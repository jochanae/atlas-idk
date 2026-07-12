import { useCallback, useEffect, useState } from "react";
import { useRun } from "@/context/RunContext";
import type { RepositoryEvent } from "@/components/RepositoryFeed";
import * as api from "@/lib/api";
import { mockRepositoryEvents } from "@/mocks/mockActivity";

/**
 * useRepositoryEvents — repository quiet-updates fetcher.
 *
 * Live path: GET /api/nexus/activity. On network / shape errors, the caller
 * receives an error state and the RepositoryFeed renders its own recovery UI.
 *
 * The identity rule from the two-layer brief is enforced downstream: events
 * whose `runId` matches an Atlas-owned run are filtered out by the feed.
 */
export type FeedStatus = "loading" | "ready" | "empty" | "error" | "disconnected";

export interface RepositoryEventsState {
  status: FeedStatus;
  data: RepositoryEvent[];
  error?: string;
  reload: () => void;
}

function coerceEvent(raw: unknown): RepositoryEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : null;
  const origin = r.origin as RepositoryEvent["origin"] | undefined;
  const title = typeof r.title === "string" ? r.title : null;
  const timestamp = typeof r.timestamp === "string" ? r.timestamp : null;
  if (!id || !origin || !title || !timestamp) return null;
  return {
    id, origin, title, timestamp,
    subtitle: typeof r.subtitle === "string" ? r.subtitle : undefined,
    sha: typeof r.sha === "string" ? r.sha : undefined,
    url: typeof r.url === "string" ? r.url : undefined,
    runId: typeof r.runId === "string" ? r.runId : undefined,
  };
}

export function useRepositoryEvents({
  conversationId,
  useMockData = false,
  ownedRunId,
}: {
  conversationId?: string;
  useMockData?: boolean;
  ownedRunId?: string;
}): RepositoryEventsState {
  const { connectionStatus } = useRun();
  const disconnected = connectionStatus === "disconnected";
  const [state, setState] = useState<Omit<RepositoryEventsState, "reload">>({
    status: "loading", data: [],
  });

  const load = useCallback(async () => {
    if (disconnected) {
      setState({ status: "disconnected", data: [] });
      return;
    }
    setState({ status: "loading", data: [] });
    if (useMockData) {
      const data = mockRepositoryEvents(ownedRunId);
      setState({ status: data.length ? "ready" : "empty", data });
      return;
    }
    try {
      const raw = await api.listRepositoryActivity(conversationId);
      const data = (Array.isArray(raw) ? raw : []).map(coerceEvent).filter((e): e is RepositoryEvent => e !== null);
      setState({ status: data.length ? "ready" : "empty", data });
    } catch (e) {
      // 4xx (not authenticated, no linked repo, not found) → silent empty state.
      // Only genuine 5xx or network failures surface an error with a retry button.
      if (e instanceof api.ApiError && e.status < 500) {
        setState({ status: "empty", data: [] });
        return;
      }
      setState({
        status: "error", data: [],
        error: (e as Error).message ?? "Couldn't load repository activity.",
      });
    }
  }, [disconnected, useMockData, ownedRunId, conversationId]);

  useEffect(() => { load(); }, [load]);

  return { ...state, reload: load };
}
