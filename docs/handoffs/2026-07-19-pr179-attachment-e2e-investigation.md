# PR #179 Attachment System — End-to-End Investigation Report

**Repo:** `jochanae/atlas-idk`  
**Base:** `main` @ `00734b92` (PR #179 merged as `190c5dfe`)  
**Scope:** Read-only investigation. **No code fixes applied.**  
**Surfaces:** Ask Atlas (Home) + Workspace  
**Date:** 2026-07-19

---

## Executive verdict

PR #179 successfully unified Ask Atlas and Workspace onto one staged → upload → `{ text, attachmentIds }` path. Acceptance tests pass (15 attachment-specific + 62 frontend package tests). Production `axiomsystem.app` now exposes `/api/attachments/*` (returns **401** without auth, not 404).

**Remaining high-severity defects are still live in main.** The worst are server startup migrations that destroy or invalidate canonical attachment rows, a content URL path that cannot serve canonical storage objects, and frontend reconciliation/hydration gaps that make successful uploads look like loss, remount, or refresh.

| Symptom category | Still present after #179? | Severity |
|---|---|---|
| Failed uploads | Yes — storage signing, CORS, startup migrations, finalize races | **Critical** |
| Attachment loss | Yes — revoke-before-reconcile, reopen filters, startup DELETE | **Critical** |
| Conversation resets | Yes — Ask Atlas toggle wipe; soft remounts still feel like reset | **High** |
| Remounts / page refreshes | Yes — index keys, chunk-load reload, 401 login redirect | **High** |
| Mixed / multi-file failures | Yes — MIME>ext mismatch, failed slots consume count, silent skips | **High** |
| Duplicate sends | Mostly mitigated on composer; handoff race remains | **Medium** |
| Storage-only mislabel | Staging OK; reopen/thread hydration loses labels | **Medium** |

---

## Method & evidence limits

| Method | Result |
|---|---|
| Static path analysis of PR #179 surfaces | Complete |
| Frontend acceptance tests | **62/62 passed** (`pnpm test` in atlas-frontend) |
| Backend classify/storage unit tests | **Passed** (other DB-dependent suites skipped/failed for missing `DATABASE_URL`) |
| Production probe `https://axiomsystem.app` | `/api/attachments/request-upload` → **401** (route live); `/api/capabilities` → **401** |
| Authenticated live browser matrix (Ask Atlas / Workspace UI) | **Blocked** — no authenticated session in this environment |
| PR #179 agent transcript | Confirmed no live UI matrix was completed there either (preview had 404s at that time) |

For each failure below:

- **Network timeline** = expected request sequence from code (not captured live HAR)
- **Server logs** = log lines / SQL the code emits under that path
- **Surface** = Ask Atlas / Workspace / Shared

Confidence: **High** = inevitable under stated conditions; **Medium** = env/race dependent; **Low** = plausible but unproven.

---

## Architecture (post-#179)

```
ComposerActions / home file input
  → useStagedAttachments.addFiles (matrix + limits)
  → uploadService: POST /api/attachments/request-upload
                 → PUT signed URL
                 → POST /api/attachments/:id/finalize
  → useAtlasConversation.submit({ stagedAttachments })
  → useNexusChatStream.send({ text, attachmentIds })
  → POST /api/nexus/chat
       → resolveAttachmentIdsForModel (skips unsupported)
       → linkAttachmentsToMessage
       → model injection (understood only)
  → AttachmentStrip (staged + sent)
```

Shared limits: **10 files / 20MB each / 50MB total**.  
Direct model use: PNG, JPG, WEBP, PDF, TXT, MD.  
Storage-only: DOCX, PPTX, XLSX, CSV, ZIP.

---

## Test matrix status

### Single-file type matrix

| Type | Expected | FE staging (code/unit) | BE classify (unit) | Live Ask Atlas | Live Workspace |
|---|---|---|---|---|---|
| PNG | model_use | Pass | understood | **Not live-tested** | **Not live-tested** |
| JPG | model_use | Pass | understood | Not live-tested | Not live-tested |
| WEBP | model_use | Pass | understood | Not live-tested | Not live-tested |
| PDF | model_use | Pass | understood | Not live-tested | Not live-tested |
| TXT | model_use | Pass | understood | Not live-tested | Not live-tested |
| Markdown | model_use | Pass | understood | Not live-tested | Not live-tested |
| DOCX | storage_only | Pass label | unsupported | Not live-tested | Not live-tested |
| PPTX | storage_only | Pass label | unsupported | Not live-tested | Not live-tested |
| XLSX | storage_only | Pass label | unsupported | Not live-tested | Not live-tested |
| CSV (`text/csv`) | storage_only | Pass | unsupported | Not live-tested | Not live-tested |
| CSV (`text/plain`) | storage_only | **FAIL — labeled model_use** | unsupported | Predicted fail | Predicted fail |
| ZIP | storage_only | Pass | unsupported | Not live-tested | Not live-tested |

### Multi-file / interaction matrix

| Case | Predicted Ask Atlas | Predicted Workspace | Evidence |
|---|---|---|---|
| two / three images | Upload+send OK; preview may blank after accept | Same | F2, F5 |
| image + PDF | OK if uploads succeed | OK | Shared path |
| image + DOCX | DOCX storage-only chip; image to model | Same | Unit mixed test |
| PDF + TXT | Both to model | Same | Shared path |
| mixed supported + storage-only | Partial model inject; silent skip server-side | Same | F8 |
| max file count (10) | Cap enforced; failed slots steal slots | Same | F7 |
| oversized file | Client fail chip (non-retryable) | Same | limits.ts |
| remove staged | Works (unit) | Works | acceptance |
| retry failed | Retries only failed (unit) | Same | acceptance |
| rapid Send | Guarded | Guarded | F10 residual race on handoff |
| type after select | No network on type | Same | prior audit + current code |
| navigate away/back | Ask Atlas draft may restore ready files | Workspace draft lost | F6 |
| refresh page | Ready files re-upload; uploading lost | Staged lost | F6 |
| reopen conversation | Attachments often missing / unlabeled | contentUrl 500 likely | F1, F3, F4 |
| home → Workspace handoff | IDs survive; blob preview broken | Auto-submit race possible | F5, F10 |

---

## Failure register

### F1 — Startup DELETE wipes all unlinked attachment rows

| Field | Detail |
|---|---|
| **Surface** | Shared (server) — hits Ask Atlas + Workspace |
| **Category** | failed uploads, attachment loss, conversation reopen |
| **Exact repro** | 1) Stage/upload any file (creates row with `nexus_message_id IS NULL`). 2) Restart API server **before** Send, **or** leave Ask Atlas rows linked only via `chat_message_id`. 3) Observe uploads 404 on finalize / send skip `not_found`. |
| **Network timeline** | `POST request-upload` 200 → (server restart) → `POST :id/finalize` **404** or later `attachmentIds` skipped `not_found_or_forbidden` |
| **Server logs** | `ensureColumns: deleted null-nexus-parent attachment rows` with `{ count }` |
| **Root cause** | `artifacts/api-server/src/index.ts:1453-1466` runs on **every** boot: `DELETE FROM message_attachments WHERE nexus_message_id IS NULL`. Canonical pending uploads and chat-linked rows match. |
| **Confidence** | **High** |
| **Recommended fix** | Remove blanket DELETE. Scope legacy cleanup to a known marker/date and never delete `pending_upload` / `uploaded` active rows. |
| **Risk of fix** | **Low** (delete the destructive migration). Residual orphan rows are preferable to data loss. |

---

### F2 — Startup marks canonical `chat-attachments` bucket rows as failed

| Field | Detail |
|---|---|
| **Surface** | Shared (server) |
| **Category** | failed uploads, attachment loss, reopen |
| **Exact repro** | Deploy/run with `PRIVATE_OBJECT_DIR` set and `CHAT_ATTACHMENTS_BUCKET` unset (current Replit/prod pattern per PR #179 transcript). Upload+finalize successfully. Restart API. Reopen conversation or re-resolve IDs. |
| **Network timeline** | Upload lifecycle 200 → after restart: thread `GET /api/attachments/:id/content` **404** (upload_status failed) or resolve skip `not_uploaded` |
| **Server logs** | `ensureColumns: marked retired-bucket attachment rows as failed` |
| **Root cause** | Fallback storage writes `storage_bucket = "chat-attachments"` (`attachmentStorage.ts:60-78`). Startup UPDATE marks **all** such rows `upload_status='failed'` / `RETIRED_BUCKET` (`index.ts:1468-1485`). Logical bucket name collides with “retired” migration. |
| **Confidence** | **High** |
| **Recommended fix** | Delete/replace retired-bucket migration. If needed, mark only pre-B3 path shapes (`/objects/uploads/...`) or a creation-time window — never the live logical bucket name. |
| **Risk of fix** | **Low–Medium**. Need one-time repair UPDATE for rows already marked `RETIRED_BUCKET`. |

---

### F3 — Thread `contentUrl` cannot serve canonical storage paths

| Field | Detail |
|---|---|
| **Surface** | Shared reopen (Workspace primary; Ask Atlas also if it kept contentUrl) |
| **Category** | attachment loss (display), renderer |
| **Exact repro** | 1) Send image via attachmentIds. 2) Reload / reopen conversation. 3) User bubble requests `GET /api/attachments/:id/content`. |
| **Network timeline** | `GET /api/nexus/thread` 200 with `attachments[].contentUrl=/api/attachments/{id}/content` → `GET .../content` **500** `{ error: "Invalid storage path" }` |
| **Server logs** | none specific; path rejects before stream |
| **Root cause** | Thread hydration emits `/api/attachments/:id/content` (`nexus.ts:2130-2132`). That route requires `storagePath.startsWith("/objects/")` (`nexus.ts:1877-1880`). Canonical rows store `{userId}/{attachmentId}/{filename}` — not `/objects/...`. |
| **Confidence** | **High** |
| **Recommended fix** | Route content through `resolveStoredObject()` / `getAttachmentFile()` like open-url/download. Also allow `availability_status` in `{active, expiring, library}`. |
| **Risk of fix** | **Low** |

---

### F4 — Ask Atlas reopen drops contentUrl-only attachments

| Field | Detail |
|---|---|
| **Surface** | Ask Atlas only |
| **Category** | attachment loss, conversation hydration |
| **Exact repro** | Send files in Ask Atlas → leave → reopen home conversation from history. |
| **Network timeline** | Thread/history returns attachments with `contentUrl`, no `base64` → client filters them out → no chips |
| **Server logs** | n/a (client filter) |
| **Root cause** | `home.tsx:403-405` keeps only attachments with `typeof a.base64 === "string"`. Post-#179 persistence is ID/contentUrl, not base64. `useMessageAttachments` exists but has **zero call sites**. |
| **Confidence** | **High** |
| **Recommended fix** | Accept `contentUrl`/`attachmentId` in enrich; wire `useMessageAttachments` or trust thread hydration; pass `processingStatus`. |
| **Risk of fix** | **Low** |

---

### F5 — Optimistic preview revoked before durable URL reconciliation

| Field | Detail |
|---|---|
| **Surface** | Shared |
| **Category** | attachment loss (display), optimistic reconciliation |
| **Exact repro** | Attach image → Send. After first SSE event, thumbnail becomes broken/unavailable while turn continues. |
| **Network timeline** | `POST /api/nexus/chat` → first SSE event → client `clearSent` → blob URL revoked → (optional) `attachment_ack` stored but **not applied to contentUrl** |
| **Server logs** | normal nexus stream |
| **Root cause** | Display uses `previewUrl` blob (`useAtlasConversation.ts:256-265`). `accepted` resolves on first event (`useNexusChatStream.ts:599`) then `onClearSent` revokes blobs (`useStagedAttachments.ts:482-490`). `onAttachmentAck` only stores acks (`useNexusChatStream.ts:975-994`) and does not replace `contentUrl`. |
| **Confidence** | **High** |
| **Recommended fix** | On ack, patch optimistic attachment `contentUrl` to `/api/attachments/:id/content` (after F3) **before** revoking blob; or delay revoke until ack/contentUrl present. |
| **Risk of fix** | **Low–Medium** |

---

### F6 — Home→Workspace handoff stores revoked blob as `contentUrl`

| Field | Detail |
|---|---|
| **Surface** | Workspace bridge / handoff |
| **Category** | attachment loss (preview); IDs usually survive |
| **Exact repro** | Home composer (Ask Atlas closed) with ready files → create project / navigate Workspace. Opening bubble may show broken image; send may still work via IDs. |
| **Network timeline** | Uploads complete → `sessionStorage` write with `contentUrl: blob:...` → `staged.clearSent` revokes blob (`home.tsx:3400-3407`) → Workspace submit with `attachmentIds` |
| **Server logs** | normal if IDs still valid (unless F1/F2 hit) |
| **Root cause** | `prepareOpeningAttachmentHandoff` copies `previewUrl` (`home.tsx:157`) then immediately revokes via `clearSent`. |
| **Confidence** | **High** |
| **Recommended fix** | Omit blob URLs from handoff; use null/`/api/attachments/:id/content` after F3; clear staged without needing preview for reopen. |
| **Risk of fix** | **Low** |

---

### F7 — Failed files consume max-count slots (multi-file cascades)

| Field | Detail |
|---|---|
| **Surface** | Shared staging |
| **Category** | multiple file failures |
| **Exact repro** | Select 10 files where some are oversized/unsupported (non-blocked failed) then add more valid files → valid ones rejected as `Max 10 files`. Or batch 11 with early failures. |
| **Network timeline** | No upload for max-count rejects; others may upload normally |
| **Server logs** | n/a |
| **Root cause** | `activeCount` includes `status === "failed"` (`useStagedAttachments.ts:244-248`). Duplicates checked after max-count (`:274`). |
| **Confidence** | **High** |
| **Recommended fix** | Count only `ready|uploading|sending` (or exclude non-retryable failures) toward max. |
| **Risk of fix** | **Low** |

---

### F8 — Mixed batches: server silently skips unsupported / unreadable IDs

| Field | Detail |
|---|---|
| **Surface** | Shared send |
| **Category** | mixed file type failures |
| **Exact repro** | Send image + DOCX + CSV. Atlas answers from image only. User believes all were “read”. Chips may still show locally if optimistic metadata present. |
| **Network timeline** | `POST /api/nexus/chat` with N ids → 200 SSE; model sees only understood subset |
| **Server logs** | `nexus: some attachmentIds skipped for model injection` with `{ skipped: [{attachmentId, reason}] }` — **not returned to client** |
| **Root cause** | Resolver returns `{resolved, skipped}` (`attachmentResolve.ts:67-134`); nexus logs only (`nexus.ts:2471-2475`). Storage-only skip is intentional; download failures / expired / not_found look the same to the user. |
| **Confidence** | **High** |
| **Recommended fix** | Surface skipped reasons in SSE/`attachment_ack` or response header; keep storage-only chips labeled; hard-fail if **all** ids skipped on attachment-only send. |
| **Risk of fix** | **Medium** (API contract) |

---

### F9 — CSV (and similar) MIME>extension mismatch FE vs BE

| Field | Detail |
|---|---|
| **Surface** | Shared classification |
| **Category** | mixed file type failures, storage-only labeling |
| **Exact repro** | Attach `data.csv` on a browser that reports `text/plain`. Staging shows **“Ready for Atlas”**. Server finalize → `unsupported`. Send → skipped for model. |
| **Network timeline** | Normal upload; finalize returns `processingStatus: unsupported`; nexus skip `processing_unsupported` |
| **Server logs** | skip reason in nexus log |
| **Root cause** | FE `resolveSupport` prefers MIME over extension (`supportMatrix.ts:180-183`) so CSV→TXT. BE `classifyProcessingStatus` forces unsupported by `.csv` extension (`attachmentClassify.ts:89-98`). |
| **Confidence** | **High** |
| **Recommended fix** | Prefer extension for known storage-only / conflict types; or align FE with BE classifier. Add acceptance case `text/plain` + `.csv`. |
| **Risk of fix** | **Low** |

---

### F10 — Workspace opening auto-submit can duplicate or drop handoff

| Field | Detail |
|---|---|
| **Surface** | Workspace bridge |
| **Category** | duplicate sends, attachment loss |
| **Exact repro A (duplicate)** | Home creates conversation that already wrote first turn; bridge `messages.length === 0` briefly → auto-submit fires again. |
| **Exact repro B (drop)** | Auto-submit returns false / transport fails after `sessionStorage.removeItem("atlas-opening-attachments")` (`workspace.tsx:6952-6963`). |
| **Network timeline A** | Possible second `POST /api/nexus/chat` with same text/ids |
| **Network timeline B** | First submit fails; storage already cleared → no retry payload |
| **Server logs** | second user message insert / or none |
| **Root cause** | Gate uses in-memory bridge length (`workspace.tsx:6937`) while history load is async; storage cleared immediately after fire-and-forget submit. |
| **Confidence** | **Medium** |
| **Recommended fix** | Await submit result before clearing storage; gate on server thread/user-message existence, not only `messages.length`; keep handoff continuation flag until ack. |
| **Risk of fix** | **Medium** |

---

### F11 — Ask Atlas surface toggle wipes conversation (looks like refresh/reset)

| Field | Detail |
|---|---|
| **Surface** | Ask Atlas only |
| **Category** | conversation resets, remounts |
| **Exact repro** | Open Ask Atlas with messages → tap Ask Atlas toggle to close → thread/messages/conversation ids cleared (`home.tsx:5535-5553`). |
| **Network timeline** | No attachment network; local state wipe. Ghost-click shield mitigates picker return; intentional/late click still resets. |
| **Server logs** | n/a |
| **Root cause** | Explicit full ambient reset on toggle-off. |
| **Confidence** | **High** (by design, but symptom matches user “reset”) |
| **Recommended fix** | Hide surface without clearing conversation; only Exit/New clears. Keep ghost-click shield. |
| **Risk of fix** | **Low–Medium** (product behavior) |

---

### F12 — Chunk-load / auth paths still force hard refresh or login

| Field | Detail |
|---|---|
| **Surface** | Shared |
| **Category** | page refreshes, remounts, attachment loss |
| **Exact repro A** | Lazy chunk error outside 8s foreground window → `location.reload()` (`__root.tsx:62-73`). Home hidden file input does **not** call `signalPickerReturn()` (unlike `ComposerActions.tsx:254`). |
| **Exact repro B** | `request-upload` / finalize / nexus returns confirmed 401 → `/login?reason=session_expired` (`install-api-fetch.ts:110-131`). |
| **Network timeline B** | any `/api/*` 401 → `GET /api/auth/me` 401 → hard navigation |
| **Server logs** | auth 401 |
| **Root cause** | Global recovery reload + session redirect; draft persistence only covers Ask Atlas **ready** files (`home.tsx:1895-1898`), not uploading/failed; Workspace has no draft persistence. |
| **Confidence** | **Medium** |
| **Recommended fix** | Call `signalPickerReturn` from home file input; persist attachmentIds (not just File blobs); keep focus refetch off; toast instead of silent loss on restore. |
| **Risk of fix** | **Medium** |

---

### F13 — Index-keyed message rows remount attachment strips

| Field | Detail |
|---|---|
| **Surface** | Ask Atlas (primary); sent chips shared |
| **Category** | remounts |
| **Exact repro** | Stream inserts/restores messages; lightbox/thumb state resets; may flash missing media. |
| **Network timeline** | none required |
| **Server logs** | n/a |
| **Root cause** | `AskAtlasSurface.tsx` keys messages by index (`:508/:525/:826`). `AttachmentStrip` sent mode keys by index (`:94/:108`). Nexus stream already uses stable `user-${streamingId}` ids. |
| **Confidence** | **High** for remount; **Medium** for user-visible loss |
| **Recommended fix** | Key by message id / attachmentId. |
| **Risk of fix** | **Low** |

---

### F14 — `linkAttachmentsToMessage` rebinds the same row (use-again / resend)

| Field | Detail |
|---|---|
| **Surface** | Shared (server) |
| **Category** | attachment loss on prior message |
| **Exact repro** | Send attachment → “use again” / resend same `attachmentId` on a new turn → original message loses nexus/chat link. |
| **Network timeline** | second send updates same row FKs |
| **Server logs** | none obvious |
| **Root cause** | `linkAttachmentsToMessage` overwrites `nexus_message_id` / `chat_message_id` (`attachmentResolve.ts:161-178`). |
| **Confidence** | **High** |
| **Recommended fix** | Join table or clone-on-reuse; never steal prior message ownership. |
| **Risk of fix** | **Medium** (schema) |

---

### F15 — Pending TTL + retention marks uploads `expiring` almost immediately

| Field | Detail |
|---|---|
| **Surface** | Shared (server) |
| **Category** | failed uploads / content 404 after short idle |
| **Exact repro** | Upload, wait until worker pass with pending `expiresAt` within 7 days (always true for 1-day pending TTL), content route requires `availability_status='active'` → 404 even before expiry. |
| **Network timeline** | content GET 404 |
| **Server logs** | retention pass counts |
| **Root cause** | Pending TTL 1 day (`attachmentStorage.ts:30`) + expiring threshold 7 days (`retentionWorker.ts:36-50`) ⇒ pending rows become `expiring` on first hourly pass. Nexus content route requires `active` (`nexus.ts:1871`). Link promotes `expiresAt` but does **not** reset availability to `active`. |
| **Confidence** | **High** |
| **Recommended fix** | Don’t mark pending as expiring; on link set `availability_status='active'`; content route allow expiring. |
| **Risk of fix** | **Low** |

---

### F16 — No PUT timeout; concurrent uploads; finalize trusts client size

| Field | Detail |
|---|---|
| **Surface** | Shared upload service |
| **Category** | failed uploads |
| **Exact repro** | Stall mid-PUT (network flap) → chip stuck `uploading`. Or storage CORS/header mismatch → `Storage upload failed: {status}` / network error. |
| **Network timeline** | `request-upload` 200 → PUT hangs/fails → no finalize |
| **Server logs** | none until finalize; request-upload ok |
| **Root cause** | XHR PUT has no timeout/abort (`uploadService.ts:48-75`); staging fires concurrent uploads (`useStagedAttachments.ts:388`); finalize only checks object exists (`attachments.ts:210-224`), not actual size/MIME. |
| **Confidence** | **Medium** (env-dependent) |
| **Recommended fix** | Timeout + abort token; optional concurrency limit; finalize via object metadata size check. |
| **Risk of fix** | **Low–Medium** |

---

### F17 — Workspace composer draft not persisted across refresh

| Field | Detail |
|---|---|
| **Surface** | Workspace only |
| **Category** | attachment loss, conversation reset (perceived) |
| **Exact repro** | Stage files in Workspace → refresh before Send → files/text gone. |
| **Network timeline** | none |
| **Server logs** | n/a |
| **Root cause** | `useComposerDraft` is memory-only; Ask Atlas alone re-enabled `PERSIST_FILE_BLOBS=true`. |
| **Confidence** | **High** |
| **Recommended fix** | Persist Workspace draft similarly, preferably by `attachmentIds` not only File blobs. |
| **Risk of fix** | **Medium** |

---

### F18 — Rapid Send: composer guarded; residual races elsewhere

| Field | Detail |
|---|---|
| **Surface** | Shared composer mitigated; handoff/ActiveRuns residual |
| **Category** | duplicate sends |
| **Exact repro** | Mash Send on Ask Atlas / Workspace composer → single submit (refs + stream busy). Handoff path: see F10. |
| **Network timeline** | one `POST /api/nexus/chat` for composer |
| **Server logs** | one user message |
| **Root cause** | `submitInFlightRef` + `canSend` + surface refs (`useAtlasConversation.ts:209-214`, home/workspace guards). |
| **Confidence** | **High** that composer is safe; **Medium** for handoff |
| **Recommended fix** | Keep guards; fix F10. |
| **Risk of fix** | **Low** |

---

### F19 — Storage-only label lost after reopen / in Workspace bubble typing

| Field | Detail |
|---|---|
| **Surface** | Shared reopen; Workspace `UserBubble` typing omits `processingStatus` |
| **Category** | storage-only labeling |
| **Exact repro** | Send PPTX → reopen thread. Chip may appear as generic file **without** “Stored — Atlas can't read…”. |
| **Network timeline** | thread hydration omits `processingStatus` (`nexus.ts:2104-2136`) |
| **Server logs** | n/a |
| **Root cause** | Hydration payload lacks processingStatus; `UserBubble` prop type omits it; `useMessageAttachments` unwired. Staging path labels correctly. |
| **Confidence** | **High** |
| **Recommended fix** | Include `processingStatus` (+ kind) in thread attachments; plumb through UserBubble/Ask Atlas enrich. |
| **Risk of fix** | **Low** |

---

### F20 — `/api/chat` (ActiveRuns / FlowPanel) does not link attachmentIds to messages

| Field | Detail |
|---|---|
| **Surface** | Shared secondary paths (not main Ask Atlas/Workspace composers) |
| **Category** | attachment loss on reopen |
| **Exact repro** | Attach via ActiveRuns/FlowPanel → send → reopen that chat message → no attachments via `GET /api/attachments/message/:id`. |
| **Network timeline** | upload OK → `/api/chat` with attachmentIds → no link call |
| **Server logs** | resolve may run; no link |
| **Root cause** | chat route resolves IDs but never `linkAttachmentsToMessage` (confirmed absent). |
| **Confidence** | **High** |
| **Recommended fix** | Link after chat message insert, or route these surfaces through Nexus. |
| **Risk of fix** | **Medium** |

---

## Symptom → failure map

| User-facing symptom | Likely failures | Surface |
|---|---|---|
| Remounts | F13, F11, F12 | Ask Atlas / Shared |
| Page refreshes | F12 | Shared |
| Duplicate sends | F10, F18 | Workspace bridge / Shared |
| Failed uploads | F1, F2, F15, F16 | Shared |
| Attachment loss | F1–F6, F14, F17, F20 | Shared / Ask Atlas / Workspace |
| Multiple file failures | F7, F8, F16 | Shared |
| Mixed type failures | F8, F9, F19 | Shared |
| Conversation resets | F11, F12, F17 | Ask Atlas / Workspace |

---

## What already works (do not regress)

1. One staging hook + one upload service + one send payload `{ text, attachmentIds }`.
2. Composer double-send guards on Ask Atlas + Workspace.
3. Storage-only staging labels (“can't read”) for correct MIME/extension pairs.
4. Retry failed upload without re-uploading successes (unit-proven).
5. Reject mixed `attachments[]` + `attachmentIds` on Nexus (400).
6. Unsupported types blocked before Send (EXE etc.).
7. Production route mount for `/api/attachments/*` (auth-gated).

---

## Recommended fix order (investigation only — not implemented)

| Priority | IDs | Why |
|---|---|---|
| P0 | **F1, F2** | Server boot destroys/invalidates uploads |
| P0 | **F3, F5, F4** | Reopen + live preview broken even when bytes exist |
| P1 | **F15, F14, F8, F9, F7** | Correctness of mixed/multi + retention |
| P1 | **F6, F10, F19** | Handoff + labeling |
| P2 | **F11, F12, F13, F17, F16, F20** | UX resilience / secondary paths |

---

## Live matrix gap (explicit)

Authenticated end-to-end UI passes for every cell in the user matrix were **not** executed in this run. Closest live evidence:

- PR #179 agent: automated acceptance only; preview `/api/attachments/*` was 404 at that time.
- This run: code + unit proof; production probe shows routes exist (401).

To complete the live matrix after P0 fixes:

1. Auth into `axiomsystem.app` (or local with `DATABASE_URL` + object storage).
2. Enable `localStorage.atlas-attach-audit = "1"` / `__atlasAttachAudit.dump()`.
3. Run every single-file and multi-file cell on **both** surfaces.
4. Capture DevTools Network + server logs for each failure against this register.

---

## Key file index

| Area | Path |
|---|---|
| Staging | `artifacts/atlas-frontend/src/hooks/useStagedAttachments.ts` |
| Upload | `artifacts/atlas-frontend/src/lib/attachments/uploadService.ts` |
| Matrix | `artifacts/atlas-frontend/src/lib/attachments/supportMatrix.ts` |
| Submit | `artifacts/atlas-frontend/src/hooks/useAtlasConversation.ts` |
| Stream | `artifacts/atlas-frontend/src/hooks/useNexusChatStream.ts` |
| Renderer | `artifacts/atlas-frontend/src/components/shared/AttachmentStrip.tsx` |
| Ask Atlas | `artifacts/atlas-frontend/src/pages/home.tsx` |
| Workspace | `artifacts/atlas-frontend/src/pages/workspace.tsx` |
| Routes | `artifacts/api-server/src/routes/attachments.ts` |
| Resolve/link | `artifacts/api-server/src/lib/attachmentResolve.ts` |
| Classify | `artifacts/api-server/src/lib/attachmentClassify.ts` |
| Storage | `artifacts/api-server/src/lib/attachmentStorage.ts` |
| Destructive boot SQL | `artifacts/api-server/src/index.ts` (~1453–1485) |
| Content GET (legacy-only) | `artifacts/api-server/src/routes/nexus.ts` (~1840–1912) |
| Thread hydrate | `artifacts/api-server/src/routes/nexus.ts` (~2102–2181) |

---

**End of investigation. No fixes applied.**
