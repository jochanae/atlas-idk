# Run Lifecycle Contract
**Version 1.0 — The single source of truth for every surface that touches a run.**

---

## The Problem This Solves

Every surface was independently tracking run state. Chat invented its own version. The run card invented its own. Timeline had another. Terminal had another. When any one of them drifted, it looked like a bug — but fixing it in one place just moved the drift somewhere else.

This document ends that. Every surface reads from one object. Nothing invents state. Nothing derives guesses. Nothing stores a local copy.

---

## The Run Object

A run is a single object in the database (`execution_runs` table). It is the **only** authoritative record of what happened.

```
run {
  id: string
  project_id: string
  conversation_id: string
  status: RunStatus
  plan: PlanBlock | null        -- what Atlas proposed
  steps: RunStep[]              -- what Atlas executed
  files_changed: FileChange[]   -- the actual diffs
  created_at: timestamp
  updated_at: timestamp
  completed_at: timestamp | null
}
```

### RunStatus — the canonical state machine

```
idle → planning → awaiting_approval → executing → succeeded | failed
                ↘ skipped (user dismissed without approving)
```

**Transitions are server-side only.** No surface may change status directly. Surfaces call API endpoints. The API changes the run object. Surfaces re-render from the updated object.

| Transition | Trigger | Who calls it |
|---|---|---|
| `idle → planning` | Atlas begins generating a plan | Server (nexus.ts, as SSE starts) |
| `planning → awaiting_approval` | Plan generation complete | Server (after plan emitted) |
| `awaiting_approval → executing` | User clicks Approve | Client → POST /api/runs/:id/approve |
| `awaiting_approval → skipped` | User clicks Skip/Close | Client → POST /api/runs/:id/skip |
| `executing → succeeded` | All steps done | Server (after last step completes) |
| `executing → failed` | Any step errors | Server (on unrecoverable error) |

---

## What Creates a Run

**One thing:** the server, when Atlas decides to produce a plan.

The server emits a `{type: "run_created", runId}` SSE event at the moment the run row is inserted. Every surface subscribes to this event and switches from "no active run" to "run exists." The client never creates a run. The client never synthesizes a run from chat tokens.

---

## Who Owns a Run

The server owns the run. The database is the run. Surfaces are **read-only views** of the run object — they render it, they do not store it.

---

## What Each Surface Is Allowed to Render

### Chat (`ChatStream.tsx`)
- **Before a run exists:** normal conversation. Atlas narration only.
- **When `status = planning`:** a single compact "Thinking..." indicator. One line. No plan details yet.
- **When `status = awaiting_approval`:** one compact PlanCard. Contains: plan title, step list, REVIEW / SKIP / APPROVE buttons. This is the ONLY interactive element. The conversation text above it is the single sentence Atlas narrated before proposing.
- **When `status = executing`:** the PlanCard collapses to a progress indicator ("Step N of M — working on X"). The card does not scroll away. It stays anchored at the bottom of the conversation until the run completes.
- **When `status = succeeded | failed | skipped`:** the card becomes a receipt. Small. Timestamped. Shows final status and file count. Not interactive. Conversation resumes normally above it.

**Chat is never allowed to:**
- Show source code in prose
- Show file paths as narration
- Show a second card while one is active
- Invent a status that contradicts the run object
- Display `Working...` text separately from the card

### Changes Tab (`ViewChangesPanel.tsx`)
- **When no run or `status = idle`:** empty state or most recent completed run
- **When `status = planning | awaiting_approval`:** Timeline tab shows pending run. Changes tab shows proposed file list (read-only).
- **When `status = executing`:** live step progress. Files update as each step completes.
- **When `status = succeeded`:** full diff view. GitHub push button if repo is linked.
- Renders **from `run.files_changed`** only. Never from chat tokens. Never from local component state.

### Timeline (`ChangesLens — Timeline view`)
- Each row is one run. Status badge comes from `run.status`. Timestamp from `run.completed_at`. Never inferred from anything else.
- Timeline is a receipt archive. It never shows "live" state — it shows the last committed state of each run.

### Terminal Tab
- Shows build/test output from `run.steps` where `step.type = "shell"`
- Sync to GitHub button: visible only when `run.status = succeeded` and a GitHub repo is linked
- Terminal does not track its own execution state. It reads from `run.steps`.

### Outputs Tab
- Lists artifacts from `run.files_changed` — the files that were written
- No independent fetch. Derives from the run object passed down.

---

## The One Live Card Rule

**At any moment, there is zero or one active run card in the chat.**

- If `status = idle | succeeded | failed | skipped` for all runs → no card in chat (receipts only)
- If a run has `status = planning | awaiting_approval | executing` → exactly one card in chat
- The card is keyed by `run.id`. It never re-renders into a different card mid-run.
- If a new run starts before the previous one is resolved → the previous run is force-transitioned to `failed` by the server before the new run is created.

---

## Data Flow — How Surfaces Stay in Sync

```
Server emits SSE event (status change, step update, run created)
  └─► useRunStream() hook (single subscription, singleton)
        └─► RunContext (React context, single source)
              ├─► Chat reads currentRun from context
              ├─► ViewChangesPanel reads currentRun from context
              ├─► Timeline reads runs[] from context
              └─► Terminal reads currentRun.steps from context
```

**No surface fetches runs independently.** `RunContext` owns the subscription and the data. Surfaces consume it.

---

## What a "Receipt" Is

When a run reaches a terminal state (`succeeded | failed | skipped`), every surface converts its live view into a receipt:

- Chat: compact card with status badge, file count, timestamp. Not interactive.
- Changes: frozen diff. GitHub push button if not yet pushed.
- Timeline: row with status badge and duration.
- Terminal: frozen output.

Receipts never update. They are snapshots of `run` at the moment it reached terminal state.

---

## Approval Flow — Exactly How It Works

1. Atlas finishes generating a plan. Server sets `status = awaiting_approval`. SSE fires.
2. Chat renders the PlanCard with REVIEW / SKIP / APPROVE.
3. User clicks APPROVE → client calls `POST /api/runs/:id/approve`
4. Server sets `status = executing`. SSE fires.
5. Every surface simultaneously updates: chat card shows progress, Changes tab goes live, Terminal starts streaming.
6. Steps complete. Server sets `status = succeeded`. SSE fires.
7. Every surface simultaneously becomes a receipt.

There is no scenario where chat shows "Succeeded" while Timeline shows "Working." They both read the same object. When the object changes, they both change.

---

## Implementation Order (Frontend Rebuild)

This contract requires rebuilding in this sequence. Each step must be complete before the next starts.

### Step 1: RunContext
Create `src/contexts/RunContext.tsx`. Single SSE subscription. Exposes `currentRun`, `runs[]`, and action dispatchers (`approve`, `skip`). This is the foundation — nothing else can be built until this exists.

### Step 2: Clean the chat surface
Gut `ChatStream.tsx` of all local run state. It reads from `RunContext` only. The only thing it renders for a run is: compact thinking indicator → PlanCard (awaiting_approval) → progress indicator (executing) → receipt (terminal). No exceptions.

### Step 3: Rebuild the Plan Card
One component. One source of truth. Props: `run: Run`. It renders differently based on `run.status`. No internal state beyond UI interactions (hover, expand).

### Step 4: Changes Tab
Remove all local fetching. Reads from `RunContext.currentRun`. If no current run, shows last completed run from `RunContext.runs`.

### Step 5: Timeline
Each row is `Run`. Status badge, timestamp, duration — all from the run object. No local state.

### Step 6: Terminal
Reads `currentRun.steps` filtered to shell type. No independent execution state.

---

## What Does NOT Exist in the New Architecture

- Local `useState` for run status in any surface component
- `useEffect` fetching runs independently in multiple places
- Chat tokens being parsed to derive run state
- A "phantom card" that appears because a component guessed a run started
- Multiple cards in chat simultaneously
- Status mismatches between surfaces

---

## The Test

When a run completes, take a screenshot. Every surface should show the same status at the same moment. If any one of them is different — a surface is violating this contract.
