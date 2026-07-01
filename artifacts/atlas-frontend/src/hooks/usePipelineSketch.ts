import { useState, useEffect, useCallback, useRef } from "react";

export interface PipelineSketchScreen {
  name: string;
  purpose: string;
  layout: string;
  primaryActions: string[];
  dataNeeds: string[];
}

export interface PipelineSketchPayload {
  archetypeId: string;
  archetypeLabel: string;
  navigationModel: string;
  screens: PipelineSketchScreen[];
  impliedRequirements: string[];
  notes: string;
  generatedFrom: {
    pageCount: number;
    entityCount: number;
    pages: string[];
    entities: string[];
  };
}

export interface PipelineSketch {
  id: number;
  projectId: number;
  type: string;
  version: number;
  title: string;
  metadata: {
    approved?: boolean;
    status?: "suggested" | "approved" | "dismissed";
    approvedAt?: string;
    source?: string;
  };
  payload: PipelineSketchPayload;
  createdAt: string;
}

export function usePipelineSketch(projectId: number | null) {
  const [sketch, setSketch] = useState<PipelineSketch | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts?type=pipeline_sketch`, {
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { artifacts: PipelineSketch[] };
      // Most recent non-dismissed sketch wins
      const active = data.artifacts.find(
        (a) => a.metadata?.status !== "dismissed"
      ) ?? null;
      setSketch(active);
      setError(null);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load sketch");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const generate = useCallback(async (): Promise<PipelineSketch | null> => {
    if (!projectId) return null;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/sketches/generate`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as PipelineSketch;
      setSketch(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      return null;
    } finally {
      setGenerating(false);
    }
  }, [projectId]);

  const approve = useCallback(async (sketchId: number): Promise<PipelineSketch | null> => {
    if (!projectId) return null;
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/${sketchId}/approve`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as PipelineSketch;
      setSketch(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
      return null;
    } finally {
      setApproving(false);
    }
  }, [projectId]);

  const dismiss = useCallback(async (sketchId: number): Promise<void> => {
    if (!projectId) return;
    setDismissing(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/${sketchId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSketch(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dismiss failed");
    } finally {
      setDismissing(false);
    }
  }, [projectId]);

  return { sketch, loading, generating, approving, dismissing, error, refetch: load, generate, approve, dismiss };
}
