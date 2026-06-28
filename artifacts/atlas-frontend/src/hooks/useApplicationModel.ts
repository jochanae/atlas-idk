import { useState, useEffect, useCallback, useRef } from "react";

export interface AMIdentity {
  name?: string;
  purpose?: string;
  audience?: string;
  category?: string;
}

export interface AMIntent {
  summary?: string;
  coreProblems?: string[];
  keyOutcomes?: string[];
  constraints?: string[];
  approvedAt?: string | null;
}

export interface AMPage {
  id: string;
  name: string;
  route?: string;
  description?: string;
}

export interface AMComponent {
  id: string;
  name: string;
  pageId?: string;
  description?: string;
}

export interface AMEntityField {
  name: string;
  type: string;
}

export interface AMEntity {
  id: string;
  name: string;
  description?: string;
  fields?: AMEntityField[];
}

export interface AMRelationship {
  id: string;
  from: string;
  to: string;
  type: "one-to-one" | "one-to-many" | "many-to-many" | string;
  label?: string;
}

export interface AMData {
  entities: AMEntity[];
  relationships: AMRelationship[];
}

export interface AMLogic {
  id: string;
  name: string;
  type: string;
  description?: string;
}

export interface AMBuildState {
  generated?: boolean;
  stage?: string;
  lastExtractedAt?: string | null;
  approvedAt?: string | null;
}

export interface AMExperienceIntent {
  emotionalRegister?: string[];
  interactionPosture?: string[];
  visualLanguage?: string[];
  designPrinciples?: string[];
  confidence?: number;
  lastConfirmed?: string | null;
}

export interface AMVisualSketch {
  analyzedAt: string;
  description: string;
  signals: {
    emotionalRegister?: string[];
    visualLanguage?: string[];
    designPrinciples?: string[];
  };
}

export interface ApplicationModel {
  id: number;
  projectId: number;
  version: number;
  identity: AMIdentity;
  intent: AMIntent;
  pages: AMPage[];
  components: AMComponent[];
  data: AMData;
  logic: AMLogic[];
  buildState: AMBuildState;
  creativePrinciples: string[];
  experienceIntent: AMExperienceIntent;
  visualSketches: AMVisualSketch[];
  createdAt: string;
  updatedAt: string;
}

export type ApplicationModelPatch = Partial<Pick<ApplicationModel,
  | "identity" | "intent" | "pages" | "components" | "data" | "logic"
  | "buildState" | "creativePrinciples" | "experienceIntent" | "visualSketches"
>> & { reason?: string };

export function useApplicationModel(projectId: number | null) {
  const [model, setModel] = useState<ApplicationModel | null>(null);
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
      const res = await fetch(`/api/projects/${projectId}/model`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApplicationModel = await res.json();
      setModel(data);
      setError(null);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load model");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const approve = useCallback(async (): Promise<ApplicationModel | null> => {
    if (!projectId) return null;
    try {
      const res = await fetch(`/api/projects/${projectId}/model/approve`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApplicationModel = await res.json();
      setModel(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
      return null;
    }
  }, [projectId]);

  const unapprove = useCallback(async (): Promise<ApplicationModel | null> => {
    if (!projectId) return null;
    try {
      const res = await fetch(`/api/projects/${projectId}/model/unapprove`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApplicationModel = await res.json();
      setModel(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unapprove failed");
      return null;
    }
  }, [projectId]);

  const patch = useCallback(async (update: ApplicationModelPatch): Promise<ApplicationModel | null> => {
    if (!projectId) return null;
    try {
      const res = await fetch(`/api/projects/${projectId}/model`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApplicationModel = await res.json();
      setModel(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Patch failed");
      return null;
    }
  }, [projectId]);

  return { model, loading, error, refetch: load, approve, unapprove, patch };
}
