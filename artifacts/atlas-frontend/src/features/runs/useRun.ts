// Reactive lookup of a Run by id. Sources from the existing ActiveRuns store
// and adapts on the fly. When backend persistence lands, swap the source.

import { useMemo } from "react";
import { useAllRuns } from "@/components/home/ActiveRuns";
import { adaptRun } from "./adaptRun";
import type { Run } from "./types";

export function useRun(id: string | undefined | null): Run | null {
  const runs = useAllRuns();
  return useMemo(() => {
    if (!id) return null;
    const ar = runs.find((r) => r.id === id);
    return ar ? adaptRun(ar) : null;
  }, [id, runs]);
}

export function useRuns(): Run[] {
  const runs = useAllRuns();
  return useMemo(() => runs.map(adaptRun), [runs]);
}
