# Library Foundation — Backend Handoff (Cursor)

**Date:** 2026-07-15
**Owner:** Cursor (backend + migrations)
**Frontend counterpart:** Lovable — already landed the normalization prep (see "Frontend state" below).
**Scope:** Build the canonical Library data model + APIs so the frontend can stop reading `home_artifacts` and the "Reference" surface can become the real "Library" entry point.

---

## Why this exists

Today three parallel systems claim to save things:

1. `home_artifacts` — saved Ask Atlas responses (home page only).
2. `project_bookmarks` — bookmark writes exist, no read path is wired.
3. Workspace-generated artifacts — live in project state, never surfaced as "saved".

The frontend "Reference" tab currently reads only `home_artifacts`. Merging these in the browser would ossify the wrong model. We need one canonical backend model **before** the product language shifts to "Library".

**Non-goal:** deleting legacy tables in this pass. Dual-read → switch new writes → validate parity → deprecate later.

---

## Deliverables

### 1. Canonical data model

New table `library_items` (name negotiable). Superset that can hold saved Ask Atlas artifacts, workspace outputs, bookmarks, and future sketches.

Suggested shape (adjust to house conventions):

```
library_items
  id              uuid pk
  user_id         fk auth
  project_id      fk projects nullable        -- null = user-level (home)
  kind            text                        -- 'document' | 'prd' | 'plan'
                                              -- | 'strategy' | 'spec'
                                              -- | 'outline' | 'brief'
                                              -- | 'bookmark' | 'sketch' | 'other'
  title           text
  content         text                        -- full body (nullable for pointer kinds)
  preview         text                        -- server-truncated ~200 chars
  origin_source   text                        -- 'ask-atlas' | 'workspace'
                                              -- | 'upload' | 'unknown'
  origin_conversation_id  uuid nullable
  origin_message_id       uuid nullable
  legacy_source   text nullable               -- 'home_artifacts' | 'project_bookmarks'
  legacy_id       text nullable               -- for reversible backfill
  created_at, updated_at
```

New table `conversation_context_items` — attach a library item to a conversation without duplicating the item.

```
conversation_context_items
  id                    uuid pk
  conversation_id       fk conversations
  library_item_id       fk library_items
  attached_by_user_id   fk auth
  attached_at           timestamptz
  detached_at           timestamptz nullable    -- soft-detach
  unique (conversation_id, library_item_id) where detached_at is null
```

Backfill: existing `home_artifacts` rows → `library_items` with `legacy_source='home_artifacts'`, `legacy_id=<id>`, `project_id=null`, `origin_source='ask-atlas'`. Existing `project_bookmarks` → `library_items` with `kind='bookmark'`, `project_id` set, `origin_source='ask-atlas'`, `origin_message_id` populated.

Do **not** drop legacy tables. Keep them dual-writable until frontend fully cuts over.

### 2. APIs

Canonical shape mirrors the frontend `LibraryItem` type (see `artifacts/atlas-frontend/src/lib/library/types.ts`):

```ts
{
  id: string,
  kind: LibraryItemKind,
  title: string,
  content?: string,
  preview: string,
  project: { id: number, name?: string } | null,
  origin: { source, conversationId?, messageId? },
  createdAt: string,
  updatedAt?: string,
}
```

Endpoints:

- `GET  /api/library` — user's items. Query params: `projectId` (number | 'null' for user-level | omitted for all), `kind` (repeatable), `limit`, `cursor`.
- `POST /api/library` — create (used by workspace + Ask Atlas save flows going forward).
- `GET  /api/library/:id`
- `PATCH /api/library/:id` — title, kind.
- `DELETE /api/library/:id`
- `POST   /api/library/:id/context` — body `{ conversationId }`. Attaches item to conversation.
- `DELETE /api/library/:id/context/:conversationId` — detaches (soft).
- `GET    /api/conversations/:id/context` — items currently attached to a conversation.

Auth: user-scoped. RLS/route-level checks per house pattern.

### 3. Rewire writes

- Ask Atlas "save" (currently `POST /api/home-artifacts`) → dual-write to `library_items` immediately; delete legacy write once frontend cuts over.
- `project_bookmarks` writes → dual-write to `library_items` (`kind='bookmark'`).
- Workspace "save as artifact" → new path writes only to `library_items`.

### 4. Context attachment semantics

Attaching an item to a conversation MUST NOT duplicate the item. The Atlas chat pipeline should, when composing context, read `conversation_context_items` and include the referenced item bodies verbatim (respecting token budget). Detachment is soft so history stays auditable.

### 5. Validation

- Parity check script: for every legacy row, a matching `library_items` row exists with same title/content and correct provenance.
- `GET /api/library` returns backfilled rows for a test user identical to legacy `GET /api/home-artifacts` mapped through the frontend adapter (see `artifacts/atlas-frontend/src/lib/library/adapters/homeArtifacts.ts`).

---

## Frontend state (already landed, do not redo)

- `artifacts/atlas-frontend/src/lib/library/types.ts` — canonical `LibraryItem` type.
- `artifacts/atlas-frontend/src/lib/library/adapters/homeArtifacts.ts` — the **only** place legacy `home_artifacts` shape exists in the frontend.
- `artifacts/atlas-frontend/src/lib/library/index.ts` — `fetchLibraryItems()` / `deleteLibraryItem()` seam.
- `AskAtlasFocusSheet` renders `LibraryItem` objects only.
- **Visible labels unchanged.** "Reference" tab copy, empty state, and injection behavior (prepend as quoted context) are preserved. The rename to "Library" and the switch to persistent attachment ship in the same release as the canonical endpoints — not before.

When backend lands, frontend cutover is a one-file edit inside `src/lib/library/index.ts` (point at `/api/library`, drop the adapter import) plus a copy pass.

---

## Order of operations

1. Migration: create `library_items` + `conversation_context_items` with backfill.
2. `GET /api/library` + `GET /api/library/:id` + `DELETE /api/library/:id`.
3. Dual-write on `POST /api/home-artifacts` and bookmark writes.
4. Parity validation.
5. Attachment endpoints + chat pipeline consumes `conversation_context_items`.
6. Notify Lovable → frontend swaps adapter for canonical endpoints, wires attachment chip, updates copy to "Library".
7. Later: deprecate `home_artifacts` / merge `project_bookmarks` writes into canonical only.

---

## Non-negotiables

- No frontend merging of legacy endpoints — that path is closed.
- No deletion of legacy tables in step 1.
- `library_items.id` is the string surfaced to the frontend; keep it stable across the backfill (uuid preferred over numeric).
- Every new endpoint must be reachable through the OpenAPI spec at `lib/api-spec/openapi.yaml` so the generated client picks it up.
