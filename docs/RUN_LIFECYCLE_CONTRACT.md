# Run Lifecycle Contract — Version 1.0
**Status: FROZEN — do not implement against a draft version.**
**Both teams (Replit backend, Lovable frontend) build against this document.**
**Changes require a version bump and agreement from both teams before implementation.**

---

## 1. Canonical Run Object

```typescript
interface Run {
  // Identity
  id: string                      // UUID, stable forever
  projectId: number
  conversationId: string          // scopes to one thread

  // Status — THE source of truth. No surface infers or guesses this.
  status: RunStatus
  intent: "BUILD" | "CHAT" | "DECIDE"

  // Content
  prompt: string                  // the exact user message that triggered this run
  response: string | null         // the full conversational prose (CHAT/DECIDE turns)
  summary: string | null          // compact one-line receipt label (shown in Timeline rows, receipts)
  plan: PlanBlock | null          // populated when status reaches "planning"
  steps: RunStep[]                // populated incrementally during execution

  // Error state (null unless status is "failed")
  error: RunError | null

  // Verification results (null until status reaches "verifying" or "succeeded")
  verification: RunVerification | null

  // GitHub commit state (separate from run lifecycle)
  commit: RunCommit | null

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
  code: string           // machine-readable: "TOOL_FAILURE" | "TIMEOUT" | "CONTEXT_LIMIT" | "UNKNOWN"
  message: string        // human-readable sentence
  recoverable: boolean   // true = user can retry; false = requires intervention
  stepId: string | null  // which step caused the failure, if known
}

interface RunVerification {
  status: "not_started" | "running" | "passed" | "failed" | "partial"
  checks: VerificationCheck[]
}

interface VerificationCheck {
  id: string
  label: string          // e.g. "TypeScript", "Tests", "Lint"
  status: "pending" | "running" | "passed" | "failed" | "skipped"
  output: string | null  // last N lines of output
  durationMs: number | null
}

interface RunCommit {
  status: "not_requested" | "running" | "succeeded" | "failed"
  sha: string | null
  url: string | null     // full GitHub commit URL
  error: string | null   // only set when status is "failed"
  committedAt: string | null
}
```

---

## 2. RunStep Schema

```typescript
interface RunStep {
  id: string              // stable UUID
  runId: string
  seq: number             // 1-based ordering, stable and monotonic

  verb: RunStepVerb
  status: "pending" | "running" | "succeeded" | "failed" | "skipped"

  title: string           // short human-readable label for this step
  content: string | null  // model prose, shell output, or tool result

  // File operations
  filePath: string | null
  beforeContent: string | null   // original file content (for diff display)
  afterContent: string | null    // new file content (for diff display)

  // Shell/test operations
  command: string | null
  exitCode: number | null

  // Artifact operations
  artifactId: string | null

  // Timing
  startedAt: string | null   // ISO 8601
  completedAt: string | null // ISO 8601
}

type RunStepVerb =
  | "THOUGHT"            // Atlas internal reasoning (shown collapsed by default)
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
```

**Surface routing by verb:**

| Verb | Changes tab | Terminal tab | Outputs tab |
|---|---|---|---|
| FILE_EDIT, LINE_PATCH, FILE_DELETE, FILE_CREATE | ✓ | — | — |
| SHELL, TEST | — | ✓ | — |
| ARTIFACT_CREATED | — | — | ✓ |
| THOUGHT, FILE_READ, ERROR, SUMMARY | — | — | — |

---

## 3. PlanBlock Schema

```typescript
interface PlanBlock {
  title: string
  rationale: string | null       // one sentence explaining the approach
  complexity: "LOW" | "MEDIUM" | "HIGH"
  estimatedChanges: number       // total number of file operations
  items: PlanItem[]
}

interface PlanItem {
  seq: number
  file: string                   // short filename for display (e.g. "TrafficChannels.tsx")
  filePath: string               // full path (e.g. "src/features/analytics/...")
  verb: "MUST" | "SHOULD" | "COULD"
  description: string            // one sentence: what changes and why
  status: "pending" | "in_progress" | "done" | "skipped"
}
```

---

## 4. Intent-Specific Lifecycle Paths

**CHAT** — conversational turns, no code execution:
```
received → thinking → succeeded
                    ↘ failed
                    ↘ cancelled
```
- No `plan` object
- No `awaiting_confirmation` state
- No Gate 1 (nothing to confirm — nothing executes)
- `response` contains the full prose
- `summary` is a short receipt label

**DECIDE** — structured analysis, decisions, deliverables — no file writes:
```
received → thinking → planning → succeeded
                               ↘ failed
                               ↘ cancelled
```
- Has a `plan` object (read-only proposal, no file changes)
- No `awaiting_confirmation` state (user does not confirm execution — there is none)
- Plan is informational only; no Gate 1

**BUILD** — file writes, execution, verification:
```
received → thinking → planning → awaiting_confirmation → executing → testing → verifying → succeeded
                                ↘ cancelled (Gate 1 rejected)          ↘ failed
                                                                        ↘ cancelled
```
- Full lifecycle as documented
- Gate 1 required before any file is written
- `testing` and `verifying` are optional — skipped if no tests or verify checks are configured

**Frontend rule:** Never render a confirmation card, plan card, or progress card for CHAT intent. Check `run.intent` before rendering any execution UI.

---

## 5. SSE Event Envelope

Every SSE event uses this envelope:

```typescript
interface RunEvent<T = unknown> {
  eventId: string          // server-assigned UUID, unique per event
  seq: number              // monotonically increasing per conversationId (for gap detection)
  runId: string            // which run this event belongs to
  conversationId: string   // which conversation stream this belongs to
  type: RunEventType
  timestamp: string        // ISO 8601 server time
  payload: T
}

type RunEventType =
  | "run_created"          // payload: { status: "received" }
  | "run_status"           // payload: { status: RunStatus }
  | "token"                // payload: { text: string }
  | "plan_ready"           // payload: { plan: PlanBlock }
  | "step_update"          // payload: { step: RunStep }
  | "verification_update"  // payload: { verification: RunVerification }
  | "run_complete"         // payload: { run: Run } — full object, terminal
  | "stream_error"         // payload: { code: string; message: string }
```

**SSE wire format:**

```
id: <eventId>
event: run_status
data: {"eventId":"...","seq":4,"runId":"...","conversationId":"...","type":"run_status","timestamp":"...","payload":{"status":"executing"}}

```

The SSE `id` field is set to `eventId`. This enables `Last-Event-ID` reconnection.

---

## 6. Reconnection and Replay Behavior

**Endpoint:** `GET /api/sse/conversation/:conversationId`

**On initial connect:**
1. Server sends all events for any active (non-terminal) run since its creation
2. If no active run: server sends `run_complete` for the most recent completed run (for hydration)
3. Then streams live events going forward

**On reconnect with `Last-Event-ID` header:**
1. Server replays all events with `seq` greater than the last received seq
2. Client must handle receiving duplicate events — events are idempotent by `eventId`
3. If reconnect gap is > 5 minutes or > 1000 missed events: server sends a `run_complete` snapshot instead of replaying individual events

**On reconnect without `Last-Event-ID` (tab sleep, browser refresh):**
1. Client fetches `GET /api/runs?conversationId=&projectId=` first to hydrate
2. Then opens SSE stream with no `Last-Event-ID`
3. Server sends current state as initial hydration events

**Reliability rules:**
- `run_complete` is guaranteed for every run that reaches a terminal state, even if the client was disconnected
- REST (`GET /api/runs/:id`) is always the recovery source — if SSE state is uncertain, REST wins
- Clients must not consider a run truly complete until they receive `run_complete` OR confirm via REST

**Client reconnection strategy:**
- Exponential backoff: 1s, 2s, 4s, 8s, max 30s
- On reconnect, compare locally known `seq` against server `seq` in first received event — if gap detected, fetch REST to fill

---

## 7. REST Endpoints (Complete)

```
GET    /api/runs?conversationId=:id&projectId=:id    → Run[]
GET    /api/runs/:id                                  → Run (with steps)
POST   /api/runs/:id/confirm                          → { ok: true }
POST   /api/runs/:id/cancel                           → { ok: true }
POST   /api/runs/:id/commit                           → { ok: true, sha: string, url: string }
```

**Idempotency:**

| Endpoint | Idempotent? | If called twice |
|---|---|---|
| `confirm` | Yes | Second call returns `{ ok: true }` if already executing |
| `cancel` | Yes | Second call returns `{ ok: true }` if already cancelled/terminal |
| `commit` | Yes | Second call returns existing commit sha/url |

**Error responses:**

```typescript
// 409 Conflict — invalid state for this action
{ error: "INVALID_STATE", current: RunStatus, required: RunStatus[] }

// 404 Not Found
{ error: "NOT_FOUND" }

// 403 Forbidden — run belongs to another user
{ error: "FORBIDDEN" }

// 500 — unrecoverable server error
{ error: "INTERNAL", message: string }
```

---

## 8. Concurrent Run Policy

**Rule: one active BUILD run per conversation at a time.**

- If a BUILD run has a non-terminal status (`received` through `verifying`) and a new BUILD turn starts, the server returns `409 CONFLICT` with `{ error: "RUN_ACTIVE", runId: string }`.
- The active run must reach a terminal state before a new one starts.
- CHAT and DECIDE turns do not create run objects and are never blocked by an active BUILD run.

**Frontend behavior:**
- When the composer receives `409 RUN_ACTIVE`, show a toast: "A run is already in progress. Wait for it to finish or cancel it."
- The Cancel button in the active run card must remain accessible.
- There is never more than one live run card in chat.

---

## 9. Cancellation Semantics

**What "cancelled" means by stage:**

| Cancelled at status | Files written? | Partial changes on disk? | Action |
|---|---|---|---|
| `received` or `thinking` | No | No | Clean — nothing happened |
| `planning` | No | No | Clean — nothing happened |
| `awaiting_confirmation` | No | No | Clean — nothing happened |
| `executing` (mid-write) | Possibly | **Yes — partial changes may exist on disk** | Backend makes no automatic rollback. Commit field will never be set. |
| `testing` or `verifying` | Yes | Yes | All writes already happened. Test results may be partial. |

**The backend does not automatically roll back partial file writes.**

When cancellation occurs during `executing`, the frontend must show: _"Cancelled mid-execution — some files may have been partially updated. Review changes before proceeding."_

The Changes tab will show whichever steps completed before cancellation. The GitHub commit button does not appear for cancelled runs.

---

## 10. The Two Gates — Final Definitions

**Gate 1 — Pre-execution confirmation (Build Mode only)**
> "I want Atlas to write these changes."

- Appears when `run.status === "awaiting_confirmation"`
- User has NOT approved writing yet — plan is proposals only
- Actions: `Cancel` (POST /cancel) → `cancelled` | `Apply changes` (POST /confirm) → `executing`
- Button label: **"Apply changes"** — never "Approve"

**Gate 2 — GitHub commit (optional, post-execution)**
> "I want to push these local changes to GitHub."

- Available when `run.status === "succeeded"` AND a GitHub repo is linked AND `run.commit.status === "not_requested"`
- Run status is already terminal — this gate does not change it
- Actions: `Keep locally` (no call) | `Commit to GitHub` (POST /commit)
- `run.commit` tracks the commit state independently
- Button label: **"Commit to GitHub"** — never "Approve"

These two gates are never shown simultaneously. They are never called the same thing.

---

## 11. response vs summary

**`response: string | null`**
- The full conversational prose Atlas generated for this turn
- Used in the chat stream for CHAT and DECIDE turns
- May be long
- Shown inline in the conversation

**`summary: string | null`**
- A compact one-line label for the run
- Used in Timeline rows, run receipts, and notification text
- Max ~80 characters
- Never the same as `response`
- Example: `"Added YouTube as traffic source (3 files)"`

The frontend must never display `response` where `summary` is appropriate, and vice versa.

---

## 12. Frontend RunProvider Contract

```typescript
interface RunContextValue {
  // Active run for this conversation (non-terminal), or null
  currentRun: Run | null

  // All runs for this conversation, newest first
  runs: Run[]

  // Gate 1 — confirm execution
  confirm(runId: string): Promise<void>

  // Cancel from any non-terminal state
  cancel(runId: string): Promise<void>

  // GitHub commit — only valid when run.status === "succeeded"
  commit(runId: string): Promise<void>

  // Connection state
  connectionStatus: "connecting" | "connected" | "reconnecting" | "disconnected"
}
```

**Rules:**
- `RunProvider` is a singleton per conversation — instantiated once, never duplicated
- All five surfaces (Chat, Changes, Timeline, Terminal, Outputs) consume from `useRunContext()`
- No surface holds its own copy of run state
- No surface fetches runs independently
- No surface parses model tokens to determine status

---

## 13. TypeScript Types Package

Replit will publish shared types at:

```
lib/run-contract/src/index.ts
```

Importable as `@workspace/run-contract`.

Lovable receives these types as a generated file. The source of truth for types is this document. If the types and this document disagree, this document wins.

---

## Version History

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-07-12 | Initial frozen contract |
