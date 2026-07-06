/**
 * useNexusWorkspaceBridge
 *
 * Option 2 bridge: keep ChatStream.tsx as the workspace presentation shell
 * and swap only the transport/conversation source to the Nexus engine.
 *
 * Wraps useNexusChatStream and adapts:
 *   - NexusMessage[]  →  ChatMessage[]  (shape used by ChatStream)
 *   - isStreaming/isPending  →  chatPending (single bool)
 *   - send({text})  →  send(text: string)  (matches sendFromIntentCapture)
 *
 * Also carries over the WRITE_FILE side-effect that used to live inside
 * WorkspaceConversationSurface so file writes still land on disk.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNexusChatStream, type NexusMessage } from "./useNexusChatStream";
import type { ChatMessage } from "@/pages/workspace";

function deriveConversationId(projectId: number): string {
  const key = `nexus_conv_${projectId}`;
  try {
    const stored = localStorage.getItem(key);
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function parseWriteFile(content: string): Array<{ path: string; fileContent: string }> {
  const results: Array<{ path: string; fileContent: string }> = [];
  const tokenRe = /WRITE_FILE:\s*(\{[^}]+\})/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(content)) !== null) {
    try {
      const meta = JSON.parse(match[1]) as { path?: string };
      if (!meta.path) continue;
      const before = content.slice(0, match.index);
      const fenceEnd = before.lastIndexOf("```");
      if (fenceEnd === -1) continue;
      const fenceStart = before.lastIndexOf("```", fenceEnd - 1);
      if (fenceStart === -1) continue;
      const rawBlock = before.slice(fenceStart + 3, fenceEnd);
      const firstNewline = rawBlock.indexOf("\n");
      const fileContent = firstNewline === -1 ? rawBlock : rawBlock.slice(firstNewline + 1);
      results.push({ path: meta.path, fileContent });
    } catch {
      // ignore malformed token
    }
  }
  return results;
}

function toChatMessage(nm: NexusMessage, idx: number): ChatMessage {
  // Strip WRITE_FILE signal tokens from displayed content — the same cleanup
  // WorkspaceConversationSurface did before rendering.
  const cleaned = nm.content.replace(/WRITE_FILE:\s*\{[^}]+\}/g, "").trim();
  return {
    // ChatMessage.id is numeric; Nexus ids are strings. Use idx-based id so
    // ChatStream keys/refs stay stable across renders.
    id: idx + 1,
    role: nm.role,
    content: cleaned,
    streaming: (nm as NexusMessage & { streaming?: boolean }).streaming ?? false,
    imageB64: nm.imageB64,
    imageMimeType: nm.imageMimeType,
  };
}

export interface NexusWorkspaceBridge {
  messages: ChatMessage[];
  chatPending: boolean;
  send: (text: string) => void;
  abort: () => void;
}

export function useNexusWorkspaceBridge(projectId: number | null | undefined): NexusWorkspaceBridge {
  const pid = typeof projectId === "number" ? projectId : 0;
  const [conversationId, setConversationId] = useState<string>(() =>
    pid ? deriveConversationId(pid) : ""
  );

  // Reset conversation id when the project changes.
  useEffect(() => {
    if (!pid) return;
    setConversationId(deriveConversationId(pid));
  }, [pid]);

  const { messages, isStreaming, isPending, send, abort } = useNexusChatStream({
    focusProjectId: pid || null,
    mode: "workspace",
    conversationId: conversationId || null,
    onConversationId: (cid) => {
      setConversationId(cid);
      if (pid) {
        try { localStorage.setItem(`nexus_conv_${pid}`, cid); } catch { /* ignore */ }
      }
    },
  });

  // WRITE_FILE side-effect — fire once per completed assistant message.
  const prevStreamingRef = useRef(false);
  const processedTokens = useRef<Set<string>>(new Set());
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;
    if (!pid) return;
    if (!wasStreaming || isStreaming) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const writes = parseWriteFile(last.content);
    for (const { path, fileContent } of writes) {
      const dedupeKey = `${path}::${fileContent.length}`;
      if (processedTokens.current.has(dedupeKey)) continue;
      processedTokens.current.add(dedupeKey);
      fetch("/api/nexus/write-file", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, path, content: fileContent }),
      })
        .then((r) => {
          if (r.ok) {
            window.dispatchEvent(new CustomEvent("axiom:file-edited", { detail: { path, projectId: pid } }));
            window.dispatchEvent(new CustomEvent("axiom:workspace-refresh", { detail: { projectId: pid } }));
          }
        })
        .catch(() => { /* ignore */ });
    }
  }, [isStreaming, messages, pid]);

  const chatMessages: ChatMessage[] = messages.map(toChatMessage);
  const chatPending = isPending || isStreaming;

  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      void send({ text: trimmed });
    },
    [send]
  );

  return { messages: chatMessages, chatPending, send: sendText, abort };
}
