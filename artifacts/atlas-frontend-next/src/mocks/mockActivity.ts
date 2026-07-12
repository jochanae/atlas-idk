import type { RunArtifactSummary } from "@contract";
import type { RepositoryEvent } from "@/components/RepositoryFeed";

/**
 * Deterministic mock data for the two-layer activity showcase.
 *
 * Repository events include one that is `runId`-linked (so the receipt owns
 * it and the feed drops it) plus three purely external events (Replit +
 * manual push + merge) that stay in the quiet-updates group.
 */

const HOUR = 1000 * 60 * 60;
const now = Date.now();
const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString();

export const mockArtifacts: RunArtifactSummary[] = [
  {
    id: "art-1",
    name: "Analytics Report.pdf",
    type: "pdf",
    mimeType: "application/pdf",
    sizeBytes: 184_000,
    status: "ready",
    downloadUrl: "https://example.invalid/analytics-report.pdf",
    previewUrl: "https://example.invalid/analytics-report/preview",
  },
];

/**
 * A recognized Atlas BUILD run — this repo event MUST be filtered out of the
 * feed when passed via ownedRunIds so the Atlas receipt is the single source
 * of that story.
 */
export function mockRepositoryEvents(ownedRunId?: string): RepositoryEvent[] {
  return [
    {
      id: "evt-atlas-1",
      origin: "atlas",
      title: "Add YouTube as recognized traffic source",
      subtitle: "3 files · Atlas run",
      sha: "a1b2c3d4e5f6",
      url: "https://github.com/jochanae/atlas-idk/commit/a1b2c3d4e5f6",
      timestamp: iso(2 * 60 * 1000),
      runId: ownedRunId, // <— dedup key
    },
    {
      id: "evt-replit-1",
      origin: "replit",
      title: "Sync backend routes",
      subtitle: "Replit deploy",
      sha: "e91f77c",
      url: "https://github.com/jochanae/atlas-idk/commit/e91f77c",
      timestamp: iso(1 * HOUR),
    },
    {
      id: "evt-manual-1",
      origin: "manual",
      title: "Fix env var typo",
      subtitle: "jochanae",
      sha: "44aa112",
      url: "https://github.com/jochanae/atlas-idk/commit/44aa112",
      timestamp: iso(3 * HOUR),
    },
    {
      id: "evt-merge-1",
      origin: "merge",
      title: "Merge branch 'contract-v1.2' into main",
      subtitle: "12 commits",
      sha: "7dfe019",
      url: "https://github.com/jochanae/atlas-idk/commit/7dfe019",
      timestamp: iso(6 * HOUR),
    },
  ];
}
