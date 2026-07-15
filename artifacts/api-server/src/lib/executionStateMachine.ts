/**
 * Execution State Machine — v1.3
 *
 * Pure functions and DB helpers for advancing a run's ExecutionState.
 * Imported by:
 *   - artifacts/api-server/src/routes/runs.ts   (HTTP routes)
 *   - lib/agent-tools/advance-execution-state.ts (agent tool)
 *
 * Neither the route nor the tool duplicates SQL or transition logic — it all
 * lives here.
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
} from "@workspace/run-contract";
import { REQUIRED_STEPS_BY_ISSUE_TYPE } from "@workspace/run-contract";

// ---------------------------------------------------------------------------
// Transition table — every legal move from each state
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
// allowedOutcome derivation
// ---------------------------------------------------------------------------

export const STATE_LABELS: Record<ExecutionState, string> = {
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

const STATE_PENDING_SUFFIX: Record<ExecutionState, string> = {
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

/**
 * Derives the human-readable outcome label for a run in a given state
 * against its VerificationContract.
 *
 * Examples:
 *   CHANGE_APPLIED + required=[..., BUILD_VERIFIED]  → "Patch applied — build verification pending"
 *   BUILD_VERIFIED + required=[..., RUNTIME_VERIFIED] → "Build verified — runtime verification pending"
 *   RUNTIME_VERIFIED + required=[..., RUNTIME_VERIFIED] → "Runtime verified"
 */
export function deriveAllowedOutcome(
  state: ExecutionState | null,
  contract: Pick<VerificationContract, "requiredSteps">,
): string {
  if (!state) return "Not started";
  if (state === "BLOCKED") return "Blocked";
  if (state === "FAILED") return "Failed";

  const label = STATE_LABELS[state] ?? state;
  const currentOrdinal = FLOW_ORDER.indexOf(state);

  const nextRequired = contract.requiredSteps.find(
    s => FLOW_ORDER.indexOf(s) > currentOrdinal,
  );

  if (!nextRequired) return label;
  return `${label} — ${STATE_PENDING_SUFFIX[nextRequired] ?? nextRequired} pending`;
}

// ---------------------------------------------------------------------------
// initializeRunContract — set the VerificationContract for a run
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
    allowedOutcome: "Not started",
  };

  await db.execute(sql`
    UPDATE contract_runs
    SET
      verification_contract = ${JSON.stringify(contract)}::jsonb,
      execution_state       = 'UNINVESTIGATED',
      updated_at            = now()
    WHERE id = ${opts.runId}
  `);

  return contract;
}

// ---------------------------------------------------------------------------
// advanceRunExecutionState — core transition function
// ---------------------------------------------------------------------------

export interface AdvanceStateOptions {
  runId: string;
  conversationId: string;
  userId: number;
  toState: ExecutionState;
  /** Optional — initializes the contract if not yet set. Ignored if contract exists. */
  issueType?: IssueType;
  evidenceType: StateTransitionEvidence["evidenceType"];
  stepId: string;
  summary: string;
  confidence: StateTransitionEvidence["confidence"];
}

export type AdvanceStateResult =
  | {
      ok: true;
      executionState: ExecutionState;
      allowedOutcome: string;
      evidence: StateTransitionEvidence;
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
    FROM contract_runs
    WHERE id = ${opts.runId}
  `);

  if (!rows.rows.length) return { ok: false, error: "Run not found" };
  const row = rows.rows[0];

  if (row.user_id !== opts.userId) return { ok: false, error: "Forbidden" };

  const mode = (row.run_mode ?? "EXPLORE") as RunMode;
  if (mode === "EXPLORE") {
    return { ok: false, error: "EXPLORE runs do not use the execution state machine" };
  }

  // ── 2. Validate transition ─────────────────────────────────────────────────
  const currentState = (row.execution_state ?? "UNINVESTIGATED") as ExecutionState;
  const validNext = VALID_NEXT_STATES[currentState] ?? [];

  if (!validNext.includes(opts.toState)) {
    return {
      ok: false,
      error: `Invalid transition: ${currentState} → ${opts.toState}. Valid next states: [${validNext.join(", ")}]`,
    };
  }

  // ── 3. Resolve / auto-initialize VerificationContract ─────────────────────
  let contract: VerificationContract | null = (row.verification_contract as VerificationContract | null) ?? null;

  if (!contract) {
    const issueType: IssueType = opts.issueType ?? "UNKNOWN";
    contract = {
      issueType,
      requiredSteps: REQUIRED_STEPS_BY_ISSUE_TYPE[issueType],
      allowedOutcome: "Not started",
    };
  }

  // INVESTIGATE mode cap: state machine stops at CAUSE_CONFIRMED
  if (
    mode === "INVESTIGATE" &&
    FLOW_ORDER.indexOf(opts.toState) > FLOW_ORDER.indexOf("CAUSE_CONFIRMED") &&
    !["BLOCKED", "FAILED"].includes(opts.toState)
  ) {
    return {
      ok: false,
      error: "INVESTIGATE runs cannot advance past CAUSE_CONFIRMED. Use EXECUTE mode for mutations.",
    };
  }

  // ── 4. Build evidence record ───────────────────────────────────────────────
  const evidence: StateTransitionEvidence = {
    id: randomUUID(),
    runId: opts.runId,
    fromState: currentState,
    toState: opts.toState,
    evidenceType: opts.evidenceType,
    stepId: opts.stepId,
    timestamp: new Date().toISOString(),
    summary: opts.summary,
    confidence: opts.confidence,
  };

  // ── 5. Derive new allowedOutcome ───────────────────────────────────────────
  contract = { ...contract, allowedOutcome: deriveAllowedOutcome(opts.toState, contract) };

  // ── 6. Auto-resolve open questions whose requiredEvidence == toState ───────
  const now = new Date().toISOString();
  const rawQuestions: OpenQuestion[] = Array.isArray(row.open_questions)
    ? (row.open_questions as OpenQuestion[])
    : [];

  const updatedQuestions: OpenQuestion[] = rawQuestions.map(q =>
    q.status === "OPEN" && q.requiredEvidence === opts.toState
      ? { ...q, status: "ANSWERED" as const, answeredAt: now, answeredByRunId: opts.runId }
      : q,
  );

  // ── 7. Append to stateHistory ──────────────────────────────────────────────
  const existingHistory: StateTransitionEvidence[] = Array.isArray(row.state_history)
    ? (row.state_history as StateTransitionEvidence[])
    : [];
  const newHistory = [...existingHistory, evidence];

  // ── 8. Persist ────────────────────────────────────────────────────────────
  await db.execute(sql`
    UPDATE contract_runs
    SET
      execution_state       = ${opts.toState},
      verification_contract = ${JSON.stringify(contract)}::jsonb,
      state_history         = ${JSON.stringify(newHistory)}::jsonb,
      open_questions        = ${JSON.stringify(updatedQuestions)}::jsonb,
      updated_at            = now()
    WHERE id = ${opts.runId}
  `);

  // ── 9. Emit SSE ───────────────────────────────────────────────────────────
  await bus.publish(opts.conversationId, opts.runId, "execution_state_update", {
    executionState: opts.toState,
    allowedOutcome: contract.allowedOutcome,
    evidence,
    openQuestions: updatedQuestions,
  });

  return {
    ok: true,
    executionState: opts.toState,
    allowedOutcome: contract.allowedOutcome,
    evidence,
    openQuestions: updatedQuestions,
  };
}
