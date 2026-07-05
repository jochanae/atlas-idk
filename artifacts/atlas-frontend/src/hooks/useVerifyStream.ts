import { useCallback, useRef, useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import type { VerifyKind, VerifyKindState } from "@/lib/verification";

export type VerifyOutputLine = { text: string; stream: "stdout" | "stderr" };

export type VerifyDoneResult = {
  kind: VerifyKind;
  status: "passed" | "failed";
  durationMs: number;
  failingCount?: number;
  entryId?: number;
};

interface UseVerifyStreamOptions {
  onOutput?: (line: VerifyOutputLine) => void;
  onDone?: (result: VerifyDoneResult) => void;
  onStart?: (kind: VerifyKind) => void;
}

export function useVerifyStream({ onOutput, onDone, onStart }: UseVerifyStreamOptions = {}) {
  const [runningKind, setRunningKind] = useState<VerifyKind | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunningKind(null);
  }, []);

  const run = useCallback(async (
    kind: VerifyKind,
    projectId: number,
    parentRunId?: string,
  ) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setRunningKind(kind);
    onStart?.(kind);

    try {
      const resp = await fetch(`/api/projects/${projectId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ kind, ...(parentRunId ? { parentRunId } : {}) }),
        signal: ac.signal,
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const dataLine = part.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.slice(5).trim()) as {
              type?: string;
              stream?: "stdout" | "stderr";
              text?: string;
              kind?: VerifyKind;
              status?: "passed" | "failed";
              durationMs?: number;
              failingCount?: number;
              entryId?: number;
              message?: string;
            };

            if (event.type === "output" && event.text) {
              onOutput?.({
                text: event.text,
                stream: event.stream === "stderr" ? "stderr" : "stdout",
              });
            }

            if (event.type === "done" && event.kind && event.status) {
              const result: VerifyDoneResult = {
                kind: event.kind,
                status: event.status,
                durationMs: event.durationMs ?? 0,
                failingCount: event.failingCount,
                entryId: event.entryId,
              };
              onDone?.(result);
              setRunningKind(null);
              abortRef.current = null;
              return result;
            }

            if (event.type === "error") {
              onOutput?.({ text: event.message ?? "Verification error", stream: "stderr" });
            }
          } catch {
            // malformed event
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return null;
      }
      onOutput?.({
        text: err instanceof Error ? err.message : "Verification failed",
        stream: "stderr",
      });
    } finally {
      setRunningKind(null);
      abortRef.current = null;
    }
    return null;
  }, [onDone, onOutput, onStart]);

  const markRunning = useCallback((kind: VerifyKind | null) => {
    setRunningKind(kind);
  }, []);

  const applyRunningToStates = useCallback((
    states: Record<VerifyKind, VerifyKindState>,
    kind: VerifyKind | null,
  ): Record<VerifyKind, VerifyKindState> => {
    if (!kind) return states;
    return {
      ...states,
      [kind]: { ...states[kind], status: "running" },
    };
  }, []);

  return { runningKind, run, cancel, markRunning, applyRunningToStates };
}
