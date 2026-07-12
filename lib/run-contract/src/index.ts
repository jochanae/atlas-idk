/**
 * @workspace/run-contract — Version 1.2
 *
 * Canonical Run Lifecycle Contract types.
 * Generated from: docs/RUN_LIFECYCLE_CONTRACT.md (v1.2)
 *
 * SOURCE OF TRUTH HIERARCHY:
 *   1. docs/RUN_LIFECYCLE_CONTRACT.md  — human-readable authority
 *   2. This file                       — executable types both teams compile against
 *   3. Mock fixtures / backend payloads — validated against these types
 *
 * Neither team may silently drift these types away from the contract document.
 * If these types and the document disagree, correct this file and bump the version.
 * If a type change is needed, update the document first and bump its version.
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
  | "run_created"           // payload: RunCreatedPayload
  | "run_status"            // payload: RunStatusPayload
  | "token"                 // payload: TokenPayload
  | "plan_ready"            // payload: PlanReadyPayload
  | "step_update"           // payload: StepUpdatePayload (metadata only, no diff content)
  | "verification_update"   // payload: VerificationUpdatePayload
  | "commit_update"         // payload: CommitUpdatePayload — fires after run is terminal
  | "run_complete"          // payload: RunCompletePayload — Run WITHOUT step content
  | "stream_error";         // payload: StreamErrorPayload

// Typed payload shapes — use these with RunEvent<T> for type-safe event handling

export interface RunCreatedPayload {
  status: "received";
  intent: RunIntent;
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
