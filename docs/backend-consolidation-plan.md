# Backend Consolidation Plan
**Replit's execution plan for Option C — backend contract and pipeline consolidation.**
**Read axiom-rebuild-spec.md first. This document assumes that contract.**

---

## What Replit Owns

- The canonical Run schema (DB + TypeScript types)
- The canonical status state machine (server-side transitions only)
- The SSE event protocol (`GET /api/sse/conversation/:conversationId`)
- The REST run-lifecycle endpoints (`/confirm`, `/cancel`, `/commit`)
- Consolidating `chat.ts` + `nexus.ts` into one execution pipeline
- Preserving all working tools, auth, DB, and unrelated routes throughout

---

## What Replit Does NOT Touch

- atlas-frontend/ (Lovable's domain)
- PostgreSQL schema for data tables (users, projects, entries, genome, etc.)
- Auth routes and session management
- Unrelated backend routes (entries, genome, checkpoints, deliverables, account, etc.)

---

## Phase 1 — Canonical Contract (No Behavior Change)

**Goal:** Establish the types, DB columns, and SSE infrastructure without changing any behavior. No existing functionality breaks. Both old pipelines still work.

**Deliverables:**

### 1A — Canonical TypeScript types
Create `lib/db/src/schema/run-contract.ts`:
- `CanonicalRunStatus` union type matching the state machine exactly
- `CanonicalRun` interface (matches the schema in rebuild-spec.md)
- `CanonicalPlanBlock`, `CanonicalPlanItem`, `CanonicalRunStep` interfaces
- `SSEEvent` discriminated union for all event types

### 1B — DB column additions
Add to `execution_runs` via `ensureColumns()` (raw SQL, not drizzle-kit push):
- `intent TEXT` — already exists, verify
- `plan JSONB` — the structured PlanBlock, currently absent
- `prompt TEXT` — already exists, verify
- Status column: already TEXT, no change needed — but add a check constraint comment documenting the valid values

No data migration needed — new columns are nullable.

### 1C — SSE infrastructure
Create `artifacts/api-server/src/lib/runEventBus.ts`:
```
class RunEventBus {
  emit(conversationId: string, event: SSEEvent): void
  subscribe(conversationId: string, res: Response): () => void
  unsubscribe(conversationId: string, res: Response): void
}
```
This is a singleton. All SSE subscribers for a conversation receive all events emitted for it.

### 1D — SSE endpoint
Add `GET /api/sse/conversation/:conversationId` to a new route file `sse.ts`:
- Auth-gated (same session middleware as all other routes)
- Registers the response with `RunEventBus`
- Sends current run state on connect (hydration event)
- Cleans up on disconnect

### 1E — Run REST endpoints
Add to `builds.ts` (already has run routes):
- `POST /api/runs/:id/confirm` → validates status is `awaiting_confirmation`, transitions to `executing`, emits `run_status` event
- `POST /api/runs/:id/cancel` → validates status is non-terminal, transitions to `cancelled`, emits `run_status` event
- `POST /api/runs/:id/commit` → validates status is `succeeded`, calls GitHub push, does NOT change run status

**Rollback:** Phase 1 is purely additive. Any failure is rolled back by reverting the new files. Nothing existing changes.

**Phase 1 complete when:**
- `GET /api/sse/conversation/:id` returns a valid SSE stream
- `POST /api/runs/:id/confirm` and `/cancel` work against real run rows
- TypeScript types compile with zero errors
- All existing tests pass

---

## Phase 2 — Instrument nexus.ts (Status Events Without Pipeline Change)

**Goal:** Make nexus.ts emit SSE status events at each natural transition point. The pipeline logic does not change — we are adding telemetry only.

**Changes to nexus.ts:**

At each point where the pipeline's internal state changes, emit via `RunEventBus`:

| Point in nexus.ts | Event emitted |
|---|---|
| Run row inserted (start of turn) | `run_created` + `run_status: "received"` |
| Intent classified, before first token | `run_status: "thinking"` |
| Plan block begins generating | `run_status: "planning"` |
| Plan generation complete | `run_status: "awaiting_confirmation"` + `plan_ready` |
| User calls /confirm → execution begins | `run_status: "executing"` |
| Each file step completes | `step_update` |
| Shell/test step begins | `run_status: "testing"` |
| Verify step begins | `run_status: "verifying"` |
| `persistNexusExecutionRun` completes | `run_status: "succeeded"` or `"failed"` + `run_complete` |
| Error path | `run_status: "failed"` + `run_complete` |

The token stream (`type: "token"`) replaces the raw SSE token push — same content, typed wrapper.

**CHAT/DECIDE intent:** emit nothing. No run object created, no status events.

**Rollback:** Remove the `RunEventBus.emit()` calls. Pipeline is identical to Phase 1.

**Phase 2 complete when:**
- Acceptance test 1 (full lifecycle) passes via SSE only — no token parsing needed
- Acceptance test 6 (simultaneous surface) passes — all surfaces read from SSE

---

## Phase 3 — chat.ts Adapter

**Goal:** Make `chat.ts` write to the same `execution_runs` table and emit through the same `RunEventBus`, so the Composer's runs are visible in Timeline/Changes alongside workspace runs.

**What chat.ts is used for (from the audit):**
- `ActiveRuns.tsx` in the Composer → `/api/chat`
- `FlowPanel.tsx` → `/api/chat`

**Approach:**
- Do not rewrite chat.ts pipeline logic
- Extract a `persistRunTurn(args)` helper that both nexus.ts and chat.ts call
- Extract a `emitRunEvent(conversationId, event)` helper that both call
- chat.ts calls these helpers at its natural transition points (mirroring Phase 2)

**Result:** Composer runs and workspace runs appear in the same Timeline. One data model.

**Rollback:** Remove the helper calls from chat.ts. chat.ts behavior is unchanged otherwise.

**Phase 3 complete when:**
- A Composer-started run appears in workspace Timeline
- chat.ts runs show correct status transitions in SSE

---

## Phase 4 — Unified Tool Registry

**Goal:** One set of agent tools. Both pipelines use the same implementations.

**Current state:**
- nexus.ts has its own tool registry (Anthropic format, raw `Anthropic.Tool[]`)
- chat.ts has its own tool registry (AI SDK `tool()` format)
- Implementations are different or duplicated

**Approach:**
- Create `lib/agent-tools/src/` — a new workspace lib
- Each tool exports: `schema` (Zod), `execute(args, context)`, `anthropicAdapter()`, `aiSdkAdapter()`
- Both nexus.ts and chat.ts import from this lib
- Tool behavior is identical regardless of which pipeline calls it

**This is the longest phase.** Tool audit first (list all tools in both registries, find duplicates), then port one by one, then replace imports.

**Rollback:** Phase 3 state is stable. Roll back by reverting the import changes, reinstating the old tool definitions.

**Phase 4 complete when:**
- All tools in both registries have implementations in `lib/agent-tools/`
- Both pipelines import from the shared lib
- Zero behavioral regressions in tool output

---

## Phase 5 — Decommission Parallel (Conditional)

**Trigger:** Lovable's new frontend passes all 7 acceptance tests against the canonical SSE contract.

**Only then:**
- Evaluate whether `chat.ts` pipeline logic can be replaced by nexus.ts + adapter wrapper
- If yes: redirect `/api/chat` to nexus.ts with a compatibility shim
- If no: leave chat.ts as a permanent consumer of the shared tool lib and run persistence

**There is no deadline on Phase 5.** It depends entirely on frontend readiness. The system is fully functional with both pipelines running against the shared contract from Phase 4 onward.

---

## Rollback Points

Every phase has a clean rollback:

| Phase | Rollback action |
|---|---|
| 1 | Delete new files (sse.ts, runEventBus.ts, run-contract.ts). No behavior changed. |
| 2 | Remove RunEventBus.emit() calls from nexus.ts. |
| 3 | Remove helper calls from chat.ts. |
| 4 | Revert import changes to nexus.ts and chat.ts. |
| 5 | Revert /api/chat redirect. |

The database is never in a rollback-required state — all schema changes are additive.

---

## Integration Contract With Lovable

Lovable should build against these endpoints once Phase 2 is complete:

```
GET  /api/sse/conversation/:conversationId   (SSE stream — primary data source)
GET  /api/runs?conversationId=&projectId=    (initial hydration on page load)
GET  /api/runs/:id                           (single run detail)
POST /api/runs/:id/confirm                   (Gate 1: apply changes)
POST /api/runs/:id/cancel                    (cancel at any pre-terminal state)
POST /api/runs/:id/commit                    (optional: push to GitHub after succeeded)
```

Lovable should NOT depend on:
- `/api/nexus/chat` SSE format (token parsing)
- `/api/chat` directly
- Any status strings other than the canonical state machine values

**Phase 2 is the Lovable unlock.** Once Phase 2 is verified, Lovable can build against the live SSE stream with real data.

---

## Execution Order

```
Phase 1 (contract + infrastructure)
  ↓ verify: SSE endpoint works, confirm/cancel endpoints work
Phase 2 (nexus.ts instrumented)
  ↓ verify: acceptance tests 1, 2, 3, 6 pass
  ↓ UNLOCK: notify Lovable — SSE contract is live, build against it
Phase 3 (chat.ts adapter)
Phase 4 (unified tools) — can run parallel to Lovable frontend work
  ↓ GATE: Lovable acceptance tests 1-7 all pass
Phase 5 (decommission parallel) — only when gate passes
```

---

## What Does Not Change During This Rebuild

- Users can log in and use the current app throughout Phases 1-4
- No data is deleted or migrated
- All existing routes continue to respond
- The Replit deployment stays live
- atlas-frontend/ continues serving the current experience
