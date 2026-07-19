# Attachment Ownership

> **Read this before touching any attachment, file-upload, or conversion code.**
> Companion documents: [runtime-map.md](runtime-map.md) · [conversation-ownership.md](conversation-ownership.md) · [agent-change-rules.md](agent-change-rules.md)

---

## The canonical attachment pipeline

All attachment handling for conversational sends goes through **one path**. Bypassing any step is a bug.

```
User drops / picks file(s)
  └─► useStagedAttachments          (state machine: ready → converting → sending → cleared)
        addFiles()                   validates size (20 MB), count (10), detects MIME type
        previewUrl = createObjectURL  local Blob URL for chip preview only

User submits composer
  └─► useAtlasConversation.submit(AtlasConversationSubmission)
        onMarkConverting(readyIds)    state: ready → converting
        fileToBase64Safe(file)        converts + resizes images >7000px or >4.5MB (canvas API)
        onMarkFailed(id, err)         on per-file conversion failure (others continue)
        nexusChatStream.send({text, attachments: [{base64, mediaType, name, clientAttachmentId}]})
        onMarkSending(sentIds)        state: converting → sending (optimistic — HTTP request fired)

nexusChatStream.send()
  └─► POST /api/nexus/chat           attachments in request body JSON
        optimistic NexusMessage added to state synchronously before the HTTP call
        lastSentUserMessageIdRef set at the same time

Server acknowledges
  └─► SSE: event: attachment_ack     { id, clientAttachmentId, status, errorCode? }
        useNexusChatStream updates NexusMessage.attachmentAcks[]
        onClearSent(sentIds)          state: sending → cleared (chip removed)

Transport failure
  └─► stream() rejects
        onRestoreToReady(sentIds)     state: sending → ready (allows user retry)
```

---

## File: `useStagedAttachments`

**Path:** `artifacts/atlas-frontend/src/hooks/useStagedAttachments.ts`
**Classification: CANONICAL**

Single source of truth for staged attachment state. Every surface that accepts file uploads must use this hook.

**State machine:**

```
           addFiles()
               │
            [ready] ──── markConverting() ──► [converting]
               │                                    │
         clearFiles()                        fileToBase64Safe()
               │                              success │ failure
            [gone]                          markSending│markFailed()
                                                 │         │
                                          [sending]     [failed]
                                              │
                                  clearSent() │ restoreToReady()
                                       [gone]     [ready]
```

**Key functions:**

| Function | Description |
|---|---|
| `addFiles(files)` | Validates and stages new files. Creates `previewUrl` via `URL.createObjectURL`. |
| `markConverting(ids)` | Transitions `ready` → `converting`. Called before the conversion loop starts. |
| `markSending(ids)` | Transitions `converting` → `sending`. Called after `nexusChatStream.send()` fires. |
| `markFailed(id, error)` | Transitions one file to `failed`. Per-file; others in the batch continue. |
| `restoreToReady(ids)` | Restores `converting`/`sending` files to `ready` on transport failure. |
| `clearSent(ids)` | Removes successfully transmitted files from state. |
| `clearFiles()` | Unconditional wipe. Only safe after `submit()` resolves successfully. |
| `detectMimeType(file)` | Heuristic MIME detection from extension + `file.type`. |

---

## File: `fileToBase64Safe`

**Path:** `artifacts/atlas-frontend/src/lib/image-resize.ts`
**Classification: CANONICAL**

The **only** function that may convert a `File` to base64 for a conversational send. Used by:
- `useAtlasConversation.submit()` — canonical path
- `home.tsx` — direct usage in the Ask Atlas surface's `handleSubmit` (pre-`useAtlasConversation` path; see note below)
- `FlowPanel.tsx` — direct usage for image-only flow attachments (LEGACY BUT REACHABLE)

**Behavior:**
- Images (`image/*`): resizes via `createImageBitmap` + `<canvas>` if width/height > 7000px or blob > 4.5 MB. Outputs `{ base64, mediaType }`.
- Non-images (PDFs, docs, etc.): reads via `FileReader` as ArrayBuffer → base64. No resize.

> ⚠️ **home.tsx direct usage:** `home.tsx` has a `fileToBase64Safe` call outside `useAtlasConversation` at line ~148 in its own `handleSubmit`. This was the pre-B2 path for Ask Atlas. The canonical path is `AskAtlasSurface` using `useAtlasConversation.submit()`. Verify this call site's reachability before removing `AskAtlasSurface`.

---

## Transport payload shape

Attachments travel in the `POST /api/nexus/chat` request body:

```typescript
attachments: Array<{
  base64: string;           // base64-encoded file contents (data URI prefix stripped)
  mediaType: string;        // MIME type, e.g. "image/png", "application/pdf"
  name?: string;            // original filename
  clientAttachmentId?: string; // StagedFile.id — stable UUID for attachment_ack correlation
}>
```

This shape is defined in `useAtlasConversation.ts` as `AtlasConversationAttachment`.

---

## Attachment persistence (`attachment_ack`)

After the server receives and stores an attachment, it emits:

```
event: attachment_ack
data: { "id": "server-uuid", "clientAttachmentId": "client-uuid", "status": "stored" | "error", "errorCode"?: "..." }
```

`useNexusChatStream` patches the corresponding `NexusMessage.attachmentAcks[]` array.
The `onClearSent` callback fires after the optimistic confirmation (on first SSE token, not after `attachment_ack`).

---

## Non-canonical attachment paths (do not extend)

### `ActiveRuns.tsx` (LEGACY BUT REACHABLE)

Direct `fetch("/api/chat")` with `attachments` in the body. Bypasses:
- `useStagedAttachments` state machine
- `useAtlasConversation` conversion logic
- The `clientAttachmentId` correlation mechanism
- `attachment_ack` events

### `FlowPanel.tsx` (LEGACY BUT REACHABLE)

Direct `fileToBase64Safe` call for the currently-attached image, then inlines `imageData` / `imageMimeType` fields in the `/api/chat` POST body. Single image only. No `useStagedAttachments`.

### `runs.ts` backend-to-backend (CANONICAL for V1.2)

The `POST /api/conversations/:id/messages` endpoint forwards the request body as-is to `POST /api/chat`. Attachment fields pass through unchanged. This is not a frontend path.

---

## Invariants (must not be violated)

1. `clearFiles()` must **never** be called before `submit()` resolves successfully.
2. `fileToBase64Safe` must **only** be called inside `useAtlasConversation.submit()` for canonical sends. Duplicating the conversion loop elsewhere creates divergence.
3. `previewUrl` (object URL) is a local Blob reference only. Do not send it to the server or store it.
4. `base64` inside `NexusMessage.attachments[]` is the actual image data for optimistic rendering. The server replaces this with a `contentUrl` in the persisted message.
5. `onMarkSending` fires after the HTTP request is started (optimistic), not after server confirmation. `onClearSent` fires after server confirms receipt (first SSE token). `onRestoreToReady` fires if the fetch itself fails.
