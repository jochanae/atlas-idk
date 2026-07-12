import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  Run,
  RunStep,
  RunChange,
  RunTerminalPage,
  RunArtifact,
  TypedRunEvent,
  RunStatus,
  RunIntent,
} from "@contract";
import { isTerminal } from "@contract";
import { runFixtures, driveMockRun } from "@/mocks/mockRuns";
import { getEntry, delay, derivedChanges } from "@/mocks/mockHydration";

/**
 * RunProvider — singleton per conversation.
 *
 * Owns the (mocked) SSE subscription. Every surface reads from this context.
 * No surface may fetch runs, hold a local copy, or infer status from tokens.
 *
 * activeBuildRun and activeTurn are separate — a BUILD may be awaiting
 * confirmation while a CHAT turn streams simultaneously.
 */
export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface RunContextValue {
  activeBuildRun: Run | null;
  activeTurn: Run | null;
  runs: Run[];
  confirm(runId: string): Promise<void>;
  cancel(runId: string): Promise<void>;
  commit(runId: string, opts?: { fail?: boolean }): Promise<void>;
  fetchSteps(runId: string): Promise<RunStep[]>;
  fetchChanges(runId: string): Promise<RunChange[]>;
  fetchTerminal(runId: string, page: number): Promise<RunTerminalPage>;
  fetchOutputs(runId: string): Promise<RunArtifact[]>;
  connectionStatus: ConnectionStatus;
  /** MOCK ONLY */
  __setConnectionStatus(status: ConnectionStatus): void;
  /** MOCK ONLY — start a scripted lifecycle for a given intent. */
  __startMockRun(intent: RunIntent, story?: keyof typeof runFixtures): string;
}

const RunContext = createContext<RunContextValue | null>(null);

export function useRun(): RunContextValue {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error("useRun must be used within <RunProvider>");
  return ctx;
}

export function RunProvider({
  conversationId,
  children,
}: {
  conversationId: string;
  children: React.ReactNode;
}) {
  const [runsById, setRunsById] = useState<Record<string, Run>>({});
  const [connectionStatus, setConnectionStatus] =
    useState<RunContextValue["connectionStatus"]>("connecting");
  const cancellers = useRef<Map<string, () => void>>(new Map());

  // Simulated "connect"
  useEffect(() => {
    const t = setTimeout(() => setConnectionStatus("connected"), 250);
    return () => clearTimeout(t);
  }, [conversationId]);

  const applyEvent = useCallback((evt: TypedRunEvent) => {
    setRunsById((prev) => {
      const existing = prev[evt.runId];
      switch (evt.type) {
        case "run_created": {
          if (existing) return prev;
          const now = new Date(evt.timestamp).toISOString();
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
          const next: Run = {
            ...existing,
            status: evt.payload.status,
            updatedAt: evt.timestamp,
          };
          return { ...prev, [evt.runId]: next };
        }
        case "plan_ready": {
          if (!existing) return prev;
          return { ...prev, [evt.runId]: { ...existing, plan: evt.payload.plan, updatedAt: evt.timestamp } };
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
          return { ...prev, [evt.runId]: { ...existing, verification: evt.payload.verification, updatedAt: evt.timestamp } };
        }
        case "commit_update": {
          if (!existing) return prev;
          return { ...prev, [evt.runId]: { ...existing, commit: evt.payload.commit, updatedAt: evt.timestamp } };
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
  }, []);

  const startMockRun = useCallback<RunContextValue["__startMockRun"]>((intent, story) => {
    const id = crypto.randomUUID();
    const stop = driveMockRun({
      runId: id,
      conversationId,
      intent,
      story,
      onEvent: applyEvent,
    });
    cancellers.current.set(id, stop);
    return id;
  }, [conversationId, applyEvent]);

  const cancel = useCallback(async (runId: string) => {
    const stop = cancellers.current.get(runId);
    stop?.();
    setRunsById((prev) => {
      const r = prev[runId];
      if (!r || isTerminal(r.status)) return prev;
      const cancelled: Run = {
        ...r,
        status: "cancelled",
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: r.status === "executing" ? {
          code: "CANCELLED_PARTIAL",
          message: "Cancelled mid-execution — some files may have been partially updated.",
          recoverable: true,
          stepId: null,
          partialWritesOccurred: true,
        } : null,
      };
      return { ...prev, [runId]: cancelled };
    });
  }, []);

  const confirm = useCallback(async (runId: string) => {
    setRunsById((prev) => {
      const r = prev[runId];
      if (!r || r.status !== "awaiting_confirmation") return prev;
      return { ...prev, [runId]: { ...r, status: "executing", updatedAt: new Date().toISOString() } satisfies Run };
    });
  }, []);

  const commit = useCallback(async (runId: string) => {
    setRunsById((prev) => {
      const r = prev[runId];
      if (!r || r.status !== "succeeded") return prev;
      const running: Run = { ...r, commit: { status: "running", sha: null, url: null, error: null, committedAt: null } };
      return { ...prev, [runId]: running };
    });
    await new Promise((res) => setTimeout(res, 900));
    setRunsById((prev) => {
      const r = prev[runId];
      if (!r) return prev;
      const sha = "a1b2c3d4e5f6";
      return {
        ...prev,
        [runId]: {
          ...r,
          commit: {
            status: "succeeded",
            sha,
            url: `https://github.com/jochanae/atlas-idk/commit/${sha}`,
            error: null,
            committedAt: new Date().toISOString(),
          },
        },
      };
    });
  }, []);

  const noopFetch = useCallback(async <T,>(_: string, seed: T): Promise<T> => seed, []);

  const value = useMemo<RunContextValue>(() => {
    const list = Object.values(runsById).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const activeBuildRun =
      list.find((r) => r.intent === "BUILD" && !isTerminal(r.status)) ?? null;
    const activeTurn =
      list.find((r) => r.intent !== "BUILD" && !isTerminal(r.status)) ?? null;
    return {
      activeBuildRun,
      activeTurn,
      runs: list,
      confirm,
      cancel,
      commit,
      fetchSteps: (id) => noopFetch(id, [] as RunStep[]),
      fetchChanges: (id) => noopFetch(id, [] as RunChange[]),
      fetchTerminal: (id, page) =>
        noopFetch(id, { lines: [], totalLines: 0, page, pageSize: 100 } as RunTerminalPage),
      fetchOutputs: (id) => noopFetch(id, [] as RunArtifact[]),
      connectionStatus,
      __startMockRun: startMockRun,
    };
  }, [runsById, confirm, cancel, commit, noopFetch, connectionStatus, startMockRun]);

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export type { Run, RunStatus, RunIntent };
