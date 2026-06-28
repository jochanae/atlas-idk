import { useState, useEffect, useCallback, useRef } from "react";

export interface DesignPlanInteractionPatterns {
  primaryAction?: string;
  secondaryAction?: string;
  editingStyle?: string;
  confirmationBehavior?: string;
  gestures?: string;
  scrollingBehavior?: string;
}

export interface DesignPlanResponsiveIntent {
  mobile?: string;
  tablet?: string;
  desktop?: string;
}

export interface DesignPlanBody {
  navigationPattern?: string;
  responsiveIntent?: DesignPlanResponsiveIntent;
  informationHierarchy?: string[];
  componentPatterns?: string;
  motionPhilosophy?: string;
  cardDensity?: string;
  typographyScale?: string;
  emptyStates?: string;
  interactionPatterns?: DesignPlanInteractionPatterns;
}

export interface DesignPlan {
  id: number;
  projectId: number;
  version: number;
  status: "draft" | "proposed" | "committed";
  body: DesignPlanBody;
  createdAt: string;
  committedAt: string | null;
}

export function useDesignPlan(projectId: number | null) {
  const [plan, setPlan] = useState<DesignPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/design-plan`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DesignPlan | null = await res.json();
      setPlan(data);
      setError(null);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load design plan");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const generate = useCallback(async (): Promise<DesignPlan | null> => {
    if (!projectId) return null;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/design-plan/generate`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DesignPlan = await res.json();
      setPlan(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
      return null;
    } finally {
      setGenerating(false);
    }
  }, [projectId]);

  const patchBody = useCallback(async (body: Partial<DesignPlanBody>): Promise<DesignPlan | null> => {
    if (!projectId) return null;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/design-plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DesignPlan = await res.json();
      setPlan(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      return null;
    } finally {
      setSaving(false);
    }
  }, [projectId]);

  const commit = useCallback(async (): Promise<DesignPlan | null> => {
    if (!projectId) return null;
    setCommitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/design-plan/commit`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DesignPlan = await res.json();
      setPlan(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed");
      return null;
    } finally {
      setCommitting(false);
    }
  }, [projectId]);

  return { plan, loading, generating, committing, saving, error, refetch: load, generate, patchBody, commit };
}
