import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

export interface ApiRunStep {
  id: number;
  verb: string;
  target: string | null;
  status: string;
  detail: string | null;
  content: string | null;
  beforeContent: string | null;
  orderIndex: number;
  createdAt: string;
}

export interface ApiRun {
  id: string;
  projectId: number;
  threadId: number | null;
  messageId: number | null;
  mode: string;
  status: string;
  summary: string | null;
  startedAt: string;
  completedAt: string | null;
  elapsedMs: number | null;
  steps: ApiRunStep[];
}

export function useProjectRuns(
  projectId: number | undefined,
  options?: { enabled?: boolean },
) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ runs: ApiRun[] }>({
    queryKey: ["project-runs", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/runs`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`runs fetch failed: ${res.status}`);
      return res.json() as Promise<{ runs: ApiRun[] }>;
    },
    // Phase 3: accept caller-level enabled gate; default true.
    // refetchOnWindowFocus disabled — the workspace poller (30 s) and staleTime
    // already keep data fresh; window-focus refetches add noise without value.
    enabled: (options?.enabled ?? true) && !!projectId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["project-runs", projectId] });
  }, [queryClient, projectId]);

  return {
    runs: data?.runs ?? [],
    execLatestRun: data?.runs?.[0] ?? null,
    isLoading,
    invalidate,
  };
}
