/**
 * Showcase.tsx — deterministic state grid for validation screenshots.
 * Rendered when ?showcase=1 is in the URL. Not shipped to production.
 *
 * Preserves the original 8 acceptance stories from the two-layer activity
 * brief and adds a States section covering loading / empty / error /
 * disconnected for every hydrated data source (changes, outputs, commit,
 * repository activity).
 */
import type { Run, RunStatus, PlanBlock, RunChange, RunArtifact, RunArtifactSummary } from "@contract";
import { StatusBadge, PlanCard, ThinkingIndicator } from "@/components/RunUi";
import { AtlasReceipt } from "@/components/AtlasReceipt";
import { RepositoryFeed, type RepositoryEvent } from "@/components/RepositoryFeed";
import { mockRepositoryEvents } from "@/mocks/mockActivity";
import type { LoadState } from "@/hooks/useRunHydration";

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
const readyChanges: RunChange[] = buildPlan.items.map((it) => ({
  stepId: `s-${it.seq}`, filePath: it.filePath, verb: "FILE_EDIT",
  beforeContent: null, afterContent: null, status: "applied",
}));
const readyArtifact: RunArtifactSummary = {
  id: "art-1", name: "Analytics Report.pdf", type: "pdf", mimeType: "application/pdf",
  sizeBytes: 184_000, status: "ready",
  downloadUrl: "https://example.invalid/analytics-report.pdf",
  previewUrl: "https://example.invalid/analytics-report/preview",
};

const H = {
  ready: (): { changes: LoadState<RunChange[]>; outputs: LoadState<RunArtifactSummary[]> } => ({
    changes: { status: "ready", data: readyChanges },
    outputs: { status: "empty" },
  }),
  readyWithArtifact: () => ({
    changes: { status: "ready", data: readyChanges } as LoadState<RunChange[]>,
    outputs: { status: "ready", data: [readyArtifact] } as LoadState<RunArtifactSummary[]>,
  }),
  loading: () => ({
    changes: { status: "loading" } as LoadState<RunChange[]>,
    outputs: { status: "loading" } as LoadState<RunArtifactSummary[]>,
  }),
  empty: () => ({
    changes: { status: "empty" } as LoadState<RunChange[]>,
    outputs: { status: "empty" } as LoadState<RunArtifactSummary[]>,
  }),
  error: () => ({
    changes: { status: "error", message: "network", retry: noop } as LoadState<RunChange[]>,
    outputs: { status: "error", message: "network", retry: noop } as LoadState<RunArtifactSummary[]>,
  }),
  disconnected: () => ({
    changes: { status: "disconnected" } as LoadState<RunChange[]>,
    outputs: { status: "disconnected" } as LoadState<RunArtifactSummary[]>,
  }),
};

/* ---------- Original acceptance stories ---------- */
const STORY_1 = makeRun("s1-chat", "succeeded", "CHAT", { response: "YouTube is grouped under 'Other' because there's no rule for it.", completedAt: NOW, elapsedMs: 900 });
const STORY_2 = makeRun("s2-build-live", "executing", "BUILD", { stepsDone: 1 });
const STORY_3 = makeRun("s3-build-done", "succeeded", "BUILD", { summary: "Added YouTube as recognized traffic source (3 files)", stepsDone: 3, completedAt: NOW, elapsedMs: 6100, commit: { status: "not_requested", sha: null, url: null, error: null, committedAt: null } });
const STORY_4 = makeRun("s4-artifact", "succeeded", "BUILD", { summary: "Generated Analytics Report", stepsDone: 1, completedAt: NOW, elapsedMs: 3200 });
const STORY_5 = makeRun("s5-changes", "succeeded", "BUILD", { summary: "Renamed Console → Terminal (2 files)", stepsDone: 2, completedAt: NOW, elapsedMs: 1400 });
const STORY_6 = makeRun("s6-commit", "succeeded", "BUILD", { summary: "Updated build lifecycle contract (1 file)", stepsDone: 1, completedAt: NOW, elapsedMs: 800, commit: { status: "succeeded", sha: "a1b2c3d4e5f6", url: "https://github.com/jochanae/atlas-idk/commit/a1b2c3d4e5f6", error: null, committedAt: NOW } });
const STORY_7_events: RepositoryEvent[] = mockRepositoryEvents().filter((e) => !e.runId);
const STORY_8 = makeRun("s8-build", "succeeded", "BUILD", { summary: "Added YouTube as recognized traffic source (3 files)", stepsDone: 3, completedAt: NOW, elapsedMs: 6100, commit: { status: "succeeded", sha: "a1b2c3d4e5f6", url: "https://github.com/jochanae/atlas-idk/commit/a1b2c3d4e5f6", error: null, committedAt: NOW } });
const STORY_8_events = mockRepositoryEvents(STORY_8.id);

/* ---------- New state stories ---------- */
const RUN_COMMIT_RUNNING = makeRun("st-commit-run", "succeeded", "BUILD", { summary: "Committing to GitHub", stepsDone: 3, completedAt: NOW, elapsedMs: 2200, commit: { status: "running", sha: null, url: null, error: null, committedAt: null } });
const RUN_COMMIT_FAILED = makeRun("st-commit-fail", "succeeded", "BUILD", { summary: "Commit rejected by GitHub", stepsDone: 3, completedAt: NOW, elapsedMs: 2200, commit: { status: "failed", sha: null, url: null, error: "GitHub push rejected: branch is protected.", committedAt: null } });

const ALL_STATUS: RunStatus[] = ["received", "thinking", "planning", "awaiting_confirmation", "executing", "testing", "verifying", "succeeded", "failed", "cancelled"];

export function Showcase() {
  return (
    <div style={{ background: "var(--bg)", color: "var(--text)", padding: 24, minHeight: "100vh" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 18 }}>Atlas · Next — Two-Layer Activity Model</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 32px" }}>
        Run Contract v1.2 · deterministic screenshots. Layer 1 = Atlas receipts. Layer 2 = repository feed.
      </p>

      <Section title="1 — Normal CHAT turn (prose only)">
        <div style={{ fontSize: 14 }}>{STORY_1.response}</div>
      </Section>
      <Section title="2 — BUILD running (one live card)">
        <PlanCard run={STORY_2} onConfirm={noop} onCancel={noop} />
      </Section>
      <Section title="3 — BUILD succeeded, no commit yet">
        <AtlasReceipt run={STORY_3} hydration={H.ready()} onCommit={noop} />
      </Section>
      <Section title="4 — BUILD succeeded with artifact (Open / Preview)">
        <AtlasReceipt run={STORY_4} hydration={H.readyWithArtifact()} />
      </Section>
      <Section title="5 — BUILD succeeded with file changes (Changes drawer)">
        <AtlasReceipt run={STORY_5} hydration={H.ready()} onCommit={noop} />
      </Section>
      <Section title="6 — commit_update: same receipt now shows the commit">
        <AtlasReceipt run={STORY_6} hydration={H.ready()} />
      </Section>
      <Section title="7 — Three external pushes: quiet updates only">
        <RepositoryFeed events={STORY_7_events} />
      </Section>
      <Section title="8 — Atlas build + its commit: one receipt AND one repo row, deduped">
        <AtlasReceipt run={STORY_8} hydration={H.ready()} />
        <RepositoryFeed events={STORY_8_events} ownedRunIds={[STORY_8.id]} />
      </Section>

      <hr style={{ margin: "40px 0 24px", border: 0, borderTop: "1px solid var(--border)" }} />
      <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>Loading / Empty / Error / Disconnected states</h2>

      <Section title="S1 — Receipt hydration: loading (changes + outputs)">
        <AtlasReceipt run={STORY_5} hydration={H.loading()} onCommit={noop} />
      </Section>
      <Section title="S2 — Receipt hydration: empty (run touched no files, produced no artifacts)">
        <AtlasReceipt run={STORY_5} hydration={H.empty()} onCommit={noop} />
      </Section>
      <Section title="S3 — Receipt hydration: error with retry (changes + outputs)">
        <AtlasReceipt run={STORY_5} hydration={H.error()} onCommit={noop} />
      </Section>
      <Section title="S4 — Receipt hydration: disconnected (actions disabled)">
        <AtlasReceipt run={STORY_5} hydration={H.disconnected()} disconnected onCommit={noop} />
      </Section>
      <Section title="S5 — Commit: running (in-place spinner)">
        <AtlasReceipt run={RUN_COMMIT_RUNNING} hydration={H.ready()} />
      </Section>
      <Section title="S6 — Commit: failed with retry + error message">
        <AtlasReceipt run={RUN_COMMIT_FAILED} hydration={H.ready()} onCommit={noop} />
      </Section>
      <Section title="S7 — Repository feed: loading">
        <RepositoryFeed events={[]} state="loading" />
      </Section>
      <Section title="S8 — Repository feed: error with retry">
        <RepositoryFeed events={[]} state="error" onRetry={noop} />
      </Section>
      <Section title="S9 — Repository feed: disconnected">
        <RepositoryFeed events={[]} state="disconnected" />
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
      <Section title="Failed with partial writes">
        <AtlasReceipt
          run={makeRun("r-fail", "failed", "BUILD", {
            summary: "Failed while patching trafficMap.ts",
            completedAt: NOW, elapsedMs: 4600,
            error: { code: "TOOL_FAILURE", message: "TypeScript check failed on src/lib/trafficMap.ts (line 42).", recoverable: true, stepId: "step-1", partialWritesOccurred: true },
          })}
          hydration={{ changes: { status: "ready", data: readyChanges.slice(0, 1) }, outputs: { status: "empty" } }}
        />
      </Section>
    </div>
  );
}

// Silence unused import in strict builds
export const _unused: RunArtifact | undefined = undefined;

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
