/**
 * useProjectSource — thin wrapper around the F2 Source Intelligence hooks
 * exported by @workspace/api-client-react. Resolves the primary source for a
 * project and re-exports the per-source hooks scoped to it.
 *
 * See docs/SOURCE_INTELLIGENCE_API.md.
 */
import { useMemo } from "react";
import {
  useListProjectSources,
  useSourceTree,
  useSourceFile,
  useSearchSource,
  useSourceSymbols,
  useSourceImports,
  useSourceRoutes,
  useSourceDiff,
  useAskSourceQa,
  useIngestProjectSource,
  type SourceListItem,
} from "@workspace/api-client-react";

export function useProjectPrimarySource(projectId: number | undefined) {
  const query = useListProjectSources(projectId ?? 0);
  const primary: SourceListItem | undefined = useMemo(() => {
    const list = query.data?.sources ?? [];
    return list.find((s) => s.isPrimary) ?? list[0];
  }, [query.data]);
  return {
    ...query,
    sources: query.data?.sources ?? [],
    primary,
    sourceId: primary?.id,
    status: primary?.lastIngestStatus,
  };
}

/**
 * Subscribe to ingest SSE progress for a source. Fires on every message
 * until `ready` | `failed`. Consumer manages lifecycle with an effect.
 */
export function subscribeSourceEvents(
  sourceId: string,
  onEvent: (e: {
    status: string;
    progress?: number;
    message?: string;
    fileCount?: number;
    processed?: number;
  }) => void,
): () => void {
  const es = new EventSource(`/api/sources/${sourceId}/events`);
  const handler = (evt: MessageEvent) => {
    try {
      onEvent(JSON.parse(evt.data));
    } catch {
      /* ignore */
    }
  };
  es.addEventListener("progress", handler as EventListener);
  es.onerror = () => es.close();
  return () => es.close();
}

export {
  useSourceTree,
  useSourceFile,
  useSearchSource,
  useSourceSymbols,
  useSourceImports,
  useSourceRoutes,
  useSourceDiff,
  useAskSourceQa,
  useIngestProjectSource,
};
