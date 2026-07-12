import { useCallback, useEffect, useState } from "react";
import { useRun } from "@/context/RunProvider";
import type { RepositoryEvent } from "@/components/RepositoryFeed";
import { mockRepositoryEvents } from "@/mocks/mockActivity";

export type FeedFlavor = "success" | "empty" | "slow" | "error";

/**
 * useRepositoryEvents — mocked repository-activity fetcher.
 *
 * Kept in the frontend until Replit confirms the Phase 2 /api/nexus/activity
 * endpoint conforms to V1.2 and preserves runId ownership. Do NOT swap this
 * for a live fetch inside a surface — swap it here or in the provider.
 */
export function useRepositoryEvents({
  ownedRunId,
  flavor = "success",
}: {
  ownedRunId?: string;
  flavor?: FeedFlavor;
}) {
  const { connectionStatus } = useRun();
  const disconnected = connectionStatus === "disconnected";
  const [state, setState] = useState<{
    status: "loading" | "ready" | "empty" | "error" | "disconnected";
    data: RepositoryEvent[];
    error?: string;
  }>({ status: "loading", data: [] });

  const load = useCallback(() => {
    if (disconnected) {
      setState({ status: "disconnected", data: [] });
      return;
    }
    setState({ status: "loading", data: [] });
    const latency = flavor === "slow" ? 1200 : 200;
    const t = setTimeout(() => {
      if (flavor === "error") {
        setState({ status: "error", data: [], error: "Couldn't load repository activity." });
        return;
      }
      const data = flavor === "empty" ? [] : mockRepositoryEvents(ownedRunId);
      setState({ status: data.length ? "ready" : "empty", data });
    }, latency);
    return () => clearTimeout(t);
  }, [disconnected, flavor, ownedRunId]);

  useEffect(() => { const c = load(); return c; }, [load]);

  return { ...state, reload: load };
}
