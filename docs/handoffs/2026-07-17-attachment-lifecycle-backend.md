# Handoff — Attachment Lifecycle Backend

**Date:** 2026-07-17
**Owner:** Backend (Cursor)
**Repo:** `jochanae/atlas-idk` (monorepo)
**Frontend status:** Section A shipped, gated behind `attachments.persistence` flag (default OFF). Legacy inline-base64 path is untouched until you flip the flag.

Companion doc: `.lovable/plan.md` (Section B is the source of truth for scope).

---

## Goal

Make attachments a first-class, persistent object in a conversation. Chip metadata survives reload. Bytes are only sent to the model on the send turn or on explicit **Use again**. Library promotion makes an attachment durable.

Current bug this fixes: attach → understand → display temporarily → forget. There is no DB row, no message linkage, no reopen path, and Nexus receives client-minted signed URLs.

---

## Scope you own

Everything server-side. Frontend adapter (`artifacts/atlas-frontend/src/lib/attachments/adapter.ts`) is already written against the contract below — match it and the flag flip does the rest.

Do NOT touch:
- `artifacts/atlas-frontend/**`
- `.lovable/**`

---

## 1. Endpoints

Add under `artifacts/api-server/src/routes/attachments.ts` (new file). Mount on the existing Express app. All routes require the standard auth middleware; every route must verify the caller owns the attachment row.

```text
POST   /api/attachments/request-upload
  body: { filename: string, mimeType: string, sizeBytes: number }
  200:  { attachmentId: string, uploadUrl: string, headers?: Record<string,string>, expiresAtHint?: string }
  - Creates message_attachments row, upload_status='pending_upload'.
  - Storage path uses attachmentId (message may not exist yet).
  - Server-side 20MB cap; reject with 413 above.

POST   /api/attachments/:id/finalize
  200:  PersistedAttachment
  - HEAD the object in storage; if missing, 409.
  - Classify kind + processingStatus (see §4).
  - Set upload_status='uploaded', availability_status='active',
    expires_at = now() + 60d.
  - Return server-authoritative row.

GET    /api/attachments/message/:messageId
  200:  PersistedAttachment[]
  - Ownership check via message → conversation → user.

GET    /api/attachments/:id/open-url
  200:  { url: string, expiresAt: string }
  - Short-lived signed GET, TTL ≤10 min. Never accept client-supplied URLs elsewhere.

POST   /api/attachments/:id/use-again
  200:  { attachmentId: string }
  - No mutation required beyond an audit log entry. Frontend re-attaches the id on next send.

POST   /api/attachments/:id/save-to-library
  200:  PersistedAttachment
  - Promote to Library. Mechanism is your call (copy / repoint / dual-retain).
    Constraint: the original conversation reference must not break.
  - Set availability_status='library', clear expires_at (null), set library_item_id.

GET    /api/attachments/:id/download
  200:  binary stream, or 302 to signed URL.
```

The `PersistedAttachment` shape is defined in `artifacts/atlas-frontend/src/lib/attachments/types.ts`. Mirror it exactly in the response.

### Nexus route change

Update the send endpoint to accept:

```ts
{ text: string, attachmentIds: string[] }
```

- Reject any legacy `attachments: [{ url, ... }]` payload once the flag is on in prod.
- Server resolves ids → verifies ownership → downloads bytes → constructs the model payload. Never trust a client-supplied URL.
- On send, link each attachment row to the resulting message id (see §3 sequencing).

---

## 2. Storage

- Reuse existing Replit object storage via `artifacts/api-server/src/lib/objectStorage.ts`. Do NOT introduce Supabase Storage for this.
- Bucket: `chat-attachments` (private). Add env var if not present.
- Path: `{userId}/{attachmentId}/{sanitizedFilename}`. Message linkage lives in the DB, not the path — a message may not exist at upload time.
- Signed URLs: server-minted only, ≤10 min TTL, read-only. `request-upload` returns a PUT URL; `open-url` and `download` return GET URLs.

The existing `POST /storage/uploads/request-url` route stays for other assets. The new attachments flow uses its own route so it can create the DB row atomically.

---

## 3. Schema

New file: `lib/db/src/schema/message_attachments.ts` (drizzle). Generate migration with `drizzle-kit generate` per `.agents/memory/drizzle-kit-tty.md`.

Columns:

| column | type | notes |
|---|---|---|
| `id` | uuid pk | = `attachmentId` |
| `user_id` | uuid, not null | owner |
| `project_id` | uuid, nullable | when scoped to a project |
| `conversation_id` | uuid, not null | ask-atlas or nexus conversation |
| `surface` | enum(`ask_atlas`,`nexus`) | |
| `chat_message_id` | uuid, nullable | set on send (ask_atlas) |
| `nexus_message_id` | uuid, nullable | set on send (nexus) |
| `filename` | text | original name |
| `mime_type` | text | |
| `size_bytes` | bigint | |
| `kind` | enum | image/pdf/doc/spreadsheet/code/text/other |
| `storage_bucket` | text | |
| `storage_path` | text | |
| `upload_status` | enum | pending_upload/uploaded/failed |
| `availability_status` | enum | active/expiring/expired/library |
| `processing_status` | enum | pending/understood/unsupported/failed |
| `library_item_id` | uuid, nullable | fk into library |
| `expires_at` | timestamptz, nullable | null when library |
| `created_at` / `updated_at` | timestamptz | standard |

Indexes: `(user_id)`, `(conversation_id)`, `(chat_message_id)`, `(nexus_message_id)`, `(expires_at) where availability_status <> 'library'`.

### Sequencing (your call — frontend is agnostic)

Two options, both acceptable:
- **(a)** Create attachment row at `request-upload`, patch `chat_message_id`/`nexus_message_id` on send.
- **(b)** Create empty message row first, then attach.

Pick one and document it in the route. The frontend only requires that `GET /api/attachments/message/:messageId` returns the rows after send completes.

---

## 4. Kind + processing classification (finalize)

Classify by mime type first, extension fallback:

- `image/*` → `kind=image`, `processingStatus=understood`
- `application/pdf` → `kind=pdf`, `understood`
- `text/*`, common code mimes, `.tsx/.ts/.js/.py/...` → `kind=code` or `text`, `understood`
- `application/vnd.openxmlformats-officedocument.*` (docx/xlsx/pptx), legacy `.doc/.xls/.ppt` → `kind=doc|spreadsheet`, `processingStatus=unsupported` (stored but not injected into model context)
- anything else → `kind=other`, `unsupported`

On processing error → `processingStatus=failed`. Row stays in DB; UI renders the "couldn't process" chip.

---

## 5. Retention job

Replit scheduled task, hourly:

```sql
UPDATE message_attachments
SET availability_status = 'expired'
WHERE availability_status IN ('active','expiring')
  AND expires_at < now();
-- then delete storage objects for the just-expired rows (keep the DB row)
```

Also flip `active → expiring` when `expires_at < now() + 7d` so the chip can render the amber "Available until …" state.

Library rows (`availability_status='library'`, `expires_at IS NULL`) are exempt.

---

## 6. Model ingestion rules

- Send bytes to the model only when: (a) the attachment id is present in `attachmentIds` on the send turn, or (b) the user hit **Use again** and the id is included again on the next send.
- `processingStatus=unsupported` or `failed` → skip injection, still show the chip in the transcript.
- Never silently re-inject attachments from earlier turns. Durable context = Library.

---

## 7. Security checklist

- Ownership check on every `/api/attachments/*` route (`user_id = auth.userId`).
- Server-side 20MB cap in `request-upload` (in addition to the client cap).
- Never accept a client-supplied signed URL as input on the Nexus route.
- Log `attachmentId`, `userId`, `route`, `outcome` on every attachment action (feeds the audit log the frontend already emits).

---

## 8. Rollout

1. Ship endpoints + schema + storage wiring + retention job.
2. Smoke test with `attachments.persistence` flag ON locally.
3. Flip flag on in staging; run the frontend acceptance suite in `src/lib/attachments/__tests__/lifecycle.test.tsx` against the real adapter.
4. Flip on in prod.
5. Delete the legacy inline-base64 path from the frontend one release later (separate frontend PR).

---

## Contract references

- Frontend types + adapter interface: `artifacts/atlas-frontend/src/lib/attachments/{types,adapter,flags}.ts`
- Frontend chip states + copy: `artifacts/atlas-frontend/src/components/attachments/MessageAttachmentChip.tsx`
- Plan of record: `.lovable/plan.md` Section B

If you diverge from the contract, update `types.ts` in the same PR and ping so the frontend adapter is regenerated.
