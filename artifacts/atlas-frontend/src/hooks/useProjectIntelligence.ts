import { useQuery } from "@tanstack/react-query";

export type ProjectIntelligenceDna = {
  purpose: string | null;
  coreEmotion: string | null;
  audience: string | null;
  identity: string | null;
  wedge: string | null;
  differentiator: string | null;
  stage: string;
  constraints: string[];
  openQuestions: string[];
  confidenceScore: number;
  lastExtractedAt: string | null;
};

export type ProjectIntelligenceHealth = {
  clarity: number;
  confidence: "Low" | "Medium" | "High";
  momentum: "Low" | "Medium" | "High";
  atlasState: string;
  risk: string | null;
  nextAction: string;
  evidence: {
    conversationsLast7Days: number;
    openBlockers: number;
    openConstraints: number;
    openQuestions: number;
    confidenceScore: number;
  };
};

export type ProjectIntelligenceReadiness = {
  overall: number;
  label: string;
  projectKind: string;
  dimensions: Record<string, unknown>;
  warnings: string[];
  sourceBreakdown: unknown;
};

type IntelligenceEntry = {
  id: number;
  title: string;
  summary: string | null;
  status: string | null;
  createdAt: string;
};

export type ProjectIntelligence = {
  projectId: number;
  projectName: string | null;
  projectDescription: string | null;
  projectStatus: string | null;
  dna: ProjectIntelligenceDna;
  health: ProjectIntelligenceHealth;
  readiness: ProjectIntelligenceReadiness;
  entries: {
    decisions: IntelligenceEntry[];
    blockers: (IntelligenceEntry & { severity: string | null })[];
    goals: IntelligenceEntry[];
    ideas: IntelligenceEntry[];
    features: IntelligenceEntry[];
    risks: IntelligenceEntry[];
    insights?: IntelligenceEntry[];
    openQuestionEntries: (IntelligenceEntry & { type: string })[];
  };
  computedAt: string;
};

export const projectIntelligenceQueryKey = (projectId: number | null) =>
  ["project-intelligence", projectId] as const;

export function useProjectIntelligence(projectId: number | null) {
  return useQuery<ProjectIntelligence>({
    queryKey: projectIntelligenceQueryKey(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/intelligence`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Intelligence fetch failed: ${res.status}`);
      return res.json() as Promise<ProjectIntelligence>;
    },
    enabled: projectId != null && projectId > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
