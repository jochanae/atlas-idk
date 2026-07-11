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
  artifactUrl?: string | null;
  orderIndex: number;
  createdAt: string;
}

export interface ApiRun {
  id: string;
  projectId: number;
  threadId: number | null;
  messageId: number | null;
  conversationId?: string | null;
  mode: string;
  status: string;
  summary: string | null;
  prompt?: string | null;
  intent?: string | null;
  startedAt: string;
  completedAt: string | null;
  elapsedMs: number | null;
  steps: ApiRunStep[];
}

export function useProjectRuns(
  projectId: number | undefined,
  options?: { enabled?: boolean; conversationId?: string | null },
) {
  const queryClient = useQueryClient();
  const conversationId = options?.conversationId ?? null;

  const { data, isLoading } = useQuery<{ runs: ApiRun[] }>({
    // Cache key includes conversationId so switching threads in the same
    // project doesn't reuse the previous thread's Timeline entries.
    queryKey: ["project-runs", projectId, conversationId],
    queryFn: async () => {
      const url = conversationId
        ? `/api/projects/${projectId}/runs?conversationId=${encodeURIComponent(conversationId)}`
        : `/api/projects/${projectId}/runs`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`runs fetch failed: ${res.status}`);
      return res.json() as Promise<{ runs: ApiRun[] }>;
    },
    // Phase 3: accept caller-level enabled gate; default true.
    // refetchOnWindowFocus disabled — the workspace poller (30 s) and staleTime
    // already keep data fresh; window-focus refetches add noise without value.
    // Run-identity spine: while any run in this project's list is still
    // `running`, poll every 1.5s so live Timeline steps appear as they are
    // incrementally persisted by the backend. Stop polling once every run has
    // reached a terminal status.
    enabled: (options?.enabled ?? true) && !!projectId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const runs = (query.state.data as { runs?: Array<{ status?: string }> } | undefined)?.runs ?? [];
      return runs.some((r) => r.status === "running") ? 1500 : false;
    },
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
