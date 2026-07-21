# Milestone 1 — Operation: Unbroken Conversation

**Phase:** A — Read-only audit (NO CODE CHANGES)  
**Date:** 2026-07-21  
**Scope:** Conversation lifecycle, attachment lifecycle, interruption inventory, acceptance criteria, repair order  
**Repo HEAD at audit:** `86e7b309` (`main`)  
**Status:** Audit complete. Phase B (Repair) must not begin until this document is reviewed.

> A user should be able to spend an hour with Atlas—sharing text, screenshots, PDFs, PowerPoints, code, and ideas—without Atlas ever interrupting the flow of thought.

This milestone is **not** about fixing isolated bugs. It is about understanding and restoring the **entire conversation lifecycle** so future fixes are systematic instead of reactive.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Conversation lifecycle](#2-conversation-lifecycle)
3. [Attachment lifecycle inventory](#3-attachment-lifecycle-inventory)
4. [Complete interruption inventory](#4-complete-interruption-inventory)
5. [Root causes (systemic)](#5-root-causes-systemic)
6. [Evidence index](#6-evidence-index)
7. [Acceptance criteria — “conversation restored”](#7-acceptance-criteria--conversation-restored)
8. [Recommended repair order (Phase B)](#8-recommended-repair-order-phase-b)
9. [Out of scope / explicitly deferred](#9-out-of-scope--explicitly-deferred)
10. [Phase A constraints checklist](#10-phase-a-constraints-checklist)

---

## 1. Architecture overview

### 1.1 Mental model

Atlas has **two live conversation surfaces** that share one canonical Nexus transport, plus several **legacy / parallel** send paths that still accept attachments.

```
┌──────────────────────────────────────────────────────────────────┐
│ ENTRY                                                            │
│  Radial “Ask Atlas” · long-press A · /atlas → /home              │
│  Home ambient composer · History · New Project                   │
└────────────────────────────┬─────────────────────────────────────┘
                             │
         ┌───────────────────┴───────────────────┐
         ▼                                       ▼
┌─────────────────────┐               ┌──────────────────────────┐
│ ASK ATLAS (/home)   │   handoff     │ WORKSPACE                │
│ AskAtlasSurface     │ ───────────►  │ /workspace/:cid          │
│ askAtlasConv        │               │ /project/:projectId      │
│ surface: ask-atlas  │               │ atlasConv + nexusBridge  │
└─────────┬───────────┘               │ surface: workspace       │
          │                           └────────────┬─────────────┘
          │  ALSO on /home (parallel):             │
          │  nexusChat = useNexusChatStream        │
          │  (ambient / crystallize feeder)        │
          ▼                                        ▼
   useAtlasConversation ──────────► useNexusChatStream
                                          │
                                          ▼
                               POST /api/nexus/chat (SSE)
                               GET  /api/nexus/thread
                               POST /api/nexus/handoff
                               POST /api/conversations
                               POST /api/attachments/* (upload)
```

Canonical ownership is defined in:

- `docs/architecture/conversation-ownership.md`
- `docs/architecture/attachment-ownership.md` *(partially stale — see §1.4)*

### 1.2 Surfaces and routes

| Surface | Route(s) | Primary UI | Controller |
|--------|----------|------------|------------|
| Ask Atlas | `/home` (`/atlas`, `/atlas/:id` → `/home`) | `AskAtlasSurface` | `askAtlasConv` = `useAtlasConversation({ surface: "ask-atlas" })` |
| Ambient home chat | `/home` | Inline home composer / message list | `nexusChat` = `useNexusChatStream({ surfaceContext: "home" })` |
| Workspace | `/workspace/:conversationId`, `/project/:projectId` | `ChatStream` + `ChatComposer` | `atlasConv` + `useNexusWorkspaceBridge` |
| Flow Chat | Workspace Flow tab | `FlowPanel` | Local state → **legacy** `POST /api/chat` |
| ActiveRuns | Embedded on `/home` overview | `ActiveRuns` | Local `File[]` → **legacy** `POST /api/chat` |

Route wiring: `artifacts/atlas-frontend/src/App.tsx` → `UnifiedShellRoutes`.

Live mount path: `main.tsx` → `App.tsx` (wouter). TanStack `router.tsx` / `routes/__root.tsx` are **not** in the live tree (`docs/workspace-remount-investigation.md`).

### 1.3 Canonical send stack (Ask Atlas + Workspace)

```
Composer (text + staged files)
  └─ useStagedAttachments          upload on pick (request-upload → PUT → finalize)
  └─ useAtlasConversation.submit   { text, stagedAttachments } → attachmentIds only
       └─ useNexusChatStream.send  POST /api/nexus/chat { attachmentIds }
            └─ SSE: token / step / done / attachment_ack / …
```

**Verified current contract** (`useAtlasConversation.ts`): submit sends **server `attachmentIds` only**. Inline base64 is deprecated / display-only. Surfaces must not convert files to base64 for Nexus transport.

### 1.4 Stale documentation warning

| Doc | Drift |
|-----|-------|
| `docs/architecture/attachment-ownership.md` | Still describes `fileToBase64Safe` as the Nexus transport path. **Current code uses ID upload + `attachmentIds`.** |
| `docs/attachment-pipeline-audit.md` (2026-07-17) | Describes Ask Atlas attachments as `useState<File[]>` with no draft persistence. **Superseded by `useStagedAttachments` + `composerDraftStore`.** |
| Agent memory claiming Ask Atlas was deleted | **False** — Ask Atlas is live. |

Phase B should update ownership docs as part of repair, not invent a second truth.

---

## 2. Conversation lifecycle

### 2.1 Where conversations begin

| Entry | File / function | What happens |
|-------|-----------------|--------------|
| Radial hub “Ask Atlas” | `UnifiedContextDock.tsx` | Navigate `/home` if needed + `axiom:ask-atlas` + `atlas:focus-composer` |
| Mobile long-press center A | `UnifiedShell.tsx` → `openAskAtlas()` | Same event |
| Composer focus on home | `home.tsx` textarea `onFocus` | Opens Ask Atlas; **clears `nexusChat` messages** |
| History select (non-promoted) | `home.tsx` `handleSwitchConversation` | Loads `GET /api/nexus/thread` → `askAtlasConv.setMessages` → opens surface |
| History promoted thread | `resolveConversationDestination` | Navigates to Workspace / project — **leaves Ask Atlas** |
| Master Map / deep link | `atlas-open-ask` session flag | Effect in `home.tsx` |
| Home Send with Ask Atlas **closed** | `home.tsx` submit path | `POST /api/conversations` → seed opening message → `/workspace/{cid}` |
| New Project CTA | `handleNewProject` | Empty conversation → `/workspace/{cid}?intake=1` |
| Ask Atlas first send | `askAtlasConv.submit` | Optimistic user msg → Nexus chat; `conversationId` on `done` → `askAtlasSession` |
| New Ask Atlas thread | `SessionHistorySheet` `onNew` → `handleNewConversation` | Clears ids + messages; `askAtlasNewConvMode` |

### 2.2 How conversations continue

| Concern | Ask Atlas | Workspace |
|---------|-----------|-----------|
| Send | `askAtlasConv.submit` / `AskAtlasSurface` `onSend` | `handleSend` → `atlasConv.submit` |
| Stream | `useNexusChatStream` SSE | Same |
| History load | Restore effect / `handleSwitchConversation` → `/api/nexus/thread` | `useNexusWorkspaceBridge` + recovery via `latest-conversation` |
| Abort | `askAtlasConv.abort` | `nexusBridge.abort` / stop controls |
| Conversation Mode | N/A (pre-project) | `sessionStorage` `atlas-conversation-mode-${id}` |
| Identity | `askAtlasSession` → `atlas-ask-atlas-conversation-id` | URL `conversationId` **or** `localStorage` `nexus_conv_{projectId}` |

### 2.3 Ask Atlas → Workspace handoff

Handoff is **not one function**. It is a family of sessionStorage contracts + optional `POST /api/nexus/handoff` + navigation conventions.

| Path | Trigger | Transfer | Navigation |
|------|---------|----------|------------|
| Commit / create from conversation | `handleHandoff` / CommitPill | memories, forge nodes, `append-thread`, `seedHandoffContinuation`, opening snapshot | `/project/{id}?source=home-handoff` (often) |
| Commit carryover | `performCreateProjectFromConversation` | `append-thread`, `atlas-adopted-conv-*`, `seedHandoffContinuation` | Prefers `/workspace/{adoptedCid}?from=home&source=commit-carryover` |
| Nexus handoff API | `triggerNexusHandoff` / CrystallizeSheet / AskAtlasSurface CommitPill | `POST /api/nexus/handoff` (flush Tier1, inject memory) | `/project/{id}` (continuation seed only if caller adds it) |
| NAVIGATE_TO / Open workspace | Assistant `navigateTo` in AskAtlasSurface | `seedHandoffContinuation(projectId)` | `msg.navigateTo.route` |
| Ambient first Send (surface closed) | Home composer | Opening message + attachments in sessionStorage | `/workspace/{cid}` |
| History promoted | `resolveConversationDestination` | None (already linked) | `/project/{id}` |

**Canonical continuation contract** (`askAtlasHelpers.seedHandoffContinuation`):

```ts
sessionStorage.setItem("atlas-opening-message", message);
sessionStorage.setItem("atlas-opening-message-project-id", String(projectId));
sessionStorage.setItem("atlas-handoff-continuation", "1");
```

Workspace opening-message effect (`workspace.tsx` ~6934+):

- If bridge already has messages **and** `atlas-handoff-continuation` is **not** `"1"` → **suppress** auto-send (quiet workspace).
- If flag is set → fire kickoff even when thread already loaded, then clear the flag.

**Preferred post-handoff URL:** `/workspace/{conversationId}` so the bridge mounts with `initialConversationId` immediately (avoids empty-history race). Many older paths still use `/project/{id}?source=home-handoff`.

### 2.4 Where conversation state is stored

| What | Where | Keys / notes |
|------|-------|--------------|
| Ask Atlas conversation id | localStorage + sessionStorage | `atlas-ask-atlas-conversation-id` via `askAtlasSession` |
| Ask Atlas open/closed | local + session | `atlas-ask-atlas-surface-open`, `atlas-ask-atlas-closed` |
| Ambient home conversation id | local + session | `atlas-home-conversation-id` (migrated into Ask Atlas key on load) |
| Workspace nexus conversation id | localStorage | `nexus_conv_{projectId}` |
| UUID → project cache | sessionStorage | `atlas-cid-{conversationId}` |
| Opening / handoff kickoff | sessionStorage | `atlas-opening-message`, `atlas-opening-message-project-id`, `atlas-opening-attachments`, `atlas-opening-conversation`, `atlas-handoff-continuation` |
| Handoff meta / banners | sessionStorage | `atlas-home-handoff-*`, `atlas-adopted-conv-*`, `atlas-commit-carryover-*`, … |
| Ask Atlas composer **text** draft | module memory + sessionStorage | `composerDraftStore` |
| Ask Atlas / Workspace **file** drafts | module `softMemoryBySurface` only | **Not** durable across hard reload (`PERSIST_FILE_BLOBS = false`) |
| Workspace composer **text** draft | React `useState` only | `useComposerDraft` — **lost on remount/nav** |
| Conversation mode toggle | sessionStorage | `atlas-conversation-mode-${projectId}` |
| In-flight messages | React state in each `useNexusChatStream` instance | Not durable mid-stream until server persist |
| Handoff UI (CommitPill) | Zustand `shellStore` | `shapingStatus`, `pendingWorkspaceId`, `handoffStage` |
| Server of record | Postgres | `nexus_messages` / `nexus_conversations` / `projects.conversation_id` |
| React Query | project/session lists | **Not** live chat messages |

No Zustand store for message history. No durable IndexedDB for File blobs (intentionally disabled after WebView OOM).

### 2.5 Where conversation state can be lost

**Verified:**

1. **Dual home controllers:** Live Ask Atlas messages live in `askAtlasConv`. Opening Ask Atlas **clears** `nexusChat`. Crystallize / `handleHandoff` / `performCreateProjectFromConversation` still read **`nexusChat.messages`** → can hand off an **empty** transcript. AskAtlasSurface CommitPill is the exception (uses its `messages` prop).
2. **In-memory stream until SSE persist:** refresh mid-stream loses partial assistant text.
3. **Composer drafts:** Ask Atlas text survives soft remount + sessionStorage; **attachments do not** survive hard reload. Workspace text draft is React-only.
4. **Missing `atlas-handoff-continuation`:** workspace lands quiet when thread already has messages.
5. **sessionStorage handoff keys:** cleared on tab close / project-id mismatch → opening message never fires.
6. **Home reset / Exit Ask Atlas / shred / new conversation:** intentionally clears ids + messages; accidental triggers feel like a wipe.
7. **Route unmount** `/home` ↔ `/project|/workspace`: full page component teardown; in-flight streams abort with the tree.
8. **Stale `nexus_conv_{id}`:** empty thread then recovery via `latest-conversation` (brief blank / wrong thread possible).
9. **CommitPill auto-idle after ~20s** (`shellStore`): CTA disappears while exploring.

**Inferred:**

- Mid-handoff navigation before `/api/nexus/handoff` settles may leave Tier1 buffer unflushed (several UI paths treat handoff as best-effort / non-blocking).
- Which CommitPill path users hit most often (surface vs floating home) affects how often empty-transcript crystallize fires.

---

## 3. Attachment lifecycle inventory

### 3.1 Shared capability matrix

Canonical matrix: `artifacts/atlas-frontend/src/lib/attachments/supportMatrix.ts` + server `attachmentClassify.ts`.

| Kind | Ext / MIME | Capability |
|------|------------|------------|
| Images / screenshots | png/jpg/jpeg/webp | `model_use` |
| PDF | pdf | `model_use` |
| PowerPoint | pptx | `model_use` (extract at send) |
| DOCX / XLSX / CSV / TXT / MD | as matrix | `model_use` |
| ZIP | zip | `storage_only` (often separate code-context path) |
| Code (`.js/.ts/.tsx/.jsx/.json` etc.) | — | **blocked** on canonical matrix (`kind: other`) |

Limits: 10 files, 20 MB/file, 50 MB/message (`limits.ts`).

### 3.2 Canonical upload → model path

```
pick / drop / paste / Files sheet
  → useStagedAttachments.addFiles
  → uploadAttachmentFile (uploadService)
       POST /api/attachments/request-upload
       PUT  (storage)
       POST /api/attachments/:id/finalize
  → chip status: ready + attachmentId
  → submit { text, stagedAttachments }
  → POST /api/nexus/chat { attachmentIds }
  → server resolveAttachmentIdsForModel (current turn; V2 may reopen prior)
```

Auth: `/api/attachments` is in `SILENT_401_PATTERNS` — attachment 401 does **not** hard-redirect to login. Upload retries 401 once after 1.5s.

### 3.3 Path inventory

#### Path A — Ask Atlas primary composer (Camera / Attach / Files)

| Field | Detail |
|-------|--------|
| **Component** | `ComposerActions` (`scope="ask-atlas"`), host `Home` + `AskAtlasSurface` |
| **Route** | `/home` |
| **Picker** | Hidden `<input type="file" accept="*/*" multiple>` + camera `capture="environment"`; Plus sheet |
| **Upload** | `onFiles` → `staged.addFiles` → `uploadAttachmentFile` |
| **Model payload** | `askAtlasConv.submit({ text, stagedAttachments })` → `{ attachmentIds }` |
| **Preview** | `AttachmentStrip` mode=`staged` |
| **Reopen** | Opening picker does **not** navigate. Ghost shield 1.5s gallery / 3s documents. |
| **Draft preservation** | Text: `composerDraftStore`. Files: soft memory only. Hard reload (Android Documents): **files lost**. |
| **Navigation** | None on attach. Ambient send without Ask Atlas open can navigate to workspace with `atlas-opening-attachments`. |
| **Auth** | Silent 401 on attachments; other APIs can still redirect. |
| **Refresh/remount risk** | **Highest known** — Documents/PPTX WebView kill + ghost tap on Exit/toggle. |
| **Confidence** | **Verified** |

#### Path B — Ask Atlas legacy / dual file input on Home shell

| Field | Detail |
|-------|--------|
| **Component** | `Home` hidden `#home-file-input` |
| **Route** | `/home` |
| **Trigger** | `AskAtlasSurface.onAddAsset` → `fileInputRef.click()` |
| **Upload / payload** | Same as Path A |
| **Shield** | `markPickerPending("ask_atlas_add_asset"\|"home_add_asset")` |
| **Paste / drop** | **None** on Ask Atlas / home |
| **Risk** | Duplicate input alongside ComposerActions; same picker risks |
| **Confidence** | **Verified** |

#### Path C — Workspace chat composer

| Field | Detail |
|-------|--------|
| **Components** | `ChatComposer` + `ComposerActions` (`scope="ws"`) |
| **Route** | `/project/:projectId`, `/workspace/:conversationId` |
| **Picker** | Same Plus sheet; also `#ws-file-input` |
| **Paste** | Textarea `onPaste` → clipboard files → `onAddFiles` |
| **Drop** | Page-level drop **only** accepts `.zip` → `processZip` (not staged attachments) |
| **Upload / payload** | `useStagedAttachments({ surface: "workspace" })` → Nexus `attachmentIds` |
| **Opening handoff** | Reads `atlas-opening-attachments` from home create-project flow |
| **Draft** | Soft remount via module memory; **text** via `useComposerDraft` (React-only — lost on remount) |
| **Risk** | Document-picker ghost taps; text draft loss on remount; ZIP drop steals ZIP attach intent |
| **Confidence** | **Verified** |

#### Path D — ComposerActions → Files browser (library re-attach)

| Field | Detail |
|-------|--------|
| **Component** | `ComposerActions` Files sheet → `FilesBrowser` mode=`attach` → `resolveToFiles` |
| **Route** | Overlay (no route change) |
| **Upload** | Fetch FS/library content → `File[]` → parent `onFiles` → staged pipeline |
| **Navigation** | Menu `"files"` action navigates to `/files` (different from in-sheet browser) |
| **Risk** | Modal only; fetch failures toast + skip |
| **Confidence** | **Verified** |

#### Path E — FlowPanel (parallel conversation)

| Field | Detail |
|-------|--------|
| **Component** | `FlowPanel` |
| **Route** | Workspace Flow tab |
| **Picker** | Paperclip — images, pdf, txt/md/csv/json, **code extensions** |
| **Upload** | Local state → on send `uploadAttachmentFiles` → `{ attachmentIds }` |
| **Model** | `POST /api/chat` with `flowMode: true` (**legacy**, not Nexus) |
| **Draft / shield** | No ghost shield; no soft-memory staging |
| **Risk** | Cleared on send; partial upload can still send text; weaker interrupt mitigations |
| **Confidence** | **Verified** |

#### Path F — ActiveRuns (home overview)

| Field | Detail |
|-------|--------|
| **Component** | `ActiveRuns` |
| **Route** | Embedded on `/home` |
| **Picker** | Paperclip, no accept filter |
| **Upload** | On submit only → `uploadAttachmentFiles` → `POST /api/chat` |
| **Staging** | Local `useState<File[]>` — **not** `useStagedAttachments` |
| **Risk** | Bypasses Nexus/WhisperGate; upload failure aborts run start |
| **Confidence** | **Verified** |

#### Path G — QuickEditRow (names only)

| Field | Detail |
|-------|--------|
| **Component** | `QuickEditRow` |
| **Behavior** | Filenames appended into prompt context — **no upload** |
| **Navigation** | Can `ejectToWorkspace` with names in sessionStorage |
| **Risk** | Low for upload wipe; can navigate away |
| **Confidence** | **Verified** |

#### Path H — Code-context ZIP

| Field | Detail |
|-------|--------|
| **Component** | `ChatComposer` `#ws-code-context-input` |
| **Upload** | `FormData` → `POST /api/upload/code-context` |
| **Model** | Injected as `fileContext` string — not `attachmentIds` |
| **Confidence** | **Verified** |

#### Path I — Workspace ZIP import / page drop

| Field | Detail |
|-------|--------|
| **Behavior** | Client-side zip listing / code context |
| **Risk** | Full-page drop handler can steal ZIP from “attach as message file” intent |
| **Confidence** | **Verified** |

#### Path J — Library “attach to conversation”

| Field | Detail |
|-------|--------|
| **Component** | `LibrarySurface.handleAttach` → `attachLibraryItem` |
| **Behavior** | Server link of existing library item — no picker |
| **Confidence** | **Verified** |

#### Path K — AttachmentComposer (lab / acceptance)

| Field | Detail |
|-------|--------|
| **Component** | `AttachmentComposer` |
| **Behavior** | Full shared loop for tests — not a production route |
| **Confidence** | **Verified** |

### 3.4 How attachments enter the model (continuity)

1. Client sends **IDs only** on the canonical path.
2. Server `resolveAttachmentIdsForModel` downloads bytes, extracts OOXML/CSV/PPTX text (+ optional slide PNGs), injects for the **current turn**.
3. **Legacy (flag off):** HARD RULE tells the model no attachment was provided if this turn has none — prior files are **not** treated as this-turn attachments (`nexus.ts`).
4. **V2 (`ATTACHMENT_CONTINUITY_V2=1`):** prior attachments **can** be re-injected via relevance-gated historical reopen (`attachmentGrounding.ts`). Flag is strict `=== "1"`.
5. History does **not** automatically re-inject prior extracted content without V2 reopen — documented continuity gap in `docs/handoffs/2026-07-21-attachment-continuity-provenance-investigation.md`.

This is a **semantic** interruption (user must re-attach or re-explain) even when the UI never remounts.

### 3.5 Attachment paths ranked by interrupt risk

1. Ask Atlas / Workspace native Attach (esp. PPTX/PDF via Documents) — ghost tap + WebView kill  
2. Ask Atlas dual inputs + Exit/toggle under picker — historically wiped thread  
3. Home ambient send with attachments — navigates to workspace mid-flow  
4. FlowPanel / ActiveRuns legacy `/api/chat` — weaker staging/error UX  
5. Paste (Workspace) / Files sheet resolve — lower remount risk  
6. Code-context ZIP / ZIP drop / QuickEdit / Library — different contracts  

**No production attachment path intentionally remounts the page when opening the file picker.** Interrupt modes are ghost clicks, hard WebView reloads, auth redirects on non-attachment APIs, intentional navigation after send/handoff, and model continuity gaps.

---

## 4. Complete interruption inventory

Confidence legend:

- **Verified** — observed in current source with file/function evidence  
- **Inferred** — strongly suggested by code/docs but not fully runtime-traced in this pass  
- **Mitigated** — historical failure with active guards; residual risk may remain  
- **Dead** — code exists but is not on the live mount path  

### Critical

#### INT-01 — Confirmed API 401 → hard login redirect

| Field | Detail |
|-------|--------|
| **File** | `artifacts/atlas-frontend/src/lib/install-api-fetch.ts` |
| **Function** | Global `window.fetch` patch |
| **Cause** | Non-silent API `401` → recheck `/api/auth/me` → `window.location.href = …/login?reason=session_expired` |
| **Runtime evidence** | Comments document attach 401s silenced so login never wipes composer mid-attach; other routes still redirect |
| **Confidence** | Verified |
| **Impact** | Full navigation; drafts, staged files, in-flight SSE lost |

Silent patterns today: `/api/attachments`, `/api/nexus/activity`, `/api/nexus/briefing`, `/api/stripe/`, `/api/connections`.

#### INT-02 — `useRequireAuth` soft redirect to login

| Field | Detail |
|-------|--------|
| **File** | `artifacts/atlas-frontend/src/hooks/useAuth.ts` |
| **Function** | `useRequireAuth` |
| **Cause** | `!isLoading && !user` → `navigate("/login")` |
| **Runtime evidence** | Used by `home.tsx` and `workspace.tsx`; auth null after failed `/auth/me` clears session |
| **Confidence** | Verified |
| **Impact** | Leaves conversation surfaces |

### High

#### INT-03 — App ErrorBoundary soft remount

| Field | Detail |
|-------|--------|
| **File** | `artifacts/atlas-frontend/src/App.tsx` |
| **Function** | `ErrorBoundary.componentDidCatch` |
| **Cause** | &lt;3 crashes/10s → `setState({ hasError: false })` remounts entire router tree |
| **Runtime evidence** | Soft remount survival added in draft/staged stores because this used to wipe composer; hard “Reload” uses `location.reload()` |
| **Confidence** | Verified |
| **Impact** | React message/stream state wiped; typed Ask Atlas draft + staged soft-memory may survive |

#### INT-04 — Exit Ask Atlas / toggle off clears thread

| Field | Detail |
|-------|--------|
| **File** | `artifacts/atlas-frontend/src/pages/home.tsx` |
| **Function** | Exit chip `onClick`; Ask Atlas toggle close; `handleLockTap` |
| **Cause** | `abort()` + `clearMessages()` (+ often clear conversation IDs / storage) |
| **Runtime evidence** | Comments document ghost taps on Exit wiping thread “looked like a refresh”; mitigated by ghost shield + `isPickerPending` |
| **Confidence** | Verified (intentional clear); accidental trigger Mitigated/Inferred residual |
| **Impact** | Conversation UI emptied; server history still exists but surface feels reset |

#### INT-05 — Hard reload / WebView kill during attach

| Field | Detail |
|-------|--------|
| **Files** | `composerDraftStore.ts`, `useStagedAttachments.ts`, home hydration |
| **Cause** | Android Documents/PPTX picker often kills WebView; `PERSIST_FILE_BLOBS = false` |
| **Runtime evidence** | Explicit comments: IDB blob writes OOM’d WebViews; soft map cleared on full reload |
| **Confidence** | Verified |
| **Impact** | Staged attachments + upload controllers lost; typed Ask Atlas input may survive |

#### INT-06 — Workspace composer text draft not persisted

| Field | Detail |
|-------|--------|
| **File** | `artifacts/atlas-frontend/src/hooks/useComposerDraft.ts` |
| **Function** | `useComposerDraft` |
| **Cause** | Plain `useState` for input (+ legacy files array); no sessionStorage/module memory for text |
| **Runtime evidence** | File header: no persistence |
| **Confidence** | Verified |
| **Impact** | Typed Workspace draft lost on remount/nav (chips may survive soft memory) |

#### INT-07 — Project switch clears workspace messages

| Field | Detail |
|-------|--------|
| **File** | `artifacts/atlas-frontend/src/hooks/useNexusWorkspaceBridge.ts` |
| **Function** | `useEffect` on `pid` |
| **Cause** | Real project-id change → `clearMessages()` + reset conversation id |
| **Runtime evidence** | Comment: avoiding clear on initial resolve that “looks like a refresh/reset on first send” |
| **Confidence** | Verified |
| **Impact** | Cross-project navigation blanks UI until rehydrate |

#### INT-08 — Route unmount `/home` ↔ `/project|/workspace`

| Field | Detail |
|-------|--------|
| **File** | `artifacts/atlas-frontend/src/App.tsx` |
| **Function** | `UnifiedShellRoutes` Switch |
| **Cause** | Wouter swaps `Home` vs lazy `Workspace` — full page unmount |
| **Runtime evidence** | Separate route components |
| **Confidence** | Verified structure; mid-stream loss Inferred |
| **Impact** | In-flight streams/drafts die with the tree |

#### INT-09 — NAVIGATE_TO hard redirect mid-stream

| Field | Detail |
|-------|--------|
| **File** | `artifacts/atlas-frontend/src/hooks/useAtlasStream.ts` |
| **Function** | SSE `done` handler |
| **Cause** | `NAVIGATE_TO:{"route":"/project/N"}` → `window.location.href = /project/N` |
| **Runtime evidence** | Hard navigation, not wouter |
| **Confidence** | Verified |
| **Impact** | Interrupts Ask Atlas / ambient stream with full reload-style nav |

#### INT-10 — Explicit hard navigations from conversation surfaces

| Field | Detail |
|-------|--------|
| **Files** | `home.tsx`, `UnifiedContextDock.tsx`, `AccountHubPanel.tsx`, `workspace.tsx` (GitHub OAuth/disconnect) |
| **Cause** | `window.location.href` / `reload()` for project open, OAuth, logout, GitHub disconnect |
| **Confidence** | Verified |
| **Impact** | High when triggered mid-compose |

#### INT-11 — Dual controller crystallize / handoff empty transcript

| Field | Detail |
|-------|--------|
| **File** | `artifacts/atlas-frontend/src/pages/home.tsx` |
| **Function** | `handleHandoff`, `performCreateProjectFromConversation`, Crystallize handlers |
| **Cause** | Ask Atlas open clears `nexusChat`; those paths still snapshot `nexusChat.messages` |
| **Runtime evidence** | Clear-on-open effect ~2333–2337; crystallize maps `nexusChat.messages`; AskAtlasSurface CommitPill uses prop messages (exception) |
| **Confidence** | Verified |
| **Impact** | Handoff can create project without the conversation the user just had |

#### INT-12 — Attachment continuity / OutputGuard (semantic interrupt)

| Field | Detail |
|-------|--------|
| **Files** | `artifacts/api-server/src/routes/nexus.ts` HARD RULE; `attachmentOutputGuard.ts`; client `onCorrection` in `useNexusChatStream` |
| **Cause** | Next turn resolves only current `attachmentIds` unless V2 reopen; HARD RULE denies prior files; guard may rewrite assistant text |
| **Runtime evidence** | Continuity investigation handoff 2026-07-21; V2 flag-gated reopen |
| **Confidence** | Verified (behavior flag-dependent) |
| **Impact** | User must re-attach or re-explain — unbroken thought broken without UI remount |

#### INT-13 — Handoff continuation suppressed (quiet workspace)

| Field | Detail |
|-------|--------|
| **File** | `artifacts/atlas-frontend/src/pages/workspace.tsx` |
| **Function** | Opening-message effect |
| **Cause** | Thread already loaded + missing `atlas-handoff-continuation=1` → drop opening message |
| **Runtime evidence** | Explicit exception comment + early return |
| **Confidence** | Verified |
| **Impact** | Ask Atlas → Workspace feels dead; user repeats themselves |

### Medium

#### INT-14 — SSE disconnect / timeout / abort

| Field | Detail |
|-------|--------|
| **Files** | `useAtlasStream.ts`, `useNexusChatStream.ts` |
| **Cause** | Network drop; stream timeout (~90s); abort on Exit; no SSE resume |
| **Confidence** | Verified |
| **Impact** | Turn interrupted; may recover via thread refetch |

#### INT-15 — Ghost click / picker return wiping Ask Atlas (mitigated)

| Field | Detail |
|-------|--------|
| **Files** | `ghostClickShield.ts`, `ComposerActions.tsx`, Exit/toggle in `home.tsx` |
| **Cause** | Mobile picker synthesizes tap on Exit / toggle |
| **Confidence** | Verified mitigation; residual Inferred if shield expires early |
| **Impact** | Residual Medium |

#### INT-16 — New conversation / session switch / archive-and-new / home-reset

| Field | Detail |
|-------|--------|
| **Files** | `home.tsx` `handleNewConversation`; `workspace.tsx` `handleNewSession`, `handleArchiveAndNew`, `handleSwitchSession`; wordmark `axiom:home-reset` |
| **Cause** | Explicit clears / navigate |
| **Confidence** | Verified |
| **Impact** | Intentional Medium; unexpected home-reset High |

#### INT-17 — Opening Ask Atlas clears ambient nexus messages

| Field | Detail |
|-------|--------|
| **File** | `home.tsx` |
| **Cause** | `askAtlasSurfaceOpen` → `nexusChat.clearMessages()`; focus opens Ask Atlas and clears |
| **Confidence** | Verified |
| **Impact** | Ambient thread wiped when entering Ask Atlas (by design for dual-renderer, harmful with INT-11) |

#### INT-18 — Blanket `queryClient.invalidateQueries()`

| Field | Detail |
|-------|--------|
| **File** | `workspace.tsx` |
| **Cause** | Invalidates **all** queries (auto-promote shaping; refresh button) |
| **Confidence** | Verified |
| **Impact** | Can flash loading / remount query-bound UI; chat messages mostly local/SSE |

#### INT-19 — Page transition overlay

| Field | Detail |
|-------|--------|
| **File** | `App.tsx` `PageTransition` |
| **Cause** | Full-screen spinner on route change; skipped within unified shell paths |
| **Confidence** | Verified |
| **Impact** | Low–Medium visual interrupt outside shell |

#### INT-20 — Lazy Workspace chunk load failure

| Field | Detail |
|-------|--------|
| **File** | `App.tsx` |
| **Cause** | `lazy(() => import("./pages/workspace").catch(retry after 1.5s))` |
| **Confidence** | Verified |
| **Impact** | Suspense spinner; if both fail → error boundary |

#### INT-21 — Auth remount refetch (`staleTime` 5 min)

| Field | Detail |
|-------|--------|
| **File** | `useAuth.ts` |
| **Cause** | `refetchOnMount: true` can null session → `useRequireAuth` login |
| **Confidence** | Verified path; false expiry Inferred under race |
| **Impact** | Medium |

#### INT-22 — Account / Stripe / GitHub hard redirects

| Field | Detail |
|-------|--------|
| **Files** | `AccountHubPanel.tsx`, `useSubscription.ts`, `FilesPanel.tsx`, `workspace.tsx` OAuth |
| **Cause** | Checkout portal / Google OAuth / session_expired → hard nav |
| **Confidence** | Verified |
| **Impact** | Medium–High if opened mid-conversation |

#### INT-23 — Duplicate send (largely guarded)

| Field | Detail |
|-------|--------|
| **Files** | `useAtlasConversation.submit`, `useNexusChatStream.send`, home/workspace in-flight refs |
| **Cause** | Guards return `STREAM_BUSY` / early return |
| **Confidence** | Verified guards; residual remount double-send Inferred |
| **Impact** | Low normally; Medium around remount |

#### INT-24 — Attachment upload failure / strip crash

| Field | Detail |
|-------|--------|
| **Files** | `useStagedAttachments.ts`, `uploadService.ts`, `AttachmentStrip.tsx` boundary |
| **Cause** | Failed chip; abort PUT on remount race; strip boundary isolates preview crashes |
| **Confidence** | Verified |
| **Impact** | Send blocked while uploading / failed; strip crash should not blank whole app |

#### INT-25 — Send while upload incomplete

| Field | Detail |
|-------|--------|
| **Files** | `home.tsx` / `workspace.tsx` handleSend |
| **Cause** | Blocks/queues when `staged.isUploading`; ready-without-`attachmentId` → `NOT_UPLOADED` |
| **Confidence** | Verified |
| **Impact** | Feels like broken send — not a full wipe |

#### INT-26 — Code files blocked on canonical matrix

| Field | Detail |
|-------|--------|
| **Files** | `supportMatrix.ts`, Composer staging validation |
| **Cause** | `.js/.ts/.tsx/...` classified `other` / blocked while product promise includes “code” |
| **Confidence** | Verified |
| **Impact** | User cannot share code as first-class attachment on canonical path (FlowPanel accept list includes code but backend may still reject) |

### Low / mitigated / dead

| ID | Name | Notes | Confidence |
|----|------|-------|------------|
| INT-27 | `useChatStream` visibility summarize | Tab hide → summarize only; does not clear messages | Verified Low |
| INT-28 | Global refetch-on-focus | Disabled in QueryClient + projects queries | Verified mitigated |
| INT-29 | beforeunload handlers | Persist / warn — do not navigate themselves | Verified Low |
| INT-30 | TanStack chunk-load hard reload | Dead — not imported by `main.tsx` | Verified dead |
| INT-31 | React StrictMode double effects | Removed from `main.tsx` | Verified dead |
| INT-32 | Vite HMR full-reload | Dev/preview only | Inferred |
| INT-33 | Form full-page submit on chat | Composers use buttons / preventDefault | Verified none |
| INT-34 | Dedicated token refresh loop | None; expiry surfaces as 401 → INT-01 | Verified |

---

## 5. Root causes (systemic)

These are the **systems** behind the interruption inventory — not individual bugs.

### RC-1 — Dual conversation controllers on `/home`

Ask Atlas and ambient home each own a live `useNexusChatStream`. Clear-on-open prevents dual UI, but handoff/crystallize still feed from the **cleared** controller. Continuity fails at the ownership boundary.

### RC-2 — Conversation identity is multi-keyed and partially ephemeral

Conversation continuity depends on a mesh of localStorage, sessionStorage, URL params, and server `conversationId` / `project_id`. Any missing piece (especially handoff continuation flag or preferred `/workspace/:cid` URL) produces a quiet or empty Workspace.

### RC-3 — Soft remount is treated as survivable; hard reload is not

ErrorBoundary remounts and surface flips are common enough that soft-memory was added. Hard reloads (Documents picker WebView kill, auth redirect, `location.href`) intentionally discard File blobs. Attach-heavy sessions therefore fail on the hardest path users hit (PDF/PPTX).

### RC-4 — Attachment transport and attachment memory are different lifetimes

Upload pipeline can succeed and persist server-side, but the **next turn** may not see prior files unless Continuity V2 reopen fires. UI survival ≠ model continuity.

### RC-5 — Auth hard-stop is global

One confirmed 401 on a non-silent endpoint hard-navigates to login. Attachment endpoints are silenced, but concurrent project/list/auth calls during picker blur can still end the session mid-thought.

### RC-6 — Parallel legacy send paths

FlowPanel and ActiveRuns still send via `/api/chat` with weaker staging, shields, and draft survival. “Conversation” is not one product surface yet.

### RC-7 — Destructive Exit semantics

Closing Ask Atlas clears local thread state. Accidental close (ghost click) and intentional close share the same wipe. Server history remains, but the user’s immediate thread of thought does not.

### RC-8 — Ownership docs lag the code

Agents and future Phase B work will reintroduce base64 / wrong-controller bugs if they follow stale ownership docs instead of current `useAtlasConversation` + `useStagedAttachments` + `attachmentIds`.

---

## 6. Evidence index

### Primary code

| Area | Paths |
|------|-------|
| Routes / ErrorBoundary | `artifacts/atlas-frontend/src/App.tsx` |
| Ask Atlas + dual controller | `artifacts/atlas-frontend/src/pages/home.tsx` |
| Workspace handoff consume | `artifacts/atlas-frontend/src/pages/workspace.tsx` |
| Canonical submit | `artifacts/atlas-frontend/src/hooks/useAtlasConversation.ts` |
| SSE transport | `artifacts/atlas-frontend/src/hooks/useNexusChatStream.ts` |
| Workspace bridge | `artifacts/atlas-frontend/src/hooks/useNexusWorkspaceBridge.ts` |
| Staging + soft memory | `artifacts/atlas-frontend/src/hooks/useStagedAttachments.ts` |
| Ask Atlas draft store | `artifacts/atlas-frontend/src/lib/composerDraftStore.ts` |
| Workspace draft | `artifacts/atlas-frontend/src/hooks/useComposerDraft.ts` |
| Upload | `artifacts/atlas-frontend/src/lib/attachments/uploadService.ts`, `adapter.ts` |
| Ghost shield | `artifacts/atlas-frontend/src/lib/ghostClickShield.ts` |
| Auth redirect | `artifacts/atlas-frontend/src/lib/install-api-fetch.ts`, `hooks/useAuth.ts` |
| Handoff seed | `artifacts/atlas-frontend/src/lib/askAtlasHelpers.ts` |
| Session keys | `artifacts/atlas-frontend/src/lib/askAtlasSession.ts` |
| Composer UI | `artifacts/atlas-frontend/src/components/composer/ComposerActions.tsx` |
| Ask Atlas UI | `artifacts/atlas-frontend/src/components/home/AskAtlasSurface.tsx` |
| Legacy Flow / Runs | `FlowPanel.tsx`, `ActiveRuns.tsx` |
| Nexus API | `artifacts/api-server/src/routes/nexus.ts` |
| Continuity V2 | `artifacts/api-server/src/lib/attachmentGrounding.ts` (and related) |

### Prior investigations (do not re-litigate; use as evidence)

| Doc | Relevance |
|-----|-----------|
| `docs/architecture/conversation-ownership.md` | Canonical stack (partially current) |
| `docs/architecture/attachment-ownership.md` | Ownership rules (**stale on transport**) |
| `docs/workspace-remount-investigation.md` | Focus remount ruled out; TanStack dead; projects focus-refetch fixed |
| `docs/attachment-pipeline-audit.md` | Auth + attach correlation (older surface state) |
| `docs/handoffs/2026-07-21-attachment-continuity-*` | Continuity without remount; hard reload loses staging |
| `docs/handoffs/2026-07-19-pr179-attachment-e2e-investigation.md` | Remount / 401 / login redirect risks |
| `docs/handoffs/2026-07-15-ask-atlas-conversation-adoption-backend.md` | Server adoption of Ask Atlas orphans |
| `docs/audits/atlas-runtime-dead-code-inventory.md` | StrictMode removed; dead paths |

### Runtime evidence available but not executed in Phase A

Phase A did **not** restart services or run E2E. Existing harnesses that Phase B should use:

- `ghostClickShield` unit tests  
- `lib/attachments/__tests__/acceptance.test.tsx`  
- `attachmentContinuity.acceptance.test.ts` (API)  
- e2e `attach-pptx-ghost-click.spec.ts`  
- Optional `localStorage.setItem("atlas-attach-audit", "1")` instrumentation from prior audits  

---

## 7. Acceptance criteria — “conversation restored”

### 7.1 Definition

**Conversation restored** means a user can spend an extended session (text + screenshots + PDFs + PPTX + code + ideas) across Ask Atlas and Workspace **without the platform forcing them to restart, re-attach, or re-explain** because of remounts, redirects, lost drafts, empty handoffs, or model amnesia of files already shared in-thread.

### 7.2 Must-pass criteria (Milestone 1)

#### Attachments never “refresh” the conversation

| # | Criterion |
|---|-----------|
| AC-A1 | **Image** attach (gallery or camera) never remounts Ask Atlas / Workspace, never clears messages, never navigates to login solely due to attach. |
| AC-A2 | **PDF** attach never remounts / clears / login-redirects solely due to attach. |
| AC-A3 | **PPTX** attach never remounts / clears / login-redirects solely due to attach (including Android Documents picker return). |
| AC-A4 | Failed upload leaves the thread intact; chip is retryable; composer text preserved. |
| AC-A5 | Opening the file picker never triggers Exit Ask Atlas / surface toggle / home-reset (ghost click). |

#### Drafts survive

| # | Criterion |
|---|-----------|
| AC-D1 | Typed draft survives Ask Atlas file picker open/close. |
| AC-D2 | Typed draft survives Workspace file picker open/close. |
| AC-D3 | Staged attachments survive soft remount (ErrorBoundary auto-reset / surface flip) on both surfaces. |
| AC-D4 | After Documents hard reload mid-pick, user is not silently emptied: either staged metadata+rehydrate from finalized uploads survives, or a clear recoverable state is shown without wiping conversation history. |
| AC-D5 | Workspace typed draft survives soft remount (parity with Ask Atlas text draft). |

#### Ask Atlas → Workspace handoff preserves momentum

| # | Criterion |
|---|-----------|
| AC-H1 | Handoff / Commit / Crystallize from an active Ask Atlas thread transfers **that** thread’s messages (never an empty `nexusChat` snapshot). |
| AC-H2 | Landing in Workspace after handoff continues the same conversation id (adopted or linked); user sees prior turns. |
| AC-H3 | If a continuation kickoff is required, it fires even when history already loaded (`atlas-handoff-continuation` or equivalent single contract). |
| AC-H4 | Preferred navigation uses `/workspace/{conversationId}` (or equivalent that pins `initialConversationId` before first paint). |
| AC-H5 | User never has to paste the Ask Atlas transcript into Workspace to “catch it up.” |

#### History and identity

| # | Criterion |
|---|-----------|
| AC-C1 | Conversation history is preserved across soft remounts (reload from server thread if local state wiped). |
| AC-C2 | Mid-stream abort/disconnect recovers to persisted server messages without blanking the surface permanently. |
| AC-C3 | Auth expiry mid-session does not destroy staged work without recovery affordance (draft/attachments) where technically possible. |
| AC-C4 | Closing Ask Atlas accidentally during picker is refused or reversible; intentional close does not orphan server history. |

#### Model continuity (same hour, same thread)

| # | Criterion |
|---|-----------|
| AC-M1 | After user attaches a file and discusses it, a later turn in the **same** conversation can reference that file without requiring re-upload (Continuity V2 or equivalent always-on for restored conversations). |
| AC-M2 | Atlas does not claim “no attachment” when the file was provided earlier in the same thread and remains available. |
| AC-M3 | Multi-file messages keep all successful uploads linked; partial failure does not silently drop successful IDs. |

#### Product promise: code + ideas

| # | Criterion |
|---|-----------|
| AC-P1 | Code files (or an explicit supported code path) can be shared in the canonical Ask Atlas / Workspace composer without being silently blocked as `other`. |
| AC-P2 | FlowPanel / ActiveRuns either migrate to the canonical stack or are clearly non-conversation surfaces with no claim of unbroken chat. |

### 7.3 Recommended additional acceptance criteria

| # | Criterion | Why |
|---|-----------|-----|
| AC-X1 | Single conversation controller per surface (no dual `nexusChat` + `askAtlasConv` ownership for the same user-visible thread). | Prevents empty handoffs at the source. |
| AC-X2 | One handoff contract module; all entry points call it; no path navigates to Workspace without it. | Ends quiet-workspace races. |
| AC-X3 | No `window.location.href` for in-product Ask Atlas → Workspace navigation (wouter/`setLocation` only). | Avoids hard reload mid-thought. |
| AC-X4 | Destructive clears (Exit, New, shred) require confirmation **or** soft-archive with one-tap restore when message count &gt; 0. | Separates intentional end from accidental wipe. |
| AC-X5 | Attachment ownership + conversation ownership docs updated in the same PR as behavior changes. | Stops reactive reintroduction of fixed bugs. |
| AC-X6 | Hour-long soak E2E (or scripted) covering: text → image → PDF → PPTX → follow-up without re-attach → handoff → continue in Workspace. | Matches the milestone objective literally. |
| AC-X7 | Non-silent 401 during an active composer session prefers soft banner + pause over hard login redirect when recovery is possible. | Auth should interrupt politely, not erase thought. |

### 7.4 Explicit non-goals for “restored”

- Perfect survival of **unfinalized** File blobs across WebView process death without any recovery UX (may remain constrained by mobile memory).  
- Migrating every legacy `/api/chat` side-effect in `useChatStream` (larger than Milestone 1; must not block conversation continuity).  
- Redesigning Ask Atlas or Workspace visual language.

---

## 8. Recommended repair order (Phase B)

Order is **dependency-first**: fix ownership and identity before polishing chips.

### Wave 0 — Guardrails (docs + invariants)

1. Update `conversation-ownership.md` and `attachment-ownership.md` to match **current** `attachmentIds` + `useStagedAttachments` truth.  
2. Add a short “Unbroken Conversation invariants” checklist referenced by agent change rules.  
3. Freeze Phase B scope to the acceptance criteria above.

### Wave 1 — Single source of conversation truth on `/home`

4. Eliminate dual-controller handoff bugs: crystallize / `handleHandoff` / create-from-conversation must read **`askAtlasConv.messages`** (or collapse ambient `nexusChat` entirely).  
5. Decide: ambient home chat is deleted, or it is the only home controller — not both for the same continuity path.  
6. Soften Exit/toggle clear: do not wipe server-backed conversation id on accidental close; refuse Exit while picker pending (complete the ghost-click story).

### Wave 2 — Handoff continuity contract

7. Make `seedHandoffContinuation` (or successor) mandatory on every Workspace entry from Ask Atlas.  
8. Prefer `/workspace/{conversationId}` navigation; deprecate quiet `/project/:id` landings without pinned conversation.  
9. Replace hard `NAVIGATE_TO` `window.location.href` with in-app navigation + continuation seed.  
10. Verify adoption backend still reassigns orphan messages; add regression coverage for empty-transcript crystallize.

### Wave 3 — Draft + attach survival

11. Persist Workspace typed draft (parity with Ask Atlas `composerDraftStore`).  
12. Survive Documents hard reload for **finalized** attachment IDs (rehydrate chips from server metadata; do not revive File blobs via IDB if OOM risk remains).  
13. Keep / harden ghost click shield; add E2E for image, PDF, PPTX on Ask Atlas and Workspace.  
14. Ensure ErrorBoundary soft remount rehydrates messages from `/api/nexus/thread` when local stream state is empty but conversation id exists.

### Wave 4 — Auth without erasing thought

15. Expand silent/soft 401 handling for endpoints commonly hit during an active session (or add “composer session pause” instead of hard redirect).  
16. Audit `useRequireAuth` + remount refetch races after picker return.

### Wave 5 — Model continuity (same hour)

17. Enable Continuity V2 (or equivalent) for restored conversations by default; lock with acceptance tests.  
18. Ensure OutputGuard cannot gaslight the user about files present earlier in-thread.  
19. Multi-file partial failure: never drop successfully finalized IDs on send.

### Wave 6 — Consolidate parallel paths

20. Migrate FlowPanel / ActiveRuns attachment sends to `useAtlasConversation` + staged pipeline, **or** quarantine them as non-conversation tools.  
21. Resolve code-file support on the canonical matrix (or provide an explicit supported code-share path).  
22. Align ZIP drop with staged attachments vs code-context so drop intent is unambiguous.

### Wave 7 — Soak + acceptance lock

23. Implement AC soak harness (AC-X6).  
24. Gate Milestone 1 “done” on must-pass criteria in §7.2, not on individual bug tickets.

---

## 9. Out of scope / explicitly deferred

| Item | Why deferred |
|------|----------------|
| Visual redesign of Ask Atlas / Workspace | Milestone 1 is continuity, not aesthetics |
| Full `useChatStream` Phase-2 elimination | Large migration; only block when it breaks continuity |
| Re-enabling IDB File blob persistence | Previously OOM’d WebViews; needs a different design |
| TanStack router resurrection | Dead path; leave dead unless product rewires mounts |
| Non-conversation pickers (VisualVault, avatar) | Out of conversation interrupt scope |

---

## 10. Phase A constraints checklist

| Constraint | Status |
|------------|--------|
| No application code changes | **Honored** — this document only |
| No fixes / refactors | **Honored** |
| No service restarts | **Honored** |
| No dependency updates | **Honored** |
| Complete interruption inventory | **Delivered** (§4) |
| Attachment path inventory | **Delivered** (§3) |
| Acceptance criteria before repair | **Delivered** (§7) |
| Recommended repair order | **Delivered** (§8) |

---

## Appendix A — Severity summary

| Severity | IDs |
|----------|-----|
| **Critical** | INT-01, INT-02 |
| **High** | INT-03–13 |
| **Medium** | INT-14–26 |
| **Low / mitigated / dead** | INT-27–34 |

**Highest live risks for mid-conversation interruption:** confirmed API 401 → login (INT-01), ErrorBoundary remount (INT-03), Exit/toggle/clear around file pickers (INT-04/15), Documents hard reload during attach (INT-05), dual-controller empty handoff (INT-11), quiet workspace after handoff (INT-13), hard `NAVIGATE_TO` / OAuth navigations (INT-09/10).

**Highest continuity risk without UI remount:** attachment HARD RULE / Continuity V2 off (INT-12).

---

## Appendix B — “What unbroken looks like” (user narrative)

1. User opens Ask Atlas and starts talking.  
2. They attach a screenshot — thread stays, draft stays, no login flash.  
3. They attach a PDF and a PPTX — same.  
4. They keep chatting for many turns; Atlas still knows those files.  
5. They Commit / enter Workspace — the same conversation continues without re-prompting.  
6. They attach more in Workspace, navigate within the shell, survive a soft remount — drafts and history remain.  
7. An hour later, they have not repeated themselves because the platform blinked.

Anything that breaks that narrative is in scope for Milestone 1 Phase B.

---

*End of Phase A audit. Await review before Phase B: Repair.*
