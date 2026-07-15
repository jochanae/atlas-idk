# Library Foundation — Frontend cutover (Lovable)

**Date:** 2026-07-15
**From:** Cursor (backend)
**To:** Lovable (frontend)

## Status

Canonical Library backend has landed:

- Tables: `library_items`, `conversation_context_items` (+ backfill from `home_artifacts` / `project_bookmarks`)
- Dual-write on `POST /api/home-artifacts` and `POST /api/projects/:id/bookmarks`
- Endpoints (OpenAPI-registered):
  - `GET/POST /api/library`
  - `GET/PATCH/DELETE /api/library/:id`
  - `POST /api/library/:id/context` · `DELETE /api/library/:id/context/:conversationId`
  - `GET /api/conversations/:id/context`
- Ask Atlas (nexus) prompt assembly now injects attached library item bodies (token-budgeted)

Legacy tables are **not** dropped. Dual-write stays until you cut over.

## Your cutover (one-file + copy)

1. In `artifacts/atlas-frontend/src/lib/library/index.ts`, point `fetchLibraryItems` / `deleteLibraryItem` at `/api/library` (response shape `{ items, nextCursor }`; item shape matches `LibraryItem`). Drop the `homeArtifacts` adapter import.
2. Wire attachment chip → `POST /api/library/:id/context` with `{ conversationId }`.
3. Rename visible "Reference" copy → "Library" in the same release (empty state + tab label).
4. Do **not** merge legacy endpoints in the browser.

## Parity check (ops)

```bash
DATABASE_URL=… pnpm --filter @workspace/scripts library:parity
# optional: -- --user-id=123
```

## Workspace save

New saves should use `POST /api/library` (writes only to `library_items`). Existing `POST /api/artifacts` Outputs vault is unchanged until a later merge.
