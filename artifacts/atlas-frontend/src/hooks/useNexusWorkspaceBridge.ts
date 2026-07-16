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

// Returns the stored conversationId from localStorage, or null if none exists.
// Does NOT generate a new UUID — that happens either after server recovery
// confirms no prior conversation exists, or immediately for URL-routed workspaces.
function deriveConversationId(projectId: number): string | null {
  const key = `nexus_conv_${projectId}`;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storeConversationId(projectId: number, conversationId: string): void {
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
  // Strip WRITE_FILE signal tokens from displayed content — the same cleanup
  // WorkspaceConversationSurface did before rendering.
  const cleaned = nm.content.replace(/WRITE_FILE:\s*\{[^}]+\}/g, "").trim();
  // stableKey: derived once from the message's own identity, never from its
  // array index.  nm.id is the DB row id (string) for persisted messages, or a
  // client-generated uuid for optimistic sends — so this fallback fires only
  // defensively (e.g. a future code path that omits id).  role+createdAt alone
  // could theoretically collide at the same millisecond; appending content.length
  // makes it collision-proof without touching array position.
  const stableKey = nm.id ?? `${nm.role[0]}-${nm.createdAt}-${nm.content.length}`;
  return {
    // Keep numeric id for backward compat (planStates maps, per-message refs).
    id: idx + 1,
    stableKey,
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
    ...(nm.clarify ? { clarify: nm.clarify as ChatMessage["clarify"] } : {}),
    ...(nm.tradeoffMatrix ? { tradeoffMatrix: nm.tradeoffMatrix as ChatMessage["tradeoffMatrix"] } : {}),
    ...(nm.decisionArtifacts?.length ? { decisionArtifacts: nm.decisionArtifacts as ChatMessage["decisionArtifacts"] } : {}),
    // File-backed deliverables (task #171 ArtifactCreatedCard) — was silently
    // dropped on the Nexus transport because toChatMessage() never mapped it,
    // even though nexus.ts's `done` event includes it (task #172 finding).
    ...(nm.generatedArtifacts?.length ? { generatedArtifacts: nm.generatedArtifacts as ChatMessage["generatedArtifacts"] } : {}),
    // Wire the message timestamp so UserBubble/AssistantBubble can display it.
    sentAt: nm.createdAt ?? undefined,
    // v1.4: backend-derived execution outcome from advance_execution_state tool
    ...(nm.executionOutcome ? { executionOutcome: nm.executionOutcome } : {}),
    // Stable run ID (execution_runs.id) — required so runCardAfterIdx anchors the
    // receipt card by matching msg.runId === execLatestRun.id (Nexus path uses UUIDs;
    // m.id is positional idx+1 which never matches execLatestRun.messageId).
    ...(nm.runId ? { runId: nm.runId } : {}),
  };
}

export interface NexusWorkspaceBridge {
  messages: ChatMessage[];
  chatPending: boolean;
  liveStep: NexusLiveStep | null;
  /** Stable identity of the in-flight turn (null when idle). */
  activeRunId: string | null;
  send: (text: string, attachments?: Array<{ base64: string; mediaType: string; name?: string }>) => void;
  abort: () => void;
}

export function useNexusWorkspaceBridge(
  projectId: number | null | undefined,
  opts?: { conversationMode?: boolean; initialConversationId?: string | null },
): NexusWorkspaceBridge {
  const pid = typeof projectId === "number" ? projectId : 0;
  const [conversationId, setConversationId] = useState<string>(() =>
    opts?.initialConversationId || (pid ? deriveConversationId(pid) : null) || ""
  );
  const historyLoadedRef = useRef(false);
  // Tracks whether a server recovery attempt has been made for this mount.
  // Prevents double-firing if the effect re-runs during recovery.
  const recoveryAttemptedRef = useRef(false);

  const { messages, isStreaming, isPending, liveStep, activeRunId, setMessages, send, abort, clearMessages, authorizeRun } = useNexusChatStream({
    focusProjectId: pid || null,
    mode: "workspace",
    conversationId: conversationId || null,
    conversationMode: opts?.conversationMode,
    surfaceContext: "workspace",
    onConversationId: (cid) => {
      // When the workspace is URL-routed, opts.initialConversationId is the
      // URL-param conversation and is the authority. Calling setConversationId
      // here would change state → trigger the guard effect at line ~154 →
      // reset historyLoadedRef → reload history from DB → setMessages(nexusMsgs)
      // during the fetch window → blank screen after every completed turn.
      // For URL-routed workspaces: persist to localStorage but do NOT update
      // internal state (the URL param is already pinned via the guard effect).
      if (!opts?.initialConversationId) {
        setConversationId(cid);
      }
      if (pid) {
        storeConversationId(pid, cid);
      }
    },
  });

  // Reset conversation id + wipe in-memory messages when the project changes,
  // so thread A never bleeds into thread B.
  const prevPidRef = useRef<number>(pid);
  useEffect(() => {
    if (!pid) return;
    if (prevPidRef.current !== pid) {
      setConversationId(opts?.initialConversationId || deriveConversationId(pid) || "");
      clearMessages();
      prevPidRef.current = pid;
      historyLoadedRef.current = false; // allow re-load for new project
      recoveryAttemptedRef.current = false; // allow re-recovery for new project
    }
  }, [pid, opts?.initialConversationId, clearMessages]);

  // `/workspace/:conversationId` is the canonical direct home-composer handoff.
  // Keep the workspace bridge pinned to that route conversation instead of a
  // generated `nexus_conv_<projectId>` thread, or the opening turn can land in
  // a different conversation than the one the workspace later reloads.
  useEffect(() => {
    if (!pid || !opts?.initialConversationId) return;
    if (conversationId === opts.initialConversationId) return;
    setConversationId(opts.initialConversationId);
    historyLoadedRef.current = false;
    storeConversationId(pid, opts.initialConversationId);
  }, [pid, opts?.initialConversationId, conversationId]);

  // Conversation recovery: if localStorage had no stored conversationId for this
  // project (conversationId initialised to ""), ask the server for the most recent
  // known thread before committing to a brand-new UUID. This prevents a cleared
  // localStorage / incognito / new device from silently creating a ghost thread
  // with no history while the real conversation sits untouched in the DB.
  useEffect(() => {
    if (!pid || opts?.initialConversationId) return; // URL-routed — no recovery needed
    if (conversationId !== "") return;               // localStorage had something — already good
    if (recoveryAttemptedRef.current) return;
    recoveryAttemptedRef.current = true;

    fetch(`/api/projects/${pid}/latest-conversation`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: { conversationId: string | null }) => {
        if (data.conversationId) {
          // Server has a real conversation — recover it.
          storeConversationId(pid, data.conversationId);
          setConversationId(data.conversationId);
        } else {
          // No prior conversation on server — this is a genuinely new project thread.
          const fresh = crypto.randomUUID();
          storeConversationId(pid, fresh);
          setConversationId(fresh);
        }
      })
      .catch(() => {
        // Network/auth failure — fall back to a fresh UUID so the workspace isn't stuck.
        const fresh = crypto.randomUUID();
        storeConversationId(pid, fresh);
        setConversationId(fresh);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]); // intentionally omit conversationId — checked via closure at effect time

  // Load prior conversation history on mount (and on project switch).
  // This restores messages that would otherwise be lost when the user navigates
  // away and returns. Briefing messages (the "Here's what I know" opener) are
  // filtered out — they're not real conversation turns.
  useEffect(() => {
    if (!pid || !conversationId || historyLoadedRef.current) return;
    historyLoadedRef.current = true;
    fetch(`/api/nexus/thread?conversationId=${encodeURIComponent(conversationId)}&focusProjectId=${pid}`, {
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) return null;
        return r.json() as Promise<Array<{ id: number; role: string; content: string; isBriefing?: boolean; createdAt?: string }>>;
      })
      .then((msgs) => {
        if (!msgs || msgs.length === 0) {
          // Zero messages for the stored conversationId. This can mean:
          //   (a) genuinely new project with no history — correct, do nothing
          //   (b) stale UUID in localStorage pointing at a ghost thread
          // Distinguish by asking the server for the real latest conversation.
          // Skip if the conversationId came from the URL (those are always correct).
          if (!opts?.initialConversationId) {
            fetch(`/api/projects/${pid}/latest-conversation`, { credentials: "include" })
              .then((r) => r.json())
              .then((data: { conversationId: string | null }) => {
                if (data.conversationId && data.conversationId !== conversationId) {
                  // Server knows a different conversation — ours is stale.
                  storeConversationId(pid, data.conversationId);
                  historyLoadedRef.current = false; // allow history to reload
                  setConversationId(data.conversationId);
                }
                // If server matches or returns null → genuinely no history, stay put.
              })
              .catch(() => { /* non-fatal */ });
          }
          return;
        }
        const real = msgs.filter((m) => !m.isBriefing && (m.role === "user" || m.role === "assistant"));
        if (real.length === 0) return;
        const nexusMsgs: NexusMessage[] = real.map((m) => ({
          id: String(m.id),
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: m.createdAt ?? new Date().toISOString(),
        }));
        setMessages(nexusMsgs);

        // For URL-routed new-project handoffs, if only the user message exists
        // (no assistant response yet), the server's background first-turn Claude
        // call is still in flight. Poll every 3s (up to 5 times) until the
        // assistant response appears, then surface it automatically.
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
                .then((r) => (r.ok ? (r.json() as Promise<Array<{ id: number; role: string; content: string; isBriefing?: boolean; createdAt?: string }>>) : null))
                .then((newMsgs) => {
                  if (!newMsgs) { poll(); return; }
                  const newReal = newMsgs.filter((m) => !m.isBriefing && (m.role === "user" || m.role === "assistant"));
                  if (newReal.length > 1) {
                    setMessages(newReal.map((m) => ({
                      id: String(m.id),
                      role: m.role as "user" | "assistant",
                      content: m.content,
                      createdAt: m.createdAt ?? new Date().toISOString(),
                    })));
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
    (text: string, attachments?: Array<{ base64: string; mediaType: string; name?: string }>) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      void send({ text: trimmed, attachments });
    },
    [send]
  );

  return { messages: chatMessages, chatPending, liveStep, activeRunId, send: sendText, abort, authorizeRun };
}
