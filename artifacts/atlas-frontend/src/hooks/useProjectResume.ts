import { useQuery } from "@tanstack/react-query";

export interface ResumeBrief {
  generatedAt: string;
  projectName: string;
  clarityScore: number;
  intent: string | null;
  audience: string | null;
  tone: string | null;
  openQuestions: string[];
  suggestedFirstBuild: string;
  threadSummary: string;
  fromConversation: boolean;
}

export function getProjectResumeQueryKey(projectId: number | null | undefined) {
  return ["project-resume", projectId] as const;
}

export function useProjectResume(projectId: number | null | undefined) {
  return useQuery({
    queryKey: getProjectResumeQueryKey(projectId),
    queryFn: async (): Promise<ResumeBrief | null> => {
      if (!projectId) return null;
      let headers: Record<string, string> = {};
      try {
        const token = localStorage.getItem("atlas-auth-token");
        if (token) headers = { Authorization: `Bearer ${token}` };
      } catch {}
      const res = await fetch(`/api/projects/${projectId}/resume`, {
        credentials: "include",
        headers,
      });
      if (!res.ok) return null;
      const data = await res.json() as { artifact: { content: string; updatedAt: string } | null };
      if (!data.artifact?.content) return null;
      try {
        return JSON.parse(data.artifact.content) as ResumeBrief;
      } catch { return null; }
    },
    enabled: !!projectId,
    staleTime: 60_000,
    retry: false,
  });
}
