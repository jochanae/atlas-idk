/**
 * useNexusWorkspaceBridge
 *
 * Side-effects bridge for the Workspace surface. Converts NexusMessage[] →
 * ChatMessage[], handles WRITE_FILE disk writes, run-completed events, and
 * conversation history / recovery.
 *
 * B1 refactor: this hook no longer owns useNexusChatStream or creates a send
 * function. All stream state is injected by the caller (useAtlasConversation).
 * Conversation submission goes through useAtlasConversation.submit() — not
 * through this bridge. The bridge is purely a side-effect and adapter layer.
 */
import { useCallback, useEffect, useRef } from "react";
import type React from "react";
import { type NexusMessage, type NexusLiveStep } from "./useNexusChatStream";
import type { ChatMessage } from "@/pages/workspace";
import { workspaceEventBus } from "@/lib/workspaceEventBus";

type ThreadMessage = {
  id: number;
  role: string;
  content: string;
  isBriefing?: boolean;
  createdAt?: string;
  runId?: string | null;
  executionOutcome?: NexusMessage["executionOutcome"] | null;
  fileEdit?: NexusMessage["fileEdit"] | null;
  fileEdits?: NexusMessage["fileEdits"] | null;
  linePatches?: NexusMessage["linePatches"] | null;
  fileDeletes?: NexusMessage["fileDeletes"] | null;
  githubPush?: NexusMessage["githubPush"] | null;
  imageGen?: NexusMessage["imageGen"] | null;
  decisionArtifacts?: NexusMessage["decisionArtifacts"] | null;
  generatedArtifacts?: NexusMessage["generatedArtifacts"] | null;
  attachments?: Array<{ id: string; contentUrl: string; mediaType: string; name?: string; messagePosition: number }>;
};

function threadMessageToNexus(m: ThreadMessage): NexusMessage {
  return {
    id: String(m.id),
    role: m.role as "user" | "assistant",
    content: m.content,
    createdAt: m.createdAt ?? new Date().toISOString(),
    runId: m.runId ?? null,
    executionOutcome: m.executionOutcome ?? null,
    fileEdit: m.fileEdit ?? null,
    fileEdits: m.fileEdits ?? null,
    linePatches: m.linePatches ?? null,
    fileDeletes: m.fileDeletes ?? null,
    githubPush: m.githubPush ?? null,
    imageGen: m.imageGen ?? null,
    decisionArtifacts: m.decisionArtifacts ?? null,
    generatedArtifacts: m.generatedArtifacts ?? null,
    ...(m.attachments && m.attachments.length > 0 ? { attachments: m.attachments } : {}),
  };
}

// Returns the stored conversationId from localStorage, or null if none exists.
// Does NOT generate a new UUID — generation happens after server recovery confirms
// no prior conversation, or immediately for URL-routed workspaces.
export function deriveConversationId(projectId: number): string | null {
  const key = `nexus_conv_${projectId}`;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storeConversationId(projectId: number, conversationId: string): void {
  try { localStorage.setItem(`nexus_conv_${projectId}`, conversationId); } catch { /* ignore */ }
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
  const rawContent = nm.content;
  const safeContent =
    typeof rawContent === "string"
      ? rawContent
      : rawContent == null
        ? ""
        : typeof rawContent === "object"
          ? (() => { try { return JSON.stringify(rawContent); } catch { return ""; } })()
          : String(rawContent);
  const cleaned = safeContent.replace(/WRITE_FILE:\s*\{[^}]+\}/g, "").trim();
  const stableKey = nm.id ?? `${nm.role[0]}-${nm.createdAt}-${safeContent.length}`;
  return {
    id: idx + 1,
    stableKey,
    role: nm.role,
    content: cleaned,
    streaming: nm.streaming ?? false,
    ...(nm.nextSuggestions?.length ? { nextSuggestions: nm.nextSuggestions } : {}),
    ...(nm.extractionQueued ? { extractionQueued: true } : {}),
    imageGen: nm.imageGen as ChatMessage["imageGen"] ?? undefined,
    modelUsed: nm.modelUsed ?? undefined,
    surface: nm.surface as ChatMessage["surface"] ?? undefined,
    executionTimeMs: nm.executionTimeMs ?? undefined,
    inputTokens: nm.inputTokens ?? undefined,
    outputTokens: nm.outputTokens ?? undefined,
    costUsd: nm.costUsd ?? undefined,
    ...(nm.clarify ? { clarify: nm.clarify as ChatMessage["clarify"] } : {}),
    ...(nm.tradeoffMatrix ? { tradeoffMatrix: nm.tradeoffMatrix as ChatMessage["tradeoffMatrix"] } : {}),
    ...(nm.decisionArtifacts?.length ? { decisionArtifacts: nm.decisionArtifacts as ChatMessage["decisionArtifacts"] } : {}),
    ...(nm.generatedArtifacts?.length ? { generatedArtifacts: nm.generatedArtifacts as ChatMessage["generatedArtifacts"] } : {}),
    sentAt: nm.createdAt ?? undefined,
    ...(nm.executionOutcome ? { executionOutcome: nm.executionOutcome } : {}),
    ...(nm.fileEdit ? { fileEdit: nm.fileEdit as ChatMessage["fileEdit"] } : {}),
    ...(nm.fileEdits?.length ? { fileEdits: nm.fileEdits as ChatMessage["fileEdits"] } : {}),
    ...(nm.linePatches?.length ? { linePatches: nm.linePatches as ChatMessage["linePatches"] } : {}),
    ...(nm.fileDeletes?.length ? { fileDeletes: nm.fileDeletes as ChatMessage["fileDeletes"] } : {}),
    ...(nm.githubPush ? { githubPush: nm.githubPush as ChatMessage["githubPush"] } : {}),
    ...(nm.runId ? { runId: nm.runId } : {}),
    ...(nm.attachments?.length ? { attachments: nm.attachments } : {}),
  };
}

/** Stream state slice injected by useAtlasConversation. */
export type NexusChatStreamSlice = {
  messages: NexusMessage[];
  setMessages: React.Dispatch<React.SetStateAction<NexusMessage[]>>;
  clearMessages: () => void;
  isStreaming: boolean;
  isPending: boolean;
  liveStep: NexusLiveStep | null;
  activeRunId: string | null;
  abort: () => void;
  authorizeRun: (runId: string, decision: "approve" | "reject") => void;
};

export interface NexusWorkspaceBridge {
  messages: ChatMessage[];
  chatPending: boolean;
  liveStep: NexusLiveStep | null;
  activeRunId: string | null;
  abort: () => void;
  authorizeRun: (runId: string, decision: "approve" | "reject") => void;
}

export function useNexusWorkspaceBridge(
  projectId: number | null | undefined,
  stream: NexusChatStreamSlice,
  opts?: {
    /** The active nexus conversation ID (managed by workspace.tsx). */
    conversationId?: string;
    /** Updates conversationId in workspace.tsx state + localStorage. */
    setConversationId?: (id: string) => void;
    /** URL-param conversation ID — pins the workspace to a specific thread. */
    initialConversationId?: string | null;
    conversationMode?: boolean;
  },
): NexusWorkspaceBridge {
  const pid = typeof projectId === "number" ? projectId : 0;
  const conversationId = opts?.conversationId ?? "";
  const setConversationId = useCallback(
    (id: string) => opts?.setConversationId?.(id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts?.setConversationId],
  );

  const { messages, isStreaming, isPending, liveStep, activeRunId, setMessages, clearMessages, abort, authorizeRun } = stream;

  const historyLoadedRef = useRef(false);
  const recoveryAttemptedRef = useRef(false);

  // Reset conversation id + wipe in-memory messages when the project changes.
  //
  // Guard against the initial mount transition: `/workspace/:conversationId`
  // renders once with pid=0 while the numeric project id is being resolved,
  // then re-renders with the real pid. That 0 → N transition is NOT a project
  // switch — it is the initial resolve. If we treat it as a switch we clobber
  // the pinned conversation from the URL, clear the freshly-loaded messages,
  // and force a recovery round-trip that visually looks like a refresh/reset
  // on the first send. Only reset when both the previous and next pid are
  // real, nonzero project ids.
  const prevPidRef = useRef<number>(pid);
  useEffect(() => {
    if (!pid) return;
    const prev = prevPidRef.current;
    if (prev !== pid) {
      const isInitialResolve = !prev || prev === 0;
      prevPidRef.current = pid;
      if (isInitialResolve) return;
      setConversationId(opts?.initialConversationId || deriveConversationId(pid) || "");
      clearMessages();
      historyLoadedRef.current = false;
      recoveryAttemptedRef.current = false;
    }
  }, [pid, opts?.initialConversationId, clearMessages, setConversationId]);

  // `/workspace/:conversationId` is the canonical direct home-composer handoff.
  // Keep pinned to that route conversation instead of a generated thread.
  useEffect(() => {
    if (!pid || !opts?.initialConversationId) return;
    if (conversationId === opts.initialConversationId) return;
    setConversationId(opts.initialConversationId);
    historyLoadedRef.current = false;
    storeConversationId(pid, opts.initialConversationId);
  }, [pid, opts?.initialConversationId, conversationId, setConversationId]);

  // Conversation recovery: if there is no stored conversationId, ask the server
  // for the most recent known thread before creating a brand-new UUID.
  useEffect(() => {
    if (!pid || opts?.initialConversationId) return;
    if (conversationId !== "") return;
    if (recoveryAttemptedRef.current) return;
    recoveryAttemptedRef.current = true;

    fetch(`/api/projects/${pid}/latest-conversation`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: { conversationId: string | null }) => {
        if (data.conversationId) {
          storeConversationId(pid, data.conversationId);
          setConversationId(data.conversationId);
        } else {
          const fresh = crypto.randomUUID();
          storeConversationId(pid, fresh);
          setConversationId(fresh);
        }
      })
      .catch(() => {
        const fresh = crypto.randomUUID();
        storeConversationId(pid, fresh);
        setConversationId(fresh);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]); // intentionally omit conversationId — checked via closure at effect time

  // Load prior conversation history on mount (and on project switch).
  useEffect(() => {
    if (!pid || !conversationId || historyLoadedRef.current) return;
    historyLoadedRef.current = true;
    fetch(`/api/nexus/thread?conversationId=${encodeURIComponent(conversationId)}&focusProjectId=${pid}`, {
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) return null;
        return r.json() as Promise<ThreadMessage[]>;
      })
      .then((msgs) => {
        if (!msgs || msgs.length === 0) {
          if (!opts?.initialConversationId) {
            fetch(`/api/projects/${pid}/latest-conversation`, { credentials: "include" })
              .then((r) => r.json())
              .then((data: { conversationId: string | null }) => {
                if (data.conversationId && data.conversationId !== conversationId) {
                  storeConversationId(pid, data.conversationId);
                  historyLoadedRef.current = false;
                  setConversationId(data.conversationId);
                }
              })
              .catch(() => { /* non-fatal */ });
          }
          return;
        }
        const real = msgs.filter((m) => !m.isBriefing && (m.role === "user" || m.role === "assistant"));
        if (real.length === 0) return;
        const nexusMsgs: NexusMessage[] = real.map(threadMessageToNexus);
        setMessages(nexusMsgs);

        if (opts?.initialConversationId && real.length === 1 && real[0].role === "user") {
          let attempts = 0;
          const maxAttempts = 5;
          const convIdSnapshot = conversationId;
          const pidSnapshot = pid;
          const poll = () => {
            if (attempts >= maxAttempts) return;
            attempts++;
            setTimeout(() => {
              fetch(
                `/api/nexus/thread?conversationId=${encodeURIComponent(convIdSnapshot)}&focusProjectId=${pidSnapshot}`,
                { credentials: "include" },
              )
                .then((r) => (r.ok ? (r.json() as Promise<ThreadMessage[]>) : null))
                .then((newMsgs) => {
                  if (!newMsgs) { poll(); return; }
                  const newReal = newMsgs.filter((m) => !m.isBriefing && (m.role === "user" || m.role === "assistant"));
                  if (newReal.length > 1) {
                    setMessages(newReal.map(threadMessageToNexus));
                  } else {
                    poll();
                  }
                })
                .catch(() => poll());
            }, 3000);
          };
          poll();
        }
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
              window.dispatchEvent(new CustomEvent("axiom:artifact-saved"));
            }
          }
        })
        .catch(() => { /* ignore */ });
    }
    if (last.extractionQueued && pid) {
      setTimeout(() => workspaceEventBus.emit("entry-changed", { projectId: pid }), 2500);
    }
  }, [isStreaming, messages, pid]);

  // run-completed emitter for the Nexus path.
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

  return { messages: chatMessages, chatPending, liveStep, activeRunId, abort, authorizeRun };
}
