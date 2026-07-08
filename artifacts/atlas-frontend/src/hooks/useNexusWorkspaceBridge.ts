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
import { useNexusChatStream, type NexusMessage, type NexusLiveStep } from "./useNexusChatStream";
import type { ChatMessage } from "@/pages/workspace";
import { workspaceEventBus } from "@/lib/workspaceEventBus";

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
    streaming: nm.streaming ?? false,
    // Surface-affecting fields that were previously dropped, causing chips,
    // decision extraction, and artifact-save events to silently break on the
    // Nexus workspace path.
    ...(nm.nextSuggestions?.length ? { nextSuggestions: nm.nextSuggestions } : {}),
    ...(nm.extractionQueued ? { extractionQueued: true } : {}),
    imageGen: nm.imageGen as ChatMessage["imageGen"] ?? undefined,
    modelUsed: nm.modelUsed ?? undefined,
    surface: nm.surface as ChatMessage["surface"] ?? undefined,
    executionTimeMs: nm.executionTimeMs ?? undefined,
    inputTokens: nm.inputTokens ?? undefined,
    outputTokens: nm.outputTokens ?? undefined,
    costUsd: nm.costUsd ?? undefined,
  };
}

export interface NexusWorkspaceBridge {
  messages: ChatMessage[];
  chatPending: boolean;
  liveStep: NexusLiveStep | null;
  send: (text: string) => void;
  abort: () => void;
}

export function useNexusWorkspaceBridge(
  projectId: number | null | undefined,
  opts?: { conversationMode?: boolean },
): NexusWorkspaceBridge {
  const pid = typeof projectId === "number" ? projectId : 0;
  const [conversationId, setConversationId] = useState<string>(() =>
    pid ? deriveConversationId(pid) : ""
  );

  const { messages, isStreaming, isPending, liveStep, setMessages, send, abort, clearMessages } = useNexusChatStream({
    focusProjectId: pid || null,
    mode: "workspace",
    conversationId: conversationId || null,
    conversationMode: opts?.conversationMode,
    onConversationId: (cid) => {
      setConversationId(cid);
      if (pid) {
        try { localStorage.setItem(`nexus_conv_${pid}`, cid); } catch { /* ignore */ }
      }
    },
  });

  // Reset conversation id + wipe in-memory messages when the project changes,
  // so thread A never bleeds into thread B.
  const prevPidRef = useRef<number>(pid);
  useEffect(() => {
    if (!pid) return;
    if (prevPidRef.current !== pid) {
      setConversationId(deriveConversationId(pid));
      clearMessages();
      prevPidRef.current = pid;
      historyLoadedRef.current = false; // allow re-load for new project
    }
  }, [pid, clearMessages]);

  // Load prior conversation history on mount (and on project switch).
  // This restores messages that would otherwise be lost when the user navigates
  // away and returns. Briefing messages (the "Here's what I know" opener) are
  // filtered out — they're not real conversation turns.
  const historyLoadedRef = useRef(false);
  useEffect(() => {
    if (!pid || !conversationId || historyLoadedRef.current) return;
    historyLoadedRef.current = true;
    fetch(`/api/nexus/thread?conversationId=${encodeURIComponent(conversationId)}&focusProjectId=${pid}`, {
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) return null;
        return r.json() as Promise<Array<{ id: number; role: string; content: string; isBriefing?: boolean }>>;
      })
      .then((msgs) => {
        if (!msgs || msgs.length === 0) return;
        const real = msgs.filter((m) => !m.isBriefing && (m.role === "user" || m.role === "assistant"));
        if (real.length === 0) return;
        const nexusMsgs: NexusMessage[] = real.map((m) => ({
          id: String(m.id),
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
        setMessages(nexusMsgs);
      })
      .catch(() => { /* non-fatal — just starts with empty history */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, conversationId]);

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
    let anyWriteSucceeded = false;
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
            if (!anyWriteSucceeded) {
              anyWriteSucceeded = true;
              // Mirror the classic path: signal that an artifact was saved so
              // PreviewPanel and other surfaces refresh.
              window.dispatchEvent(new CustomEvent("axiom:artifact-saved"));
            }
          }
        })
        .catch(() => { /* ignore */ });
    }
    // When Atlas queued a background decision extraction, emit entry-changed after
    // a short delay to let the server finish writing the extracted entries before
    // LedgerPanel, ViewChangesPanel, and MemoryTab refresh.
    if (last.extractionQueued && pid) {
      setTimeout(() => workspaceEventBus.emit("entry-changed", { projectId: pid }), 2500);
    }
  }, [isStreaming, messages, pid]);

  // run-completed emitter for the Nexus path — workspace.tsx's chatPending
  // effect tracks useChatStream's chatPending (not the Nexus bridge), so it
  // never fires for Nexus turns. This effect is the canonical emitter for the
  // Nexus path; workspace.tsx remains the emitter for the classic path.
  const prevPendingRef = useRef(false);
  useEffect(() => {
    const wasPending = prevPendingRef.current;
    const nowPending = isPending || isStreaming;
    prevPendingRef.current = nowPending;
    if (wasPending && !nowPending && pid) {
      workspaceEventBus.emit("run-completed", { projectId: pid });
    }
  }, [isPending, isStreaming, pid]);

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

  return { messages: chatMessages, chatPending, liveStep, send: sendText, abort };
}
