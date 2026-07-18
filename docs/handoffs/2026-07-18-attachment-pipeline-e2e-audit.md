# Attachment Pipeline End-to-End Audit

**Repo:** `jochanae/atlas-idk`  
**Date:** 2026-07-18  
**Scope:** Audit only — no code changes, persistence not enabled, kill switch not touched.  
**Base:** `main` @ `777211f7` ("Fixed duplicate attach sends")

This document maps every attachment code path across frontend + backend, flags divergences / dead branches / duplicate-send risks, and ends with a prioritized fix list split for parallel execution (frontend vs backend).

---

## Executive verdict

1. **Canonical path works and does not double-send.** Ask Atlas + Workspace Nexus sends go through `useAtlasConversation` → `useNexusChatStream` → `POST /api/nexus/chat` with **only** `attachments[]` (inline base64). Legacy `imageBase64` / `imageData` are intentionally omitted (comments cite a confirmed 2→3 image duplication bug).
2. **Six frontend send paths still exist.** Only one (`useAtlasConversation`) has the staged lifecycle + `clientAttachmentId`. The others are siblings with weaker/broken semantics.
3. **`attachmentIds[]` is dead schema on both backend routes.** Declared, never read. No ID-resolution path exists.
4. **Kill switch is a fiction.** `artifacts/api-server/src/lib/agent-loop/flags.ts` has no `attachments.persistence`. Frontend `lib/attachments/flags.ts` was removed (`147fc04f`). `.replit` sets `ATTACHMENTS_PERSISTENCE=true`, but that env only feeds `GET /api/capabilities` — it gates nothing. Nexus **always** persists inline base64 to GCS when a linked message id exists.
5. **Draft blobs are safely off.** `PERSIST_FILE_BLOBS = false` in `composerDraftStore.ts` — no path rehydrates stale File blobs.
6. **No attachment error currently reaches `App.tsx` ErrorBoundary.** All paths are async-caught, swallowed, or unhandled promise rejections (ActiveRuns).

---

## 1. Surface → transport → payload → known bug

| Surface | Composer state | Transport | Wire payload | Known bug / divergence |
|---|---|---|---|---|
| **Ask Atlas** (`home.tsx` → `askAtlasConv.submit`) | `useStagedAttachments` | `useAtlasConversation` → `useNexusChatStream` → `POST /api/nexus/chat` | `attachments[{base64,mediaType,name,clientAttachmentId}]` only | Healthy. Errors returned but fire-and-forget drops codes (`home.tsx:3289`). |
| **Workspace Nexus** (`workspace.tsx` `handleSend`, `useNexusWorkspaceChat=true`) | `useStagedAttachments` | same canonical stack → `/api/nexus/chat` | same | Healthy for composer sends. Programmatic sends (`doSendFromComposer`, window events) drop attachments. |
| **Home → Workspace handoff** (`prepareOpeningAttachments`) | `File[]` → sessionStorage base64 | Workspace auto-submit → `atlasConv.submit({attachments})` passthrough → `/api/nexus/chat` | `attachments[]` **images only**, **no `clientAttachmentId`** | Non-images dropped at home. Conversion failure swallowed (`home.tsx:3399-3402`). Ack correlation impossible. sessionStorage quota risk. |
| **ActiveRuns** (Home Composer card) | local `File[]` | hand-rolled fetch → `POST /api/chat` | `attachments[]` only | Bypass of `useChatStream` / auth headers / history. Own `fileToBase64`. Unhandled rejection on read fail. Clears files before confirm. |
| **FlowPanel** (Workspace Flow Chat) | local `flowAttachedFiles: File[]` | hand-rolled fetch → `POST /api/chat` | **LEGACY** `imageData` + `imageMimeType` only | Sole remaining legacy-field sender. Non-images → text suffix only. Encode fail → empty strings. Clears files before confirm. |
| **WorkspaceConversationSurface** | local `File[]` | own `useNexusChatStream` → `/api/nexus/chat` | `attachments[]`, no `clientAttachmentId` | Bypasses `useAtlasConversation`. Own `fileToBase64`. No staged lifecycle / failure chips. |
| **Workspace legacy** (`useChatStream`, dead when flag true) | `attachedFiles` via ChatComposer | `doSend` → `POST /api/chat` | `attachments[]` **images only** | `docAttachments` computed, never sent (`useChatStream.ts:318`). `attachmentIds` typed, never used (`:124`). Regenerates without attachments. |
| **`/api/attachments/*` client** | — | — | — | **Zero frontend callers.** Upload lifecycle endpoints not implemented server-side (only `GET :id/content`). |

---

## 2. Path traces (composer → model)

### 2a. Canonical Nexus (Ask Atlas + Workspace composer)

```
ComposerActions.onFiles
  → useStagedAttachments.addFiles (status: ready|failed)
  → handleSubmit / handleSend
  → useAtlasConversation.submit
       · markConverting
       · fileToBase64Safe per ready file  (useAtlasConversation.ts:253-273)
       · clientAttachmentId = staged UUID
       · nexusChatStream.send({ text, attachments })
  → useNexusChatStream.send
       · body.attachments = allFileAttachments   (useNexusChatStream.ts:534-542)
       · deliberately omits imageBase64/imageMimeType
  → POST /api/nexus/chat
  → nexus.ts allAttachments assembly (legacyAttachments + optional imageBase64)  (:2440-2447)
  → Anthropic: image / document(PDF) / text stub  (:6129-6167)
     Gemini: inlineData (:6038-6054)
  → side-effect: persistAttachmentsForMessage → GCS + message_attachments (:3732-3763)
  → SSE attachment_ack (:3759, :5770-5786)
```

**Duplicate risk on this path:** None today. Both hooks refuse to send legacy fields alongside `attachments[]`.

### 2b. Home → Workspace opening handoff

```
home handleSubmit (project-create branch)
  → imageFiles = files.filter(image/*)          (home.tsx:~3314)
  → prepareOpeningAttachments(imageFiles)       (home.tsx:144-159, :3399)
  → sessionStorage["atlas-opening-attachments"]
  → POST /api/conversations { initialMessage }  ← NO attachments on this request
  → navigate to workspace
workspace openingMessage effect
  → atlasConv.submit({ text, attachments: openingMessage.attachments })  (workspace.tsx:6838)
  → useAtlasConversation passthrough branch (no staged lifecycle, no clientAttachmentId)
  → /api/nexus/chat as above
```

### 2c. ActiveRuns → `/api/chat`

```
ActiveRuns attachments: File[]
  → Promise.all(map fileToBase64)               (ActiveRuns.tsx:688)
  → POST /api/projects/:id/sessions
  → POST /api/chat { attachments[] }            (ActiveRuns.tsx:317-332)
  → chat.ts allAttachments                      (chat.ts:3182-3189)
  → Anthropic contentParts (PDF → text stub!)   (chat.ts:5019-5037)
  → callModel(..., allAttachments[0], ...)      (chat.ts:5365)  ← first only on that branch
  → NO persistAttachmentsForMessage
```

### 2d. FlowPanel → `/api/chat` (legacy fields)

```
flowAttachedFiles: File[]
  → first image only → fileToBase64Safe
  → POST /api/chat { imageData, imageMimeType } (FlowPanel.tsx:388-390)
  → chat.ts merges into allAttachments via legacyBase64/legacyMimeType (:3168-3188)
  → model as above
```

**Does not currently double-send** (never combines with `attachments[]`), but is the only path still on the pre-canonical field shape.

### 2e. useChatStream (legacy workspace — effectively dead)

`useNexusWorkspaceChat = true` hardcoded (`workspace.tsx:4715`). Hook still mounted (session bootstrap, prior hydration, summarize). Composer sends never reach `doSend` for attachments in production.

Wire body when invoked: `attachments: imgAttachments` only (`useChatStream.ts:410-417`). `docAttachments` discarded.

---

## 3. Backend routes

### 3a. `POST /api/chat` — `artifacts/api-server/src/routes/chat.ts`

| Shape | Accepted? | Consumed? |
|---|---|---|
| `attachments[{base64,mediaType,name}]` | yes | yes (`:3182-3187`) |
| `imageData` + `imageMimeType` | yes | yes (`:3168-3170, :3188`) |
| `attachmentIds[]` | declared (`:3124`) | **never read** |

- **`ATTACHMENTS_PERSISTENCE` gating:** none (comment only at `:3123`).
- **Both shapes sent:** both merge into `allAttachments` → **duplicate first image if client sends both** (this is why frontend hooks omit legacy fields).
- **Persistence:** never calls `persistAttachmentsForMessage`.
- **PDF fidelity:** text stub only (`:5025-5027`), not Anthropic `document`.
- **`callModel` path:** only first attachment (`:5365`).

### 3b. `POST /api/nexus/chat` — `artifacts/api-server/src/routes/nexus.ts`

| Shape | Accepted? | Consumed? |
|---|---|---|
| `attachments[{base64,mediaType,name,clientAttachmentId,sizeBytes}]` | yes | yes (`:2440-2447`) |
| `imageBase64` / `imageData` + `imageMimeType` | yes | yes (`:2424-2446`) — appended as extra entry |
| `attachmentIds[]` | declared (`:2375`) | **never read** |
| `text` alias for `message` | yes (schema) | used for message text |

- **Comment at `:2372` claims "Rejected when ATTACHMENTS_PERSISTENCE=true"** — **not implemented**.
- **Persistence:** always runs `persistAttachmentsForMessage` when `linkedNexusMessageId` + inputs (`:3732-3763`). No env/user/project gate.
- **PDF:** real `document` block (`:6141-6150`).
- **Dead comment:** `resolveAttachmentIdsForModel` referenced at `:6128` — function does not exist.
- **Dead comment:** "rows already exist from request-upload" (`:~3676`) — that route does not exist.

### 3c. `/api/attachments/*`

| Endpoint | Status |
|---|---|
| `GET /api/attachments/:id/content` | Implemented (`nexus.ts:1835-1907`). Ownership join. **Not gated by env.** |
| `POST request-upload`, `:id/finalize`, `message/:messageId`, `:id/open-url`, `:id/use-again`, `:id/save-to-library`, `:id/download` | **Not implemented** (planned in `docs/handoffs/2026-07-17-attachment-lifecycle-backend.md`) |

### 3d. Symmetry: chat vs nexus

| Aspect | `/api/chat` | `/api/nexus/chat` |
|---|---|---|
| Legacy `attachments[]` | yes | yes |
| Legacy single-image fields | `imageData` | `imageBase64` + `imageData` |
| `attachmentIds` consumed | no | no |
| Reject legacy when flag on | no | no |
| Persist to `message_attachments` | **no** | **yes (always)** |
| `attachment_ack` SSE | no | yes |
| PDF → `document` block | no | yes |
| Multi-file to model | partial (`callModel` first-only) | full list |
| Gemini multimodal | via `callModel` single image | full list |

**`ATTACHMENTS_PERSISTENCE` does not gate either route symmetrically — it gates neither.**

---

## 4. Refresh / crash / ErrorBoundary

`ErrorBoundary` at `App.tsx:63-127` only catches **render/commit** throws. Async attachment errors never reach it.

| Source | What happens | Boundary? | User signal |
|---|---|---|---|
| `useAtlasConversation` conversion fail | per-file `onMarkFailed` (`:253-273`) | no | failed chip |
| `useAtlasConversation` transport fail | `onRestoreToReady` + `{TRANSPORT_FAILED}` (`:340-380`) | no | files restored; result often ignored by caller |
| `useNexusChatStream` timeout / SSE error | assistant bubble `runStatus:"failed"` | no | in-thread |
| `useChatStream` HTTP / catch | generic assistant message (`:1232-1243`) | no | in-thread |
| FlowPanel encode fail | empty `imageData`/`imageMimeType` (`:388-390`) | no | **silent** |
| FlowPanel fetch fail | assistant bubble + `reportError` (`:429-432`) | no | in-thread |
| ActiveRuns `fileToBase64` reject | `Promise.all` in `handleSubmit` (`:687-690`) — **try/finally, no catch** | no | **unhandledrejection**; no toast |
| ActiveRuns run fail | card `status:"failed"` (`:519-527`) | no | card |
| `prepareOpeningAttachments` fail | empty catch (`home.tsx:3399-3402`) | no | **silent** — text-only continue |
| `composerDraftStore` IDB | all `.catch(() => undefined)` | no | none |
| ComposerActions oversized / onFiles throw | `toast.error` | no | toast |
| WorkspaceConversationSurface send throw | restore files + `console.error` (`:224-227`) | no | none |

**Unhandled throws / rejections (attachment-related):**
1. `ActiveRuns.tsx:268-281` + `:687-690` — `FileReader.onerror` → unhandled promise rejection.
2. No render-time attachment throw path found that would hit ErrorBoundary today.

---

## 5. Draft / persistence layer

File: `artifacts/atlas-frontend/src/lib/composerDraftStore.ts`

| Mechanism | Flag / gate | Today |
|---|---|---|
| Module memory text + files | — | text yes; files forced `[]` on write (`:197`) |
| sessionStorage input/meta | — | text persisted; meta `fileCount:0` (`:171-172`) |
| IndexedDB File blobs | `PERSIST_FILE_BLOBS = false` (`:24`) | write short-circuit (`:88`); read returns `[]` (`:114`); persist always `idbClearFiles` (`:176-177`) |
| `hydrateAskAtlasComposerDraft` | gated via `idbReadFiles` | always `files: []` |

**Confirmed: no path rehydrates stale blobs while `PERSIST_FILE_BLOBS` is false.** Residual IDB from older builds is cleared on next persist tick.

Handoff sessionStorage (`atlas-opening-attachments`) is a separate, ungated path — base64 images only, not IndexedDB.

---

## 6. Kill switch reality check

| Claimed control | Reality |
|---|---|
| `attachments.persistence` in `flags.ts` | **Does not exist.** `agent-loop/flags.ts` only has agent-loop + structured-plan helpers. |
| Frontend `lib/attachments/flags.ts` | **Removed** (`147fc04f`). Grep finds zero production frontend reads of `ATTACHMENTS_PERSISTENCE` / `attachmentPersistence`. |
| `process.env.ATTACHMENTS_PERSISTENCE` | Read only at `app.ts:254` for `/api/capabilities`. `.replit:80` sets `"true"`. |
| Nexus persistence gated | **No.** `persistAttachmentsForMessage` always runs (`nexus.ts:3746-3763`). |
| Legacy rejection when flag true | **Not implemented** (comment-only at `nexus.ts:2372`). |
| Draft blob persistence | **Forced off** via hardcoded `PERSIST_FILE_BLOBS = false` (`composerDraftStore.ts:24`). This is the only real frontend kill switch, and it only covers draft rehydration — not send transport. |

**Nothing bypasses `flags.ts` for attachments because there is no attachments flag in `flags.ts` to bypass.**

---

## 7. Prioritized fix list

Split for parallel work. **Do not enable persistence or invent a kill switch in these passes unless explicitly scoped.** Goal of Pass 1: one send path, one payload shape, no silent drops.

### P0 — Frontend (fix-fix)

| # | Fix | Why | Refs |
|---|---|---|---|
| F1 | **Migrate FlowPanel off legacy `imageData`/`imageMimeType` → `attachments[]`** (same shape as ActiveRuns / useChatStream). Keep single-image or expand later. | Sole remaining duplicate-risk field shape; inconsistent with every other client. | `FlowPanel.tsx:388-390`; server merge at `chat.ts:3168-3188` |
| F2 | **Catch ActiveRuns conversion failures** — wrap `Promise.all(fileToBase64)` in try/catch; toast or card error; do not clear attachments until accept. Prefer `fileToBase64Safe`. | Unhandledrejection; silent composer reset. | `ActiveRuns.tsx:268-281`, `:687-714`, `:709` |
| F3 | **Stop optimistic-clear before accept** on ActiveRuns + FlowPanel (match `useAtlasConversation` clear-on-accepted). | Lost files on network fail. | `ActiveRuns.tsx:709`; `FlowPanel.tsx:363-364` |
| F4 | **Handoff: attach `clientAttachmentId` + don't swallow conversion errors** in `prepareOpeningAttachments` / opening submit. Surface toast on fail. | Ack correlation broken; silent text-only send. | `home.tsx:144-159`, `:3399-3402`; `workspace.tsx:6838`; passthrough `useAtlasConversation.ts:280-283` |
| F5 | **Route WorkspaceConversationSurface through `useAtlasConversation`** (or delete if unused in prod nav). Kill private `fileToBase64` / parallel Nexus hook. | Third staging model; no failure UI; no clientAttachmentId. | `WorkspaceConversationSurface.tsx:77-87`, `:104`, `:113-121`, `:201-231` |

### P1 — Frontend (cleanup)

| # | Fix | Why | Refs |
|---|---|---|---|
| F6 | **Either wire or delete `docAttachments` in `useChatStream`** — today docs are silently dropped. | Dead branch; false confidence. | `useChatStream.ts:318`, `:410-417` |
| F7 | **Remove unused `options.attachmentIds` from `doSend` type** until real ID transport exists. | Dead contract invites half-migrations. | `useChatStream.ts:124` |
| F8 | **Regenerate must re-send prior attachments** (or explicitly refuse). | Image turns regenerate text-only. | `useChatStream.ts:1264-1275` |
| F9 | **Surface `submit()` error codes** in home/workspace `.finally` fire-and-forget (toast on `ALL_CONVERSIONS_FAILED` / `TRANSPORT_FAILED`). | Failures currently invisible beyond chip state. | `home.tsx:3289-3292`; `workspace.tsx:7376-7378` |
| F10 | **Revoke FlowPanel object URLs** on remove/unmount. | Memory leak. | `FlowPanel.tsx:1367-1383` |
| F11 | **Decide fate of ActiveRuns `/api/chat` bypass** — migrate to canonical Nexus submit or document as intentionally separate BUILD-run transport. | Parallel SSE parser + auth gap. | `ActiveRuns.tsx:317-332` |

### P0 — Backend (backend owner)

| # | Fix | Why | Refs |
|---|---|---|---|
| B1 | **Implement or delete `attachmentIds` on both routes.** If delete: remove from schema + comments. If implement: resolve IDs → model parts with ownership checks; define precedence when both shapes present (reject 400 if both). | Dead schema; clients that "upgrade" send empty multimodal content with no error. | `chat.ts:3124`; `nexus.ts:2375`; assembly `chat.ts:3182`; `nexus.ts:2440` |
| B2 | **Make `ATTACHMENTS_PERSISTENCE` real or stop advertising it.** Options: (a) gate `persistAttachmentsForMessage` + capability bit, or (b) remove env + `/api/capabilities` field + stale comments. Do **not** leave comment-"Rejected when…" while always accepting. | Kill switch fiction; `.replit` says true; code ignores. | `app.ts:254`; `.replit:80`; `nexus.ts:2372`, `:3746-3763`; `chat.ts:3123` |
| B3 | **Symmetrize PDF / multi-file model fidelity on `/api/chat`** with nexus (`document` blocks; pass full list into `callModel`). | ActiveRuns/FlowPanel PDF/docs degraded vs Ask Atlas. | `chat.ts:5025-5027`, `:5365` vs `nexus.ts:6141-6150` |
| B4 | **Remove or implement planned `/api/attachments/*` upload lifecycle** (`request-upload`, finalize, …). Update handoff docs that claim Section A shipped. | Docs/plan drift; 404s for any client written against plan. | `docs/handoffs/2026-07-17-attachment-lifecycle-backend.md`; `nexus.ts:1835` (only live route) |
| B5 | **Delete stale comments** referencing `resolveAttachmentIdsForModel` and pre-existing request-upload rows. | Misleads the next implementer. | `nexus.ts:6128`, `:~3676` |

### P1 — Backend

| # | Fix | Why | Refs |
|---|---|---|---|
| B6 | **Decide persistence for `/api/chat` attachments** (persist like nexus, or document ephemeral-only). | Asymmetry: chat attachments never retrievable via `:id/content`. | `chat.ts` (no persist call) vs `nexus.ts:3748` |
| B7 | **If both legacy + `attachments[]` arrive, reject or dedupe** instead of concatenating. | Server-side duplicate image if any client regresses. | `chat.ts:3182-3188`; `nexus.ts:2440-2446` |
| B8 | **Add `attachments.persistence` helper to `flags.ts` only if B2 chooses real gating** — single source of truth; both routes + capability endpoint must call it. | Prevents future bypass. | `flags.ts` (currently no helper) |

---

## 8. Suggested parallel split

**Frontend pass (this handoff consumer):** F1 → F5 first (payload consistency + crash/silent-loss), then F6–F11 cleanup. Stay on inline `attachments[]`. Do **not** introduce `attachmentIds` client-side until B1 lands.

**Backend pass:** B1 + B2 first (schema honesty + kill-switch truth), then B3–B5. Do **not** flip persistence behavior for production without an explicit product decision — today nexus already persists unconditionally despite docs saying "default OFF".

---

## 9. Out of scope / explicitly not done

- No code changes in this audit.
- Persistence not enabled or disabled.
- Kill switch not added or flipped.
- Prior audit at `docs/attachment-pipeline-audit.md` (2026-07-17) is **stale** (pre-`useAtlasConversation` / pre-`composerDraftStore` / pre-duplicate-send fix) — treat this document as the current source of truth.

---

## 10. Key file index

| Area | Path |
|---|---|
| Canonical submit | `artifacts/atlas-frontend/src/hooks/useAtlasConversation.ts` |
| Nexus stream | `artifacts/atlas-frontend/src/hooks/useNexusChatStream.ts` |
| Legacy chat stream | `artifacts/atlas-frontend/src/hooks/useChatStream.ts` |
| Staged files | `artifacts/atlas-frontend/src/hooks/useStagedAttachments.ts` |
| Draft store | `artifacts/atlas-frontend/src/lib/composerDraftStore.ts` |
| Ask Atlas / handoff | `artifacts/atlas-frontend/src/pages/home.tsx` |
| Workspace | `artifacts/atlas-frontend/src/pages/workspace.tsx` |
| ActiveRuns | `artifacts/atlas-frontend/src/components/home/ActiveRuns.tsx` |
| FlowPanel | `artifacts/atlas-frontend/src/components/workspace/FlowPanel.tsx` |
| Parallel surface | `artifacts/atlas-frontend/src/components/workspace/WorkspaceConversationSurface.tsx` |
| ErrorBoundary | `artifacts/atlas-frontend/src/App.tsx` |
| `/api/chat` | `artifacts/api-server/src/routes/chat.ts` |
| `/api/nexus/chat` + content GET | `artifacts/api-server/src/routes/nexus.ts` |
| Persist lib | `artifacts/api-server/src/lib/attachmentPersistence.ts` |
| Capabilities | `artifacts/api-server/src/app.ts` |
| Agent flags (no attach flag) | `artifacts/api-server/src/lib/agent-loop/flags.ts` |
