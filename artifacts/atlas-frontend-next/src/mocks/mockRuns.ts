import type { PlanBlock, RunIntent, TypedRunEvent } from "@contract";

/**
 * Mock lifecycle driver — replaces backend SSE while Phase 1 is UI-only.
 * Emits a scripted event sequence per intent/story so every surface can
 * render its full range of states.
 */

const chatPlan: PlanBlock = {
  title: "N/A",
  rationale: null,
  complexity: "LOW",
  estimatedChanges: 0,
  items: [],
};

const buildPlan: PlanBlock = {
  title: "Add YouTube as a recognized traffic source",
  rationale: "Normalize `youtube.com` and `youtu.be` referrers so the analytics dashboard attributes them correctly instead of grouping under 'Other'.",
  complexity: "MEDIUM",
  estimatedChanges: 3,
  items: [
    { seq: 1, file: "trafficMap.ts", filePath: "src/lib/trafficMap.ts", verb: "MUST", description: "Add youtube.com / youtu.be to the referrer → channel map.", status: "pending" },
    { seq: 2, file: "TrafficChannels.tsx", filePath: "src/components/TrafficChannels.tsx", verb: "SHOULD", description: "Add YouTube icon + color to the channel legend.", status: "pending" },
    { seq: 3, file: "trafficMap.test.ts", filePath: "src/lib/trafficMap.test.ts", verb: "MUST", description: "Cover both youtube.com and youtu.be short links.", status: "pending" },
  ],
};

const decidePlan: PlanBlock = {
  title: "Rename Ledger → Decisions",
  rationale: "Users repeatedly mistake Ledger for a financial view.",
  complexity: "LOW",
  estimatedChanges: 0,
  items: [
    { seq: 1, file: "nav.tsx", filePath: "src/nav.tsx", verb: "COULD", description: "Rename the sidebar label.", status: "pending" },
  ],
};

export const runFixtures = {
  build_success: "build_success",
  build_awaiting: "build_awaiting",
  build_failure: "build_failure",
  chat: "chat",
  decide: "decide",
} as const;

export type StoryKey = keyof typeof runFixtures;

interface DriveParams {
  runId: string;
  conversationId: string;
  intent: RunIntent;
  story?: StoryKey;
  onEvent: (evt: TypedRunEvent) => void;
}

function pickStory(intent: RunIntent, story?: StoryKey): StoryKey {
  if (story) return story;
  if (intent === "CHAT") return "chat";
  if (intent === "DECIDE") return "decide";
  return "build_success";
}

/**
 * Emits scripted events on a timer. Returns a cancel function that stops
 * any further emissions (used by RunProvider.cancel).
 */
export function driveMockRun({ runId, conversationId, intent, story, onEvent }: DriveParams): () => void {
  const chosen = pickStory(intent, story);
  let seq = 0;
  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const emit = (partial: Omit<TypedRunEvent, "eventId" | "seq" | "runId" | "conversationId" | "timestamp">) => {
    if (cancelled) return;
    seq += 1;
    onEvent({
      eventId: crypto.randomUUID(),
      seq,
      runId,
      conversationId,
      timestamp: new Date().toISOString(),
      ...partial,
    } as TypedRunEvent);
  };

  const schedule = (ms: number, fn: () => void) => {
    const t = setTimeout(() => { if (!cancelled) fn(); }, ms);
    timers.push(t);
  };

  // Initial creation is synchronous
  emit({ type: "run_created", payload: { status: "received", intent } });
  schedule(150, () => emit({ type: "run_status", payload: { status: "thinking" } }));

  if (chosen === "chat") {
    schedule(1200, () => emit({
      type: "run_complete",
      payload: { run: buildCompletedRun(runId, conversationId, intent, "succeeded", { response: "That flow makes sense — YouTube is currently in 'Other' because there's no rule for it." }) },
    }));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }

  if (chosen === "decide") {
    schedule(700, () => emit({ type: "run_status", payload: { status: "planning" } }));
    schedule(1400, () => emit({ type: "plan_ready", payload: { plan: decidePlan } }));
    schedule(2000, () => emit({
      type: "run_complete",
      payload: { run: buildCompletedRun(runId, conversationId, intent, "succeeded", { plan: decidePlan, summary: "Proposed renaming Ledger → Decisions" }) },
    }));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }

  // BUILD variants
  schedule(500, () => emit({ type: "run_status", payload: { status: "planning" } }));
  schedule(1100, () => emit({ type: "plan_ready", payload: { plan: buildPlan } }));
  schedule(1400, () => emit({ type: "run_status", payload: { status: "awaiting_confirmation" } }));

  if (chosen === "build_awaiting") {
    // Stop here — surface renders the Gate 1 confirmation card indefinitely
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }

  // Auto-confirm after a delay for success/failure stories
  schedule(2600, () => emit({ type: "run_status", payload: { status: "executing" } }));

  buildPlan.items.forEach((item, idx) => {
    schedule(2900 + idx * 500, () => emit({
      type: "step_update",
      payload: {
        step: {
          id: `step-${idx + 1}`,
          runId,
          seq: idx + 1,
          verb: "FILE_EDIT",
          status: "succeeded",
          title: `Edit ${item.file}`,
          detail: null,
          filePath: item.filePath,
          command: null,
          exitCode: null,
          outputSummary: null,
          artifact: null,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      },
    }));
  });

  if (chosen === "build_failure") {
    schedule(4600, () => emit({
      type: "run_complete",
      payload: {
        run: buildCompletedRun(runId, conversationId, intent, "failed", {
          plan: buildPlan,
          summary: "Failed while patching trafficMap.ts",
          error: {
            code: "TOOL_FAILURE",
            message: "TypeScript check failed on src/lib/trafficMap.ts (line 42).",
            recoverable: true,
            stepId: "step-1",
            partialWritesOccurred: true,
          },
        }),
      },
    }));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }

  schedule(4600, () => emit({ type: "run_status", payload: { status: "testing" } }));
  schedule(5300, () => emit({ type: "run_status", payload: { status: "verifying" } }));
  schedule(5800, () => emit({
    type: "verification_update",
    payload: {
      verification: {
        status: "passed",
        checks: [
          { id: "ts", label: "TypeScript", status: "passed", output: null, durationMs: 812 },
          { id: "tests", label: "Tests", status: "passed", output: null, durationMs: 1240 },
        ],
      },
    },
  }));
  schedule(6100, () => emit({
    type: "run_complete",
    payload: {
      run: buildCompletedRun(runId, conversationId, intent, "succeeded", {
        plan: buildPlan,
        summary: "Added YouTube as recognized traffic source (3 files)",
        stepCount: buildPlan.items.length,
        stepsDone: buildPlan.items.length,
        verification: {
          status: "passed",
          checks: [
            { id: "ts", label: "TypeScript", status: "passed", output: null, durationMs: 812 },
            { id: "tests", label: "Tests", status: "passed", output: null, durationMs: 1240 },
          ],
        },
        commit: { status: "not_requested", sha: null, url: null, error: null, committedAt: null },
      }),
    },
  }));

  return () => { cancelled = true; timers.forEach(clearTimeout); };
}

function buildCompletedRun(
  id: string,
  conversationId: string,
  intent: RunIntent,
  status: "succeeded" | "failed",
  overrides: Partial<import("@contract").Run> = {},
): import("@contract").Run {
  const now = new Date().toISOString();
  return {
    id,
    projectId: null,
    conversationId,
    status,
    intent,
    prompt: "",
    response: null,
    summary: null,
    plan: intent === "CHAT" ? null : chatPlan,
    stepCount: 0,
    stepsDone: 0,
    error: null,
    verification: null,
    commit: null,
    snapshotRef: null,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    elapsedMs: 6100,
    ...overrides,
  };
}
