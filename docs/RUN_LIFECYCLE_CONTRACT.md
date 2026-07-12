# Run Lifecycle Contract — Version 1.1
**Status: FROZEN — do not implement against a draft version.**
**Both teams (Replit backend, Lovable frontend) build against this document.**
**Changes require a version bump and agreement from both teams before implementation.**

---

## Foundational Rule: One System, Not Two

**Every assistant turn — CHAT, DECIDE, or BUILD — receives a canonical Run ID and a lightweight Run record.**

Messages and runs are not competing state systems. They may be separate database records, but they share one canonical turn identity via `runId`. The conversation history remains durable and ordered; runs carry the execution state for that same turn. Neither replaces the other.

The unified rule:
- CHAT turns → lightweight Run + ConversationMessage record, no execution card, does not block BUILD
- DECIDE turns → lightweight Run + ConversationMessage record, no execution card, does not block BUILD
- BUILD turns → full Run + ConversationMessage record, execution card rendered, subject to one-active-BUILD restriction

This gives the system:
- Consistent SSE streaming (all events carry a `runId`)
- Persisted failures and timing evidence for every turn
- Refresh restoration without special cases
- One lifecycle vocabulary across all surfaces
- Audit trail for every interaction (Timeline shows all turns, not just builds)

### ConversationMessage

Every user message and every assistant turn produces a `ConversationMessage` record. The chat renderer reads from conversation messages — not from runs.

```typescript
interface ConversationMessage {
  id: string
  runId: string              // links this message to its canonical run
  conversationId: string
  role: "user" | "assistant"
  content: string            // final settled content (streaming prose resolves here)
  createdAt: string          // ISO 8601
}
```

**Conversation history endpoint (paginated):**
```
GET /api/conversations/:conversationId/messages?cursor=&limit=50  → ConversationPage
```
```typescript
interface ConversationPage {
  messages: ConversationMessage[]
  nextCursor: string | null  // null when no more history
  total: number
}
```

**Ordering:** messages are ordered by `createdAt` ascending. The cursor is opaque — do not parse it.

**Duplicate submission prevention:** the client includes an idempotency key on each user message send. The server rejects a second request with the same key within 60 seconds.

**Streaming → settled:** while a CHAT/DECIDE turn is streaming, `token` SSE events carry the prose. When `run_complete` fires, the final `content` is written to the `ConversationMessage` record. The chat renderer transitions from the SSE token stream to the settled message at that point.

---

## 1. Canonical Run Object

```typescript
interface Run {
  // Identity
  id: string                      // UUID, stable forever
  projectId: number | null        // null for general conversations not scoped to a project
  conversationId: string          // scopes to one thread

  // Status — THE source of truth. No surface infers or guesses this.
  status: RunStatus
  intent: "BUILD" | "CHAT" | "DECIDE"

  // Content
  prompt: string                  // the exact user message that triggered this run
  response: string | null         // full conversational prose (CHAT/DECIDE turns)
  summary: string | null          // compact one-line receipt label (~80 chars max)
  plan: PlanBlock | null          // populated when status reaches "planning" (BUILD/DECIDE only)

  // Steps — metadata only in this object; full content via /api/runs/:id/steps
  stepCount: number               // total steps (including pending)
  stepsDone: number               // steps completed so far

  // Error state (null unless status is "failed")
  error: RunError | null

  // Verification results (null until verifying stage or later)
  verification: RunVerification | null

  // GitHub commit state — separate from run lifecycle, BUILD only
  commit: RunCommit | null

  // Recovery anchor — recorded at run creation for cancellation/failure recovery
  snapshotRef: string | null      // git commit SHA or workspace snapshot ID at run start

  // Timestamps
  createdAt: string               // ISO 8601
  updatedAt: string               // ISO 8601, updated on every state change
  completedAt: string | null      // set when status reaches any terminal state
  elapsedMs: number | null
}

type RunStatus =
  | "received"
  | "thinking"
  | "planning"
  | "awaiting_confirmation"
  | "executing"
  | "testing"
  | "verifying"
  | "succeeded"
  | "failed"
  | "cancelled"

interface RunError {
  code: "TOOL_FAILURE" | "TIMEOUT" | "CONTEXT_LIMIT" | "CANCELLED_PARTIAL" | "UNKNOWN"
  message: string                 // human-readable sentence
  recoverable: boolean            // true = user can retry; false = requires intervention
  stepId: string | null           // which step caused the failure, if known
  partialWritesOccurred: boolean  // true if files were written before failure/cancellation
}

interface RunVerification {
  status: "not_started" | "running" | "passed" | "failed" | "partial"
  checks: VerificationCheck[]
}

interface VerificationCheck {
  id: string
  label: string                   // e.g. "TypeScript", "Tests", "Lint"
  status: "pending" | "running" | "passed" | "failed" | "skipped"
  output: string | null           // truncated output (last 2000 chars max)
  durationMs: number | null
}

interface RunCommit {
  status: "not_requested" | "running" | "succeeded" | "failed"
  sha: string | null
  url: string | null              // full GitHub commit URL
  error: string | null            // set when status is "failed"
  committedAt: string | null
}
```

---

## 2. RunStep Schema

Steps are returned via `/api/runs/:id/steps`, not embedded in the Run object. The Run object carries only `stepCount` and `stepsDone`. This prevents `run_complete` events from becoming enormous for multi-file builds.

```typescript
interface RunStep {
  id: string                      // stable UUID
  runId: string
  seq: number                     // 1-based, monotonic, stable

  verb: RunStepVerb
  status: "pending" | "running" | "succeeded" | "failed" | "skipped"
  title: string                   // short human-readable label
  detail: string | null           // brief status note (e.g. "3 functions updated")

  // File operations — content retrieved via /api/runs/:id/changes for diffs
  filePath: string | null

  // Shell/test operations
  command: string | null
  exitCode: number | null
  outputSummary: string | null    // last 500 chars of shell output; full via /api/runs/:id/terminal

  // Artifact operations — hydrated via /api/runs/:id/outputs
  artifact: RunArtifactSummary | null

  // Timing
  startedAt: string | null        // ISO 8601
  completedAt: string | null      // ISO 8601
}

type RunStepVerb =
  | "ACTIVITY"           // user-safe summary of Atlas reasoning or inspection work
                         // (e.g. "Compared existing UTM flow with proposed YouTube path")
                         // Never raw model reasoning. Never chain-of-thought text.
  | "FILE_READ"          // read a file (informational, not shown in Changes tab)
  | "FILE_EDIT"          // wrote a complete file
  | "LINE_PATCH"         // patched specific lines
  | "FILE_DELETE"        // deleted a file
  | "FILE_CREATE"        // created a new file
  | "SHELL"              // ran a shell command
  | "TEST"               // ran a test suite
  | "ARTIFACT_CREATED"   // produced a downloadable output
  | "ERROR"              // a step-level error that did not abort the run
  | "SUMMARY"            // Atlas's closing summary for the turn

interface RunArtifactSummary {
  id: string
  name: string                    // display name (e.g. "Analytics Report.pdf")
  type: string                    // artifact type (e.g. "pdf", "html", "pptx")
  mimeType: string                // MIME type (e.g. "application/pdf")
  sizeBytes: number | null
  status: "generating" | "ready" | "failed"
  downloadUrl: string | null      // available when status is "ready"
  previewUrl: string | null       // optional inline preview
}
```

**ACTIVITY is never raw internal reasoning.** It is a user-safe, one-sentence description of what Atlas examined or decided. The backend is responsible for generating this summary before persisting the step.

**Surface routing by verb:**

| Verb | Chat | Changes | Terminal | Outputs | Timeline |
|---|---|---|---|---|---|
| ACTIVITY | Collapsed by default | — | — | — | ✓ (summary) |
| FILE_READ | — | — | — | — | — |
| FILE_EDIT, LINE_PATCH, FILE_DELETE, FILE_CREATE | — | ✓ | — | — | ✓ |
| SHELL, TEST | — | — | ✓ | — | ✓ |
| ARTIFACT_CREATED | — | — | — | ✓ | ✓ |
| ERROR | ✓ (inline) | — | — | — | ✓ |
| SUMMARY | ✓ (receipt text) | — | — | — | — |

---

## 3. Dedicated Content Endpoints

The Run object contains metadata only. Full content is retrieved via dedicated endpoints. The `RunProvider` owns all fetching — surfaces never call these directly.

```
GET /api/runs/:id/steps                → RunStep[]          (step metadata, no diff content)
GET /api/runs/:id/changes              → RunChange[]        (file diffs with before/after)
GET /api/runs/:id/terminal             → RunTerminalPage    (paginated shell/test output)
GET /api/runs/:id/outputs              → RunArtifact[]      (full artifact metadata)
```

```typescript
interface RunChange {
  stepId: string
  filePath: string
  verb: "FILE_EDIT" | "LINE_PATCH" | "FILE_DELETE" | "FILE_CREATE"
  beforeContent: string | null
  afterContent: string | null
  status: "pending" | "applied" | "failed" | "skipped"
}

interface RunTerminalPage {
  lines: TerminalLine[]
  totalLines: number
  page: number
  pageSize: number
}

interface TerminalLine {
  stepId: string
  stream: "stdout" | "stderr"
  text: string
  timestamp: string
}

interface RunArtifact extends RunArtifactSummary {
  runId: string
  stepId: string
  createdAt: string
}
```

---

## 4. PlanBlock Schema

```typescript
interface PlanBlock {
  title: string
  rationale: string | null        // one sentence explaining the approach
  complexity: "LOW" | "MEDIUM" | "HIGH"
  estimatedChanges: number
  items: PlanItem[]
}

interface PlanItem {
  seq: number
  file: string                    // short filename (e.g. "TrafficChannels.tsx")
  filePath: string                // full path
  verb: "MUST" | "SHOULD" | "COULD"
  description: string             // one sentence: what changes and why
  status: "pending" | "in_progress" | "done" | "skipped"
}
```

---

## 5. Intent-Specific Lifecycle Paths

All intents create a Run record. Lifecycle paths differ by intent.

### CHAT
```
received → thinking → succeeded
                    ↘ failed
                    ↘ cancelled
```
- Has a Run record with a `runId`
- `response` contains full prose
- `summary` is a short receipt label
- No `plan`, no `awaiting_confirmation`, no file steps
- Does not render an execution card
- Does not block an active BUILD run
- Does not count toward the one-active-BUILD restriction

### DECIDE
```
received → thinking → planning → succeeded
                               ↘ failed
                               ↘ cancelled
```
- Has a Run record with a `runId`
- Has a `plan` (informational only — no file writes)
- No `awaiting_confirmation` (no execution gate needed)
- Does not render an execution card
- Does not block an active BUILD run
- `plan.items` may be shown to the user as a decision proposal, not as pending execution

### BUILD
```
received → thinking → planning → awaiting_confirmation → executing → [testing →] [verifying →] succeeded
                                ↘ cancelled (Gate 1 rejected)                                  ↘ failed
                                                          ↘ cancelled (mid-execution)          ↘ cancelled
```
- Full lifecycle as documented
- Gate 1 required before any file is written
- Subject to one-active-BUILD restriction (see Section 9)
- Renders execution card in chat

### Valid skip transitions for BUILD

When testing or verification is not configured or not applicable:

```
executing → testing → verifying → succeeded   (full path)
executing → testing → succeeded               (no verifier configured)
executing → verifying → succeeded             (no test runner configured)
executing → succeeded                         (no testing or verification)
```

**The backend sends explicit status events for each stage entered.** The frontend never infers a skipped stage from the absence of an event. If `testing` status is never emitted, the frontend treats that stage as not applicable for this run — it does not guess.

---

## 6. SSE Event Envelope

```typescript
interface RunEvent<T = unknown> {
  eventId: string              // server-assigned UUID, unique per event
  seq: number                  // monotonically increasing per conversationId
  runId: string                // which run this event belongs to
  conversationId: string       // which conversation stream
  type: RunEventType
  timestamp: string            // ISO 8601 server time
  payload: T
}

type RunEventType =
  | "run_created"              // payload: { status: "received", intent: RunIntent }
  | "run_status"               // payload: { status: RunStatus }
  | "token"                    // payload: { text: string }
  | "plan_ready"               // payload: { plan: PlanBlock }
  | "step_update"              // payload: { step: RunStep } (metadata only, no diff content)
  | "verification_update"      // payload: { verification: RunVerification }
  | "commit_update"            // payload: { commit: RunCommit }
  | "run_complete"             // payload: { run: Run } — Run object WITHOUT step content
  | "stream_error"             // payload: { code: string; message: string }
```

**run_complete payload contains the Run metadata object only** — `stepCount`, `stepsDone`, `status`, `error`, `verification`, `commit`, etc. It does not contain full step content, diffs, or terminal output. Those are fetched via dedicated endpoints after the run completes.

**SSE wire format:**
```
id: <eventId>
event: run_status
data: {"eventId":"...","seq":4,"runId":"...","conversationId":"...","type":"run_status","timestamp":"...","payload":{"status":"executing"}}

```

---

## 7. Reconnection and Replay

**Endpoint:** `GET /api/sse/conversation/:conversationId`

**Authorization:**
- Requires valid session cookie
- Server verifies the authenticated user owns or has access to this conversation
- Access is re-verified on every reconnect attempt (not just the initial connect)
- Events for one conversation must never be sent to a subscriber of another

**Event persistence:**
- Events are written to `conversation_events` table before being emitted to the SSE stream
- This makes replay possible across service restarts and multi-instance deployments
- In-memory-only event buses are not acceptable — the database is the event store

**On initial connect:**
1. Server sends current state of any active run as hydration events (in-order, from `run_created`)
2. If no active run: sends `run_complete` for the most recent run
3. Then streams live events going forward

**On reconnect with `Last-Event-ID`:**
1. Server replays all events with `seq` greater than the last-received seq
2. Events are idempotent by `eventId` — clients must handle receiving duplicates
3. If gap > 500 events or > 10 minutes: server sends current `run_complete` snapshot instead of replaying individual events

**On reconnect without `Last-Event-ID`:**
1. Client fetches `GET /api/runs?conversationId=` first to hydrate
2. Opens SSE stream from current state
3. Server sends active run state as initial events

**REST is always the recovery source.** If SSE state is uncertain after reconnect, REST wins.

**Client reconnection backoff:** 1s, 2s, 4s, 8s, 16s, max 30s

---

## 8. REST Endpoints

```
GET    /api/runs?conversationId=:id&projectId=:id    → Run[]        (metadata only)
GET    /api/runs/:id                                  → Run          (metadata + stepCount)
GET    /api/runs/:id/steps                            → RunStep[]
GET    /api/runs/:id/changes                          → RunChange[]
GET    /api/runs/:id/terminal?page=&pageSize=         → RunTerminalPage
GET    /api/runs/:id/outputs                          → RunArtifact[]
POST   /api/runs/:id/confirm                          → { ok: true }
POST   /api/runs/:id/cancel                           → { ok: true }
POST   /api/runs/:id/commit                           → { ok: true, sha: string, url: string }
```

**Idempotency:**

| Endpoint | Idempotent | If called twice |
|---|---|---|
| `confirm` | Yes | Returns `{ ok: true }` if already executing or beyond |
| `cancel` | Yes | Returns `{ ok: true }` if already cancelled or terminal |
| `commit` | Yes | Returns existing `sha` and `url` if already committed |

**Error responses:**
```typescript
{ error: "INVALID_STATE", current: RunStatus, required: RunStatus[] }  // 409
{ error: "NOT_FOUND" }                                                   // 404
{ error: "FORBIDDEN" }                                                   // 403
{ error: "RUN_ACTIVE", runId: string }                                   // 409, on concurrent BUILD
{ error: "INTERNAL", message: string }                                   // 500
```

---

## 9. Concurrent Run Policy

**One active BUILD run per conversation at a time.**

- If a BUILD run has a non-terminal status and a new BUILD turn starts: server returns `409 RUN_ACTIVE`
- CHAT and DECIDE turns are never blocked by an active BUILD run
- CHAT and DECIDE runs are never subject to the one-active restriction

**Frontend:**
- When `409 RUN_ACTIVE` is received: toast "A build is already running. Wait for it to finish or cancel it."
- The Cancel button on the active build card must remain visible
- While a non-terminal BUILD run exists, exactly one live BUILD card is visible in chat. When no active BUILD run exists, zero BUILD cards are shown. Never two simultaneously.

---

## 10. The Two Gates

**Gate 1 — Pre-execution confirmation (BUILD only)**
> "Apply these changes."

- Shown when `run.status === "awaiting_confirmation"`
- No files have been written yet
- `Cancel` → POST /cancel → `cancelled` | `Apply changes` → POST /confirm → `executing`
- Button label: **"Apply changes"** — never "Approve"

**Gate 2 — GitHub commit (BUILD only, post-execution, optional)**
> "Commit to GitHub."

- Available when `run.status === "succeeded"` AND `run.commit.status === "not_requested"` AND GitHub linked
- Run is already terminal — this does not change `run.status`
- `run.commit` tracks the commit state independently
- Button label: **"Commit to GitHub"** — never "Approve"

Never shown simultaneously. Never called the same thing.

---

## 11. Cancellation Semantics

| Cancelled at status | Files written? | Partial writes on disk? | `error.partialWritesOccurred` |
|---|---|---|---|
| `received`, `thinking` | No | No | false |
| `planning` | No | No | false |
| `awaiting_confirmation` | No | No | false |
| `executing` (mid-write) | Possibly | **Yes** | true |
| `testing`, `verifying` | Yes | Yes (all writes done) | false |

**The backend does not automatically roll back partial file writes.**

When cancellation occurs with `partialWritesOccurred: true`, the frontend shows:
> "Cancelled mid-execution — some files may have been partially updated. Use the Changes tab to review what was written."

**Recovery anchor:** `run.snapshotRef` records the git commit SHA (or workspace snapshot ID) at run creation. This enables a future rollback action even if automatic rollback is not implemented in V1.

---

## 12. RunProvider Frontend Contract

```typescript
interface RunContextValue {
  // Active BUILD run (non-terminal), or null
  activeBuildRun: Run | null

  // Active CHAT or DECIDE turn (non-terminal), or null
  // May be non-null simultaneously with activeBuildRun
  activeTurn: Run | null

  // All runs for this conversation, newest first (metadata only)
  runs: Run[]

  // Gate 1 — confirm BUILD execution
  confirm(runId: string): Promise<void>

  // Cancel any non-terminal run
  cancel(runId: string): Promise<void>

  // GitHub commit — only valid when run.status === "succeeded"
  commit(runId: string): Promise<void>

  // Content fetchers — RunProvider owns these, surfaces do not call them directly
  fetchSteps(runId: string): Promise<RunStep[]>
  fetchChanges(runId: string): Promise<RunChange[]>
  fetchTerminal(runId: string, page: number): Promise<RunTerminalPage>
  fetchOutputs(runId: string): Promise<RunArtifact[]>

  // Connection state
  connectionStatus: "connecting" | "connected" | "reconnecting" | "disconnected"
}
```

**`activeBuildRun`** — the BUILD run that renders the execution card in chat. Used by Changes, Terminal, Outputs. Never replaced by a CHAT/DECIDE turn.

**`activeTurn`** — the current CHAT or DECIDE run. Used only to drive the thinking/streaming indicator in chat. Does not affect any other surface.

**Rules:**
- `RunProvider` is a singleton per conversation — one SSE connection
- No surface holds its own copy of run state
- No surface fetches runs independently
- No surface parses model tokens to determine status
- `activeBuildRun` and `activeTurn` can be non-null at the same time — CHAT can stream while a BUILD is awaiting confirmation

---

## 13. response vs summary

**`response: string | null`**
- Full conversational prose for this turn
- Rendered inline in the chat stream as Atlas speaks
- May be long
- Used for CHAT and DECIDE turns

**`summary: string | null`**
- Compact one-line receipt label (max ~80 characters)
- Used in: Timeline rows, run receipt chips, notification text
- Generated by the backend — never derived from the first N chars of `response`
- Example: `"Added YouTube as recognized traffic source (3 files)"`

Never display `response` where `summary` is expected. Never use `prompt` as a display label.

---

## 14. TypeScript Types Package

Canonical types live at `lib/run-contract/src/index.ts`, importable as `@workspace/run-contract` within the monorepo. Lovable receives these as a generated TypeScript file.

**Source of truth hierarchy:**
1. `docs/RUN_LIFECYCLE_CONTRACT.md` — human-readable authority (this document)
2. `lib/run-contract/src/index.ts` — the executable types both backend and frontend compile against
3. Mock fixtures and backend event payloads are validated against the same types

When the document and the types disagree, the document wins and the types must be corrected. The reverse is also true: if a type change is needed, this document must be updated first and the version bumped. Neither team may silently drift the types away from the contract.

A future CI step will validate that backend-emitted SSE payloads satisfy the TypeScript types (compile-time) and that Lovable mock fixtures parse without error. Until that step exists, both teams are responsible for manual verification on each version bump.

---

## 15. What Lovable Can Build Now (Before Phase 2)

Against mock data and local state:
- Shell layout (bottom nav, header, tab bar)
- `RunProvider` with the full interface defined in Section 12
- Lifecycle story components for each status (can be driven by mocked run objects)
- Plan card, progress indicator, receipt chip
- Changes, Timeline, Terminal, Outputs surface layouts
- Reconnect and hydration logic (against mock SSE)

**Do not wire to production SSE until Replit confirms Phase 2 is live.** Lovable should not attempt to interpret existing `/api/nexus/chat` SSE tokens — that stream does not conform to this contract.

---

## Version History

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-07-12 | Initial frozen contract |
| 1.1 | 2026-07-12 | Critical fix: CHAT/DECIDE create lightweight runs (no two-system split). Made `projectId` nullable. Split `RunProvider.currentRun` into `activeBuildRun` + `activeTurn`. Replaced `THOUGHT` verb with user-safe `ACTIVITY`. Moved step content out of `run_complete` to dedicated endpoints. Added `RunArtifactSummary` to steps. Defined BUILD skip transitions explicitly. Added `snapshotRef` for cancellation recovery. Added SSE auth, durable event persistence, and multi-instance rules. |
| 1.2 | 2026-07-12 | Clarified foundational rule: messages and runs share `runId` but are separate durable records, not competing systems. Added `ConversationMessage` schema and paginated `/messages` endpoint with ordering and duplicate-prevention rules. Added `commit_update` SSE event for post-terminal commit state changes. Fixed concurrent-run wording: zero cards when no active BUILD, one card while active, never two. Replaced single-source-of-truth claim with explicit source-of-truth hierarchy (document → types → fixtures). |
