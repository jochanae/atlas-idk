import { useCallback, useEffect, useState } from "react";
import type { RunChange, RunArtifact } from "@contract";
import { useRun } from "@/context/RunProvider";

export type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "empty" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "disconnected" };

export interface RunHydration {
  changes: LoadState<RunChange[]>;
  outputs: LoadState<RunArtifact[]>;
  reload: () => void;
}

/**
 * useRunHydration — kicks off /changes and /outputs fetches for a terminal
 * BUILD run via the provider. Surfaces read the returned LoadState directly
 * instead of holding their own copy.
 */
export function useRunHydration(runId: string | null, enabled = true): RunHydration {
  const { fetchChanges, fetchOutputs, connectionStatus } = useRun();
  const disconnected = connectionStatus === "disconnected";
  const [changes, setChanges] = useState<LoadState<RunChange[]>>({ status: "idle" });
  const [outputs, setOutputs] = useState<LoadState<RunArtifact[]>>({ status: "idle" });

  const loadChanges = useCallback(async () => {
    if (!runId) return;
    setChanges({ status: "loading" });
    try {
      const data = await fetchChanges(runId);
      setChanges(data.length ? { status: "ready", data } : { status: "empty" });
    } catch (e) {
      setChanges({ status: "error", message: (e as Error).message, retry: loadChanges });
    }
  }, [runId, fetchChanges]);

  const loadOutputs = useCallback(async () => {
    if (!runId) return;
    setOutputs({ status: "loading" });
    try {
      const data = await fetchOutputs(runId);
      setOutputs(data.length ? { status: "ready", data } : { status: "empty" });
    } catch (e) {
      setOutputs({ status: "error", message: (e as Error).message, retry: loadOutputs });
    }
  }, [runId, fetchOutputs]);

  const reload = useCallback(() => { loadChanges(); loadOutputs(); }, [loadChanges, loadOutputs]);

  useEffect(() => {
    if (!enabled || !runId) return;
    if (disconnected) {
      setChanges({ status: "disconnected" });
      setOutputs({ status: "disconnected" });
      return;
    }
    loadChanges();
    loadOutputs();
  }, [enabled, runId, disconnected, loadChanges, loadOutputs]);

  return { changes, outputs, reload };
}
