/**
 * Showcase.tsx — deterministic state grid for validation screenshots.
 * Rendered when ?showcase=1 is in the URL. Not shipped to production.
 *
 * Covers the 8 acceptance stories from the two-layer activity brief plus
 * the earlier lifecycle grid.
 */
import type { Run, RunStatus, PlanBlock } from "@contract";
import { StatusBadge, PlanCard, ThinkingIndicator } from "@/components/RunUi";
import { AtlasReceipt } from "@/components/AtlasReceipt";
import { RepositoryFeed, type RepositoryEvent } from "@/components/RepositoryFeed";
import { mockArtifacts, mockRepositoryEvents } from "@/mocks/mockActivity";

const NOW = new Date().toISOString();

const buildPlan: PlanBlock = {
  title: "Add YouTube as a recognized traffic source",
  rationale: "Normalize youtube.com and youtu.be referrers.",
  complexity: "MEDIUM",
  estimatedChanges: 3,
  items: [
    { seq: 1, file: "trafficMap.ts", filePath: "src/lib/trafficMap.ts", verb: "MUST", description: "Add referrer map.", status: "pending" },
    { seq: 2, file: "TrafficChannels.tsx", filePath: "src/components/TrafficChannels.tsx", verb: "SHOULD", description: "Add legend entry.", status: "pending" },
    { seq: 3, file: "trafficMap.test.ts", filePath: "src/lib/trafficMap.test.ts", verb: "MUST", description: "Cover short links.", status: "pending" },
  ],
};

function makeRun(id: string, status: RunStatus, intent: "BUILD" | "CHAT" | "DECIDE", overrides: Partial<Run> = {}): Run {
  return {
    id, projectId: null, conversationId: "showcase-conv",
    status, intent,
    prompt: "", response: null, summary: null,
    plan: intent === "BUILD" ? buildPlan : null,
    stepCount: 3, stepsDone: 0,
    error: null, verification: null, commit: null, snapshotRef: null,
    createdAt: NOW, updatedAt: NOW, completedAt: null, elapsedMs: null,
    ...overrides,
  };
}

const noop = () => {};

/* ---------- Acceptance stories ---------- */

const STORY_1_run = makeRun("s1-chat", "succeeded", "CHAT", {
  response: "YouTube is currently grouped under 'Other' because there's no rule for it.",
  summary: null, // CHAT turns never render a receipt
  completedAt: NOW, elapsedMs: 900,
});

const STORY_2_run = makeRun("s2-build-live", "executing", "BUILD", { stepsDone: 1 });

const STORY_3_run = makeRun("s3-build-done", "succeeded", "BUILD", {
  summary: "Added YouTube as recognized traffic source (3 files)",
  stepsDone: 3, completedAt: NOW, elapsedMs: 6100,
  commit: { status: "not_requested", sha: null, url: null, error: null, committedAt: null },
});

const STORY_4_run = makeRun("s4-artifact", "succeeded", "BUILD", {
  summary: "Generated Analytics Report",
  stepsDone: 1, completedAt: NOW, elapsedMs: 3200,
  commit: null,
});

const STORY_5_run = makeRun("s5-changes", "succeeded", "BUILD", {
  summary: "Renamed Console → Terminal (2 files)",
  stepsDone: 2, completedAt: NOW, elapsedMs: 1400,
  commit: null,
});

const STORY_6_run = makeRun("s6-commit", "succeeded", "BUILD", {
  summary: "Updated build lifecycle contract (1 file)",
  stepsDone: 1, completedAt: NOW, elapsedMs: 800,
  commit: {
    status: "succeeded",
    sha: "a1b2c3d4e5f6",
    url: "https://github.com/jochanae/atlas-idk/commit/a1b2c3d4e5f6",
    error: null, committedAt: NOW,
  },
});

const STORY_7_events: RepositoryEvent[] = [
  {
    id: "s7-a", origin: "manual", title: "Fix env var typo", subtitle: "jochanae",
    sha: "44aa112", url: "https://github.com/jochanae/atlas-idk/commit/44aa112",
    timestamp: new Date(Date.now() - 20 * 60_000).toISOString(),
  },
  {
    id: "s7-b", origin: "replit", title: "Sync backend routes", subtitle: "Replit deploy",
    sha: "e91f77c", url: "https://github.com/jochanae/atlas-idk/commit/e91f77c",
    timestamp: new Date(Date.now() - 90 * 60_000).toISOString(),
  },
  {
    id: "s7-c", origin: "merge", title: "Merge branch 'contract-v1.2' into main", subtitle: "12 commits",
    sha: "7dfe019", url: "https://github.com/jochanae/atlas-idk/commit/7dfe019",
    timestamp: new Date(Date.now() - 240 * 60_000).toISOString(),
  },
];

const STORY_8_run = makeRun("s8-build", "succeeded", "BUILD", {
  summary: "Added YouTube as recognized traffic source (3 files)",
  stepsDone: 3, completedAt: NOW, elapsedMs: 6100,
  commit: {
    status: "succeeded", sha: "a1b2c3d4e5f6",
    url: "https://github.com/jochanae/atlas-idk/commit/a1b2c3d4e5f6",
    error: null, committedAt: NOW,
  },
});
const STORY_8_events = mockRepositoryEvents(STORY_8_run.id);

const ALL_STATUS: RunStatus[] = [
  "received", "thinking", "planning", "awaiting_confirmation",
  "executing", "testing", "verifying", "succeeded", "failed", "cancelled",
];

export function Showcase() {
  return (
    <div style={{ background: "var(--bg)", color: "var(--text)", padding: 24, minHeight: "100vh" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 18 }}>Atlas · Next — Two-Layer Activity Model</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 32px" }}>
        Run Contract v1.2 · deterministic screenshots. Layer 1 = Atlas receipts (inline). Layer 2 = repository feed (quiet updates).
      </p>

      <Section title="1 — Normal CHAT turn (prose only, no receipt, no card)">
        <div style={{ fontSize: 14 }}>{STORY_1_run.response}</div>
      </Section>

      <Section title="2 — BUILD running (one live execution card)">
        <PlanCard run={STORY_2_run} onConfirm={noop} onCancel={noop} />
      </Section>

      <Section title="3 — BUILD succeeded, no commit yet (settles to one receipt with Commit action)">
        <AtlasReceipt run={STORY_3_run} changesCount={3} onDetails={noop} onCommit={noop} />
      </Section>

      <Section title="4 — BUILD succeeded with artifact (Open / Download / Preview)">
        <AtlasReceipt run={STORY_4_run} artifacts={mockArtifacts} onPreview={noop} />
      </Section>

      <Section title="5 — BUILD succeeded with file changes (Details / Changes)">
        <AtlasReceipt run={STORY_5_run} changesCount={2} onDetails={noop} onCommit={noop} />
      </Section>

      <Section title="6 — Later commit_update: same receipt now shows the commit (no duplicate row)">
        <AtlasReceipt run={STORY_6_run} changesCount={1} onDetails={noop} />
      </Section>

      <Section title="7 — Three external GitHub pushes: grouped under quiet updates, not as receipts">
        <RepositoryFeed events={STORY_7_events} />
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
          Tap the row to expand. None of these render as Atlas receipts.
        </div>
      </Section>

      <Section title="8 — One Atlas build + its commit: one receipt AND one repo row, linked, never duplicated">
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>
          Layer 1 · Atlas receipt (owns the story of what Atlas completed)
        </div>
        <AtlasReceipt run={STORY_8_run} changesCount={3} onDetails={noop} />
        <div style={{ fontSize: 11, color: "var(--muted)", margin: "16px 0 6px" }}>
          Layer 2 · Repository feed (Atlas's commit is filtered out via ownedRunIds; only external events shown)
        </div>
        <RepositoryFeed events={STORY_8_events} ownedRunIds={[STORY_8_run.id]} />
      </Section>

      <hr style={{ margin: "40px 0 24px", border: 0, borderTop: "1px solid var(--border)" }} />

      <Section title="StatusBadge — all 10 RunStatus values">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {ALL_STATUS.map((s) => <StatusBadge key={s} status={s} />)}
        </div>
      </Section>

      <Section title="ThinkingIndicator">
        <ThinkingIndicator />
      </Section>

      <Section title="AtlasReceipt — failed with partial writes">
        <AtlasReceipt
          run={makeRun("r-fail", "failed", "BUILD", {
            summary: "Failed while patching trafficMap.ts",
            completedAt: NOW, elapsedMs: 4600,
            error: {
              code: "TOOL_FAILURE",
              message: "TypeScript check failed on src/lib/trafficMap.ts (line 42).",
              recoverable: true, stepId: "step-1", partialWritesOccurred: true,
            },
          })}
          changesCount={1}
          onDetails={noop}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, color: "var(--muted)", marginBottom: 12, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
