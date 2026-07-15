/**
 * Execution State Machine — v1.4
 *
 * Pure functions and DB helpers for advancing a run's ExecutionState.
 *
 * v1.4 changes:
 *   - Targets execution_runs (not contract_runs — deprecated)
 *   - deriveRunOutcome() returns RunOutcome (structured, not free-text)
 *   - advanceRunExecutionState() validates evidenceRefs against execution_run_steps
 *   - Evidence validation: purpose + run ownership + ordering per target state
 *   - runId is server-provided from context — never accepted from model input
 *
 * Imported by:
 *   - artifacts/api-server/src/routes/runs.ts
 *   - artifacts/api-server/src/lib/agent-tools/advance-execution-state.ts
 */

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import * as bus from "./runEventBus";
import type {
  ExecutionState,
  IssueType,
  RunMode,
  VerificationContract,
  StateTransitionEvidence,
  OpenQuestion,
  RunOutcome,
  EvidenceRef,
  StepPurpose,
  ModeHistoryEntry,
} from "@workspace/run-contract";
import { REQUIRED_STEPS_BY_ISSUE_TYPE } from "@workspace/run-contract";

// ---------------------------------------------------------------------------
// Transition table
// ---------------------------------------------------------------------------

export const VALID_NEXT_STATES: Record<ExecutionState, ExecutionState[]> = {
  UNINVESTIGATED:    ["INVESTIGATING", "BLOCKED", "FAILED"],
  INVESTIGATING:     ["CAUSE_CONFIRMED", "BLOCKED", "FAILED"],
  CAUSE_CONFIRMED:   ["CHANGE_PROPOSED", "BLOCKED", "FAILED"],
  CHANGE_PROPOSED:   ["CHANGE_APPLIED", "BLOCKED", "FAILED"],
  CHANGE_APPLIED:    ["BUILD_VERIFIED", "BLOCKED", "FAILED"],
  BUILD_VERIFIED:    ["RUNTIME_VERIFIED", "BLOCKED", "FAILED"],
  RUNTIME_VERIFIED:  ["USER_FLOW_VERIFIED", "BLOCKED", "FAILED"],
  USER_FLOW_VERIFIED:[],
  BLOCKED:           [],
  FAILED:            [],
};

// ---------------------------------------------------------------------------
// StepPurpose derivation — server-side utility
// ---------------------------------------------------------------------------

const PURPOSES_FOR_INVESTIGATION: StepPurpose[] = ["CODE_SEARCH", "FILE_INSPECTION"];
const PURPOSES_FOR_PATCH: StepPurpose[] = ["PATCH"];
const PURPOSES_FOR_BUILD: StepPurpose[] = ["BUILD", "TYPECHECK"];
const PURPOSES_FOR_RUNTIME: StepPurpose[] = ["STARTUP", "HEALTH_CHECK", "DEPLOY"];
const PURPOSES_FOR_BROWSER: StepPurpose[] = ["BROWSER_FLOW"];

/**
 * Derive StepPurpose from a step's verb and optional command string.
 * Called at step creation time — never from model input.
 * Stored in execution_run_steps.step_purpose.
 */
export function derivePurposeFromVerb(verb: string, command?: string | null): StepPurpose {
  const v = verb.toUpperCase();
  switch (v) {
    case "FILE_EDIT":
    case "LINE_PATCH":
    case "FILE_CREATE":
    case "FILE_DELETE": return "PATCH";
    case "FILE_READ":
    case "READ":
    case "READING": return "FILE_INSPECTION";
    case "SEARCH": return "CODE_SEARCH";
    case "TEST": return "TEST";
    case "ARTIFACT_CREATED":
    case "SUMMARY":
    case "ACTIVITY":
    case "PROMPT":
    case "ERROR": return "OTHER";
    case "SHELL": {
      if (!command) return "OTHER";
      const cmd = command.toLowerCase();
      if (/\b(tsc|typecheck|type-check)\b/.test(cmd)) return "TYPECHECK";
      if (/\b(build|esbuild|webpack|rollup|vite build|cargo build|pnpm build)\b/.test(cmd)) return "BUILD";
      if (/\b(vitest|jest|mocha|pytest|go test|npm test|pnpm test)\b/.test(cmd)) return "TEST";
      if (/\b(health|readiness|liveness|curl|wget)\b/.test(cmd)) return "HEALTH_CHECK";
      if (/\b(start|restart|pnpm dev|pnpm start|npm start|node server)\b/.test(cmd)) return "STARTUP";
      if (/\b(deploy|fly deploy|docker push|kubectl apply|heroku)\b/.test(cmd)) return "DEPLOY";
      if (/\b(playwright|puppeteer|cypress)\b/.test(cmd)) return "BROWSER_FLOW";
      return "OTHER";
    }
    default:
      if (v.includes("SEARCH") || v.includes("GREP")) return "CODE_SEARCH";
      return "OTHER";
  }
}

// ---------------------------------------------------------------------------
// RunOutcome derivation — backend-owned, never model-written
// ---------------------------------------------------------------------------

/** Canonical forward order. BLOCKED/FAILED are off-path terminal states. */
const FLOW_ORDER: ExecutionState[] = [
  "UNINVESTIGATED",
  "INVESTIGATING",
  "CAUSE_CONFIRMED",
  "CHANGE_PROPOSED",
  "CHANGE_APPLIED",
  "BUILD_VERIFIED",
  "RUNTIME_VERIFIED",
  "USER_FLOW_VERIFIED",
];

const OUTCOME_CODE_FOR_STATE: Record<ExecutionState, RunOutcome["code"]> = {
  UNINVESTIGATED:    "NOT_STARTED",
  INVESTIGATING:     "INVESTIGATING",
  CAUSE_CONFIRMED:   "CAUSE_CONFIRMED",
  CHANGE_PROPOSED:   "CAUSE_CONFIRMED",
  CHANGE_APPLIED:    "CHANGE_APPLIED",
  BUILD_VERIFIED:    "BUILD_VERIFIED",
  RUNTIME_VERIFIED:  "RUNTIME_VERIFIED",
  USER_FLOW_VERIFIED:"USER_FLOW_VERIFIED",
  BLOCKED:           "BLOCKED",
  FAILED:            "FAILED",
};

const STATE_LABELS: Record<ExecutionState, string> = {
  UNINVESTIGATED:    "Not started",
  INVESTIGATING:     "Investigating",
  CAUSE_CONFIRMED:   "Cause confirmed",
  CHANGE_PROPOSED:   "Plan ready",
  CHANGE_APPLIED:    "Patch applied",
  BUILD_VERIFIED:    "Build verified",
  RUNTIME_VERIFIED:  "Runtime verified",
  USER_FLOW_VERIFIED:"User flow verified",
  BLOCKED:           "Blocked",
  FAILED:            "Failed",
};

const PENDING_SUFFIX: Record<ExecutionState, string> = {
  UNINVESTIGATED:    "investigation",
  INVESTIGATING:     "investigation",
  CAUSE_CONFIRMED:   "root cause confirmation",
  CHANGE_PROPOSED:   "plan proposal",
  CHANGE_APPLIED:    "patch application",
  BUILD_VERIFIED:    "build verification",
  RUNTIME_VERIFIED:  "runtime verification",
  USER_FLOW_VERIFIED:"user flow verification",
  BLOCKED:           "unblocking",
  FAILED:            "recovery",
};

/**
 * Derive the RunOutcome for a run in a given state.
 * outcome.complete = true only when all requiredSteps are in completedSteps.
 * This is the contract invariant: complete means every required state has
 * validated backend evidence — not merely that the model claimed success.
 */
export function deriveRunOutcome(
  state: ExecutionState | null,
  contract: Pick<VerificationContract, "requiredSteps" | "completedSteps">,
): RunOutcome {
  if (!state || state === "UNINVESTIGATED") {
    return {
      code: "NOT_STARTED",
      label: "Not started",
      complete: false,
      pendingVerification: [...contract.requiredSteps],
    };
  }
  if (state === "BLOCKED") {
    return { code: "BLOCKED", label: "Blocked", complete: false, pendingVerification: [] };
  }
  if (state === "FAILED") {
    return { code: "FAILED", label: "Failed", complete: false, pendingVerification: [] };
  }

  const code = OUTCOME_CODE_FOR_STATE[state] ?? "NOT_STARTED";
  const currentOrdinal = FLOW_ORDER.indexOf(state);

  const pendingVerification = contract.requiredSteps.filter(
    s => !contract.completedSteps.includes(s) && FLOW_ORDER.indexOf(s) > currentOrdinal,
  );

  const complete = contract.requiredSteps.every(s => contract.completedSteps.includes(s));

  const label = pendingVerification.length === 0
    ? (STATE_LABELS[state] ?? state)
    : `${STATE_LABELS[state] ?? state} — ${PENDING_SUFFIX[pendingVerification[0]] ?? pendingVerification[0]} pending`;

  return { code, label, complete, pendingVerification };
}

// ---------------------------------------------------------------------------
// initializeRunContract
// ---------------------------------------------------------------------------

export interface InitRunContractOptions {
  runId: string;
  issueType: IssueType;
}

export async function initializeRunContract(
  opts: InitRunContractOptions,
): Promise<VerificationContract> {
  const requiredSteps = REQUIRED_STEPS_BY_ISSUE_TYPE[opts.issueType];
  const contract: VerificationContract = {
    issueType: opts.issueType,
    requiredSteps,
    completedSteps: [],
    outcome: deriveRunOutcome("UNINVESTIGATED", { requiredSteps, completedSteps: [] }),
  };

  await db.execute(sql`
    UPDATE execution_runs
    SET
      verification_contract = ${JSON.stringify(contract)}::jsonb,
      execution_state       = 'UNINVESTIGATED'
    WHERE id = ${opts.runId}
  `);

  return contract;
}

// ---------------------------------------------------------------------------
// Evidence validation helpers
// ---------------------------------------------------------------------------

interface StepRecord {
  id: number;
  run_id: string;
  step_purpose: string | null;
  status: string;
  created_at: string;
}

async function loadStep(stepId: number): Promise<StepRecord | null> {
  const rows = await db.execute(sql`
    SELECT id, run_id, step_purpose, status, created_at
    FROM execution_run_steps
    WHERE id = ${stepId}
  `);
  return rows.rows.length ? (rows.rows[0] as unknown as StepRecord) : null;
}

async function latestStepWithPurpose(
  runId: string,
  purposes: StepPurpose[],
): Promise<StepRecord | null> {
  for (const purpose of purposes) {
    const rows = await db.execute(sql`
      SELECT id, run_id, step_purpose, status, created_at
      FROM execution_run_steps
      WHERE run_id = ${runId}
        AND step_purpose = ${purpose}
        AND status = 'ok'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    if (rows.rows.length) return rows.rows[0] as unknown as StepRecord;
  }
  return null;
}

/**
 * Validate evidence refs for a given target state.
 * Returns null on success; an error message string on failure.
 */
async function validateEvidenceRefs(
  runId: string,
  toState: ExecutionState,
  evidenceRefs: EvidenceRef[],
): Promise<string | null> {
  // States that require no evidence refs
  if (toState === "INVESTIGATING" || toState === "CHANGE_PROPOSED") return null;
  // BLOCKED / FAILED: allowed with zero refs (failure is self-evident)
  if ((toState === "BLOCKED" || toState === "FAILED") && evidenceRefs.length === 0) return null;

  if (evidenceRefs.length === 0) {
    return `${toState} requires at least one evidenceRef. Provide the ID of an execution_run_steps record that proves this state.`;
  }

  // Load and validate ownership of all refs
  const steps: StepRecord[] = [];
  for (const ref of evidenceRefs) {
    const step = await loadStep(ref.id);
    if (!step) return `Evidence step ${ref.id} not found.`;
    if (step.run_id !== runId) {
      return `Evidence step ${ref.id} belongs to a different run. Only steps from this run may be used as evidence.`;
    }
    steps.push(step);
  }

  switch (toState) {
    case "CAUSE_CONFIRMED": {
      const ok = steps.some(s => PURPOSES_FOR_INVESTIGATION.includes(s.step_purpose as StepPurpose));
      if (!ok) {
        return `CAUSE_CONFIRMED requires at least one CODE_SEARCH or FILE_INSPECTION step. Provided purposes: [${steps.map(s => s.step_purpose ?? "OTHER").join(", ")}]`;
      }
      break;
    }
    case "CHANGE_APPLIED": {
      const patchStep = steps.find(s => PURPOSES_FOR_PATCH.includes(s.step_purpose as StepPurpose));
      if (!patchStep) {
        return `CHANGE_APPLIED requires a PATCH step (FILE_EDIT, LINE_PATCH, FILE_CREATE, or FILE_DELETE). Provided: [${steps.map(s => s.step_purpose ?? "OTHER").join(", ")}]`;
      }
      if (patchStep.status !== "ok") {
        return `PATCH step ${patchStep.id} has status "${patchStep.status}" — must be "ok".`;
      }
      break;
    }
    case "BUILD_VERIFIED": {
      const buildStep = steps.find(s => PURPOSES_FOR_BUILD.includes(s.step_purpose as StepPurpose));
      if (!buildStep) {
        return `BUILD_VERIFIED requires a BUILD or TYPECHECK step. Provided: [${steps.map(s => s.step_purpose ?? "OTHER").join(", ")}]`;
      }
      if (buildStep.status !== "ok") {
        return `BUILD/TYPECHECK step ${buildStep.id} has status "${buildStep.status}" — must be "ok".`;
      }
      const latestPatch = await latestStepWithPurpose(runId, PURPOSES_FOR_PATCH);
      if (latestPatch) {
        const patchTime = new Date(latestPatch.created_at).getTime();
        const buildTime = new Date(buildStep.created_at).getTime();
        if (buildTime <= patchTime) {
          return `BUILD/TYPECHECK step ${buildStep.id} predates the latest PATCH step. Run the build after applying changes.`;
        }
      }
      break;
    }
    case "RUNTIME_VERIFIED": {
      const runtimeStep = steps.find(s => PURPOSES_FOR_RUNTIME.includes(s.step_purpose as StepPurpose));
      if (!runtimeStep) {
        return `RUNTIME_VERIFIED requires a STARTUP, HEALTH_CHECK, or DEPLOY step. Provided: [${steps.map(s => s.step_purpose ?? "OTHER").join(", ")}]`;
      }
      if (runtimeStep.status !== "ok") {
        return `Runtime step ${runtimeStep.id} has status "${runtimeStep.status}" — must be "ok".`;
      }
      const latestBuild = await latestStepWithPurpose(runId, PURPOSES_FOR_BUILD);
      if (latestBuild) {
        const buildTime = new Date(latestBuild.created_at).getTime();
        const runtimeTime = new Date(runtimeStep.created_at).getTime();
        if (runtimeTime <= buildTime) {
          return `Runtime step ${runtimeStep.id} predates the latest BUILD step. Verify runtime after building.`;
        }
      }
      break;
    }
    case "USER_FLOW_VERIFIED": {
      const browserStep = steps.find(s => PURPOSES_FOR_BROWSER.includes(s.step_purpose as StepPurpose));
      if (!browserStep) {
        return `USER_FLOW_VERIFIED requires a BROWSER_FLOW step. Provided: [${steps.map(s => s.step_purpose ?? "OTHER").join(", ")}]. Atlas cannot self-create a human-verification event.`;
      }
      if (browserStep.status !== "ok") {
        return `BROWSER_FLOW step ${browserStep.id} has status "${browserStep.status}" — must be "ok".`;
      }
      break;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// advanceRunExecutionState — core transition function
// ---------------------------------------------------------------------------

export interface AdvanceStateOptions {
  /** Server-provided from AgentToolContext — never from model input. */
  runId: string;
  conversationId: string;
  userId: number;
  toState: ExecutionState;
  /** Optional — initializes the contract if not yet set. Ignored if contract exists. */
  issueType?: IssueType;
  /** References to immutable execution_run_steps records. Backend validates them. */
  evidenceRefs: EvidenceRef[];
  /** Model's explanation of what the evidence shows — context only, not proof. */
  summary: string;
}

export type AdvanceStateResult =
  | {
      ok: true;
      executionState: ExecutionState;
      outcome: RunOutcome;
      openQuestions: OpenQuestion[];
    }
  | { ok: false; error: string };

export async function advanceRunExecutionState(
  opts: AdvanceStateOptions,
): Promise<AdvanceStateResult> {
  // ── 1. Load current run state ──────────────────────────────────────────────
  const rows = await db.execute(sql`
    SELECT user_id, run_mode, execution_state, verification_contract,
           state_history, open_questions
    FROM execution_runs
    WHERE id = ${opts.runId}
  `);

  if (!rows.rows.length) return { ok: false, error: "Run not found" };

  const row = rows.rows[0] as {
    user_id: number;
    run_mode: string | null;
    execution_state: string | null;
    verification_contract: unknown;
    state_history: unknown;
    open_questions: unknown;
  };

  if (row.user_id !== opts.userId) return { ok: false, error: "Forbidden" };

  const mode = (row.run_mode ?? "EXPLORE") as RunMode;
  if (mode === "EXPLORE") {
    return { ok: false, error: "EXPLORE runs do not use the execution state machine." };
  }

  // ── 2. Validate transition topology ───────────────────────────────────────
  const currentState = (row.execution_state ?? "UNINVESTIGATED") as ExecutionState;
  const validNext = VALID_NEXT_STATES[currentState] ?? [];

  if (!validNext.includes(opts.toState)) {
    return {
      ok: false,
      error: `Invalid transition: ${currentState} → ${opts.toState}. Valid: [${validNext.join(", ")}]`,
    };
  }

  // INVESTIGATE mode cap: stops at CAUSE_CONFIRMED
  if (
    mode === "INVESTIGATE" &&
    FLOW_ORDER.indexOf(opts.toState) > FLOW_ORDER.indexOf("CAUSE_CONFIRMED") &&
    !["BLOCKED", "FAILED"].includes(opts.toState)
  ) {
    return {
      ok: false,
      error: "INVESTIGATE runs cannot advance past CAUSE_CONFIRMED. Escalate to EXECUTE mode for mutations.",
    };
  }

  // ── 3. Validate evidence refs against execution_run_steps ─────────────────
  const evidenceError = await validateEvidenceRefs(opts.runId, opts.toState, opts.evidenceRefs);
  if (evidenceError) return { ok: false, error: evidenceError };

  // ── 4. Resolve VerificationContract ───────────────────────────────────────
  const existingContract = row.verification_contract as VerificationContract | null;
  const issueType: IssueType = existingContract?.issueType ?? opts.issueType ?? "UNKNOWN";
  const requiredSteps = existingContract?.requiredSteps ?? REQUIRED_STEPS_BY_ISSUE_TYPE[issueType];
  const prevCompleted: ExecutionState[] = existingContract?.completedSteps ?? [];

  // ── 5. Update completedSteps + derive RunOutcome ───────────────────────────
  const completedSteps = [...new Set([...prevCompleted, opts.toState])];
  const outcome = deriveRunOutcome(opts.toState, { requiredSteps, completedSteps });
  const contract: VerificationContract = { issueType, requiredSteps, completedSteps, outcome };

  // ── 6. Build evidence record ───────────────────────────────────────────────
  const evidence: StateTransitionEvidence = {
    id: randomUUID(),
    runId: opts.runId,
    fromState: currentState,
    toState: opts.toState,
    evidenceRefs: opts.evidenceRefs,
    summary: opts.summary,
    timestamp: new Date().toISOString(),
  };

  // ── 7. Auto-resolve open questions ────────────────────────────────────────
  const now = new Date().toISOString();
  const rawQuestions = Array.isArray(row.open_questions)
    ? (row.open_questions as OpenQuestion[])
    : [];
  const updatedQuestions: OpenQuestion[] = rawQuestions.map(q =>
    q.status === "OPEN" && q.requiredEvidence === opts.toState
      ? { ...q, status: "ANSWERED" as const, answeredAt: now, answeredByRunId: opts.runId }
      : q,
  );

  // ── 8. Append to stateHistory ──────────────────────────────────────────────
  const existingHistory = Array.isArray(row.state_history)
    ? (row.state_history as StateTransitionEvidence[])
    : [];

  // ── 9. Persist ─────────────────────────────────────────────────────────────
  await db.execute(sql`
    UPDATE execution_runs
    SET
      execution_state       = ${opts.toState},
      verification_contract = ${JSON.stringify(contract)}::jsonb,
      state_history         = ${JSON.stringify([...existingHistory, evidence])}::jsonb,
      open_questions        = ${JSON.stringify(updatedQuestions)}::jsonb
    WHERE id = ${opts.runId}
  `);

  // ── 10. Emit SSE ──────────────────────────────────────────────────────────
  await bus.publish(opts.conversationId, opts.runId, "execution_state_update", {
    executionState: opts.toState,
    outcome,
    openQuestions: updatedQuestions,
  });

  return { ok: true, executionState: opts.toState, outcome, openQuestions: updatedQuestions };
}

// ---------------------------------------------------------------------------
// recordModeEscalation — EXPLORE → INVESTIGATE on DECIDE turns
// ---------------------------------------------------------------------------

/**
 * Called when a DECIDE-intent turn begins using investigation tools.
 * Updates run_mode to INVESTIGATE and appends a ModeHistoryEntry.
 * Non-fatal: if the run row doesn't exist yet, the update silently no-ops.
 */
export async function recordModeEscalation(
  runId: string,
  fromMode: RunMode,
  toMode: RunMode,
): Promise<void> {
  const entry: ModeHistoryEntry = {
    mode: toMode,
    reason: "mode_escalation",
    previousMode: fromMode,
    timestamp: new Date().toISOString(),
  };

  await db.execute(sql`
    UPDATE execution_runs
    SET
      run_mode     = ${toMode},
      mode_history = COALESCE(mode_history, '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb
    WHERE id = ${runId}
  `).catch(() => { /* non-fatal */ });
}
