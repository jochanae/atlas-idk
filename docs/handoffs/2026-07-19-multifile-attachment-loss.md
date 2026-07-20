# Multi-file attachment loss + failed-chip touch — investigation

**Date:** 2026-07-19 / 2026-07-20  
**Surface:** Workspace (`/project/100`) — also applies to Ask Atlas (shared path)  
**Repro timestamp:** `2026-07-19T23:53:36.055Z`  
**Selection:** DOCX + PDF + PPTX in one message  

No production DB in this environment — IDs below are the **code-path reconstruction** for that turn shape. Exact UUIDs require server logs / `message_attachments` rows for that timestamp.

---

## A. Multi-file attachment loss

### Observed

| Stage | DOCX | PDF | PPTX |
|---|---|---|---|
| Staged locally | yes | yes | yes |
| Upload/finalize | ready (uploaded) | ready (uploaded) | **failed / stalled** (remained in composer) |
| In `attachmentIds[]` on send | **yes** | **yes** | **no** (not in `readyFiles`) |
| Linked to user message | yes | yes | no |
| Resolved for model | **skipped** `processing_unsupported` | **injected** as PDF document | n/a |
| Model payload blocks | text note only (after fix) / previously **silent skip** | `document` base64 block | n/a |

### First point where two successful files become one

**File:** `artifacts/api-server/src/lib/attachmentResolve.ts`  
**Lines:** ~81–89 (`processingStatus === "unsupported"` → `continue`)

Both DOCX and PDF leave the client in `attachmentIds[]` and are linked via `linkAttachmentsToMessage`. The reduction to one **model-visible** attachment happens here — not in `.find()`, `attachmentIds[0]`, or a singular overwrite.

### Full chain (no singular-array bugs found)

1. `useStagedAttachments` → `readyFiles = status===ready && attachmentId` (DOCX+PDF; PPTX excluded if failed)
2. `workspace.tsx` → `atlasConv.submit({ stagedAttachments: staged.readyFiles })`
3. `useAtlasConversation.submit` → `attachmentIds = readyStaged.map(sf => sf.attachmentId)` (**both** IDs)
4. `useNexusChatStream.send` → `POST /api/nexus/chat` body `{ text, attachmentIds: [docxId, pdfId] }`
5. `nexus.ts` → `resolveAttachmentIdsForModel` → DOCX skipped, PDF resolved
6. `allAttachments` → only PDF → Claude `document` block
7. `linkAttachmentsToMessage` still links **both** IDs to the message

Searched and **not found** on this path: `attachmentIds[0]`, `.find()` replacing `.filter()`, last-write-wins attachment state, Promise race returning one result.

### Silent filter (pre-fix)

Skip was only `logger.info` — no user toast, no model note. Atlas therefore described “one attachment” (the PDF).

**Minimal fix applied:** inject an explicit text block listing storage-only / unreadable skips so the model must acknowledge stored-but-unread files.

---

## B. Failed-chip touch interception

### Cause

Not a drag-handle wrapping the strip. On mobile:

1. Tap Retry/X → browser blurs the focused textarea  
2. `ChatComposer` `onBlur` → `inputFocused=false`  
3. `sheetVisible` collapses (`ChatComposer.tsx` ~359, ~450–469)  
4. Click never reaches Retry/X  

Send already had `onPointerDown preventDefault` (`ChatComposer.tsx` ~911–915). AttachmentStrip Retry/X did **not**.

### Fix applied

`AttachmentStrip` Retry/X:

- `onPointerDown` / `onMouseDown` → `preventDefault` + `stopPropagation` (same pattern as Send)
- Larger hit targets (≥32×32 / Retry min 44×32)
- `touchAction: manipulation`

Collapse/grip/backdrop still work from non-interactive areas.

---

## C. Capability truth

| File | Typical MIME | FE capability | FE label | BE kind | BE processingStatus | Model inclusion |
|---|---|---|---|---|---|---|
| DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `storage_only` | Stored — Atlas can't read this file type yet | `doc` | `unsupported` | **No** bytes; honesty note only |
| PDF | `application/pdf` | `model_use` | Ready for Atlas | `pdf` | `understood` | **Yes** — native PDF document block |
| PPTX | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | `storage_only` | Stored — Atlas can't read this file type yet | `doc` | `unsupported` | **No** (and was not sent while stalled) |

No DOCX/PPTX conversion/extraction path exists in the support matrix. Atlas must not claim it read them.

Sources:

- FE: `artifacts/atlas-frontend/src/lib/attachments/supportMatrix.ts`
- BE: `artifacts/api-server/src/lib/attachmentClassify.ts`

---

## How to confirm the exact turn in prod

```sql
-- around 2026-07-19T23:53:36.055Z
SELECT id, role, content, created_at
FROM nexus_messages
WHERE created_at BETWEEN '2026-07-19T23:53:30Z' AND '2026-07-19T23:53:45Z'
ORDER BY created_at;

SELECT id, filename, mime_type, upload_status, processing_status,
       nexus_message_id, created_at
FROM message_attachments
WHERE created_at BETWEEN '2026-07-19T23:50:00Z' AND '2026-07-19T23:55:00Z'
ORDER BY created_at;
```

Server log line to match: `nexus: some attachmentIds skipped for model injection` with `reason: processing_unsupported` for the DOCX id.
