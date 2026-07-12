# Axiom Rebuild Specification
**The shared contract between Replit (backend) and Lovable (frontend).**
**Version 1.0 — Commit this before writing a single line of implementation code.**

---

## Scope

Replace the frontend execution architecture and consolidate the AI/run contract.

**Preserved without changes:**
- PostgreSQL database (all tables, all data)
- Authentication and session management
- User, project, and Ledger data
- Working tool implementations (file writes, search, codegen, artifacts)
- Unrelated backend routes (entries, genome, checkpoints, deliverables, etc.)

**Replaced:**
- Frontend execution state architecture (atlas-frontend/src → atlas-frontend-next/)
- AI pipeline: two pipelines (chat.ts + nexus.ts) → one canonical pipeline
- Run lifecycle: ad-hoc status strings → canonical state machine
- SSE protocol: text token streaming only → typed structured events
- Approval semantics: mislabeled "Approve" → two clearly separated gates

---

## The Fundamental Correction: Two Gates, Not One

The current system has one "Approve" button that conflates two completely different user decisions:

**Gate 1 — Pre-execution confirmation**
> "I want Atlas to make these changes."
- Happens BEFORE any files are written
- User is reviewing a proposed plan
- Buttons: `Cancel` / `Apply changes`
- If cancelled → run status: `cancelled`, nothing was written

**Gate 2 — Post-execution commit decision**
> "I want to push these local changes to GitHub."
- Happens AFTER files have already been written locally
- User is reviewing what was actually changed
- Buttons: `Keep locally` / `Commit to GitHub`
- This is NOT part of the run lifecycle — it is a separate, optional action
- The run is already `succeeded` at this point

These are never shown simultaneously. They are never called the same thing.

---

## Canonical Run Schema

```typescript
interface Run {
  id: string                    // UUID, stable across all surfaces
  projectId: number
  conversationId: string        // scopes to the active thread
  
  status: RunStatus             // THE source of truth — no surface infers this
  intent: "BUILD" | "CHAT" | "DECIDE"
  
  // Content
  prompt: string                // the user message that triggered this run
  summary: string | null        // one-line human-readable title
  plan: PlanBlock | null        // populated when status reaches "planning"
  
  // Steps — populated incrementally as execution proceeds
  steps: RunStep[]
  
  // Timestamps
  createdAt: string             // ISO 8601
  updatedAt: string             // ISO 8601 — updated on every status change
  completedAt: string | null    // set when status reaches terminal state
  elapsedMs: number | null
}

interface PlanBlock {
  title: string
  complexity: "LOW" | "MEDIUM" | "HIGH"
  estimatedChanges: number
  items: PlanItem[]
}

interface PlanItem {
  index: number
  file: string                  // short filename for display
  filePath: string              // full path
  verb: "SHOULD" | "MUST" | "COULD"
  description: string
  status: "pending" | "in_progress" | "done" | "skipped"
}

interface RunStep {
  id: number
  verb: "FILE_EDIT" | "LINE_PATCH" | "FILE_DELETE" | "FILE_CREATE" | "SHELL" | "READ" | "ARTIFACT_CREATED"
  target: string | null
  status: "ok" | "error" | "skipped"
  detail: string | null
  content: string | null
  beforeContent: string | null  // for diff display
  orderIndex: number
  createdAt: string
}
```

---

## Canonical Status State Machine

```
received → thinking → planning → awaiting_confirmation → executing → testing → verifying → succeeded
                                ↘ cancelled (user cancels before execution)              ↘ failed
                                                                                         ↘ cancelled
```

### Status Definitions

| Status | Meaning | Who sets it |
|---|---|---|
| `received` | Server received the user message, turn has started | Server, immediately on request |
| `thinking` | Atlas is processing intent and context | Server, before first token |
| `planning` | Atlas is generating a structured plan | Server, when plan block begins |
| `awaiting_confirmation` | Plan is complete, waiting for user Gate 1 decision | Server, when plan generation completes |
| `executing` | User confirmed — files are being written | Server, when user calls /confirm |
| `testing` | Post-execution test runner invoked | Server, when shell test step begins |
| `verifying` | Verification checks running | Server, when verify step begins |
| `succeeded` | All steps completed successfully | Server, when last step completes |
| `failed` | One or more steps failed unrecoverably | Server, on unrecoverable error |
| `cancelled` | User cancelled before or during execution | Server, on /cancel call |

### Rules
- Only the server changes status
- Status always moves forward (no backwards transitions except failed/cancelled from any state)
- `CHAT` and `DECIDE` intent turns never create a run at all — no run object, no status
- A new run cannot start while another run for the same project is in a non-terminal status — server rejects with 409

---

## SSE Event Protocol

All events are emitted on the same SSE stream. The stream is keyed by `conversationId`, not by `runId` — so the frontend subscribes once to the conversation and receives all runs within it.

**Endpoint:** `GET /api/sse/conversation/:conversationId`

**Content-Type:** `text/event-stream`

**Events:**

```typescript
// Run created — a new run has started
{ type: "run_created", runId: string, status: "received", timestamp: string }

// Status changed — the authoritative status update
{ type: "run_status", runId: string, status: RunStatus, timestamp: string }

// Token — a prose token from the model (chat text only, not plan content)
{ type: "token", runId: string, text: string }

// Plan ready — the full plan block
{ type: "plan_ready", runId: string, plan: PlanBlock }

// Step update — a step's status changed
{ type: "step_update", runId: string, step: RunStep }

// Run complete — terminal event with final run object
{ type: "run_complete", runId: string, status: "succeeded" | "failed" | "cancelled", run: Run }

// Error — stream-level error
{ type: "error", code: string, message: string }
```

**Rules:**
- Every event includes `runId` so surfaces can route updates to the correct run
- `run_status` is always emitted before any event that requires the new status to be true
- `run_complete` always carries the full Run object — frontends can use it to hydrate on reconnect
- The SSE stream reconnects automatically; on reconnect the server sends the current run state

---

## REST Endpoints (Run Lifecycle)

```
GET  /api/runs?conversationId=&projectId=      → Run[]     (list, most recent first)
GET  /api/runs/:id                             → Run       (single run with steps)
POST /api/runs/:id/confirm                     → { ok: true } (Gate 1 — user approves execution)
POST /api/runs/:id/cancel                      → { ok: true } (cancel from any non-terminal state)
```

**GitHub commit (separate from run lifecycle):**
```
POST /api/runs/:id/commit                      → { ok: true, commitUrl: string }
```
This is available only when `run.status === "succeeded"` and a GitHub repo is linked.
It does not change `run.status`.

---

## Frontend Contract (What Lovable Builds Against)

### RunProvider
```typescript
// Single context. Single SSE connection. Singleton.
const { currentRun, runs, confirm, cancel } = useRunContext()
```

- `currentRun` — the active run for this conversation (non-terminal status), or null
- `runs` — all runs for this conversation, newest first
- `confirm(runId)` — calls POST /api/runs/:id/confirm (Gate 1)
- `cancel(runId)` — calls POST /api/runs/:id/cancel

### Surface Rendering Rules

**Chat:**
- When `currentRun.status === "thinking"` → show one small indicator: "Thinking…"
- When `currentRun.status === "planning"` → show plan building incrementally
- When `currentRun.status === "awaiting_confirmation"` → show PlanCard with `Cancel` / `Apply changes`
- When `currentRun.status === "executing" | "testing" | "verifying"` → show compact progress: "Step N of M"
- When `currentRun.status === "succeeded"` → show compact receipt. Conversation resumes above it.
- When `currentRun.status === "failed"` → show error receipt with retry option
- No other states appear in chat. No exceptions.

**Changes Tab:**
- Renders `currentRun.steps` filtered to file-write verbs
- When `status === "awaiting_confirmation"` → shows proposed files (read-only, from `plan.items`)
- When `status === "executing"` and beyond → shows actual steps as they complete
- When terminal → shows full diff (before/after from `step.beforeContent` / `step.content`)
- The GitHub commit button appears ONLY when `status === "succeeded"` and GitHub is linked

**Timeline:**
- Each row is one `Run` from `runs[]`
- Status badge = `run.status`. Duration = `run.elapsedMs`. Date = `run.completedAt`.
- No local state. No independent fetching.

**Terminal:**
- Shows `currentRun.steps` where `step.verb === "SHELL"`
- No independent execution state

**Outputs:**
- Shows `currentRun.steps` where `step.verb === "ARTIFACT_CREATED"`

### What the Frontend Must Never Do
- Parse model text tokens to guess run status
- Store run status in local component state
- Fetch runs independently in multiple components
- Show `status = succeeded` while another surface shows `status = executing`
- Label the GitHub commit action "Approve"

---

## Migration Strategy: Not a Hard Cut

The old frontend (`atlas-frontend/`) remains running and available throughout the rebuild.

The new frontend is built at `atlas-frontend-next/` served at a different path.

Cutover is not a moment — it is a gate:

**Cutover criteria:**
1. All acceptance tests pass (see below)
2. Auth session continuity verified (same user, same data)
3. `currentRun` accurately reflects server state within 200ms of status change
4. All five surfaces show identical status at the same moment
5. GitHub commit flow works and is correctly separated from run status
6. The old frontend remains accessible for 2 weeks post-cutover as rollback

---

## Acceptance Tests (Gate Before Any Cutover)

These must pass before the new frontend is declared production-ready:

1. **Full lifecycle test:** Send a BUILD message → observe `received → thinking → planning → awaiting_confirmation` status changes in all surfaces simultaneously
2. **Confirmation test:** Click "Apply changes" → observe `executing → succeeded` in all surfaces simultaneously, with no surface lagging
3. **Cancel test:** Click "Cancel" at `awaiting_confirmation` → run shows `cancelled`, no files were written
4. **GitHub commit separation test:** After `succeeded`, commit to GitHub → run status stays `succeeded`, chat does not change
5. **Reconnect test:** Close and reopen the page mid-execution → surfaces hydrate from run object, not from re-parsing tokens
6. **Simultaneous surface test:** Screenshot at `succeeded` — all five surfaces show identical status
7. **CHAT intent test:** Send a conversational message → no run object is created, no run card appears in chat

---

## What This Document Is Not

This is not a UI design spec. Colors, typography, and layout are Lovable's domain.
This is not a deployment plan. That comes after this contract is proven.
This is not complete — edge cases will emerge. When they do, the contract is updated here first, then implemented in both teams.
