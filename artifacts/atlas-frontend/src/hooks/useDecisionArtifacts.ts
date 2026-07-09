import { useState, useEffect, useCallback, useRef } from "react";

export type DecisionArtifactType = "tradeoff_matrix" | "decision_tree" | "deviation_log";

export interface DecisionArtifactRecord {
  id: number;
  projectId: number;
  type: DecisionArtifactType;
  version: number;
  title: string;
  metadata: unknown;
  payload: Record<string, unknown>;
  createdAt: string;
}

const DECISION_TYPES: DecisionArtifactType[] = ["tradeoff_matrix", "decision_tree", "deviation_log"];

export function useDecisionArtifacts(projectId: number | null) {
  const [artifacts, setArtifacts] = useState<DecisionArtifactRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const results = await Promise.all(
        DECISION_TYPES.map(async (type) => {
          const res = await fetch(`/api/projects/${projectId}/artifacts?type=${type}`, { signal: ctrl.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data: { artifacts: DecisionArtifactRecord[] } = await res.json();
          return data.artifacts;
        }),
      );
      const merged = results.flat().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setArtifacts(merged);
      setError(null);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load decision artifacts");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  return { artifacts, loading, error, reload: load };
}
