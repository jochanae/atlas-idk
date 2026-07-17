import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceEvent } from "@/lib/workspaceEventBus";

export const PARKED_COUNT_QUERY_KEY = ["entries", "parked-count"] as const;

async function fetchParkedCount(): Promise<number> {
  try {
    const res = await fetch("/api/entries/parked-count", { credentials: "include" });
    if (!res.ok) return 0;
    const data = await res.json() as { count: number };
    return typeof data.count === "number" ? data.count : 0;
  } catch {
    return 0;
  }
}

export function useParkedCount(): number {
  const queryClient = useQueryClient();
  const { data = 0 } = useQuery({
    queryKey: PARKED_COUNT_QUERY_KEY,
    queryFn: fetchParkedCount,
    staleTime: 30_000,
    // Native file pickers blur/focus the tab; a parked-count refetch on return
    // is unnecessary and can race 401 → login mid-attach on mobile.
    refetchOnWindowFocus: false,
  });

  // Subscribe to the event bus so the badge refreshes immediately after any
  // park action — no more 30s wait caused by staleTime.
  useWorkspaceEvent("entry-changed", () => {
    void queryClient.invalidateQueries({ queryKey: PARKED_COUNT_QUERY_KEY });
  });

  return data;
}

export function useInvalidateParkedCount() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: PARKED_COUNT_QUERY_KEY });
}
