/**
 * @workspace/run-contract — Version 1.4
 *
 * Canonical Run Lifecycle Contract types.
 *
 * SOURCE OF TRUTH HIERARCHY:
 *   1. This file — executable types both teams compile against
 *   2. Mock fixtures / backend payloads — validated against these types
 *
 * Neither team may silently drift these types away from the contract document.
 * If a type change is needed, bump the version here and update all consumers.
 *
 * v1.4 changes (truth-layer wiring repair):
 *   - StepPurpose — system-owned purpose classification for execution_run_steps
 *   - EvidenceRef — typed reference to an immutable execution_run_steps record
 *   - RunOutcome — structured backend-derived outcome (replaces allowedOutcome: string)
 *   - VerificationContract: adds completedSteps[], replaces allowedOutcome with outcome: RunOutcome
 *   - StateTransitionEvidence: evidenceRefs[] replaces self-reported evidenceType/stepId/confidence
 *   - ModeHistoryEntry — separate from state_history; tracks EXPLORE→INVESTIGATE escalations
 *   - ExecutionStateUpdatePayload: outcome: RunOutcome replaces allowedOutcome: string + evidence
 *   - Truth-layer state consolidated onto execution_runs; contract_runs is deprecated
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type RunIntent = "BUILD" | "CHAT" | "DECIDE";

export type RunStatus =
  | "received"
  | "thinking"
  | "planning"
  | "awaiting_confirmation"
  | "executing"
  | "testing"
  | "verifying"
  | "succeeded"
  | "failed"
  | "cancelled";

/** Terminal states — a run in one of these states will never change status again. */
export const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
]);

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// ---------------------------------------------------------------------------
// RunMode — v1.3
// ---------------------------------------------------------------------------

/**
 * Epistemic posture for the run. Set at run creation, immutable for that run.
 *
 * EXPLORE      — Tentative reasoning, brainstorming, or product strategy.
 *                No mutations allowed. No verification state machine.
 *                No run card in UI. Behaves like a CHAT turn.
 *
 * INVESTIGATE  — Atlas gathers evidence without altering the project.
 *                File reads, search, log reads allowed. No writes, builds, or deploys.
 *                Epistemic discipline required: states advance through
 *                UNINVESTIGATED → INVESTIGATING → CAUSE_CONFIRMED | BLOCKED.
 *                Run succeeds when CAUSE_CONFIRMED (or BLOCKED if stuck).
 *
 * EXECUTE      — Full lifecycle. Atlas may write files, run commands, build, restart, deploy.
 *                Full ExecutionState machine enforced. VerificationContract required.
 *                No "succeeded" unless verificationContract.requiredSteps are all reached.
 */
export type RunMode = "EXPLORE" | "INVESTIGATE" | "EXECUTE";

// ---------------------------------------------------------------------------
// ExecutionState — v1.3
// ---------------------------------------------------------------------------

/**
 * Granular state within the "executing" phase of a run.
 * Lives alongside RunStatus — null until RunStatus reaches "executing".
 * The backend advances this; the model never promotes it directly.
 *
 * Valid transitions are defined in EXECUTION_STATE_TRANSITIONS below.
 */
export type ExecutionState =
  | "UNINVESTIGATED"    // executing just started; no evidence gathered yet
  | "INVESTIGATING"     // reading code, logs, search results — forming hypotheses
  | "CAUSE_CONFIRMED"   // root cause located with direct evidence
  | "CHANGE_PROPOSED"   // plan committed; no mutations yet
  | "CHANGE_APPLIED"    // at least one file/shell mutation succeeded
  | "BUILD_VERIFIED"    // successful build after the latest change
  | "RUNTIME_VERIFIED"  // runtime health confirmed after build/restart
  | "USER_FLOW_VERIFIED"// user-facing flow confirmed (browser automation or human sign-off)
  | "BLOCKED"           // cannot advance; reason recorded in stateHistory
  | "FAILED";           // non-recoverable failure during execution

/**
 * Valid ExecutionState transitions.
 * Each transition requires evidence (see StateTransitionEvidence).
 *
 * UNINVESTIGATED   → INVESTIGATING
 * INVESTIGATING    → CAUSE_CONFIRMED | BLOCKED
 * CAUSE_CONFIRMED  → CHANGE_PROPOSED (EXECUTE mode) | terminal (INVESTIGATE mode)
 * CHANGE_PROPOSED  → CHANGE_APPLIED
 * CHANGE_APPLIED   → BUILD_VERIFIED | terminal (issueType: CONTENT_EDIT)
 * BUILD_VERIFIED   → RUNTIME_VERIFIED | terminal (issueType: CODE_COMPILE | DEPLOYMENT)
 * RUNTIME_VERIFIED → USER_FLOW_VERIFIED | terminal (issueType: SERVER_ROUTING)
 * USER_FLOW_VERIFIED → terminal (issueType: UI_BEHAVIOR)
 * BLOCKED          → terminal (run fails unless explicitly unblocked)
 * FAILED           → terminal
 */
export const TERMINAL_EXECUTION_STATES: ReadonlySet<ExecutionState> = new Set([
  "USER_FLOW_VERIFIED",
  "BLOCKED",
  "FAILED",
]);

export function isTerminalExecutionState(state: ExecutionState): boolean {
  return TERMINAL_EXECUTION_STATES.has(state);
}

// ---------------------------------------------------------------------------
// StepPurpose — v1.4
// ---------------------------------------------------------------------------

/**
 * System-owned classification of what an execution_run_steps record proves.
 * Set by the server at step creation time — derived from the tool/verb that
 * produced the step. The model never writes this field.
 *
 * Used by advanceRunExecutionState() to validate evidence references:
 *   CHANGE_APPLIED   requires PATCH
 *   BUILD_VERIFIED   requires BUILD | TYPECHECK (succeeded, after latest PATCH)
 *   RUNTIME_VERIFIED requires STARTUP | HEALTH_CHECK | DEPLOY (after latest BUILD)
 *   USER_FLOW_VERIFIED requires BROWSER_FLOW or human-verification event
 */
export type StepPurpose =
  | "CODE_SEARCH"    // search_codebase, grep, symbol lookup
  | "FILE_INSPECTION"// file reads, directory listings, config reads
  | "PATCH"          // FILE_EDIT, LINE_PATCH, FILE_CREATE, FILE_DELETE
  | "BUILD"          // build command (esbuild, webpack, cargo build, etc.)
  | "TYPECHECK"      // tsc --noEmit, pnpm typecheck, flow check
  | "TEST"           // test runner (vitest, jest, mocha, pytest, etc.)
  | "STARTUP"        // process start / restart (node server.js, pnpm dev, etc.)
  | "HEALTH_CHECK"   // HTTP probe, curl health endpoint, readiness check
  | "DEPLOY"         // deployment command (docker push, fly deploy, etc.)
  | "BROWSER_FLOW"   // browser automation result (Playwright, Puppeteer)
  | "OTHER";         // catch-all — cannot prove any specific verification state

// ---------------------------------------------------------------------------
// EvidenceRef + RunOutcome — v1.4
// ---------------------------------------------------------------------------

/**
 * A typed reference to an immutable execution_run_steps record.
 * The backend validates: step exists, belongs to the run, has correct purpose,
 * and is correctly ordered relative to prior steps.
 */
export interface EvidenceRef {
  type: "EXECUTION_STEP";
  id: number;  // execution_run_steps.id — server validates ownership + purpose
}

/**
 * Stable code for the run's current outcome — safe for conditional logic and styling.
 * Maps 1:1 with ExecutionState (plus NOT_STARTED for uninitialized runs).
 */
export type RunOutcomeCode =
  | "NOT_STARTED"
  | "INVESTIGATING"
  | "CAUSE_CONFIRMED"
  | "CHANGE_APPLIED"
  | "BUILD_VERIFIED"
  | "RUNTIME_VERIFIED"
  | "USER_FLOW_VERIFIED"
  | "BLOCKED"
  | "FAILED";

/**
 * Structured backend-derived outcome. The model never writes any field here.
 *
 * complete = true only when every state in verificationContract.requiredSteps
 * has been reached with validated evidence — not merely when the model claims
 * it is done.
 */
export interface RunOutcome {
  code: RunOutcomeCode;
  label: string;                    // "Patch applied — build verification pending"
  complete: boolean;                // true = all contract.requiredSteps satisfied
  pendingVerification: ExecutionState[]; // required steps not yet reached
}

// ---------------------------------------------------------------------------
// IssueType + VerificationContract — v1.4
// ---------------------------------------------------------------------------

/**
 * The nature of the problem Atlas is solving.
 * Determines which ExecutionState steps are required before a run may succeed.
 *
 * CONTENT_EDIT   — doc/copy/config change — min: CHANGE_APPLIED
 * CODE_COMPILE   — build/type/lint error — min: BUILD_VERIFIED
 * SERVER_ROUTING — API route, middleware, backend logic — min: RUNTIME_VERIFIED
 * UI_BEHAVIOR    — user-facing interaction, navigation, rendering — min: USER_FLOW_VERIFIED
 * DEPLOYMENT     — deploy pipeline, image, env config — min: RUNTIME_VERIFIED
 * INVESTIGATION  — diagnosis only, no mutations — CAUSE_CONFIRMED is terminal
 * UNKNOWN        — Atlas classifies at turn start; defaults to SERVER_ROUTING requirements
 */
export type IssueType =
  | "CONTENT_EDIT"
  | "CODE_COMPILE"
  | "SERVER_ROUTING"
  | "UI_BEHAVIOR"
  | "DEPLOYMENT"
  | "INVESTIGATION"
  | "UNKNOWN";

/**
 * The verification steps Atlas must reach (in order) before this run may succeed.
 * Created at run start based on IssueType.
 * The backend owns derivation; the model never writes outcome directly.
 *
 * outcome.complete = true only when every requiredStep has been reached with
 * validated backend evidence — not merely because the model claims it is done.
 */
export interface VerificationContract {
  issueType: IssueType;
  /** Ordered execution states that must be reached in sequence. */
  requiredSteps: ExecutionState[];
  /** States already reached with validated evidence for this run. */
  completedSteps: ExecutionState[];
  /** Backend-derived structured outcome. The model never writes any field here. */
  outcome: RunOutcome;
}

/** Required steps per issue type — canonical mapping. */
export const REQUIRED_STEPS_BY_ISSUE_TYPE: Record<IssueType, ExecutionState[]> = {
  CONTENT_EDIT:  ["CAUSE_CONFIRMED", "CHANGE_APPLIED"],
  CODE_COMPILE:  ["CAUSE_CONFIRMED", "CHANGE_APPLIED", "BUILD_VERIFIED"],
  SERVER_ROUTING:["CAUSE_CONFIRMED", "CHANGE_APPLIED", "BUILD_VERIFIED", "RUNTIME_VERIFIED"],
  UI_BEHAVIOR:   ["CAUSE_CONFIRMED", "CHANGE_APPLIED", "BUILD_VERIFIED", "RUNTIME_VERIFIED", "USER_FLOW_VERIFIED"],
  DEPLOYMENT:    ["CAUSE_CONFIRMED", "CHANGE_APPLIED", "BUILD_VERIFIED", "RUNTIME_VERIFIED"],
  INVESTIGATION: ["CAUSE_CONFIRMED"],
  UNKNOWN:       ["CAUSE_CONFIRMED", "CHANGE_APPLIED", "BUILD_VERIFIED", "RUNTIME_VERIFIED"],
};

// ---------------------------------------------------------------------------
// StateTransitionEvidence — v1.4
// ---------------------------------------------------------------------------

/**
 * Evidence record attached to each ExecutionState transition.
 *
 * v1.4: evidenceRefs replaces the old self-reported evidenceType/stepId/confidence.
 * The backend validates each ref: step exists, belongs to the run, has the
 * correct StepPurpose for the target state, and is correctly ordered.
 *
 * summary is the model's explanation of what the evidence shows — it is stored
 * for context but never treated as proof.
 */
export interface StateTransitionEvidence {
  id: string;
  runId: string;
  fromState: ExecutionState;
  toState: ExecutionState;
  /** References to immutable execution_run_steps records that justify this transition. */
  evidenceRefs: EvidenceRef[];
  /** Model's explanation of what the evidence shows — context only, not proof. */
  summary: string;
  timestamp: string;  // ISO 8601
}

// ---------------------------------------------------------------------------
// OpenQuestion — v1.3
// ---------------------------------------------------------------------------

/**
 * An unresolved question attached to a run.
 * Blocking questions prevent the run from claiming a fully verified outcome.
 * Questions survive to the next session and surface at workspace open.
 */
export interface OpenQuestion {
  id: string;
  question: string;
  importance: "blocking" | "informational";
  openedByRunId: string;
  openedAt: string;        // ISO 8601
  /**
   * The ExecutionState that, when reached, would answer this question.
   * null means it requires explicit human confirmation.
   */
  requiredEvidence: ExecutionState | null;
  status: "OPEN" | "ANSWERED" | "SUPERSEDED" | "NO_LONGER_RELEVANT";
  answeredAt: string | null;
  answeredByRunId: string | null;
  /**
   * Plain-language conditions under which this question auto-closes.
   * e.g. ["new deployment begins", "deployment configuration changes"]
   */
  expiresWhen: string[];
}

// ---------------------------------------------------------------------------
// ModeHistoryEntry — v1.4
// ---------------------------------------------------------------------------

/**
 * Records a mode selection or escalation event for a run.
 * Kept separate from state_history (which tracks ExecutionState transitions).
 *
 * The only permitted escalation for live turns is EXPLORE → INVESTIGATE
 * on a DECIDE-intent turn when investigation tools fire. INVESTIGATE → EXECUTE
 * requires explicit user approval or a BUILD-intent turn.
 */
export interface ModeHistoryEntry {
  mode: RunMode;
  reason: "initial_classification" | "mode_escalation";
  previousMode?: RunMode;
  timestamp: string;  // ISO 8601
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export interface Run {
  // Identity
  id: string;                      // UUID, stable forever
  projectId: number | null;        // null for general conversations not scoped to a project
  conversationId: string;          // scopes to one thread

  // Status — THE source of truth. No surface infers or guesses this.
  status: RunStatus;
  intent: RunIntent;

  // v1.3: Epistemic posture — set at run creation, immutable
  mode: RunMode;

  // Content
  prompt: string;                  // the exact user message that triggered this run
  response: string | null;         // full conversational prose (CHAT/DECIDE turns)
  summary: string | null;          // compact one-line receipt label (~80 chars max)
  plan: PlanBlock | null;          // populated when status reaches "planning" (BUILD/DECIDE only)

  // Steps — metadata only in this object; full content via /api/runs/:id/steps
  stepCount: number;               // total steps (including pending)
  stepsDone: number;               // steps completed so far

  // Error state (null unless status is "failed")
  error: RunError | null;

  // Verification results (null until verifying stage or later)
  verification: RunVerification | null;

  // v1.3: Granular execution state — null until RunStatus reaches "executing"
  // Only EXECUTE and INVESTIGATE mode runs populate this.
  executionState: ExecutionState | null;

  // v1.3: Verification contract — null for EXPLORE turns
  // Derived from issueType at run creation. Owns allowedOutcome.
  verificationContract: VerificationContract | null;

  // v1.3: Evidence log for each state transition — append-only
  stateHistory: StateTransitionEvidence[];

  // v1.3: Unresolved questions from this run
  openQuestions: OpenQuestion[];

  // GitHub commit state — separate from run lifecycle, BUILD only
  commit: RunCommit | null;

  // Recovery anchor — recorded at run creation for cancellation/failure recovery
  snapshotRef: string | null;      // git commit SHA or workspace snapshot ID at run start

  // Timestamps
  createdAt: string;               // ISO 8601
  updatedAt: string;               // ISO 8601, updated on every state change
  completedAt: string | null;      // set when status reaches any terminal state
  elapsedMs: number | null;
}

export interface RunError {
  code: "TOOL_FAILURE" | "TIMEOUT" | "CONTEXT_LIMIT" | "CANCELLED_PARTIAL" | "UNKNOWN";
  message: string;                 // human-readable sentence
  recoverable: boolean;            // true = user can retry; false = requires intervention
  stepId: string | null;           // which step caused the failure, if known
  partialWritesOccurred: boolean;  // true if files were written before failure/cancellation
}

export interface RunVerification {
  status: "not_started" | "running" | "passed" | "failed" | "partial";
  checks: VerificationCheck[];
}

export interface VerificationCheck {
  id: string;
  label: string;                   // e.g. "TypeScript", "Tests", "Lint"
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  output: string | null;           // truncated output (last 2000 chars max)
  durationMs: number | null;
}

export interface RunCommit {
  status: "not_requested" | "running" | "succeeded" | "failed";
  sha: string | null;
  url: string | null;              // full GitHub commit URL
  error: string | null;            // set when status is "failed"
  committedAt: string | null;
}

// ---------------------------------------------------------------------------
// RunStep
// ---------------------------------------------------------------------------

/**
 * Step verb.
 *
 * ACTIVITY: user-safe summary of Atlas reasoning or inspection work.
 *   - One sentence describing what Atlas examined or decided.
 *   - Never raw model reasoning. Never chain-of-thought text.
 *   - Example: "Compared existing UTM flow with proposed YouTube path."
 *   - The backend generates this description before persisting the step.
 */
export type RunStepVerb =
  | "ACTIVITY"          // user-safe summary of Atlas reasoning/inspection
  | "FILE_READ"         // read a file (informational, not shown in Changes tab)
  | "FILE_EDIT"         // wrote a complete file
  | "LINE_PATCH"        // patched specific lines
  | "FILE_DELETE"       // deleted a file
  | "FILE_CREATE"       // created a new file
  | "SHELL"             // ran a shell command
  | "TEST"              // ran a test suite
  | "ARTIFACT_CREATED"  // produced a downloadable output
  | "ERROR"             // a step-level error that did not abort the run
  | "SUMMARY";          // Atlas's closing summary for the turn

export interface RunStep {
  id: string;                      // stable UUID
  runId: string;
  seq: number;                     // 1-based, monotonic, stable

  verb: RunStepVerb;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  title: string;                   // short human-readable label
  detail: string | null;           // brief status note (e.g. "3 functions updated")

  // File operations — content retrieved via /api/runs/:id/changes
  filePath: string | null;

  // Shell/test operations
  command: string | null;
  exitCode: number | null;
  outputSummary: string | null;    // last 500 chars of shell output; full via /api/runs/:id/terminal

  // Artifact operations — hydrated via /api/runs/:id/outputs
  artifact: RunArtifactSummary | null;

  // Timing
  startedAt: string | null;        // ISO 8601
  completedAt: string | null;      // ISO 8601
}

/**
 * Surface routing by verb. The RunProvider owns all fetching.
 * Surfaces never call content endpoints directly.
 *
 * Verb            | Chat | Changes | Terminal | Outputs | Timeline
 * ----------------+------+---------+----------+---------+---------
 * ACTIVITY        |  ▼   |    —    |    —     |    —    |    ✓
 * FILE_READ       |  —   |    —    |    —     |    —    |    —
 * FILE_EDIT/etc   |  —   |    ✓    |    —     |    —    |    ✓
 * SHELL/TEST      |  —   |    —    |    ✓     |    —    |    ✓
 * ARTIFACT_CREATED|  —   |    —    |    —     |    ✓    |    ✓
 * ERROR           |  ✓   |    —    |    —     |    —    |    ✓
 * SUMMARY         |  ✓   |    —    |    —     |    —    |    —
 *
 * (▼ = collapsed by default in Chat)
 */

// ---------------------------------------------------------------------------
// Artifact
// ---------------------------------------------------------------------------

export interface RunArtifactSummary {
  id: string;
  name: string;                    // display name (e.g. "Analytics Report.pdf")
  type: string;                    // artifact type (e.g. "pdf", "html", "pptx")
  mimeType: string;                // MIME type (e.g. "application/pdf")
  sizeBytes: number | null;
  status: "generating" | "ready" | "failed";
  downloadUrl: string | null;      // available when status is "ready"
  previewUrl: string | null;       // optional inline preview
}

export interface RunArtifact extends RunArtifactSummary {
  runId: string;
  stepId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Content endpoint response shapes
// ---------------------------------------------------------------------------

export interface RunChange {
  stepId: string;
  filePath: string;
  verb: "FILE_EDIT" | "LINE_PATCH" | "FILE_DELETE" | "FILE_CREATE";
  beforeContent: string | null;
  afterContent: string | null;
  status: "pending" | "applied" | "failed" | "skipped";
}

export interface RunTerminalPage {
  lines: TerminalLine[];
  totalLines: number;
  page: number;
  pageSize: number;
}

export interface TerminalLine {
  stepId: string;
  stream: "stdout" | "stderr";
  text: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// PlanBlock
// ---------------------------------------------------------------------------

export interface PlanBlock {
  title: string;
  rationale: string | null;        // one sentence explaining the approach
  complexity: "LOW" | "MEDIUM" | "HIGH";
  estimatedChanges: number;
  items: PlanItem[];
}

export interface PlanItem {
  seq: number;
  file: string;                    // short filename (e.g. "TrafficChannels.tsx")
  filePath: string;                // full path
  verb: "MUST" | "SHOULD" | "COULD";
  description: string;             // one sentence: what changes and why
  status: "pending" | "in_progress" | "done" | "skipped";
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

/**
 * Every user message and every assistant turn produces a ConversationMessage.
 * The chat renderer reads from conversation messages — not from runs.
 * Messages and runs are linked by runId.
 */
export interface ConversationMessage {
  id: string;
  runId: string;                   // links this message to its canonical run
  conversationId: string;
  role: "user" | "assistant";
  content: string;                 // final settled content (streaming prose resolves here)
  createdAt: string;               // ISO 8601
}

export interface ConversationPage {
  messages: ConversationMessage[];
  nextCursor: string | null;       // null when no more history; cursor is opaque
  total: number;
}

// ---------------------------------------------------------------------------
// SSE Events
// ---------------------------------------------------------------------------

export interface RunEvent<T = unknown> {
  eventId: string;                 // server-assigned UUID, unique per event
  seq: number;                     // monotonically increasing per conversationId
  runId: string;                   // which run this event belongs to
  conversationId: string;          // which conversation stream
  type: RunEventType;
  timestamp: string;               // ISO 8601 server time
  payload: T;
}

export type RunEventType =
  | "run_created"             // payload: RunCreatedPayload
  | "run_status"              // payload: RunStatusPayload
  | "token"                   // payload: TokenPayload
  | "plan_ready"              // payload: PlanReadyPayload
  | "step_update"             // payload: StepUpdatePayload (metadata only, no diff content)
  | "verification_update"     // payload: VerificationUpdatePayload
  | "execution_state_update"  // payload: ExecutionStateUpdatePayload — v1.3
  | "commit_update"           // payload: CommitUpdatePayload — fires after run is terminal
  | "run_complete"            // payload: RunCompletePayload — Run WITHOUT step content
  | "stream_error";           // payload: StreamErrorPayload

// Typed payload shapes — use these with RunEvent<T> for type-safe event handling

export interface RunCreatedPayload {
  status: "received";
  intent: RunIntent;
  mode: RunMode;                   // v1.3
}

export interface RunStatusPayload {
  status: RunStatus;
}

export interface TokenPayload {
  text: string;
}

export interface PlanReadyPayload {
  plan: PlanBlock;
}

export interface StepUpdatePayload {
  step: RunStep;
}

export interface VerificationUpdatePayload {
  verification: RunVerification;
}

/**
 * v1.4: Fires when Atlas advances the executionState.
 * The backend emits this after validating evidence and computing the RunOutcome.
 * The UI renders outcome — never derives it from model prose.
 *
 * outcome.complete gates whether completion language is permitted.
 * outcome.pendingVerification drives progress indicators.
 */
export interface ExecutionStateUpdatePayload {
  executionState: ExecutionState;
  outcome: RunOutcome;             // backend-derived structured outcome
  openQuestions: OpenQuestion[];   // full current list for this run
}

/**
 * commit_update fires when GitHub commit state changes after the run is already terminal.
 * Transitions: not_requested → running → succeeded | failed
 * Every surface that shows the commit button must respond to this event.
 */
export interface CommitUpdatePayload {
  commit: RunCommit;
}

/**
 * run_complete sends the Run metadata object only.
 * It does NOT contain full step content, diffs, or terminal output.
 * Those are fetched via dedicated endpoints after the run completes.
 */
export interface RunCompletePayload {
  run: Run;
}

export interface StreamErrorPayload {
  code: string;
  message: string;
}

// Discriminated union for exhaustive event handling
export type TypedRunEvent =
  | RunEvent<RunCreatedPayload> & { type: "run_created" }
  | RunEvent<RunStatusPayload> & { type: "run_status" }
  | RunEvent<TokenPayload> & { type: "token" }
  | RunEvent<PlanReadyPayload> & { type: "plan_ready" }
  | RunEvent<StepUpdatePayload> & { type: "step_update" }
  | RunEvent<VerificationUpdatePayload> & { type: "verification_update" }
  | RunEvent<ExecutionStateUpdatePayload> & { type: "execution_state_update" }
  | RunEvent<CommitUpdatePayload> & { type: "commit_update" }
  | RunEvent<RunCompletePayload> & { type: "run_complete" }
  | RunEvent<StreamErrorPayload> & { type: "stream_error" };

// ---------------------------------------------------------------------------
// REST response shapes
// ---------------------------------------------------------------------------

export interface RunsQueryParams {
  conversationId?: string;
  projectId?: number;
}

export interface ConfirmResponse {
  ok: true;
}

export interface CancelResponse {
  ok: true;
}

export interface CommitResponse {
  ok: true;
  sha: string;
  url: string;
}

// Error responses — all error endpoints return one of these shapes
export type RunApiError =
  | { error: "INVALID_STATE"; current: RunStatus; required: RunStatus[] }  // 409
  | { error: "NOT_FOUND" }                                                   // 404
  | { error: "FORBIDDEN" }                                                   // 403
  | { error: "RUN_ACTIVE"; runId: string }                                   // 409, concurrent BUILD
  | { error: "INTERNAL"; message: string };                                  // 500

// ---------------------------------------------------------------------------
// RunProvider interface — frontend contract
// ---------------------------------------------------------------------------

/**
 * RunProvider is a singleton per conversation — one SSE connection.
 * No surface holds its own copy of run state.
 * No surface fetches runs independently.
 * No surface parses model tokens to determine status.
 */
export interface RunContextValue {
  /**
   * The active BUILD run (non-terminal status), or null.
   * Drives the execution card in chat. Used by Changes, Terminal, Outputs surfaces.
   * Never replaced by a CHAT or DECIDE turn.
   */
  activeBuildRun: Run | null;

  /**
   * The current CHAT or DECIDE turn (non-terminal), or null.
   * Used only to drive the thinking/streaming indicator in chat.
   * Does not affect any other surface.
   * May be non-null simultaneously with activeBuildRun.
   */
  activeTurn: Run | null;

  /**
   * All runs for this conversation, newest first (metadata only).
   */
  runs: Run[];

  /**
   * Gate 1: confirm BUILD execution.
   * Only valid when run.status === "awaiting_confirmation".
   * Idempotent — safe to call if already executing or beyond.
   */
  confirm(runId: string): Promise<void>;

  /**
   * Cancel any non-terminal run.
   * Idempotent — safe to call if already cancelled or terminal.
   */
  cancel(runId: string): Promise<void>;

  /**
   * Trigger GitHub commit.
   * Only valid when run.status === "succeeded" and run.commit.status === "not_requested".
   * Idempotent — returns existing sha/url if already committed.
   * Does NOT change run.status.
   */
  commit(runId: string): Promise<void>;

  /**
   * Content fetchers — RunProvider owns these. Surfaces do not call them directly.
   */
  fetchSteps(runId: string): Promise<RunStep[]>;
  fetchChanges(runId: string): Promise<RunChange[]>;
  fetchTerminal(runId: string, page: number): Promise<RunTerminalPage>;
  fetchOutputs(runId: string): Promise<RunArtifact[]>;

  /** SSE connection state */
  connectionStatus: "connecting" | "connected" | "reconnecting" | "disconnected";
}

// ---------------------------------------------------------------------------
// Concurrent run policy — documented as types for exhaustive checking
// ---------------------------------------------------------------------------

/**
 * The server returns RUN_ACTIVE (409) when a BUILD turn starts while another
 * non-terminal BUILD run exists for the same conversationId.
 *
 * CHAT and DECIDE turns are never blocked.
 *
 * Frontend rule:
 *   - While activeBuildRun !== null: exactly one BUILD card visible in chat
 *   - While activeBuildRun === null: zero BUILD cards visible in chat
 *   - Never two BUILD cards simultaneously
 */
export type ConcurrentRunPolicy = "ONE_ACTIVE_BUILD_PER_CONVERSATION";

// ---------------------------------------------------------------------------
// Cancellation semantics — for UI display logic
// ---------------------------------------------------------------------------

/**
 * When error.partialWritesOccurred is true after cancellation, the frontend shows:
 * "Cancelled mid-execution — some files may have been partially updated.
 *  Use the Changes tab to review what was written."
 *
 * run.snapshotRef records the git commit SHA (or workspace snapshot ID) at run
 * creation. This enables future rollback even if automatic rollback is not
 * implemented in v1.
 */
export type CancellationNote = "PARTIAL_WRITES_POSSIBLE";

// ---------------------------------------------------------------------------
// Intent-specific lifecycle paths — valid status transitions
// ---------------------------------------------------------------------------

/**
 * Valid transitions by intent. The backend may skip testing/verifying stages
 * for BUILD runs — but only by emitting explicit status events. The frontend
 * never infers a skipped stage from the absence of an event.
 *
 * CHAT:    received → thinking → succeeded | failed | cancelled
 * DECIDE:  received → thinking → planning → succeeded | failed | cancelled
 * BUILD:   received → thinking → planning → awaiting_confirmation
 *            → executing → [testing →] [verifying →] succeeded | failed | cancelled
 *            (may also cancel at awaiting_confirmation)
 */
export type ValidTransitions = {
  CHAT: {
    received: "thinking";
    thinking: "succeeded" | "failed" | "cancelled";
  };
  DECIDE: {
    received: "thinking";
    thinking: "planning" | "failed" | "cancelled";
    planning: "succeeded" | "failed" | "cancelled";
  };
  BUILD: {
    received: "thinking";
    thinking: "planning" | "failed" | "cancelled";
    planning: "awaiting_confirmation" | "failed" | "cancelled";
    awaiting_confirmation: "executing" | "cancelled";
    executing: "testing" | "verifying" | "succeeded" | "failed" | "cancelled";
    testing: "verifying" | "succeeded" | "failed" | "cancelled";
    verifying: "succeeded" | "failed" | "cancelled";
  };
};

// ---------------------------------------------------------------------------
// Mode-gated action policy — v1.3
// ---------------------------------------------------------------------------

/**
 * Which RunStepVerbs are permitted per RunMode.
 * The backend rejects any tool call that would produce a forbidden verb.
 * The model cannot circumvent this by rewording — the API validates on step creation.
 *
 * EXPLORE:      ACTIVITY, SUMMARY only — no reads, no writes, no builds
 * INVESTIGATE:  ACTIVITY, FILE_READ, SHELL (read-only), SUMMARY, ERROR
 * EXECUTE:      all verbs permitted
 */
export const PERMITTED_VERBS_BY_MODE: Record<RunMode, ReadonlySet<RunStepVerb>> = {
  EXPLORE: new Set(["ACTIVITY", "SUMMARY", "ERROR"]),
  INVESTIGATE: new Set(["ACTIVITY", "FILE_READ", "SHELL", "SUMMARY", "ERROR"]),
  EXECUTE: new Set([
    "ACTIVITY", "FILE_READ", "FILE_EDIT", "LINE_PATCH", "FILE_DELETE",
    "FILE_CREATE", "SHELL", "TEST", "ARTIFACT_CREATED", "ERROR", "SUMMARY",
  ]),
};

export function isVerbPermitted(mode: RunMode, verb: RunStepVerb): boolean {
  return PERMITTED_VERBS_BY_MODE[mode].has(verb);
}

// ---------------------------------------------------------------------------
// Browser Flow types — v1.5
// ---------------------------------------------------------------------------

/**
 * Named viewport profiles for run_browser_flow.
 * Dimensions are resolved server-side — the model never supplies pixel values.
 */
export type ViewportProfile = "DESKTOP" | "MOBILE" | "FOLD_CLOSED" | "FOLD_OPEN";

/**
 * Structured semantic target for browser interactions.
 * Priority: testId > role > label > text > css (fallback).
 * The runner refuses destructive targets ("Delete", "Remove account") in READ_ONLY scope.
 */
export type BrowserLocator =
  | { by: "testId"; value: string }
  | { by: "role"; role: string; name?: string }
  | { by: "label"; value: string }
  | { by: "text"; value: string }
  | { by: "css"; value: string };

/**
 * One step in a browser flow. Steps execute in order; any failure stops the run.
 * The model provides these — the server validates and enforces scope before executing.
 */
export type BrowserStepInput =
  | { action: "navigate"; path: string }
  | { action: "click"; target: BrowserLocator; waitAfterMs?: number }
  | { action: "fill"; target: BrowserLocator; value: string }
  | { action: "wait"; ms: number }
  | { action: "wait_for"; selector: string; timeoutMs?: number }
  | { action: "refresh" }
  | { action: "screenshot"; label?: string };

/**
 * One assertion evaluated after steps complete.
 * All assertions run even if some fail; the aggregate determines pass/fail.
 */
export type BrowserAssertionInput =
  | { type: "text_visible"; value: string }
  | { type: "url_contains"; value: string }
  | { type: "element_visible"; selector: string }
  | { type: "element_absent"; selector: string }
  | { type: "no_console_errors" }
  | { type: "no_network_errors"; pattern?: string }
  /** Evaluate a JS expression in page context. Result is JSON-stringified and
   *  checked with expectContains (substring). Leave expectContains blank to
   *  assert the expression returns a truthy value. */
  | { type: "js_eval"; expression: string; expectContains?: string };

/**
 * Per-viewport result stored in execution_run_steps.metadata.
 * The step's status='ok' requires ALL viewports to pass.
 */
export interface BrowserProfileResult {
  viewport: ViewportProfile | string;
  success: boolean;
  assertionsPassed: number;
  assertionsFailed: number;
  finalUrl: string;
}

/**
 * Structured artifact reference stored in execution_run_steps.metadata.
 * Object keys are GCS paths under browser-runs/{userId}/{projectId}/{runId}/{stepId}/.
 */
export interface BrowserArtifactRef {
  type: "SCREENSHOT" | "TRACE" | "REPORT";
  objectKey: string;
  sha256: string;
  createdAt: string;
}

/**
 * Scope for a browser test session.
 * READ_ONLY: blocks POST/PUT/PATCH/DELETE at the Playwright route layer.
 * CONTROLLED_WRITE: permits specific mutation endpoints declared in allowedMutations.
 */
export type BrowserTestScope = "READ_ONLY" | "CONTROLLED_WRITE";

/**
 * An explicitly permitted mutation endpoint for CONTROLLED_WRITE scope.
 */
export interface MutationAllow {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  pathPattern: string;
}
