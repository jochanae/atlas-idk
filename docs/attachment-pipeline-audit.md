# Attachment Pipeline Audit — Ask Atlas & Workspace

**Branch:** `cursor/attachment-pipeline-audit-a0f7`  
**Date:** 2026-07-17  
**Scope:** Read-only audit → instrumentation → proven root causes → separated fixes → acceptance tests.

Enable runtime event capture:

```js
localStorage.setItem("atlas-attach-audit", "1")
// or ?attachAudit=1
window.__atlasAttachAudit.dump()
window.__atlasAttachAudit.summary()
```

---

## Executive verdict

| Symptom | What it actually is |
|---|---|
| Attach image → type (no send) → “redirect / logout / refresh” | **Typing itself triggers no network and no navigation.** Correlated causes are (a) file-picker blur/focus side effects, (b) concurrent API `401` → hard login redirect, or (c) soft remount that clears in-memory draft (looks like a reset). |
| Attachments “don’t work” in Workspace | **Proven bug:** Nexus composer override sent **text only** and ignored `attachedFiles`. Ask Atlas sends attachments correctly. |
| Recent auth `staleTime: Infinity` change | **Masks session expiry** on the React Query auth path. Unrelated to keystrokes. Softened to finite staleTime while keeping `refetchOnWindowFocus: false`. |

Ask Atlas and Workspace share the **same Nexus attachment transport contract** (`attachments: { base64, mediaType, name? }[]` → `POST /api/nexus/chat`) but Workspace’s live composer **was not using it**.

---

## Surface comparison

### Ask Atlas composer

| Concern | Implementation |
|---|---|
| File-input handler | `ComposerActions` (`scope="ask-atlas"`) → `onFiles` → `home.tsx` `setAttachedFiles` |
| Attachment state | `home.tsx` `useState<File[]>` (max 10) |
| Text/draft state | `home.tsx` `input` / `setInput` |
| Draft persistence | **None** (remount clears text + files) |
| Conversion / upload on attach | **None** — `File` + blob URL only |
| Conversion on send | `fileToBase64Safe` → `askAtlasChat.send({ attachments })` |
| Image preview | `AskAtlasSurface` object URLs |
| Auth hooks | `useRequireAuth()` on Home |
| Network on attach | **None** |
| Network on text change | **None** |
| Navigation | `useRequireAuth` → `/login`; `install-api-fetch` → `/login?reason=session_expired` on confirmed 401 |
| Error boundary | App-level only (`App.tsx`) |
| Send endpoint | `POST /api/nexus/chat` |
| Artifact storage | Request body only; **DB persists message text, not attachment bytes** |

### Workspace composer

| Concern | Implementation |
|---|---|
| File-input handler | Same `ComposerActions` (`scope="ws"`) + legacy `#ws-file-input` |
| Attachment state | `useComposerDraft().attachedFiles` |
| Text/draft state | `useComposerDraft().input` |
| Draft persistence | **None** |
| Conversion on attach | **None** (ZIP → client `processZip` text context; separate path) |
| Conversion on send | **Was broken** (Nexus override dropped files). **Fixed** to use `filesToNexusAttachments` → `nexusBridge.send(text, attachments)` |
| Image preview | `ChatComposer` object URLs |
| Auth hooks | `useRequireAuth()` on Workspace |
| Network on attach | None for images; ZIP code-context calls missing `/api/upload/code-context` |
| Network on text change | Only if URL detected → `/api/url-intelligence` |
| Send endpoint | `POST /api/nexus/chat` via bridge (`useNexusWorkspaceChat = true`) |
| Classic `/api/chat` path | Still instantiated but overridden for composer sends |

---

## Auth change audit (`useAuth.ts`)

**Replit speculative commit `40918849`:**

```ts
staleTime: Infinity,
refetchOnMount: false,
refetchOnWindowFocus: false,
refetchOnReconnect: false,
```

| Setting | Effect on attach bug | Effect on session safety |
|---|---|---|
| `refetchOnWindowFocus: false` | Helps — file picker blurs/focuses tab | OK if other 401 paths remain |
| `refetchOnReconnect: false` | Helps avoid reconnect races | Delays detection until next API call |
| `staleTime: Infinity` + `refetchOnMount: false` | Unrelated to typing | **Masks expired/revoked sessions** until hard reload |

**Also present:** `home.tsx` had `refetchOnWindowFocus: true` on `useListProjects` — focus return after picker could refetch projects (and trip 401 → login via `install-api-fetch`). Set to `false`.

**Applied policy (this PR):**

```ts
staleTime: 5 * 60 * 1000,   // finite — remount can revalidate
refetchOnMount: true,
refetchOnWindowFocus: false, // keep — protects file-picker return
refetchOnReconnect: false,
```

Session expiry still detected via: (1) stale remount refetch of `/api/auth/me`, (2) any API `401` confirmed by `/api/auth/me` in `install-api-fetch.ts`.

---

## What Atlas can actually inspect vs display

| Type | Accepted | Uploaded raw? | Model understands? | Persist? | Reopen? | Promote to Workspace? |
|---|---|---|---|---|---|---|
| Images (jpeg/png/gif/webp) | `*/*` picker; model wants image/* | Client base64 (resize if >4.5MB / >7000px) | **Yes** multimodal (Ask Atlas; Workspace after fix) | Text only — **bytes not in DB** | **No** bytes | Up to 4 images via `sessionStorage` once |
| PDF | Same picker | Client base64 | **Yes** Claude document blocks (Ask Atlas) | No | No | **Not** in promote path (images only) |
| DOCX / other docs | Picker allows | Base64 | **No** — treated as image / ignored | No | No | No |
| Spreadsheets | Picker allows | Base64 | **No** structured parse | No | No | No |
| ZIP | Separate | Client unpack → text context; or `zip-import` | Text dump into `/api/chat` context; Nexus does not auto-inject | ZIP import DB yes | Project-scoped | N/A |
| Video | Camera accept | — | **No** | No | No | No |
| Library items | Separate API | Text context | Reinjected each Ask Atlas turn | Yes | Yes | Separate |

**First turn only for pixels/docs:** history stores `content` text; subsequent turns do not re-send prior attachment bytes unless Library/ZIP context applies.

**Failure UX:** encode failures often swallowed; oversized base64 skipped server-side with log; 413 → “Images are too large…”; max 10 toast on home.

---

## Root causes (separated)

### RC1 — Workspace Nexus send drops attachments
- **Files:** `workspace.tsx` Nexus `handleSend`/`doSend` override; `useNexusWorkspaceBridge.ts`
- **Proof:** override called `nexusBridge.send(text)` only; bridge required non-empty text
- **Fix:** convert `attachedFiles` via `filesToNexusAttachments`, pass to `send`; allow attachment-only
- **Status:** Fixed in this PR

### RC2 — Auth Infinity masks session expiry (speculative anti-logout)
- **Files:** `useAuth.ts`
- **Proof:** `staleTime: Infinity` + `refetchOnMount: false` never revalidates auth query
- **Not the attach→type keystroke cause**, but unsafe as a permanent “fix”
- **Fix:** finite staleTime + mount revalidate; keep focus refetch off
- **Status:** Fixed in this PR

### RC3 — Projects list refetch on window focus (Ask Atlas / home)
- **Files:** `home.tsx` `useListProjects`
- **Proof:** `refetchOnWindowFocus: true` while global default is false; file picker returns focus
- **Can cause:** loading flash / 401 → login correlation after attach
- **Fix:** `refetchOnWindowFocus: false`
- **Status:** Fixed in this PR

### RC4 — No composer draft persistence
- **Files:** `useComposerDraft.ts`, `home.tsx` input/files state
- **Proof:** comments + code — memory only
- **Effect:** any remount looks like “lost session / refresh”
- **Fix:** deferred (separate PR) — sessionStorage draft by conversation id
- **Status:** Documented, not implemented

### RC5 — Attachment bytes not persisted
- **Files:** `nexus.ts` message insert; schemas
- **Effect:** reopen / promote cannot re-inspect prior files (except one-shot opening images)
- **Fix:** deferred — object storage + message attachment metadata
- **Status:** Documented, not implemented

### RC6 — File-input CSS reposition (Replit)
- **Files:** `ComposerActions.tsx`, `ChatComposer.tsx`
- **Change:** absolute 1×1 → fixed offscreen
- **Assessment:** Unlikely root cause of login redirect; left in place as harmless picker compatibility tweak

### RC7 — Historical PDF send → project creation hard nav
- **Files:** `home.tsx` Ask Atlas gate
- **Status:** Previously mitigated for surface-open path; early `hasImages`-only gate tightened to `hasFiles` in this PR

---

## Event order for attach → type (expected, healthy)

```
picker_opened
→ (visibility_change hidden / window_blur)   // native picker
→ file_selected
→ attachment_state_updated
→ composer_rerendered
→ (visibility_change visible / window_focus)
→ text_changed (×n)
```

**Failure signatures to look for in `__atlasAttachAudit.summary()`:**

| Signature | Meaning |
|---|---|
| `… → auth_response 401 → window_location_change …/login?reason=session_expired` | True login redirect |
| `… → router_navigation useRequireAuth → /login` | Soft navigate from null user |
| `… → component_unmount AskAtlasSurface/ChatComposer → component_mount` without location change | Soft remount / state loss |
| `… → error_boundary` | Crash → blank shell |
| `text_changed` with **no** network/nav | Healthy (bug is elsewhere / perceived) |

---

## Production acceptance tests

Vitest: `src/lib/__tests__/attachmentPipeline.acceptance.test.ts`

Manual / Playwright matrix (minimum):

| # | Case | Ask Atlas expect | Workspace expect |
|---|---|---|---|
| 1 | Image only, send | Multimodal turn | Multimodal turn (after RC1) |
| 2 | Image + typed text | Both in payload | Both in payload |
| 3 | Document + typed text | PDF as document block | PDF in attachments[] |
| 4 | Cancel picker | No state change; audit `file_selected` count 0 | Same |
| 5 | Multiple attachments | Cap 10 | Cap 10 |
| 6 | Oversized file | Client resize or 413 toast | Same |
| 7 | Unsupported file | May send as base64; model may ignore | Same |
| 8 | Attach, wait 5 min, type | Stay logged in; draft still present | Same |
| 9 | Attach and send | Persists as text row; image not reloaded from DB | Same |
| 10 | Reopen, ask about prior attachment | Model lacks bytes unless user re-attaches | Same |
| 11 | Promote to Workspace, ask again | Opening images once via sessionStorage | After first send, no retained bytes |

Instrumentation checklist for #8: enable `atlas-attach-audit`, confirm no `window_location_change` to login during wait+type.

---

## Same attachment contract?

| Layer | Shared? |
|---|---|
| Picker UI (`ComposerActions`) | Yes |
| Staging (`File[]` + blob preview) | Yes (pattern) |
| Convert (`fileToBase64Safe` / `filesToNexusAttachments`) | Yes after fix |
| Transport (`useNexusChatStream` → `/api/nexus/chat`) | Yes |
| Live Workspace composer wiring | **Was No → Yes after RC1** |
| Persistence of bytes | Shared gap (neither persists) |
| Library context | Ask Atlas only |
| ZIP text context | Workspace-oriented; not Nexus-injected |

---

## Files touched in this PR

- `src/lib/attachAuditLog.ts` — temporary instrumentation
- `src/lib/composerAttachments.ts` — shared convert helper
- `src/lib/__tests__/attachmentPipeline.acceptance.test.ts`
- `src/main.tsx`, `App.tsx`, `install-api-fetch.ts`
- `hooks/useAuth.ts`, `hooks/useNexusWorkspaceBridge.ts`
- `components/composer/ComposerActions.tsx`
- `components/home/AskAtlasSurface.tsx`
- `components/workspace/ChatComposer.tsx`
- `pages/home.tsx`, `pages/workspace.tsx`
- `docs/attachment-pipeline-audit.md` (this file)
