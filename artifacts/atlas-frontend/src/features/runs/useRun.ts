// Reactive lookup of a Run by id. Sources from the existing ActiveRuns store
// and adapts on the fly. Falls back to a DB fetch via /api/runs/:id when
// the run isn't found in memory (e.g. after a page reload).

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAllRuns } from "@/components/home/ActiveRuns";
import { adaptRun } from "./adaptRun";
import type { Run } from "./types";

interface ApiRunRow {
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
  steps: Array<{
    id: number;
    verb: string;
    target: string | null;
    status: string;
    detail: string | null;
    createdAt: string;
  }>;
}

function adaptDbRun(row: ApiRunRow): Run {
  const runStatus: Run["status"] =
    row.status === "succeeded" ? "applied"
    : row.status === "failed" ? "failed"
    : "running";

  return {
    id: row.id,
    status: runStatus,
    title: row.summary ?? "Run",
    createdAt: new Date(row.startedAt).getTime(),
    elapsedMs: row.elapsedMs ?? null,
    files: row.steps
      .filter((s) => s.verb === "FILE_EDIT" || s.verb === "LINE_PATCH" || s.verb === "FILE_DELETE")
      .map((s) => s.target ?? "")
      .filter(Boolean),
    produced: [],
    applyError: null,
    steps: row.steps.map((s) => ({
      verb: s.verb,
      target: s.target,
      status: s.status,
      detail: s.detail,
    })),
  } as unknown as Run;
}

export function useRun(id: string | undefined | null): Run | null {
  const runs = useAllRuns();
  const inMemory = useMemo(() => {
    if (!id) return null;
    const ar = runs.find((r) => r.id === id);
    return ar ? adaptRun(ar) : null;
  }, [id, runs]);

  const { data: dbRun } = useQuery<ApiRunRow>({
    queryKey: ["run", id],
    queryFn: async () => {
      const res = await fetch(`/api/runs/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error(`run fetch failed: ${res.status}`);
      return res.json() as Promise<ApiRunRow>;
    },
    enabled: !!id && !inMemory,
    staleTime: 60_000,
    retry: false,
  });

  if (inMemory) return inMemory;
  if (dbRun) return adaptDbRun(dbRun);
  return null;
}

export function useRuns(): Run[] {
  const runs = useAllRuns();
  return useMemo(() => runs.map(adaptRun), [runs]);
}
