# Attachment Lifecycle — Frontend Plan + Backend Handoff

Scope split per your direction. Lovable executes Section A only. Section B is a handoff spec, not implementation.

---

## A. Frontend implementation (this pass)

### A1. Shared TypeScript model

New file: `artifacts/atlas-frontend/src/lib/attachments/types.ts`

```ts
export type AttachmentKind =
  | "image" | "pdf" | "doc" | "spreadsheet" | "code" | "text" | "other";

export type UploadStatus       = "uploading" | "uploaded" | "failed";
export type AvailabilityStatus = "active" | "expiring" | "expired" | "library";
export type ProcessingStatus   = "pending" | "understood" | "unsupported" | "failed";

export interface StagedAttachment {
  clientId: string;             // uuid, client-only
  file: File;
  kind: AttachmentKind;
  uploadStatus: UploadStatus;
  uploadProgress: number;       // 0..1
  attachmentId?: string;        // set after server ack
  error?: string;
}

export interface PersistedAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind;
  availabilityStatus: AvailabilityStatus;
  processingStatus: ProcessingStatus;
  expiresAt: string | null;     // ISO, server-supplied; null when promoted
  libraryItemId: string | null;
  openUrl?: string;             // short-lived, server-supplied on fetch
}
```

Send contract to Nexus:

```ts
// Frontend sends only IDs. Server resolves + authorizes.
{ text: string; attachmentIds: string[] }
```

### A2. API adapter (mocked; real impl in handoff)

New file: `artifacts/atlas-frontend/src/lib/attachments/adapter.ts`

```ts
export interface AttachmentAdapter {
  requestUpload(file: File):     Promise<{ attachmentId: string; uploadUrl: string; headers?: Record<string,string> }>;
  finalizeUpload(attachmentId: string): Promise<PersistedAttachment>;
  listForMessage(messageId: string):    Promise<PersistedAttachment[]>;
  getOpenUrl(attachmentId: string):     Promise<{ url: string; expiresAt: string }>;
  useAgain(attachmentId: string):       Promise<{ attachmentId: string }>; // returns id to re-attach on next send
  saveToLibrary(attachmentId: string):  Promise<PersistedAttachment>;
  download(attachmentId: string):       Promise<Blob>;
}
```

Two implementations:
- `mockAttachmentAdapter` — in-memory, drives all UI states for dev + tests.
- `httpAttachmentAdapter` — thin wrapper over endpoints the backend handoff defines. Wired but gated by feature flag; falls back to legacy inline base64 path when flag off.

### A3. Feature flags

New file: `artifacts/atlas-frontend/src/lib/attachments/flags.ts`
- `attachments.persistence` (default **off**) — when off, keeps today's inline-base64 send path untouched.
- `attachments.useAgain` (default off)
- `attachments.library` (default off)

Flags are read from `import.meta.env` + `localStorage` override. Nothing regresses until backend is live.

### A4. UI

New: `artifacts/atlas-frontend/src/components/attachments/MessageAttachmentChip.tsx`
- Single component used in both Ask Atlas and Workspace message rendering.
- Visual states driven by `availabilityStatus` + `processingStatus` + `uploadStatus`:

| State | Chip appearance | Copy |
|---|---|---|
| uploading | spinner + progress bar | `Uploading…` |
| upload failed | red border, retry icon | `Upload failed — retry` |
| active | normal | (filename · size) |
| expiring (≤7d from `expiresAt`) | amber dot | `Available until {date} · Save to Library to keep it` |
| expired | greyed, no-open | `File expired · original file is no longer available` |
| library | gold tint | `Saved to Library` |
| unsupported | neutral + info icon | `Stored — Atlas can't read this file type yet` |
| processing failed | neutral + warn icon | `Stored — Atlas couldn't process this file` |

Menu:
- Staged (pre-send): **Remove**, **Retry** (if failed)
- Persisted, active: **Open**, **Use again**, **Save to Library**, **Download**
- Persisted, library: **Open**, **Use again**, **Download**
- Persisted, expired: **(no actions)** — chip is history only
- Persisted, unsupported/processing-failed: **Open**, **Download** (no Use again)

No "Remove" on persisted chips in this pass.

New: `artifacts/atlas-frontend/src/components/attachments/AttachmentRow.tsx`
- Renders staged rail in the composer and persisted rail beneath sent messages.

New hook: `artifacts/atlas-frontend/src/hooks/useMessageAttachments.ts`
- `listForMessage(messageId)` with React Query; returns `PersistedAttachment[]`.

### A5. Composer wiring

Edits (surgical — keep legacy path when flag off):
- `artifacts/atlas-frontend/src/lib/composerAttachments.ts` — add `filesToAttachmentIds(files, adapter)` alongside existing `filesToNexusAttachments`.
- `artifacts/atlas-frontend/src/components/composer/ComposerActions.tsx` — stage → `adapter.requestUpload` → PUT → `finalizeUpload`. Show progress; on failure keep row with Retry.
- `artifacts/atlas-frontend/src/components/composer/ChatComposer.tsx` — render `AttachmentRow` for staged items.
- `artifacts/atlas-frontend/src/components/home/AskAtlasSurface.tsx` — same.
- `artifacts/atlas-frontend/src/hooks/useNexusWorkspaceBridge.ts` — when flag on, send `{ attachmentIds }`; else current behavior.
- `home.tsx` Ask Atlas send — same branching.

### A6. Message rendering

- Ask Atlas and Workspace message renderers call `useMessageAttachments(messageId)` and render `AttachmentRow` beneath message content.
- Chips persist on reload as soon as backend returns metadata. Under mock adapter, they persist across route changes only (sufficient for acceptance tests).

### A7. Acceptance tests

New: `artifacts/atlas-frontend/src/lib/attachments/__tests__/lifecycle.test.tsx`

Covers:
1. Stage image → upload progress → uploaded → send → chip renders on message.
2. Upload failure → Retry restores staged row without losing text draft.
3. Oversized file → toast, not staged; composer keyboard focus preserved.
4. Multi-file mix (image + pdf + docx + tsx) → all staged; docx renders `unsupported` state after finalize; others `understood`.
5. Chip states: active, expiring (server returns `expiresAt` within 7d), expired, library, unsupported, processing-failed — each renders correct copy + menu.
6. Menu: Remove only on staged; Use again + Save to Library only on active/library; no actions on expired.
7. Send with `{ attachmentIds }` when flag on; legacy inline base64 when flag off (regression guard).
8. Reload thread with mock adapter → persisted chips reappear from `listForMessage`.

### A8. Files touched

Created:
- `src/lib/attachments/types.ts`
- `src/lib/attachments/adapter.ts` (+ `mockAttachmentAdapter`, `httpAttachmentAdapter`)
- `src/lib/attachments/flags.ts`
- `src/components/attachments/MessageAttachmentChip.tsx`
- `src/components/attachments/AttachmentRow.tsx`
- `src/hooks/useMessageAttachments.ts`
- `src/lib/attachments/__tests__/lifecycle.test.tsx`

Edited (behind flag, legacy path preserved):
- `src/lib/composerAttachments.ts`
- `src/components/composer/ComposerActions.tsx`
- `src/components/composer/ChatComposer.tsx`
- `src/components/home/AskAtlasSurface.tsx`
- `src/hooks/useNexusWorkspaceBridge.ts`
- `src/pages/home.tsx`
- `src/pages/workspace.tsx` (chip render under sent messages)

Not touched: `artifacts/api-server/**`, `lib/db/**`, `lib/api-spec/**`, `supabase/**`.

---

## B. Backend / storage / model handoff (not implemented)

Owner: backend pass following this one. Frontend adapter mirrors this contract.

### B1. Endpoints (Express, in `artifacts/api-server/src/routes/`)

```text
POST   /api/attachments/request-upload
       body: { filename, mimeType, sizeBytes }
       200:  { attachmentId, uploadUrl, headers?, expiresAtHint }
       Notes: creates attachments row status=pending_upload.
              Storage path uses attachmentId, NOT messageId
              (message may not exist yet).

POST   /api/attachments/:id/finalize
       200:  PersistedAttachment
       Notes: verifies object exists in storage, sets status=active,
              runs kind/processing classification, returns server-authoritative
              expiresAt.

GET    /api/attachments/message/:messageId
       200:  PersistedAttachment[]

GET    /api/attachments/:id/open-url
       200:  { url, expiresAt }    // short-lived signed URL

POST   /api/attachments/:id/use-again
       200:  { attachmentId }      // same id; server logs intent, frontend
                                   // includes it in next send

POST   /api/attachments/:id/save-to-library
       200:  PersistedAttachment   // backend chooses: copy vs repoint vs dual-retain
                                   // frontend only renders resulting state

GET    /api/attachments/:id/download
       200:  binary stream (or 302 to signed URL)
```

**Nexus route change:** accept `attachmentIds: string[]`. Server verifies ownership, resolves objects, constructs the model payload itself. Do not accept client-supplied signed read URLs.

### B2. Storage

- Bucket: `chat-attachments` (private).
- Path: `{userId}/{attachmentId}/{sanitizedFilename}` — message linkage is a DB relation, not a path segment.
- Backend chooses provider (existing Replit `ObjectStorageService` recommended for consistency; Supabase Storage acceptable if backend prefers).
- Signed URLs: short TTL (≤10 min), read-only, server-minted only.

### B3. Schema (`lib/db/src/schema/message_attachments.ts`, drizzle)

Columns: `id`, `user_id`, `project_id?`, `conversation_id`, `surface` (`ask_atlas`|`nexus`), `chat_message_id?`, `nexus_message_id?`, `filename`, `mime_type`, `size_bytes`, `kind`, `storage_bucket`, `storage_path`, `upload_status`, `availability_status`, `processing_status`, `library_item_id?`, `expires_at`, `created_at`, `updated_at`.

Message linkage is set at finalize or on message insert — sequencing is a backend decision. Options for backend to pick:
- (a) create attachment row first, link message_id on send;
- (b) create message row first (empty), then attach.
Frontend does not care as long as `listForMessage` works after send.

### B4. Retention

- Default 60 days for chat-scoped attachments. Server owns the value and returns it as `expiresAt`. Frontend never computes it.
- Expiry job: Replit scheduled task marks `availability_status=expired`, deletes object, keeps DB row. Promoted-to-library rows exempt.

### B5. Library promotion

Backend decides mechanism (copy / repoint / dual-retain). Constraint: the original conversation reference must never break. Frontend just re-renders the returned `PersistedAttachment`.

### B6. Model ingestion

- Bytes sent to the model only on: (a) the send turn attachments are attached, or (b) explicit **Use again**.
- Unsupported kinds (docx/xlsx/etc. under current pipeline) return `processingStatus=unsupported` — persisted but not injected.
- No silent re-injection on subsequent turns. Library is the durable-context path.

### B7. Security

- Ownership check on every attachment endpoint.
- Signed URLs never accepted as input from client.
- 20MB per-file cap enforced server-side in addition to client cap.
- RLS/grants per Cloud rules if any of this ends up in Supabase; otherwise standard auth middleware in Express.

### B8. Rollout

1. Backend ships endpoints + schema + storage + expiry job.
2. Flip `attachments.persistence` flag on in staging.
3. Verify acceptance matrix end-to-end.
4. Flip on in prod.
5. Remove legacy inline-base64 path after one release.

---

## Open decision for backend (not blocking frontend)

Message ↔ attachment linkage sequencing (B3 (a) vs (b)). Frontend adapter works with either.
