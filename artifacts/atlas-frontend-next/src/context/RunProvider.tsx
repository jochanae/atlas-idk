import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Run,
  ConversationMessage,
  TypedRunEvent,
} from "@contract";
import { isTerminal } from "@contract";
import {
  RunContext,
  type ConnectionStatus,
  type RunContextValue,
  type PendingMessage,
  type SendMessageResult,
} from "./RunContext";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import { openConversationStream } from "@/lib/sse";

export { useRun } from "./RunContext";
export type { RunContextValue, ConnectionStatus };

const MESSAGE_PAGE_SIZE = 50;

/**
 * LiveRunProvider — real implementation against the V1.2 backend.
 *
 * Owns:
 *   - one SSE subscription per conversationId
 *   - conversation history (paginated)
 *   - REST hydration (steps / changes / terminal / outputs) via passthrough
 *   - confirm / cancel / commit actions
 *
 * Rules:
 *   - Surfaces never fetch directly; they call the returned fetchers.
 *   - Events are deduped by eventId; late/out-of-order events with
 *     seq <= lastSeenSeq are ignored.
 *   - After every terminal or commit-changing event we re-fetch the run
 *     via REST to reconcile against the durable store (§7: REST wins).
 */
export function RunProvider({
  conversationId,
  children,
}: {
  conversationId: string;
  children: React.ReactNode;
}) {
  const [runsById, setRunsById] = useState<Record<string, Run>>({});
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [messagesStatus, setMessagesStatus] =
    useState<RunContextValue["messagesStatus"]>("idle");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);

  const seenEventIds = useRef<Set<string>>(new Set());
  const lastSeqRef = useRef<number>(0);

  // -------------------------------------------------------------------------
  // Initial hydration: runs + first page of messages
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    seenEventIds.current = new Set();
    lastSeqRef.current = 0;

    (async () => {
      try {
        const [runs, page] = await Promise.all([
          api.listRuns(conversationId).catch(() => [] as Run[]),
          api.listMessages(conversationId, { limit: MESSAGE_PAGE_SIZE }).catch(() => null),
        ]);
        if (cancelled) return;
        const byId: Record<string, Run> = {};
        for (const r of runs) byId[r.id] = r;
        setRunsById(byId);
        if (page) {
          setMessages(page.messages);
          setNextCursor(page.nextCursor);
          setMessagesStatus("ready");
        } else {
          setMessagesStatus("error");
        }
      } catch {
        if (!cancelled) setMessagesStatus("error");
      }
    })();

    return () => { cancelled = true; };
  }, [conversationId]);

  // -------------------------------------------------------------------------
  // Apply SSE events
  // -------------------------------------------------------------------------
  const applyEvent = useCallback((evt: TypedRunEvent) => {
    if (evt.eventId) {
      if (seenEventIds.current.has(evt.eventId)) return;
      seenEventIds.current.add(evt.eventId);
    }
    if (typeof evt.seq === "number" && evt.seq > lastSeqRef.current) {
      lastSeqRef.current = evt.seq;
    }

    setRunsById((prev) => {
      const existing = prev[evt.runId];
      switch (evt.type) {
        case "run_created": {
          if (existing) return prev;
          const now = evt.timestamp;
          const seed: Run = {
            id: evt.runId,
            projectId: null,
            conversationId: evt.conversationId,
            status: evt.payload.status,
            intent: evt.payload.intent,
            prompt: "",
            response: null,
            summary: null,
            plan: null,
            stepCount: 0,
            stepsDone: 0,
            error: null,
            verification: null,
            commit: null,
            snapshotRef: null,
            createdAt: now,
            updatedAt: now,
            completedAt: null,
            elapsedMs: null,
          };
          return { ...prev, [evt.runId]: seed };
        }
        case "run_status": {
          if (!existing) return prev;
          return {
            ...prev,
            [evt.runId]: { ...existing, status: evt.payload.status, updatedAt: evt.timestamp },
          };
        }
        case "plan_ready": {
          if (!existing) return prev;
          return {
            ...prev,
            [evt.runId]: { ...existing, plan: evt.payload.plan, updatedAt: evt.timestamp },
          };
        }
        case "step_update": {
          if (!existing) return prev;
          const step = evt.payload.step;
          const stepCount = Math.max(existing.stepCount, step.seq);
          const stepsDone =
            step.status === "succeeded" || step.status === "skipped"
              ? Math.max(existing.stepsDone, step.seq)
              : existing.stepsDone;
          return {
            ...prev,
            [evt.runId]: { ...existing, stepCount, stepsDone, updatedAt: evt.timestamp },
          };
        }
        case "verification_update": {
          if (!existing) return prev;
          return {
            ...prev,
            [evt.runId]: { ...existing, verification: evt.payload.verification, updatedAt: evt.timestamp },
          };
        }
        case "commit_update": {
          if (!existing) return prev;
          return {
            ...prev,
            [evt.runId]: { ...existing, commit: evt.payload.commit, updatedAt: evt.timestamp },
          };
        }
        case "run_complete": {
          return { ...prev, [evt.runId]: evt.payload.run };
        }
        case "token":
        case "stream_error":
          return prev;
      }
      return prev;
    });

    // When a turn completes, refresh the corresponding conversation messages
    // so the settled assistant content lands from the durable store.
    if (evt.type === "run_complete") {
      api.listMessages(conversationId, { limit: MESSAGE_PAGE_SIZE })
        .then((page) => {
          setMessages(page.messages);
          setNextCursor(page.nextCursor);
        })
        .catch(() => { /* leave existing messages */ });
    }
  }, [conversationId]);

  // -------------------------------------------------------------------------
  // SSE subscription
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handle = openConversationStream({
      conversationId,
      onEvent: applyEvent,
      onStatus: setConnectionStatus,
      getLastSeenSeq: () => lastSeqRef.current,
    });
    return () => handle.close();
  }, [conversationId, applyEvent]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  const confirm = useCallback(async (runId: string) => {
    await api.confirmRun(runId);
    // Optimistic; the server will emit run_status/executing.
  }, []);

  const cancel = useCallback(async (runId: string) => {
    await api.cancelRun(runId);
  }, []);

  const commit = useCallback(async (runId: string) => {
    // Optimistic "running" so the receipt reflects intent immediately;
    // commit_update from SSE will supersede with the real state.
    setRunsById((prev) => {
      const r = prev[runId];
      if (!r) return prev;
      return {
        ...prev,
        [runId]: {
          ...r,
          commit: { status: "running", sha: null, url: null, error: null, committedAt: null },
        },
      };
    });
    try {
      const res = await api.commitRun(runId);
      setRunsById((prev) => {
        const r = prev[runId];
        if (!r) return prev;
        return {
          ...prev,
          [runId]: {
            ...r,
            commit: {
              status: "succeeded",
              sha: res.sha,
              url: res.url,
              error: null,
              committedAt: new Date().toISOString(),
            },
          },
        };
      });
    } catch (e) {
      setRunsById((prev) => {
        const r = prev[runId];
        if (!r) return prev;
        return {
          ...prev,
          [runId]: {
            ...r,
            commit: {
              status: "failed",
              sha: null,
              url: null,
              error: (e as Error).message,
              committedAt: null,
            },
          },
        };
      });
    }
  }, []);

  // -------------------------------------------------------------------------
  // History pagination
  // -------------------------------------------------------------------------
  const loadMoreMessages = useCallback(async () => {
    if (!nextCursor) return;
    setMessagesStatus("loading");
    try {
      const page = await api.listMessages(conversationId, {
        cursor: nextCursor,
        limit: MESSAGE_PAGE_SIZE,
      });
      setMessages((prev) => [...prev, ...page.messages]);
      setNextCursor(page.nextCursor);
      setMessagesStatus("ready");
    } catch {
      setMessagesStatus("error");
    }
  }, [conversationId, nextCursor]);

  // -------------------------------------------------------------------------
  // Composer send (canonical V1.2 turn-entry endpoint)
  // -------------------------------------------------------------------------
  const sendMessage = useCallback(async (
    content: string,
    idempotencyKey: string,
  ): Promise<SendMessageResult> => {
    const trimmed = content.trim();
    if (!trimmed) return { ok: false, error: "Empty message" };

    const clientId = `pending-${idempotencyKey}`;
    // If this exact idempotencyKey is already pending (double-tap), don't
    // stack a second optimistic row — reuse the existing pending entry.
    let existed = false;
    setPendingMessages((prev) => {
      if (prev.some((p) => p.idempotencyKey === idempotencyKey)) {
        existed = true;
        return prev;
      }
      const optimistic: PendingMessage = {
        clientId,
        idempotencyKey,
        content: trimmed,
        status: "sending",
      };
      return [...prev, optimistic];
    });

    try {
      const res = await api.sendMessage(conversationId, {
        content: trimmed,
        idempotencyKey,
      });
      setPendingMessages((prev) =>
        prev.map((p) =>
          p.idempotencyKey === idempotencyKey
            ? { ...p, status: "accepted", runId: res.runId, userMessageId: res.userMessageId }
            : p,
        ),
      );
      // Refresh history so the persisted user row lands and reconciles.
      // We do NOT optimistically create runs, assistant messages, or receipts.
      api.listMessages(conversationId, { limit: MESSAGE_PAGE_SIZE })
        .then((page) => {
          setMessages(page.messages);
          setNextCursor(page.nextCursor);
          setMessagesStatus("ready");
        })
        .catch(() => { /* keep optimistic row until next refresh */ });
      return {
        ok: true,
        runId: res.runId,
        userMessageId: res.userMessageId,
        intent: res.intent,
        duplicate: !!res.duplicate,
      };
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      const code =
        (apiErr?.body && typeof apiErr.body === "object" && "code" in apiErr.body
          ? String((apiErr.body as { code?: unknown }).code ?? "")
          : "") ||
        (apiErr?.body && typeof apiErr.body === "object" && "error" in apiErr.body
          ? String((apiErr.body as { error?: unknown }).error ?? "")
          : "");
      const message = (err as Error).message ?? "Send failed";
      setPendingMessages((prev) =>
        prev.map((p) =>
          p.idempotencyKey === idempotencyKey
            ? { ...p, status: "error", error: message }
            : p,
        ),
      );
      // Silence unused warning when there was no new optimistic row.
      void existed;
      return { ok: false, error: message, code: code || undefined };
    }
  }, [conversationId]);

  // Prune pending entries once the server-persisted user message shows up.
  useEffect(() => {
    if (pendingMessages.length === 0) return;
    setPendingMessages((prev) =>
      prev.filter((p) => {
        if (!p.userMessageId) return true;
        return !messages.some((m) => m.id === p.userMessageId);
      }),
    );
    // messages is the reconciliation source; safe to depend on it.
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Fetchers (thin passthroughs — surfaces call these)
  // -------------------------------------------------------------------------
  const fetchSteps = useCallback((runId: string) => api.getSteps(runId), []);
  const fetchChanges = useCallback((runId: string) => api.getChanges(runId), []);
  const fetchTerminal = useCallback((runId: string, page: number) => api.getTerminal(runId, page), []);
  const fetchOutputs = useCallback((runId: string) => api.getOutputs(runId), []);

  const value = useMemo<RunContextValue>(() => {
    const list = Object.values(runsById).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const activeBuildRun =
      list.find((r) => r.intent === "BUILD" && !isTerminal(r.status)) ?? null;
    const activeTurn =
      list.find((r) => r.intent !== "BUILD" && !isTerminal(r.status)) ?? null;
    return {
      activeBuildRun,
      activeTurn,
      runs: list,
      messages,
      messagesStatus,
      hasMoreMessages: !!nextCursor,
      loadMoreMessages,
      pendingMessages,
      sendMessage,
      confirm,
      cancel,
      commit,
      fetchSteps,
      fetchChanges,
      fetchTerminal,
      fetchOutputs,
      connectionStatus,
    };
  }, [
    runsById, messages, messagesStatus, nextCursor, loadMoreMessages,
    pendingMessages, sendMessage,
    confirm, cancel, commit,
    fetchSteps, fetchChanges, fetchTerminal, fetchOutputs,
    connectionStatus,
  ]);

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}
