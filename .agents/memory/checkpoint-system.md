---
name: Checkpoint System
description: Server-backed verified restore points — architecture, triggers, and UI integration
---

## What exists

`project_checkpoints` table (created via `ensureColumns()` in `artifacts/api-server/src/index.ts`):
- columns: id (text PK), project_id, type, label, title, notes, created_by ('system'|'user'),
  dna_snapshot (jsonb), am_snapshot (jsonb), build_ref, message_ref, created_at

API in `artifacts/api-server/src/routes/checkpoints.ts`:
- GET /api/projects/:id/checkpoints — list
- POST /api/projects/:id/checkpoints — manual create
- Exported helpers: `createCheckpoint()`, `createAutoCheckpointOnce()` (once-per-type guard)

Auto-triggers (fire-and-forget, non-blocking):
- `generation.ts` forge-sync → type='build', title='First Verified Build' (once)
- `projectDna.ts` PATCH → type='understanding', title='Project DNA Established' (when creative_principles non-empty, once)

Frontend in `artifacts/atlas-frontend/src/lib/atlas-history.ts`:
- `useCheckpoints(projectId)` — fetches + polls 30s + dispatches `atlas:checkpoint-created` event
- `useCheckpointCreatedListener()` — subscribe to ceremonial event
- Types: `ProjectCheckpoint`, `CheckpointType`

UI in `artifacts/atlas-frontend/src/components/HistoryBookmarksSheet.tsx`:
- 3 tabs: History | Checkpoints | Bookmarks
- Checkpoints tab has green accent (not gold) to distinguish
- Inline checkpoint creation form, type-colored rows

## Why once-per-type
`createAutoCheckpointOnce` guards with a COUNT query before inserting — each milestone
is captured exactly once per project to avoid noise.

## Pending (future work)
- Design plan committed → type='design' checkpoint
- Deployment → type='release' checkpoint
- `useCheckpointCreatedListener` consumer to show toast in workspace
- Checkpoint restore/rollback (inspect panel)
- Major Milestone detection from chat semantic analysis
