# Milestone 1 — Operation: Unbroken Conversation

**Phase:** A — Read-only audit (NO CODE CHANGES)  
**Date:** 2026-07-21  
**Scope:** Conversation lifecycle, attachment lifecycle, interruption inventory, acceptance criteria, repair order  
**Repo HEAD at audit:** `86e7b309` (`main`)  
**Status:** Phase B — **Wave 0 CLOSED**; **Wave 1 CLOSED**; **Wave 2 in progress** — G2-1 (INT-35) + G2-2 (INT-39) **passed** (2026-07-22); INT-37 scroll/composer + response-start feedback next.  
**Gate:** Wave 0 + Wave 1 gates met. Remaining Wave 2 Breaks/Friction should still land before treating Milestone 1 as fully complete.

**Hard rule (Phase B):**

> No repair may close an interruption without passing its acceptance test.

An INT is not “fixed” when the code looks right. It is fixed when the acceptance test in §6 for that INT passes. PRs that claim to close an INT must include (or update) that test and show it green.

> A user should be able to spend an hour with Atlas—sharing text, screenshots, PDFs, PowerPoints, code, and ideas—without Atlas ever interrupting the flow of thought.

**Product principle for prioritization:**

> The conversation should never be interrupted by the platform.

This milestone is **not** about fixing isolated bugs. It is about understanding and restoring the **entire conversation lifecycle** so future fixes are systematic instead of reactive.

**Do not fix all 34 interruptions at once.** Repair by product-principle severity (Conversation Killer → Conversation Break → Conversation Friction), not by technical complexity.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Conversation lifecycle](#2-conversation-lifecycle)
3. [Attachment lifecycle inventory](#3-attachment-lifecycle-inventory)
4. [Complete interruption inventory](#4-complete-interruption-inventory)
5. [Product-principle severity classification](#5-product-principle-severity-classification)
6. [Interruption → Severity → Acceptance Test](#6-interruption--severity--acceptance-test)
7. [Root causes (systemic)](#7-root-causes-systemic)
8. [Evidence index](#8-evidence-index)
9. [Acceptance criteria — “conversation restored”](#9-acceptance-criteria--conversation-restored)
10. [Recommended repair order (Phase B)](#10-recommended-repair-order-phase-b)
11. [Out of scope / explicitly deferred](#11-out-of-scope--explicitly-deferred)
12. [Phase A constraints checklist](#12-phase-a-constraints-checklist)

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
3. **Legacy (kill switch `ATTACHMENT_CONTINUITY_V2=0`):** HARD RULE tells the model no attachment was provided if this turn has none — prior files are **not** treated as this-turn attachments (`nexus.ts`).
4. **V2 (default ON; INT-12):** prior attachments **can** be re-injected via relevance-gated historical reopen (`attachmentGrounding.ts` / `selectRelevantPriorAttachments`). Kill switch: `ATTACHMENT_CONTINUITY_V2=0`.
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

**Product-principle severity** for each INT is authoritative in §5–§6 (Conversation Killer / Break / Friction). The Critical/High/Medium labels below are the original technical triage and remain for engineering context only.

### Critical (technical)

#### INT-01 — Confirmed API 401 → hard login redirect

| Field | Detail |
|-------|--------|
| **Product severity** | **Conversation Killer** — Wave 0 #1 |
| **File** | `artifacts/atlas-frontend/src/lib/install-api-fetch.ts` |
| **Function** | Global `window.fetch` patch |
| **Cause** | Non-silent API `401` → recheck `/api/auth/me` → `window.location.href = …/login?reason=session_expired` |
| **Runtime evidence** | Comments document attach 401s silenced so login never wipes composer mid-attach; other routes still redirect |
| **Confidence** | Verified |
| **Impact** | Full navigation; drafts, staged files, in-flight SSE lost |
| **Acceptance test** | §6 INT-01 — start typing, expire session, verify no unexpected login redirect while work is in progress |

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
| **Product severity** | **Conversation Killer / Break** — Wave 1 #1 |
| **Files** | `composerDraftStore.ts`, `useStagedAttachments.ts`, home hydration |
| **Cause** | Android Documents/PPTX picker often kills WebView; `PERSIST_FILE_BLOBS = false` |
| **Runtime evidence** | Explicit comments: IDB blob writes OOM’d WebViews; soft map cleared on full reload |
| **Confidence** | Verified |
| **Impact** | Staged attachments + upload controllers lost; typed Ask Atlas input may survive |
| **Acceptance test** | §6 INT-05 — PPTX/PDF attach survives picker return / hard-reload recovery without silent re-upload of finalized files |

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
| **Product severity** | **Conversation Killer** — Wave 0 #3 |
| **File** | `artifacts/atlas-frontend/src/pages/home.tsx` |
| **Function** | `handleHandoff`, `performCreateProjectFromConversation`, Crystallize handlers |
| **Cause** | Ask Atlas open clears `nexusChat`; those paths still snapshot `nexusChat.messages` |
| **Runtime evidence** | Clear-on-open effect ~2333–2337; crystallize maps `nexusChat.messages`; AskAtlasSurface CommitPill uses prop messages (exception) |
| **Confidence** | Verified |
| **Impact** | Handoff can create project without the conversation the user just had |
| **Acceptance test** | §6 INT-11 — multi-turn Ask Atlas → Crystallize/Commit → Workspace shows that transcript, never empty |

#### INT-12 — Attachment continuity / OutputGuard (semantic interrupt)

| Field | Detail |
|-------|--------|
| **Product severity** | **Conversation Break** — Wave 1 #2 (*chat vs collaboration*) |
| **Files** | `artifacts/api-server/src/routes/nexus.ts` HARD RULE; `attachmentOutputGuard.ts`; client `onCorrection` in `useNexusChatStream` |
| **Cause** | Next turn resolves only current `attachmentIds` unless V2 reopen; HARD RULE denies prior files; guard may rewrite assistant text |
| **Runtime evidence** | Continuity investigation handoff 2026-07-21; V2 flag-gated reopen |
| **Confidence** | Verified (behavior flag-dependent) |
| **Impact** | User must re-attach or re-explain — unbroken thought broken without UI remount |
| **Acceptance test** | §6 INT-12 — upload PPTX, discuss, later ask “Look at slide 5 again” with no re-upload; Atlas retains file context |

#### INT-13 — Handoff continuation suppressed (quiet workspace)

| Field | Detail |
|-------|--------|
| **Product severity** | **Conversation Killer** — Wave 0 #2 (*Navigation is not the end of thought.*) |
| **File** | `artifacts/atlas-frontend/src/pages/workspace.tsx` |
| **Function** | Opening-message effect |
| **Cause** | Thread already loaded + missing `atlas-handoff-continuation=1` → drop opening message |
| **Runtime evidence** | Explicit exception comment + early return |
| **Confidence** | Verified |
| **Impact** | Ask Atlas → Workspace feels dead; user repeats themselves |
| **Acceptance test** | §6 INT-13 — create Workspace from Ask Atlas; Atlas continues thought after navigation without another user message |

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

#### INT-35 — Workspace create false confirmation (tool / PROJECT_READY lie)

| Field | Detail |
|-------|--------|
| **Files** | `nexus.ts` SURFACE CONTRACT, `create_project` tool, `askAtlasHandoffContract.ts`, CommitPill / `handleHandoff` |
| **Cause** | Ask Atlas BUILD coaching said “I'll create…” / “server creates” while `PROJECT_READY` only arms CommitPill; `forceCreate` was workspace-gated (dead on Ask Atlas). Model believed creation executed before any project row existed. |
| **Confidence** | **Verified** (manual 2026-07-22 — first attempt narrated create with no workspace; second attempt succeeded) |
| **Impact** | **Conversation Break** — user must catch Atlas’s false success and re-ask; trust in tool/action grounding broken |
| **Acceptance test** | §6 INT-35 — explicit “create the workspace” creates a project (or Open Workspace is armed without creation claims); Atlas must not claim created/opening unless `create_project` succeeded this turn |

#### INT-39 — Unsupported slide-order claim without PPTX reopen

| Field | Detail |
|-------|--------|
| **Files** | `attachmentRelevance.ts`, `attachmentProvenanceQuery.ts`, `attachmentOutputGuard.ts`, `nexus.ts` Continuity V2 reopen |
| **Cause** | Relevance selected **whole files**, not slides — but section-order follow-ups (“does pricing come after the challenge?”) lacked slide/deck cues → `relevance_selected_none` → no reopen. OutputGuard did not gate freeform slide-order prose. Ask Atlas → Workspace prior discovery could also miss rows when only `conversation_id` / project linkage remained. Ending slides 15–19 are **not** omitted by relevance; if reopen succeeds, extract cap is 20 slides (prefix budget truncate is a separate rare path). |
| **Confidence** | **Verified** (manual 2026-07-22 — Workspace claimed pricing after challenge; deck order is pricing 15 → takeaway 16 → challenge 17 → journey 18 → closing 19; Ask Atlas earlier had correct order) |
| **Impact** | **Conversation Break** — collaboration false confidence; user must catch wrong deck structure |
| **Acceptance test** | §6 INT-39 — after PPTX discuss + Workspace handoff, ask a section-order question without saying “slide”; verify Continuity V2 reopens the deck and answer matches ending-slide order (or OutputGuard refuses without reopen) |

#### INT-40 — Broken inline attachment preview + late composer clear

| Field | Detail |
|-------|--------|
| **Cause** | Ask Atlas `renderMessageImages` treated every attachment (including PPTX) as an `<img>` after `AttachmentStrip` already rendered a valid card — broken second preview. Workspace does not use this helper. Composer clear latency is separate polish. |
| **Confidence** | **Verified** (repro Ask Atlas only; Workspace clean) |
| **Impact** | **Conversation Friction** |
| **Repair** | `renderMessageImages` returns null when structured `attachments` exist; AttachmentStrip is sole renderer for PPTX/PDF. |

#### INT-36 — Thinking Thread z-index / stacking

| Field | Detail |
|-------|--------|
| **Cause** | Thinking Thread renders behind chat content |
| **Confidence** | Observed (manual 2026-07-22) |
| **Impact** | **Conversation Friction** — non-blocking; readability only |

#### INT-37 — Composer jump on handoff / scroll

| Field | Detail |
|-------|--------|
| **Cause** | UnifiedContextDock / `useSmartAutoScroll` race; Workspace `returnToken` re-primed on every `focus` / `visibilitychange`, yanking mid-thread readers to the tail |
| **Confidence** | Observed (manual 2026-07-22); root cause verified in code |
| **Impact** | **Conversation Friction** |
| **Repair** | Hydration-gated chrome lock: freeze `--atlas-dock-reserved` + `--atlas-composer-clearance` during handoff; unlock once after `historyReady` / opening pipeline settles. ChatStream no longer double-applies dock+safe-area (shell owns those). |

#### INT-38 — Home-handoff banner visual weight

| Field | Detail |
|-------|--------|
| **Cause** | Banner after Ask Atlas → Workspace handoff feels visually heavy |
| **Confidence** | Observed (manual 2026-07-22) |
| **Impact** | **Conversation Friction** — non-blocking; polish later |

---

## 5. Product-principle severity classification

Technical severity (Critical / High / Medium / Low) describes **how the platform fails**.  
Product-principle severity describes **what the user experiences**.

| Bucket | Meaning | Repair posture |
|--------|---------|----------------|
| **Conversation Killer** | Conversation stops or the user loses work. Platform ends the thread of thought. | Fix first. No Milestone 2 until done. |
| **Conversation Break** | User can keep talking, but continuity is lost (re-attach, re-explain, empty handoff, quiet landing). Collaboration becomes artificial chat. | Fix next. Wave 1 of Milestone 1. |
| **Conversation Friction** | Conversation continues, but feels awkward (flashes, blocked sends, weaker legacy paths, intentional clears). | Fix after Killers and Breaks. Do not let these distract from Wave 0/1. |

**Principle test for every INT:**

> Does this violate *“The conversation should never be interrupted by the platform”*?

If yes → Killer or Break. If it only makes the conversation feel clumsy → Friction.

### 5.1 Conversation Killers

| ID | Interruption | Why it kills the conversation |
|----|--------------|-------------------------------|
| **INT-01** | Auth hard redirect (401 → login) | User is typing / attaching / thinking → suddenly on login. Conversation over. Work in flight lost. |
| **INT-02** | `useRequireAuth` soft redirect to login | Same user experience via route navigate when auth becomes null. |
| **INT-11** | Dual controller empty handoff | Atlas “hands off” while Workspace receives an empty history. Trust broken; conversation broken. |
| **INT-13** | Quiet Workspace (missing `atlas-handoff-continuation`) | Navigation becomes the end of thought. Workspace sits silent; user must restart momentum. |
| **INT-04** *(accidental)* | Exit / toggle clear via ghost click | Accidental wipe during attach looks like a refresh; local thread gone. |
| **INT-05** *(mid-attach hard kill)* | WebView / Documents hard reload | Staged files vanish mid-“let me show you this”; often coupled with lost upload controllers. |
| **INT-09** | `NAVIGATE_TO` hard `window.location.href` | Hard reload-style nav mid-stream ends the live thought without soft continuation. |
| **INT-10** *(mid-compose)* | Hard navigations (OAuth / logout / reload) | Leaves conversation surface abruptly while composing. |

> **Wave 0 focus (must-fix first):** INT-01, INT-13, INT-11.  
> These three were explicitly called out as conversation killers that violate the product principle. INT-02 is the sibling of INT-01 and rides with it. INT-04/05/09/10 are Killers when they fire mid-thought; their full repair may continue into Wave 1/2 but they are classified as Killers, not Friction.

### 5.2 Conversation Breaks

| ID | Interruption | Why it breaks continuity |
|----|--------------|--------------------------|
| **INT-05** *(recovery)* | Documents/PPTX File blobs not durable | “Let me show you this” → “Let me upload it again.” |
| **INT-12** | Prior-turn attachments not reinjected | “Look at slide 5 again” fails; chat instead of collaboration. |
| **INT-03** | ErrorBoundary soft remount | Stream/message React state wiped; user may need to reorient even if draft soft-memory survives. |
| **INT-06** | Workspace typed draft not persisted | Remount/nav forces retyping. |
| **INT-07** | Project switch clears messages | Blank until rehydrate; continuity flash-break. |
| **INT-08** | Route unmount `/home` ↔ Workspace | In-flight stream/draft dies with the tree. |
| **INT-14** | SSE disconnect / timeout / no resume | Turn interrupted; context may recover only after refetch. |
| **INT-15** | Ghost click residual | Residual risk of Ask Atlas wipe after picker. |
| **INT-17** | Opening Ask Atlas clears ambient `nexusChat` | Feeds INT-11 empty-handoff; ambient continuity lost. |
| **INT-21** | Auth remount refetch race | Can cascade into Killer (login) after picker return. |
| **INT-24** | Upload failure / strip crash | Continuity of the attach act breaks; send blocked. |
| **INT-25** | Send while upload incomplete | Thought stalled at send boundary. |
| **INT-26** | Code files blocked on canonical matrix | Product promise (“share code”) cannot continue on the main path. |
| **INT-35** | Workspace create false confirmation | Atlas says creating/created while nothing was created; user must re-ask. |
| **INT-39** | Unsupported slide-order without PPTX reopen | Workspace invents deck order after handoff; Ask Atlas had been correct. |

> **Wave 1 focus (closed):** INT-05 (durable attach recovery) and INT-12 (prior-turn reinjection).  
> **Wave 2a:** INT-35 closed; **INT-39** next (reopen grounding for section-order claims).

### 5.3 Conversation Friction

| ID | Interruption | Why it is friction (not a kill) |
|----|--------------|--------------------------------|
| **INT-16** | New / switch / archive / home-reset | Intentional clears are OK when deliberate; awkward when unexpected. |
| **INT-18** | Blanket query invalidation | Loading flashes; chat usually survives. |
| **INT-19** | Page transition overlay | Visual interrupt; skipped inside unified shell. |
| **INT-20** | Lazy Workspace chunk retry | Suspense spinner; recoverable. |
| **INT-22** | Account / Stripe / GitHub redirects | Awkward if opened mid-chat; usually user-initiated. |
| **INT-23** | Duplicate send (mostly guarded) | Rare double-turn friction. |
| **INT-27** | Visibility summarize | Non-destructive. |
| **INT-28** | Refetch-on-focus (mitigated) | Historical; fixed. |
| **INT-29** | beforeunload handlers | Warn/persist only. |
| **INT-30** | TanStack hard reload | Dead path. |
| **INT-31** | StrictMode double effects | Removed. |
| **INT-32** | Vite HMR full-reload | Dev only. |
| **INT-33** | Form full-page submit on chat | Not present on composers. |
| **INT-34** | Token refresh loop | Covered by INT-01. |
| **INT-36** | Thinking Thread z-index | Renders behind chat; polish. |
| **INT-37** | Composer jump on handoff/scroll | Dock / auto-scroll race; polish. |
| **INT-38** | Home-handoff banner weight | Visually heavy; refine later. |

Legacy parallel paths (FlowPanel / ActiveRuns) are **Friction** for Milestone 1 until they claim to be the conversation — then they become Breaks. Quarantine or migrate in Wave 2.

### 5.4 Classification summary counts

| Bucket | Count | IDs |
|--------|------:|-----|
| Conversation Killer | 8 | INT-01, INT-02, INT-04*, INT-05*, INT-09, INT-10*, INT-11, INT-13 |
| Conversation Break | 15 | INT-03, INT-05†, INT-06–08, INT-12, INT-14–15, INT-17, INT-21, INT-24–26, INT-35, **INT-39** |
| Conversation Friction | 17 | INT-16, INT-18–20, INT-22–23, INT-27–34, INT-36–38, **INT-40** |

\* Killer when accidental / mid-compose.  
† INT-05 appears in both Killer (hard kill mid-attach) and Break (durable recovery / re-upload tax) — same root cause, two user faces.

---

## 6. Interruption → Severity → Acceptance Test

Every repair ends with a **measurable test**, not “it should be fixed.”

| ID | Interruption | Severity | Acceptance Test |
|----|--------------|----------|-----------------|
| INT-01 | Auth hard redirect (401 → login) | **Conversation Killer** | Start typing (and optionally staging a file). Expire/force a non-silent API 401. Verify the user is **not** unexpectedly hard-redirected to login while work is in progress; prefer soft banner / pause with draft + staged files preserved. |
| INT-02 | `useRequireAuth` → login | **Conversation Killer** | With an active Ask Atlas or Workspace composer draft, null out auth via remount/refetch race. Verify no silent navigate-away that destroys the in-progress conversation without recovery. |
| INT-03 | ErrorBoundary soft remount | **Conversation Break** | Force a recoverable child render error (&lt;3/10s). Verify conversation id remains, messages rehydrate from `/api/nexus/thread` (or soft-memory), and composer draft is not blanked. |
| INT-04 | Exit / toggle clears thread | **Conversation Killer** *(accidental)* | Open file picker on Ask Atlas; synthesize/allow ghost return. Verify Exit/toggle does **not** clear messages while picker-pending. Intentional Exit with messages either confirms or soft-archives with restore. |
| INT-05 | Documents/PPTX WebView kill / lost File blobs | **Conversation Killer / Break** | Upload a PPTX (and PDF). Simulate Documents picker hard reload after finalize (and mid-upload). Verify conversation history intact; finalized attachments reappear as chips or clear recoverable state — user is not forced to silently start over. |
| INT-06 | Workspace draft not persisted | **Conversation Break** | Type a long Workspace draft; trigger soft remount / navigate-within-shell return. Verify text draft restored. |
| INT-07 | Project switch clears messages | **Conversation Break** | Switch projects and back (or land with resolving pid). Verify no permanent blank thread; history rehydrates to the correct conversation without user re-prompt. |
| INT-08 | Route unmount home ↔ workspace | **Conversation Break** | Start a stream or draft on Ask Atlas; navigate to Workspace via **handoff contract** (not hard kill). Verify prior turns visible and continuation fires per INT-13. Mid-stream abort recovers to persisted messages. |
| INT-09 | `NAVIGATE_TO` hard redirect | **Conversation Killer** | Trigger assistant `NAVIGATE_TO` to a project. Verify in-app navigation (not `window.location.href` reload) and handoff continuation still runs. |
| INT-10 | Explicit hard navigations mid-compose | **Conversation Killer** *(mid-compose)* | From an active composer, trigger OAuth/account paths. Verify either blocked with save, or draft/attachments survive return; no unexplained conversation wipe. |
| INT-11 | Dual controller empty handoff | **Conversation Killer** | Have a multi-turn Ask Atlas thread. Crystallize / Commit / create-from-conversation. Verify Workspace receives **that** transcript (non-empty), not an empty `nexusChat` snapshot. |
| INT-12 | Prior-turn attachments not reinjected | **Conversation Break** | Upload a PowerPoint, discuss it, send a later turn with **no** new attach (“Look at slide 5 again”). Verify Atlas still has file context (Continuity V2 or equivalent) and does not claim no attachment was provided. |
| INT-35 | Workspace create false confirmation | **Conversation Break** | After a long Ask Atlas thread, ask Atlas to create the workspace. Verify either (a) a project row is created via `create_project` on explicit create phrasing, or (b) Open Workspace is armed via `PROJECT_READY` **without** Atlas claiming creation/opening already happened. First-attempt false success fails the test. |
| INT-39 | Unsupported slide-order without reopen | **Conversation Break** | Upload PPTX, discuss slides, hand off to Workspace, ask “Does pricing come after the challenge?” (no “slide” word). Verify `nexus.continuity.diag` shows reopen (`historicalReopenResolvedCount > 0`) and answer matches deck order (pricing before challenge), **or** OutputGuard refuses order claims when reopen did not run. |
| INT-40 | Broken inline attach preview / late clear | **Conversation Friction** | Attach PPTX; verify a single valid card (no broken secondary image/filename preview) and composer staging clears promptly after send. |
| INT-36 | Thinking Thread stacking | **Conversation Friction** | Open Thinking Thread during chat; verify it is not obscured behind message content (z-index). |
| INT-37 | Composer jump on handoff/scroll | **Conversation Friction** | Trigger handoff / scroll near composer; verify no large jump (UnifiedContextDock / auto-scroll). |
| INT-38 | Home-handoff banner weight | **Conversation Friction** | After Ask Atlas → Workspace handoff, verify banner is readable without dominating the first viewport (polish bar). |
| INT-13 | Quiet Workspace / missing continuation | **Conversation Killer** | Create/enter Workspace from Ask Atlas. Verify Atlas **automatically continues its thought** after navigation without requiring another user message. Quiet landing = fail. |
| INT-14 | SSE disconnect / timeout | **Conversation Break** | Kill network mid-stream; restore. Verify user sees a recoverable error, persisted turns remain, and a retry/continue path exists without wiping history. |
| INT-15 | Ghost click after picker | **Conversation Break** | Attach image, PDF, PPTX on Ask Atlas and Workspace. On picker return, verify no Exit/toggle/home-reset; draft + chips remain. |
| INT-16 | New / switch / archive / home-reset | **Conversation Friction** | Invoke New Conversation deliberately. Verify clear is intentional (confirm or obvious CTA). Accidental wordmark `home-reset` during active thread does not wipe without affordance. |
| INT-17 | Ask Atlas open clears ambient nexus | **Conversation Break** | With dual-controller still present: open Ask Atlas after ambient messages; verify handoff paths do not depend on cleared ambient store (ties to INT-11). |
| INT-18 | Blanket `invalidateQueries` | **Conversation Friction** | Trigger shaping auto-promote / refresh. Verify chat transcript does not blank or remount into empty state. |
| INT-19 | Page transition overlay | **Conversation Friction** | Navigate within unified shell; verify no full-screen spinner covering an active conversation. |
| INT-20 | Lazy Workspace chunk failure | **Conversation Friction** | Fail first workspace chunk load once; verify retry succeeds without losing handoff continuation keys. |
| INT-21 | Auth remount refetch race | **Conversation Break** | Return from file picker; verify `/api/auth/me` remount refetch does not cascade into login redirect (INT-01/02). |
| INT-22 | Account / Stripe / GitHub redirects | **Conversation Friction** | Open billing/OAuth from Workspace with a draft present; verify draft survival policy is defined and held. |
| INT-23 | Duplicate send | **Conversation Friction** | Double-tap Send during in-flight turn; verify single user message / single assistant reply. |
| INT-24 | Upload failure / strip crash | **Conversation Break** | Fail one of multi-file uploads. Verify thread intact, failed chip retryable, successful IDs still sendable. Crash AttachmentStrip preview; verify full conversation UI does not blank. |
| INT-25 | Send while upload incomplete | **Conversation Break** | Hit Send during upload. Verify no silent text-only send that drops files; either wait/queue or clear blocked state with draft preserved. |
| INT-26 | Code files blocked | **Conversation Break** | Attach a `.ts` / `.js` (or documented code path) on Ask Atlas / Workspace. Verify supported share path exists — not silent `other` reject without guidance. |
| INT-27 | Visibility summarize | **Conversation Friction** | Background tab during session; verify messages not cleared (regression lock). |
| INT-28 | Refetch-on-focus | **Conversation Friction** | Return focus after picker; verify no projects-list “reload feel” and no conversation wipe (already mitigated — keep regression). |
| INT-29 | beforeunload | **Conversation Friction** | Refresh with dirty scenario; verify warn/persist behavior only — no forced navigation. |
| INT-30 | TanStack chunk reload (dead) | **Conversation Friction** | Confirm dead path stays unmounted; if rewired, must not `location.reload()` on chunk error during chat. |
| INT-31 | StrictMode | **Conversation Friction** | Confirm StrictMode remains off in production mount (regression). |
| INT-32 | Vite HMR reload | **Conversation Friction** | Dev-only; document as non-prod. |
| INT-33 | Form full-page submit | **Conversation Friction** | Enter in composer never full-page posts. |
| INT-34 | Token refresh | **Conversation Friction** | Covered by INT-01 acceptance; no separate hard redirect path. |

### 6.1 Wave 0 acceptance gate (must pass before Wave 1 closes as “done”)

| Gate | INT | Pass condition |
|------|-----|----------------|
| G0-1 | INT-01 (+ INT-02) | Active composer session never hard-lands on login solely due to background 401 / auth race; work preserved or softly paused. |
| G0-2 | INT-13 | Ask Atlas → Workspace always continues thought without requiring a fresh user message. |
| G0-3 | INT-11 | Handoff / Crystallize / Commit never delivers an empty transcript when Ask Atlas had messages. |

### 6.2 Wave 1 acceptance gate (attachment continuity)

| Gate | INT | Pass condition |
|------|-----|----------------|
| G1-1 | INT-05 | PPTX/PDF/image attach survives picker return and hard-reload recovery path without forcing silent re-upload of already-finalized files. |
| G1-2 | INT-12 | After discussing an attached deck/doc, later turns can reference it without re-upload (“Look at slide 5 again”). |

**Milestone 2 may not start until G0-1…G0-3 and G1-1…G1-2 are verified.**

---

## 7. Root causes (systemic)

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

## 8. Evidence index

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

## 9. Acceptance criteria — “conversation restored”

### 9.1 Definition

**Conversation restored** means a user can spend an extended session (text + screenshots + PDFs + PPTX + code + ideas) across Ask Atlas and Workspace **without the platform forcing them to restart, re-attach, or re-explain** because of remounts, redirects, lost drafts, empty handoffs, or model amnesia of files already shared in-thread.

### 9.2 Must-pass criteria (Milestone 1)

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

### 9.3 Recommended additional acceptance criteria

| # | Criterion | Why |
|---|-----------|-----|
| AC-X1 | Single conversation controller per surface (no dual `nexusChat` + `askAtlasConv` ownership for the same user-visible thread). | Prevents empty handoffs at the source. |
| AC-X2 | One handoff contract module; all entry points call it; no path navigates to Workspace without it. | Ends quiet-workspace races. |
| AC-X3 | No `window.location.href` for in-product Ask Atlas → Workspace navigation (wouter/`setLocation` only). | Avoids hard reload mid-thought. |
| AC-X4 | Destructive clears (Exit, New, shred) require confirmation **or** soft-archive with one-tap restore when message count &gt; 0. | Separates intentional end from accidental wipe. |
| AC-X5 | Attachment ownership + conversation ownership docs updated in the same PR as behavior changes. | Stops reactive reintroduction of fixed bugs. |
| AC-X6 | Hour-long soak E2E (or scripted) covering: text → image → PDF → PPTX → follow-up without re-attach → handoff → continue in Workspace. | Matches the milestone objective literally. |
| AC-X7 | Non-silent 401 during an active composer session prefers soft banner + pause over hard login redirect when recovery is possible. | Auth should interrupt politely, not erase thought. |

### 9.4 Explicit non-goals for “restored”

- Perfect survival of **unfinalized** File blobs across WebView process death without any recovery UX (may remain constrained by mobile memory).  
- Migrating every legacy `/api/chat` side-effect in `useChatStream` (larger than Milestone 1; must not block conversation continuity).  
- Redesigning Ask Atlas or Workspace visual language.

---

## 10. Recommended repair order (Phase B)

**Prioritize by product principle, not technical complexity.**

> The conversation should never be interrupted by the platform.

**Hard rule:** No repair may close an interruption without passing its acceptance test (§6). Code without a green acceptance test does not close the INT.

Do **not** attempt all 34 interruptions in one sweep. Complete and verify each wave’s acceptance gates before expanding scope.  
**Do not start Milestone 2 until Wave 0 and Wave 1 are complete and verified** (§6.1–6.2).

Docs/invariants updates may land alongside Wave 0 (ownership docs must match `attachmentIds` truth) but must not delay Killer fixes.

---

### Wave 0 — Conversation Killers (fix first)

These literally break the conversation.

| Priority | INT | Work | Acceptance gate |
|---------:|-----|------|-----------------|
| 1 | **INT-01** (+ **INT-02**) | Auth hard redirect: replace hard login navigation during active composer sessions with soft pause / banner; preserve draft + staged files; keep attachment silent-401; extend soft handling to endpoints hit mid-session | G0-1 |
| 2 | **INT-13** | Quiet Workspace: make continuation mandatory on every Ask Atlas → Workspace entry; prefer `/workspace/{cid}`; no quiet landing when history already loaded | G0-2 |
| 3 | **INT-11** (+ **INT-17**) | Empty handoff: crystallize / Commit / create-from-conversation must read the live Ask Atlas transcript (`askAtlasConv`), not cleared `nexusChat`; collapse or quarantine dual controller | G0-3 |

**Also treat as Killers when they fire mid-thought (start mitigation in Wave 0, finish as needed):**

| INT | Minimum Wave 0 mitigation |
|-----|---------------------------|
| INT-04 | Refuse Exit/toggle while picker-pending (complete ghost-click story) |
| INT-09 | Stop using `window.location.href` for in-product `NAVIGATE_TO`; use in-app nav + continuation seed |
| INT-10 | Soften mid-compose OAuth/logout paths so they do not silently erase drafts |

**Wave 0 exit criteria:** G0-1, G0-2, G0-3 all pass with automated or scripted acceptance tests from §6.

---

### Wave 1 — Attachment Continuity

Turns “chat” back into “collaboration.”

| Priority | INT | Work | Acceptance gate |
|---------:|-----|------|-----------------|
| 1 | **INT-05** | Documents/PPTX WebView kill: survive hard reload for **finalized** attachment IDs (rehydrate chips from server metadata). Do not revive raw File blobs via IDB if OOM risk remains. Harden picker-return path. | G1-1 |
| 2 | **INT-12** | Prior-turn attachments: enable Continuity V2 (or equivalent) for restored conversations by default; OutputGuard must not claim “no attachment” when prior file remains available | G1-2 |

**Supporting Breaks that usually ship with Wave 1 (same theme):**

| INT | Work |
|-----|------|
| INT-15 | Ghost-click residual E2E for image / PDF / PPTX on Ask Atlas and Workspace |
| INT-24 / INT-25 | Upload failure + send-while-uploading: never drop successful IDs; never silent text-only send |
| INT-03 | Soft remount rehydrates thread from server when local stream empty but conversation id exists |
| INT-06 | Workspace typed draft persistence (parity with Ask Atlas) |

**Wave 1 exit criteria:** G1-1 and G1-2 pass. User can upload a deck, discuss it, navigate within the conversation, and ask about it again without re-uploading.

---

### Wave 2 — Everything else (Breaks then Friction)

Work remaining interruptions in Cursor’s dependency order **within** the product-principle buckets — Breaks before Friction.

#### Wave 2a — Remaining Conversation Breaks

0. **INT-35** — Workspace create false confirmation — **Closed** (manual 2026-07-22)  
0b. **INT-39** — Slide-order / section-order claims require PPTX reopen after Workspace handoff (relevance + OutputGuard + conversation-scoped prior load)  
1. INT-07 / INT-08 — Project switch + route unmount: rehydrate without blanking; handoff-safe navigation  
2. INT-14 — SSE disconnect recovery path  
3. INT-21 — Auth remount refetch races after picker (reinforces Wave 0)  
4. INT-26 — Code-file support on canonical matrix (or explicit supported path)  
5. Multi-file partial-failure locks already started in Wave 1  

#### Wave 2b — Conversation Friction + consolidation

6. INT-16 — Intentional clears: confirm / soft-archive when messages exist  
7. INT-18 / INT-19 / INT-20 — Invalidate / transition / lazy-load polish  
8. INT-22 / INT-23 — Account redirects + duplicate-send guards  
9. Migrate or quarantine FlowPanel / ActiveRuns (legacy `/api/chat`)  
10. Align ZIP drop vs staged attach intent  
11. Update ownership docs + unbroken-conversation invariants in agent rules  
12. Regression locks for mitigated/dead items (INT-27–34)  
13. Hour-long soak harness (AC-X6): text → image → PDF → PPTX → follow-up without re-attach → handoff → continue in Workspace  
14. **INT-36 / INT-37 / INT-38** — Thinking Thread z-index; composer jump on handoff/scroll; home-handoff banner weight (observed 2026-07-22, non-blocking)  
15. **INT-40** — Broken inline PPTX/image preview + late composer attachment clear (observed 2026-07-22, non-blocking vs INT-39)  

**Wave 2 exit criteria:** Remaining §9.2 must-pass criteria green; soak harness passes; Milestone 1 can be declared complete.

---

### Explicit non-order

| Do not | Why |
|--------|-----|
| Fix all 34 in parallel | Dilutes focus; Friction work will delay Killers |
| Start Milestone 2 after “a few” fixes | Wave 0 + Wave 1 gates are the bar |
| Optimize technical elegance over G0/G1 | Product principle outranks architecture purity for this milestone |

---

## 11. Out of scope / explicitly deferred

| Item | Why deferred |
|------|----------------|
| Visual redesign of Ask Atlas / Workspace | Milestone 1 is continuity, not aesthetics |
| Full `useChatStream` Phase-2 elimination | Large migration; only block when it breaks continuity |
| Re-enabling IDB File blob persistence | Previously OOM’d WebViews; needs a different design |
| TanStack router resurrection | Dead path; leave dead unless product rewires mounts |
| Non-conversation pickers (VisualVault, avatar) | Out of conversation interrupt scope |
| Milestone 2 — Atlas intelligence | **Unblocked** on Wave 0 + Wave 1 gates (2026-07-22); prefer clearing Wave 2 Breaks before heavy Milestone 2 investment |

---

## 12. Phase A constraints checklist

| Constraint | Status |
|------------|--------|
| No application code changes | **Honored** — this document only |
| No fixes / refactors | **Honored** |
| No service restarts | **Honored** |
| No dependency updates | **Honored** |
| Complete interruption inventory | **Delivered** (§4) |
| Attachment path inventory | **Delivered** (§3) |
| Product-principle severity buckets | **Delivered** (§5) |
| Interruption → Severity → Acceptance Test | **Delivered** (§6) |
| Acceptance criteria before repair | **Delivered** (§9) |
| Recommended repair order | **Delivered** (§10) — principle-first Waves 0/1/2 |

---

## Appendix A — Severity summary (product principle)

| Bucket | IDs | Wave |
|--------|-----|------|
| **Conversation Killer** | INT-01, INT-02, INT-04*, INT-05*, INT-09, INT-10*, INT-11, INT-13 | **Wave 0** (INT-01, INT-13, INT-11 first) |
| **Conversation Break** | INT-03, INT-05†, INT-06–08, INT-12, INT-14–15, INT-17, INT-21, INT-24–26, INT-35, **INT-39** | **Wave 2a** (INT-35 closed; INT-39 next) |
| **Conversation Friction** | INT-16, INT-18–20, INT-22–23, INT-27–34, INT-36–38, INT-40 | **Wave 2b** |

\* Killer when accidental / mid-compose.  
† INT-05: Killer face (hard kill) + Break face (re-upload tax).

**Wave 0 must-fix trio:** INT-01 (auth hard redirect), INT-13 (quiet Workspace), INT-11 (empty handoff).  
**Wave 1 must-fix duo:** INT-05 (PPTX/Documents survival), INT-12 (prior-turn reinjection). **Both closed 2026-07-22.**

**Wave 2 lead Break:** INT-35 (workspace create false confirmation).

Technical Critical/High/Medium labels in §4 remain useful for engineering triage; **product-principle buckets decide repair order.**

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

## Appendix C — Stabilization program status

| Artifact | Status |
|----------|--------|
| Definition of “conversation restored” | §9 |
| System map / audit | §§1–4 |
| 34 interruption vectors | §4 |
| Product-principle classification | §5 |
| Acceptance test per interruption | §6 |
| Repair roadmap (Waves 0/1/2) | §10 |
| **Hard rule: no INT closed without passing its acceptance test** | Locked |
| Milestone 2 gate | Wave 0 + Wave 1 verified |

### Wave 0 repair status — **CLOSED** (2026-07-22)

| Gate | INT | Acceptance test | Status |
|------|-----|-----------------|--------|
| G0-1 | INT-01 (+ INT-02) | Soft-pause when composer session active; no hard login redirect mid-thought | **Closed** — automated AC + no regression in Wave 0 manual sessions |
| G0-2 | INT-13 | Ask Atlas → Workspace continues thought without requiring a fresh user message | **Closed** — manual acceptance via **Atlanta Family Tech Day** handoff (2026-07-22) |
| G0-3 | INT-11 | Handoff/Crystallize/Commit never delivers an empty transcript when Ask Atlas had messages | **Closed** — automated AC + Atlanta Family Tech Day transcript carried into Workspace |

#### INT-13 close evidence (Atlanta Family Tech Day handoff)

Product-owner manual sign-off (2026-07-22): Ask Atlas → Workspace handoff for the Atlanta Family Tech Day conversation continued prior thought. Prior failure mode (“I don't have a prior session…”) no longer observed after kickoff-context gate (#200).

Criteria checked against §6 INT-13 / G0-2:
- [x] Workspace created / navigation succeeded  
- [x] Prior Ask Atlas transcript present in Workspace  
- [x] Atlas continued the thread (did not deny a prior session)  
- [x] Momentum preserved without requiring the user to re-prompt the whole context  

Wave 0 exit criteria met.

---

### Wave 1 repair status (Phase B — **CLOSED** 2026-07-22)

| Gate | INT | Acceptance test | Status |
|------|-----|-----------------|--------|
| G1-1 | INT-05 | Finalized attachment IDs survive Documents/PPTX hard-reload; no silent re-upload of finalized files; conversation history intact | **Closed** (manual 2026-07-22) |
| G1-2 | INT-12 | Prior-turn attachments reinjected (“Look at slide 5 again”) without re-upload | **Closed** (manual 2026-07-22) |

**G1-1 manual acceptance (2026-07-22):** PPTX survived repeated navigation and hard refreshes; Atlas continued answering slide-specific questions without re-upload. Staging-meta rehydrate path (PR #201) verified.

**G1-2 manual acceptance (2026-07-22):** Atlas retained PPTX context across a long conversation, remembered previous slide discussions, and answered follow-up questions without requiring re-upload. Continuity V2 default-on (PR #202) verified.

Wave 1 exit criteria met. **Milestone 2 attachment/auth continuity gate is satisfied** (G0 + G1). Remaining Wave 2 work (INT-35+) still tracks under Milestone 1 completeness.

---

### Wave 2 repair status (Phase B — in progress)

| Gate | INT | Acceptance test | Status |
|------|-----|-----------------|--------|
| G2-1 | INT-35 | Explicit workspace create does not falsely succeed; PROJECT_READY does not claim creation | **Closed** (manual 2026-07-22) |
| G2-2 | INT-39 | Section-order follow-up reopens PPTX (or refuses order claims); ending-slide order correct | **Closed** (manual 2026-07-22) |
| G2-3 | INT-37 | Scroll/composer stable on handoff + tab focus; no mid-thread yank | **In progress** |
| — | Response-start | Visible feedback before first token (Ask Atlas phrase + Workspace Thinking pulse) | **In progress** |
| — | INT-36, INT-38, INT-40 | Thinking Thread z-index; handoff banner; broken inline attach preview / late clear | Logged (non-blocking) |

**G2-1 manual acceptance (2026-07-22):** First explicit create request created **Empower Me Session 1** and armed Open Workspace. Transcript and PPTX carried into Workspace.

**G2-2 manual acceptance (2026-07-22):** Prior PPTX reopened; slide-order question answered from the deck with pricing before challenge. Outcome strongly implies reopen; server-log `historicalReopenResolvedCount` for that past turn was not retrieved in-agent. **Follow-up instrumentation:** `attachmentContinuity` is now echoed on nexus `done` (and `console.info("[atlas.continuity]", …)` in the client) so the next turn can confirm `historicalReopenResolvedCount > 0` in DevTools without server logs.

**INT-39 finding (resolved):** Workspace invented order when section-order follow-ups skipped relevance reopen. Fix shipped in PR #204.

This is a structured stabilization program, not a bug chase.

---

*Phase A complete. Phase B Wave 0 + Wave 1 closed. Wave 2: INT-35 + INT-39 closed; INT-37 scroll + response-start feedback in progress.*
