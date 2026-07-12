/**
 * Showcase.tsx — deterministic state grid for validation screenshots.
 * Rendered when ?showcase=1 is in the URL. Not shipped to production.
 *
 * Shows every mocked lifecycle state simultaneously with hardcoded Run objects
 * so screenshots don't depend on timer timing.
 */
import type { Run, RunStatus } from "@contract";
import { StatusBadge, PlanCard, ReceiptChip, ThinkingIndicator } from "@/components/RunUi";

const NOW = new Date().toISOString();

const buildPlan = {
  title: "Add YouTube as a recognized traffic source",
  rationale: "Normalize youtube.com and youtu.be referrers so analytics attributes them correctly.",
  complexity: "MEDIUM" as const,
  estimatedChanges: 3,
  items: [
    { seq: 1, file: "trafficMap.ts", filePath: "src/lib/trafficMap.ts", verb: "MUST" as const, description: "Add youtube.com/youtu.be to the referrer map.", status: "pending" as const },
    { seq: 2, file: "TrafficChannels.tsx", filePath: "src/components/TrafficChannels.tsx", verb: "SHOULD" as const, description: "Add YouTube icon + color to channel legend.", status: "pending" as const },
    { seq: 3, file: "trafficMap.test.ts", filePath: "src/lib/trafficMap.test.ts", verb: "MUST" as const, description: "Cover both youtube.com and youtu.be short links.", status: "pending" as const },
  ],
};

function makeRun(id: string, status: RunStatus, intent: "BUILD" | "CHAT" | "DECIDE", overrides: Partial<Run> = {}): Run {
  return {
    id,
    projectId: null,
    conversationId: "showcase-conv",
    status,
    intent,
    prompt: "",
    response: null,
    summary: null,
    plan: intent === "BUILD" ? buildPlan : null,
    stepCount: 3,
    stepsDone: 0,
    error: null,
    verification: null,
    commit: null,
    snapshotRef: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    elapsedMs: null,
    ...overrides,
  };
}

const STATES: { label: string; run: Run }[] = [
  {
    label: "CHAT — thinking",
    run: makeRun("r-chat-thinking", "thinking", "CHAT"),
  },
  {
    label: "CHAT — succeeded (receipt)",
    run: makeRun("r-chat-done", "succeeded", "CHAT", {
      summary: "That flow makes sense — YouTube is in 'Other' because there's no rule for it.",
      completedAt: NOW, elapsedMs: 1200,
    }),
  },
  {
    label: "DECIDE — planning",
    run: makeRun("r-decide-planning", "planning", "DECIDE", {
      plan: { title: "Rename Ledger → Decisions", rationale: "Users mistake Ledger for a financial view.", complexity: "LOW", estimatedChanges: 0, items: [{ seq: 1, file: "nav.tsx", filePath: "src/nav.tsx", verb: "COULD", description: "Rename the sidebar label.", status: "pending" }] },
    }),
  },
  {
    label: "BUILD — awaiting confirmation",
    run: makeRun("r-build-await", "awaiting_confirmation", "BUILD"),
  },
  {
    label: "BUILD — executing (step 1 of 3)",
    run: makeRun("r-build-exec", "executing", "BUILD", { stepsDone: 1 }),
  },
  {
    label: "BUILD — testing",
    run: makeRun("r-build-test", "testing", "BUILD", { stepsDone: 3 }),
  },
  {
    label: "BUILD — verifying",
    run: makeRun("r-build-verify", "verifying", "BUILD", {
      stepsDone: 3,
      verification: {
        status: "running",
        checks: [
          { id: "ts", label: "TypeScript", status: "running", output: null, durationMs: null },
          { id: "tests", label: "Tests", status: "pending", output: null, durationMs: null },
        ],
      },
    }),
  },
  {
    label: "BUILD — succeeded",
    run: makeRun("r-build-ok", "succeeded", "BUILD", {
      summary: "Added YouTube as recognized traffic source (3 files)",
      stepsDone: 3, completedAt: NOW, elapsedMs: 6100,
      commit: { status: "not_requested", sha: null, url: null, error: null, committedAt: null },
    }),
  },
  {
    label: "BUILD — failed (partial writes)",
    run: makeRun("r-build-fail", "failed", "BUILD", {
      summary: "Failed while patching trafficMap.ts",
      completedAt: NOW, elapsedMs: 4600,
      error: {
        code: "TOOL_FAILURE",
        message: "TypeScript check failed on src/lib/trafficMap.ts (line 42).",
        recoverable: true,
        stepId: "step-1",
        partialWritesOccurred: true,
      },
    }),
  },
  {
    label: "BUILD — cancelled (partial writes mid-exec)",
    run: makeRun("r-build-cancel", "cancelled", "BUILD", {
      stepsDone: 1, completedAt: NOW,
      error: {
        code: "CANCELLED_PARTIAL",
        message: "Cancelled mid-execution — some files may have been partially updated.",
        recoverable: true,
        stepId: null,
        partialWritesOccurred: true,
      },
    }),
  },
];

const ALL_STATUS: RunStatus[] = [
  "received", "thinking", "planning", "awaiting_confirmation",
  "executing", "testing", "verifying", "succeeded", "failed", "cancelled",
];

function noop() {}

export function Showcase() {
  return (
    <div style={{ background: "var(--bg)", color: "var(--text)", padding: 24, minHeight: "100vh" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 18 }}>Atlas · Next — Lifecycle Showcase</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 32px" }}>
        Run Contract v1.2 · All states rendered deterministically (no timers).
      </p>

      {/* Status badge strip */}
      <Section title="StatusBadge — all 10 RunStatus values">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {ALL_STATUS.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </Section>

      {/* Per-state cards */}
      {STATES.map(({ label, run }) => (
        <Section key={run.id} title={label}>
          {run.status === "thinking" && run.intent !== "BUILD" ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <StatusBadge status={run.status} />
              <ThinkingIndicator />
            </div>
          ) : run.status === "succeeded" && (run.intent === "CHAT" || run.intent === "DECIDE") ? (
            <div style={{ color: "var(--muted)", fontSize: 14, fontStyle: "italic" }}>{run.summary}</div>
          ) : (run.intent === "BUILD" && (
            run.status === "awaiting_confirmation" ||
            run.status === "executing" ||
            run.status === "testing" ||
            run.status === "verifying"
          )) ? (
            <PlanCard run={run} onConfirm={noop} onCancel={noop} />
          ) : (run.intent === "BUILD" && (
            run.status === "succeeded" || run.status === "failed" || run.status === "cancelled"
          )) ? (
            <PlanCard run={run} onConfirm={noop} onCancel={noop} />
          ) : run.intent === "DECIDE" && run.status === "planning" ? (
            <PlanCard run={run} onConfirm={noop} onCancel={noop} />
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <StatusBadge status={run.status} />
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{run.intent}</span>
            </div>
          )}
        </Section>
      ))}

      {/* Concurrent BUILD + CHAT scenario */}
      <Section title="BUILD awaiting_confirmation + simultaneous CHAT thinking">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>Active CHAT turn (concurrent)</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <StatusBadge status="thinking" />
              <ThinkingIndicator />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>Active BUILD (the one live card)</div>
            <PlanCard
              run={makeRun("r-concurrent-build", "awaiting_confirmation", "BUILD")}
              onConfirm={noop}
              onCancel={noop}
            />
          </div>
        </div>
      </Section>

      {/* Receipt chips */}
      <Section title="ReceiptChip — succeeded BUILD (commit not yet requested)">
        <ReceiptChip
          run={makeRun("r-receipt", "succeeded", "BUILD", {
            summary: "Added YouTube traffic source (3 files)",
            commit: { status: "not_requested", sha: null, url: null, error: null, committedAt: null },
          })}
          onCommit={noop}
        />
      </Section>

      <Section title="ReceiptChip — succeeded BUILD (committed to GitHub)">
        <ReceiptChip
          run={makeRun("r-committed", "succeeded", "BUILD", {
            summary: "Added YouTube traffic source (3 files)",
            commit: {
              status: "succeeded",
              sha: "a1b2c3d4e5f6",
              url: "https://github.com/jochanae/atlas-idk/commit/a1b2c3d4e5f6",
              error: null,
              committedAt: NOW,
            },
          })}
        />
      </Section>

      <Section title="Zero BUILD cards — no active BUILD">
        <div style={{ color: "var(--muted)", fontStyle: "italic", fontSize: 14 }}>
          No runs yet — start a mock lifecycle from the panel on the right.
        </div>
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
