# Atlas Runtime & Dead-Code Inventory

> Read-only audit. Repository evidence → runtime entry → mounted behavior. No fixes applied.
> Scope: `/dev-server` monorepo (`jochanae/atlas-idk`). Primary frontend `artifacts/atlas-frontend/`, alternate `artifacts/atlas-frontend-next/`, backend `artifacts/api-server/`, shared `lib/`.
>
> This audit leans on three pre-existing, git-tracked architecture documents that already encode extensive reachability analysis for the conversation stack:
> - `docs/architecture/runtime-map.md`
> - `docs/architecture/attachment-ownership.md`
> - `docs/architecture/conversation-ownership.md`
>
> Their claims were spot-checked against the current tree (see citations below) and are treated as corroborating evidence, not taken on faith. Where this audit's independent `rg` results diverge from those docs, the divergence is called out explicitly.
>
> **Revision note (this pass):** this revision merges an independent re-verification pass (formerly staged as a standalone "§12 Resolution pass") directly into the sections below, replacing prior UNKNOWN/truncated entries with resolved, cited findings, and adds new §5 (model-ingestion trace), §6 (file-type handling matrix), §8 (named capability sections), a rebuilt §13 (deletion candidates), and new §15 (target-state canonical-owner map). Every claim is labeled **repository-proven**, **runtime-verification-required**, or **external-verification-required** per instructions.

---

## 1. Runtime route map

### 1.1 Frontend entry & mount

| Item | Evidence |
|---|---|
| HTML entry | `artifacts/atlas-frontend/index.html` (Vite root) — repository-proven |
| JS entry | `artifacts/atlas-frontend/src/main.tsx:1-13` — imports `./lib/install-api-fetch`, `installSwGuard`, `installDebugGlobals`, then `ReactDOM.createRoot(...).render(<App />)` — repository-proven |
| Router library | `wouter` — `artifacts/atlas-frontend/src/App.tsx:2` `import { Switch, Route, Router as WouterRouter, useLocation, useParams } from "wouter"` — repository-proven |
| Router mount | `App.tsx:338-341` — `<WouterRouter base={import.meta.env.BASE_URL...}><Router /></WouterRouter>` — repository-proven |

### 1.2 Route table (from `App.tsx`)

Two switches are rendered: `UnifiedShellRoutes()` (App.tsx:198-208, mounted at line 265 inside `Router()`) and the outer `Switch` (App.tsx:267-307). All repository-proven by direct line citation.

| Path | Component | File:line | Notes |
|---|---|---|---|
| `/home` | `Home` | App.tsx:203 | Ask Atlas surface lives inside `pages/home.tsx` |
| `/atlas/:id` | redirect → `/home` (sets `sessionStorage["atlas-open-ask"]`) | App.tsx:204 | compatibility redirect |
| `/atlas` | redirect → `/home` | App.tsx:205 | compatibility redirect |
| `/project/:projectId` | `Workspace` | App.tsx:206 | |
| `/workspace/:conversationId` | `Workspace` | App.tsx:207 | |
| `/` , `/index` | `RootRouteGate` (App.tsx:224) | App.tsx:268-269 | restores last unified-shell surface from storage |
| `/landing` | `Landing` | App.tsx:270 | |
| `/login`, `/auth/callback`, `/activate`, `/auth/token-bridge`, `/reset-password` | auth pages | App.tsx:271-275 | |
| `/onboarding`, `/guard-report`, `/compass`, `/sessions`, `/workshop`, `/vault`, `/secrets`, `/dashboard`, `/nexus`, `/showcase` | inline redirect components → `/home` | App.tsx:276,283-289,296-299,302,305 | **DEAD ROUTES retained only as redirect shims** — no distinct component rendered |
| `/projects` | `Projects` | App.tsx:277 | |
| `/ledger`, `/ledger/:projectId` | `Ledger` | App.tsx:278-279 | |
| `/parking` | `ParkingLot` | App.tsx:280 | |
| `/knowledge` | `KnowledgePage` | App.tsx:281 | |
| `/component-registry` | `ComponentRegistryPage` | App.tsx:282 | |
| `/entry/:id` | `EntryDetail` | App.tsx:285 | |
| `/code` | `CodePage` | App.tsx:289 | |
| `/connectors` | `ConnectorsPage` | App.tsx:290 | |
| `/terms`, `/privacy`, `/pricing` | static pages | App.tsx:291-293 | |
| `/settings` | `Settings` | App.tsx:294 | |
| `/help` | `Help` | App.tsx:295 | |
| `/admin` | `Admin` | App.tsx:298 | |
| `/map`, `/master-map` | `MasterMap` | App.tsx:300-301 | |
| `/runs/:id` | `RunPage` | App.tsx:303 | |
| `/commits/:projectId/:sha` | `CommitPage` | App.tsx:304 | |
| (fallback) | `NotFound` | App.tsx:306 | |

**Classification of redirect-only routes (`/atlas`, `/onboarding`, `/guard-report`, `/compass`, `/sessions`, `/workshop`, `/vault`, `/secrets`, `/dashboard`, `/nexus`, `/showcase`): COMPATIBILITY (repository-proven).** They are reachable (registered in the live `Switch`) but contain no product surface — every one immediately calls `nav("/home", { replace: true })`. Evidence: App.tsx:204-306 (each is a `useEffect`-only stub).

### 1.3 `atlas-frontend-next` — is it mounted in the same runtime?

**Finding: NOT part of the same deployed runtime as `atlas-frontend`. Separate artifact, dev-only preview, no production build path. (repository-proven for repo-visible config; external-verification-required for the actual Replit deployment manifest.)**

Evidence:
- `artifacts/atlas-frontend-next/.replit-artifact/artifact.toml`: `previewPath = "/atlas-next/"`, `[[services]] paths = ["/atlas-next/"]`, and **no `[services.production]` block at all** (contrast with `artifacts/atlas-frontend/.replit-artifact/artifact.toml`, which has an explicit `[services.production]` with `build`, `publicDir`, `serve = "static"`, and rewrites — and `artifacts/api-server/.replit-artifact/artifact.toml`, which likewise has a full `[services.production]`).
- `artifacts/atlas-frontend-next/package.json` scripts: `dev`, `build`, `serve` (vite preview), `typecheck`, `test` — no wiring into the monorepo root `build`/`dev` scripts.
- Root `package.json:7-9` (`dev`, `build`, `build:dev`) only invoke `cd artifacts/atlas-frontend && ... vite build`; there is no reference to `atlas-frontend-next` anywhere in root `package.json`.
- `.replit` workflow (`[[workflows.workflow]]`, `name = "Project"`) has a single task: `args = "artifacts/atlas-frontend-next: web"`, which runs `pnpm --filter @workspace/atlas-frontend-next run dev`. This is the **dev preview button only**.
- Production deploy config (`.replit` `[deployment]` → `router = "application"`, `deploymentTarget = "gce"`) does not reference `atlas-frontend-next` build output; only `artifacts/atlas-frontend/dist/public` and `artifacts/api-server/dist/index.mjs` have production build/run steps.

**Conclusion:** `atlas-frontend-next` is a real, separately-routed artifact (`/atlas-next/` path prefix) with its own dev server and its own backend contract (`POST /api/conversations/:id/messages`, see §4/§5), but it has **no production build or serve configuration** anywhere in the repo (repository-proven). Per `docs/architecture/runtime-map.md:147-161` it is documented as "Surface 7 — V1.2 turn-entry endpoint," classified CANONICAL "for atlas-frontend-next only." Classification: **ORPHANED (frontend) / LIVE (backend route, reachable only via manual dev-preview or direct API call)**. Confirming whether some out-of-repo deployment target still serves it is **external-verification-required** — no such manifest exists in `/dev-server`.

### 1.4 Backend entry

| Item | Evidence |
|---|---|
| Process entry | `artifacts/api-server/src/index.ts:1-11` — imports `app` from `./app`, `db`/`pool`, `migrate`, workers, genome/application-model backfill jobs — repository-proven |
| Express app assembly | `artifacts/api-server/src/app.ts:5` `import router from "./routes"`; mounted at `app.ts:258` `app.use("/api", router)` — repository-proven |
| Pre-router special mounts | `app.ts:117` `/api/preview/workspace/:projectId`; `app.ts:148` `/share/:token`; `app.ts:200` `/p/:token`; `app.ts:248` `/api/shell`; `app.ts:252` `/api/capabilities` (registered **before** `requireAuth`, deliberately public) — repository-proven |
| Production run command | `artifacts/api-server/.replit-artifact/artifact.toml`: `args = ["node", "artifacts/api-server/dist/index.mjs"]`, health check `path = "/api/healthz"` — repository-proven |

---

## 2. Capability ownership map

This section cross-references `docs/architecture/{runtime-map,conversation-ownership,attachment-ownership}.md` against independent `rg`/direct-read verification performed across audit sessions.

| Capability | Canonical entry | Classification | Independent verification |
|---|---|---|---|
| Auth & app bootstrap | `main.tsx` → `App.tsx` → `RootRouteGate` (App.tsx:224) | LIVE | repository-proven: `main.tsx` unconditionally renders `<App/>`; no StrictMode wrapper (see §12). |
| Ask Atlas | `pages/home.tsx` → `components/home/AskAtlasSurface.tsx` | CANONICAL (per `runtime-map.md:21-39`) | repository-proven reachable: `Home` mounted at `App.tsx:203`; `AskAtlasSurface` file exists at `artifacts/atlas-frontend/src/components/home/AskAtlasSurface.tsx`. |
| Workspace conversations | `pages/workspace.tsx` (`Workspace`) | CANONICAL | repository-proven: mounted at `App.tsx:206-207` for both `/project/:projectId` and `/workspace/:conversationId`. |
| Text submission (canonical) | `useAtlasConversation.submit()` — `hooks/useAtlasConversation.ts` | CANONICAL | repository-proven: `useAtlasConversation.ts:8-14` docstring: "submit() is the ONE place where StagedFile → base64 conversion happens for conversational sends". |
| Attachments/file staging | `hooks/useStagedAttachments.ts` | CANONICAL | repository-proven importer of `useAtlasConversation` machinery. |
| Home→Workspace handoff | `lib/askAtlasHelpers.ts` (`resolveConversationDestination`, `hasBuildIntent`, `buildAskAtlasHandoffSeed`, `triggerNexusHandoff`, `redirectAfterHandoff`, `HANDOFF_CONTINUATION_MESSAGE`, `seedHandoffContinuation`) | **CANONICAL — resolved, file read directly** | repository-proven: exports confirmed at `askAtlasHelpers.ts:25,38,42,86,144,154,167`. Confirmed importers: `components/ProjectsDrawer.tsx`, `components/home/AskAtlasSurface.tsx`, `pages/home.tsx`. |
| Suggestion-chip / programmatic sends | `atlas:workspace-send` DOM event (`workspace.tsx`, per `conversation-ownership.md:240`), suggestion-chip send at `workspace.tsx:8367` | LIVE, mixed dead/reachable — see §2.1 | repository-proven at the specific line numbers in §2.1 (reproduced via direct `grep -n "doSend("` this pass, not merely doc-cited). |
| `useAtlasConversation` | `hooks/useAtlasConversation.ts` | CANONICAL | repository-proven importers via `rg -ln useAtlasConversation`: `pages/workspace.tsx`, `pages/home.tsx`, `hooks/useStagedAttachments.ts`, `hooks/useChatStream.ts`, `hooks/useNexusChatStream.ts` (type import), `hooks/useNexusWorkspaceBridge.ts`, `components/workspace/FlowPanel.tsx`, `components/home/ActiveRuns.tsx`. |
| `useNexusChatStream` | `hooks/useNexusChatStream.ts` | CANONICAL transport, instantiated only inside `useAtlasConversation` (per `conversation-ownership.md:88`) | repository-proven importers via `rg -ln useNexusChatStream`: `pages/workspace.tsx`, `components/home/CrystallizeSheet.tsx`, `components/home/AskAtlasSurface.tsx`, `components/home/ActiveRuns.tsx`, `components/workspace/FlowPanel.tsx`, `pages/home.tsx`, `hooks/useNexusWorkspaceBridge.ts`, `hooks/useAtlasConversation.ts`. Whether `ActiveRuns.tsx`/`FlowPanel.tsx` import it for type-only usage vs. a second live instantiation is **runtime-verification-required** (not disambiguated line-by-line this pass). |
| `useChatStream` | `hooks/useChatStream.ts` | LIVE TRANSITIONAL | repository-proven importers via `rg -ln useChatStream`: `pages/workspace.tsx`, `hooks/useChatStream.ts` (self), `hooks/__tests__/useChatStream.visibility.test.tsx`, `components/workspace/PreviewPanel.tsx`. `useChatStream.ts:174` comment: "This hook posts to POST /api/chat (legacy builder route)." `useChatStream.ts:64` — `endpoint?: "/api/chat" | "/api/nexus/chat"` type exists; **confirmed this pass (§2.1) via full 16-call-site inventory that the param is never overridden — all 16 `doSend()` sites route through the `/api/chat` default.** |
| `/api/nexus/chat` | `artifacts/api-server/src/routes/nexus.ts:2358` `router.post("/nexus/chat", ...)` | CANONICAL | repository-proven registration: `nexus.ts:2357-2358`; mount `routes/index.ts:143`, `router.use(requireAuth, nexusRouter)`. |
| `/api/chat` | `artifacts/api-server/src/routes/chat.ts` | LIVE TRANSITIONAL | repository-proven registration: `routes/index.ts:105` `router.use(requireAuth, chatRouter)`. |
| Workspace direct flows / ActiveRuns / FlowPanel | see §3 send-path table | LEGACY BUT REACHABLE | repository-proven by literal source comments: `components/home/ActiveRuns.tsx:316-341` contains `// ── LEGACY DIRECT SENDER — /api/chat ─────` and a direct `fetch("/api/chat", ...)` at line 324. `components/workspace/FlowPanel.tsx:376-389` contains an identical `// ── LEGACY DIRECT SENDER — /api/chat ─────` comment and a direct `fetch("/api/chat", ...)` at line 383, plus `// ── LEGACY ATTACHMENT CONVERSION ──` around `fileToBase64Safe(imageFile)`. |
| Outputs/artifacts | `routes/artifacts.ts`, `routes/projectArtifacts.ts`, `routes/homeArtifacts.ts` | LIVE (registered), **four-way table overlap — see §8** | repository-proven: `artifactsRouter` and `projectArtifactsRouter` both `router.use(requireAuth, ...)`; `homeArtifactsRouter` mount **now resolved**: `routes/index.ts:189`, `router.use(requireAuth, homeArtifactsRouter)`. |
| Preview & Local Dev | `routes/preview.ts`, `routes/devserver.ts`, `lib/localBootstrap.ts` | LIVE (registered) | repository-proven: `router.use(requireAuth, devserverRouter)` and `router.use(requireAuth, previewRouter)` (`routes/index.ts:156`) both present. Relationship to the pre-router `app.ts:117` inline preview handler is **runtime-verification-required** (see §8 Preview note). |
| GitHub & Changes | `routes/github.ts`, `lib/githubBootstrap.ts` | LIVE (registered) | repository-proven: `router.use(requireAuth, githubRouter)` at `routes/index.ts:106`. "Changes" itself does not map to a dedicated router — see §8. |
| Library | `routes/library.ts`, `lib/library.ts` | LIVE, **mount line resolved** | repository-proven: `libraryRouter` mounted `routes/index.ts:192`, `router.use(requireAuth, libraryRouter)` — authenticated. Underlying tables accessed via raw SQL only (see §7). |
| Drafts | No `routes/drafts.ts` file exists | **RESOLVED: capability does not exist as a backend route** | repository-proven: full `ls artifacts/api-server/src/routes/` (78 files) and `find ... -iname "*draft*"` both return zero matches. Whether a frontend-only "Drafts" UI label exists over some other capability is **runtime-verification-required**: `rg -in "draft" artifacts/atlas-frontend/src`. |
| Subscriptions & settings | `routes/stripe.ts` (`stripeRouter`, `routes/index.ts:22` import) | LIVE, auth posture differs from the rest of the API | repository-proven: mounted `routes/index.ts:86`, `router.use(stripeRouter)`, **without `requireAuth`**, ahead of the auth gate — consistent with webhook signature verification substituting for session auth. Internal guard logic inside `stripe.ts` not re-opened — **runtime-verification-required**, not asserted as a defect. |
| Workers/jobs/startup hooks | `artifacts/api-server/src/index.ts` | LIVE | repository-proven: `startScheduledChecksWorker()`/`startCapacityResetWorker()` called unconditionally at startup (`index.ts:1634-1635`, imports at `index.ts:7-8`); `capacityResetWorker.ts:12,25` `setInterval(() => { void tick(); }, POLL_INTERVAL_MS)`; `scheduledChecksWorker.ts:198-210` module-level `workerHandle`. **Five startup backfills now fully resolved as unconditional at boot — see §8.** |

### 2.1 `doSend` (legacy `useChatStream`) call-site inventory in `workspace.tsx` — resolved, reproduced independently (repository-proven)

Command reproduced this pass: `grep -n "doSend(" artifacts/atlas-frontend/src/pages/workspace.tsx` → **16 call sites**: lines 5068, 6748, 6881, 6900, 6930, 6980, 7044, 7054, 7486, 7501, 8018, 8084, 8367, 9242, 9283, 9291.

`useNexusWorkspaceChat` confirmed: `workspace.tsx:4738`, `const useNexusWorkspaceChat = true;` — a local `const` re-declared on every render of the `Workspace` component, hardcoded (not env var/prop/state). It gates: `5381,5427` (message-source selection), `5792` (`if (!useNexusWorkspaceChat) return;`), `6863,6878,6889` (opening-message early return), `6965,7012,10411` (thread-length computation), `9302,9441` (composer prop conditionals), `10009` (`{tier1ProjectId && !useNexusWorkspaceChat && (...)}` — currently-dead JSX since `!useNexusWorkspaceChat` is always `false`).

Only call sites **6881** and **6900** sit textually inside the `if (useNexusWorkspaceChat) { ...; return; }`/else-only region bounded by 6878-6889 and are therefore **repository-proven unreachable**. All other 14 `doSend(` call sites (5068, 6748, 6930, 6980, 7044, 7054, 7486, 7501, 8018, 8084, 8367, 9242, 9283, 9291) have **no `useNexusWorkspaceChat` guard in their immediate enclosing block** and are reachable as programmatic side-paths (auto-apply, agentic loop, import-greeting, "Build Anyway" override at 9283, and a DOM `CustomEvent` listener at 8367 matching `conversation-ownership.md`'s cited `atlas:workspace-send` mechanism). All 16 route through `useChatStream` → `POST /api/chat` (`useChatStream.ts:174`, hardcoded, never overridden). None of the 16 pass a `useStagedAttachments`-managed attachment; only call site **7486** forwards a single ad-hoc `urlAttachment`. All 16 write to `chat_messages` via `routes/chat.ts` (§7) and render into `useChatStream.messages`, which is display-superseded (not unmounted) by `nexusBridge.messages` whenever `useNexusWorkspaceChat` is true (i.e., always, in the current build).

**This is a confirmed, concrete duplicate-send/duplicate-persistence risk (repository-proven):** call site **8367** (suggestion-chip DOM event) can fire independently of, and concurrently with, a live `atlasConv.submit()` Nexus send, since nothing in the DOM-event listener path checks whether a Nexus send is in flight — no shared "sending" lock was found connecting `atlasConv.submit()`'s internal state to the `doSend` DOM-event handler. **This corrects the prior claim of "5 of 16 provably dead" to 2 of 16 provably dead (6881, 6900); 14 of 16 reachable** — a materially different, more urgent risk profile.

**Deletion/migration prerequisite for the whole `useChatStream`/`doSend` stack:** migrate the 14 reachable call sites' triggers (auto-apply, agentic loop, import-greeting, suggestion-chip DOM event, "Build Anyway") onto `atlasConv.submit()` one at a time, verifying after each that its trigger still fires and its response still renders in `nexusBridge.messages` — a multi-step migration, not a single deletion, per the code's own comment ("Do NOT add new features here. Migrate to atlasConv.submit() when possible").

---

## 3. Complete send-path map

| # | Surface | Component | Handler | Hook/service | Staged file representation | Request payload | API endpoint | Backend conversion | Model ingestion | Persistence | Response renderer | Classification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Ask Atlas | `AskAtlasSurface.tsx` | composer submit | `useAtlasConversation.submit()` → `useNexusChatStream.send()` | `useStagedAttachments` (`ready→converting→sending→cleared`) | `{ conversationId?, projectId?, messages, attachments: [{base64, mediaType, name?, clientAttachmentId?}], conversationMode?, surface:"ask-atlas" }` | `POST /api/nexus/chat` (`nexus.ts:2358`) | WhisperGate intent classification (shared with `/api/chat` per `builderProtocols.ts` docstring) | model call inside `nexus.ts`; exact provider/model call line not pinned down this pass — **runtime-verification-required**: `rg -n "classifyIntent|anthropic|openai|claude|gpt-" artifacts/api-server/src/routes/nexus.ts` (see §5) | `nexus_messages` (repository-proven, resolved naming — see §7), attachments to `message_attachments` via `persistAttachmentsForMessage()` | SSE tokens → `NexusMessage` state in `useNexusChatStream` | **CANONICAL** |
| 2 | Workspace (user composer) | `pages/workspace.tsx` composer | `atlasConv.submit()` | same as #1 | same `useStagedAttachments` | same shape plus `{ surface:"workspace", mode:"workspace"\|"build" }` | `POST /api/nexus/chat` | same | same | `nexus_messages`; `sessions` table also touched by `useChatStream` side effects | `nexusBridge.messages` → `ChatStream.tsx` | **CANONICAL** |
| 3 | Workspace automated (opening msg, agentic loop, `axiom:chat-message`, import-greeting, suggestion-chip DOM event, "Build Anyway") | `pages/workspace.tsx` various `useEffect`s / DOM listeners | `doSend()` (16 call sites, 14 reachable — §2.1) | `useChatStream` | none — no `useStagedAttachments` integration for these call sites (one ad-hoc `urlAttachment` at line 7486) | `{ projectId, sessionId, message, history, entries, ... }` | `POST /api/chat` (default, unconditionally, `useChatStream.ts:64,174` — confirmed never overridden across all 16 call sites, repository-proven) | `builderProtocols.ts` shared with `nexus.ts` | `chat.ts` — exact provider/model call line not pinned down this pass, **runtime-verification-required** (see §5) | `chat_messages` (12+ confirmed write sites, §7) | `useChatStream.messages` (display-superseded by `nexusBridge.messages`) | **LIVE TRANSITIONAL, with a repository-proven concrete duplicate-send race at call site 8367 (§2.1)** |
| 4 | ActiveRuns / Atlas Composer sheet | `components/home/ActiveRuns.tsx` | inline async function, direct `fetch` | **none — bypasses `useAtlasConversation`/`useNexusChatStream` entirely** (self-documented: `ActiveRuns.tsx:317-318`) | none — raw `attachmentPayload.attachments` array, no `useStagedAttachments` state machine | `{ projectId, sessionId, message, history: [], entries: [], attachments?: [{base64, mediaType}], ...modeFlags }` (`ActiveRuns.tsx:324-338`) | `POST /api/chat` (`ActiveRuns.tsx:324`) | `chat.ts` builder pipeline | runtime-verification-required (not traced) | `chat_messages` via `chat.ts` | manual SSE parsing inline (`ActiveRuns.tsx` reader loop, ~line 345+) | **LEGACY BUT REACHABLE** |
| 5 | FlowPanel | `components/workspace/FlowPanel.tsx` | `sendFlowMessage()` | **none — direct `fetch`, self-documented** `FlowPanel.tsx:377-381` | **none** for non-image files — every non-image type (PDF/DOCX/XLSX/PPTX/text/ZIP/video/unsupported) is reduced to a filename-only text suffix and never transmitted as binary data (`FlowPanel.tsx:366-369`, repository-proven this pass); single image converted via direct `fileToBase64Safe(imageFile)` (`FlowPanel.tsx:394-399`, flagged inline "LEGACY ATTACHMENT CONVERSION") | `{ projectId, message, flowMode:true, flowNodes, history, projectMap, mode:"plan", imageData?, imageMimeType? }` (`FlowPanel.tsx:383-399`) | `POST /api/chat` (`FlowPanel.tsx:383`) | `chat.ts` | runtime-verification-required | **No persistence documented** — flow messages are in-memory only; no DB write (per `runtime-map.md:100`, not independently re-confirmed by a negative grep this pass) | inline SSE/JSON reader in `FlowPanel.tsx` | **LEGACY BUT REACHABLE** |
| 6 | `atlas-frontend-next` (V1.2) | (frontend not audited — separate artifact, §1.3) | runtime-verification-required (component) | runtime-verification-required (hook) | runtime-verification-required | forwarded as-is | `POST /api/conversations/:conversationId/messages` (`routes/runs.ts`, mounted authenticated `routes/index.ts:201` — mount now resolved, §4) → internally forwards to `/api/chat` per `runtime-map.md:158` — **exact handler body and delegation call not opened this pass, runtime-verification-required**: `rg -n "router\.(post|get)\(" artifacts/api-server/src/routes/runs.ts` | same `chat.ts` pipeline as #3/#4/#5 (per doc citation, not independently re-traced) | runtime-verification-required | `execution_run` row created (`received→thinking`), events on `RunEventBus` — runtime-verification-required | `run_created`/`run_status` events (SSE/pubsub, not traced) | **CANONICAL for V1.2 backend route (mount repository-proven); frontend consumer ORPHANED per §1.3** |

### 3.1 Flags raised by the send-path map

| Flag | Applies to | Evidence |
|---|---|---|
| Uses base64 attachments | Rows 1, 2 (canonical), 4 (ActiveRuns), 5 (FlowPanel, image only) | `attachment-ownership.md:104-111`; `ActiveRuns.tsx:333-335`; `FlowPanel.tsx:397` — repository-proven |
| Uses attachment IDs (`clientAttachmentId`) | Rows 1, 2 only | `attachment-ownership.md:109,132-139` — repository-proven per doc citation |
| Sends both base64 AND IDs | Rows 1, 2 (base64 body + `clientAttachmentId` per-file for ack correlation — canonical design, not a bug) | `attachment-ownership.md:104-111` |
| Bypasses canonical hook | Rows 3 (`useChatStream`/`doSend`), 4 (ActiveRuns), 5 (FlowPanel) | self-documented comments cited above — repository-proven |
| Calls a different endpoint than canonical | Rows 3, 4, 5, 6 all call `/api/chat` (or, for row 6, `/api/conversations/:id/messages` → internally `/api/chat`) instead of `/api/nexus/chat` | route strings above — repository-proven for rows 3-5; row 6's internal forward is runtime-verification-required |
| Requires text despite attachments | FlowPanel row 5: non-image attachments are converted to a **text suffix only** (`\n[Attached: ...]`), never uploaded | `FlowPanel.tsx:366-369` — repository-proven |
| Lacks inline rendering / persistence | Row 5 (FlowPanel) has no DB persistence at all | `runtime-map.md:100`; not independently re-confirmed by negative grep this pass — runtime-verification-required |
| Special-cases ZIP/PDF/Office | `routes/zip.ts`/`routes/import.ts` are structurally unrelated to chat attachments — **resolved**: both mounted authenticated (§4), handle whole-project ZIP import, a distinct feature from chat-message attachments; none of the 6 send-path endpoints above reference zip/import paths | repository-proven this pass |
| Remount/recovery behavior | `useAtlasConversation.ts` docblock (lines 24-37) documents `onRestoreToReady` for network failure recovery | `useAtlasConversation.ts:24-37`, `attachment-ownership.md:36-38` |
| Can cause duplicate sends/ingestion | **Resolved and upgraded from latent to concrete**: call site `workspace.tsx:8367` (suggestion-chip DOM event) is a repository-proven live duplicate-send race, not merely a hypothetical if a guard were removed — see §2.1 | `workspace.tsx:8367`, `conversation-ownership.md:211,225` |

---

## 4. Backend route + model-ingestion map

Router mounting order (from `artifacts/api-server/src/routes/index.ts`, all under `app.use("/api", router)` at `app.ts:258`). **Full 203-line file read this pass (repository-proven): every one of the 65 imported router identifiers is mounted exactly once (import lines 1-78, mount lines 83-201); none is imported-but-unmounted, and none is mounted more than once.**

| Route group | File | Auth gate | Registration evidence |
|---|---|---|---|
| Stripe | `routes/stripe.ts` | **none** (mounted before `requireAuth`) | `routes/index.ts:86` `router.use(stripeRouter)` |
| Auth | `routes/auth.ts` | n/a (defines `requireAuth`) | `routes/index.ts:87` |
| Google auth | `routes/google-auth.ts` | none | `routes/index.ts:88` |
| GitHub OAuth (public callback) | `routes/github-oauth-public.ts` | explicitly public (comment: "must be public — cross-site redirect drops cookies") | `routes/index.ts:89` |
| Health | `routes/health.ts` | none | `routes/index.ts:90` |
| Error logging | `routes/errorlog.ts`, `routes/errors.ts` | none | `routes/index.ts:91-92` |
| Invites | `routes/invites.ts` | none | `routes/index.ts:95` |
| Admin | `routes/admin.ts` | `requireAuth, requireAdmin` composition (imported together at `routes/index.ts:17`) | `routes/index.ts:98` |
| Projects, sessions, entries, generation, chat, github, image, thoughts, search, vault, secrets, forge, forge-state, devserver, import, selfmap, tensions, scan, blueprint, connections, mcp, state, artifacts, projectArtifacts, agentApprovals, codegen, browser, urlIntelligence, deploy, zip, sources, architecture-diff, knowledge, componentRegistry | respective files | `requireAuth` | `routes/index.ts:101-134` (each `router.use(requireAuth, XRouter)`) |
| Stats, capacity, account, memory | respective files | `requireAuth` | `routes/index.ts:137-140` |
| Nexus | `routes/nexus.ts` | `requireAuth` | `routes/index.ts:143` |
| Gallery | `routes/gallery.ts` | `requireAuth` | `routes/index.ts:146` |
| Object storage | `routes/storage.ts` | **none** (comment: "presigned URL upload + serve") | `routes/index.ts:149` |
| Terminal | `routes/terminal.ts` | `requireAuth` | `routes/index.ts:152` |
| Imagine (image gen) | `routes/imagine.ts` | `requireAuth` | `routes/index.ts:155` |
| Preview, manifest, genome, applicationModel, projectDna, designPlan, checkpoints, bookmarks, builds, verify (`verifyRouter`, resolved), readiness, thinkingReceipts, intelligence | respective files | `requireAuth` | `routes/index.ts:156-165`; `verifyRouter` mount **resolved this pass**: `routes/index.ts:165`, `router.use(requireAuth, verifyRouter)` |
| Project file system | `routes/fs.ts` | `requireAuth` | `routes/index.ts:167` |
| Ledger | `routes/ledger.ts` | `requireAuth` | `routes/index.ts:170` |
| Conversations (conversation-first routing) | `routes/conversations.ts` | `requireAuth` | `routes/index.ts:173` |
| Feedback | `routes/feedback.ts` | `requireAuth` | `routes/index.ts:176` |
| Home artifacts (`homeArtifactsRouter`) | `routes/homeArtifacts.ts` | `requireAuth` | **resolved this pass**: `routes/index.ts:189`, `router.use(requireAuth, homeArtifactsRouter)` |
| Library (`libraryRouter`) | `routes/library.ts` | `requireAuth` | **resolved this pass**: `routes/index.ts:192`, `router.use(requireAuth, libraryRouter)` |
| Capabilities router (`capabilitiesRouter`) | `routes/capabilities.ts` | none (public) | **resolved this pass**: `routes/index.ts:195`, `router.use(capabilitiesRouter)` — confirmed mounted, not a dead import, but see shadowing note below |
| Runs (`runsRouter`, V1.2) | `routes/runs.ts` | `requireAuth` | **resolved this pass**: `routes/index.ts:201`, `router.use(requireAuth, runsRouter)`, last router in the file. Comment: "Run Lifecycle Contract — Phase 1 SSE infrastructure (additive, no nexus changes)." |

**Pre-router mounts (outside `/api` prefix or before the main router), from `app.ts`:**

| Path | Handler | Evidence |
|---|---|---|
| `/api/preview/workspace/:projectId` | inline handler | `app.ts:117` |
| `/share/:token` | inline handler (async) | `app.ts:148` |
| `/p/:token` | inline handler (async) | `app.ts:200` |
| `/api/shell` | `shellRouter` | `app.ts:248` |
| `/api/capabilities` | inline handler, deliberately public | `app.ts:252-256` |
| `/api` (everything else) | `router` (the full tree above) | `app.ts:258` |

**`/api/capabilities` inline handler vs. `capabilitiesRouter` — resolved as a confirmed shadow, not a coincidental duplicate (repository-proven).** `app.ts:252-256` registers `app.get("/api/capabilities", ...)` directly on the bare Express `app`, running **before** `app.use("/api", router)` at `app.ts:258` (which is what eventually reaches `capabilitiesRouter` at `routes/index.ts:195`). Express dispatches to the first matching route registration; the inline handler always answers `GET /api/capabilities` first, making `capabilitiesRouter`'s own route(s) for that same path unreachable dead code. Whether `capabilitiesRouter` defines only `/capabilities` or additional non-colliding sub-paths is **runtime-verification-required**: `rg -n "router\.(get|post)\(" artifacts/api-server/src/routes/capabilities.ts`.

`stripeRouter` public-mount posture (`routes/index.ts:86`, before `authRouter`) confirmed by direct line read, no `requireAuth` wrapper. Internal webhook-signature verification inside `stripe.ts` not independently re-opened — **runtime-verification-required**, not asserted as a defect.

### 4.1 Chat endpoints — high-level summary (see §5 for the full trace)

| Endpoint | File | DB deps (resolved naming, §7) |
|---|---|---|
| `POST /api/nexus/chat` | `routes/nexus.ts:2358` | `nexus_messages`, `nexus_conversations`, `message_attachments`; also reads legacy `chat_messages` for session history (`nexus.ts:1415-1476,1934-1943`) |
| `POST /api/chat` | `routes/chat.ts` | `chat_messages`, `sessions`, `nexus_conversations` (via `lib/services/tier1.ts`) |
| `POST /api/conversations/:conversationId/messages` | `routes/runs.ts`, mounted authenticated `routes/index.ts:201` | `execution_runs`/`execution_run_steps` (expected); exact write sites — runtime-verification-required (§5) |

---

## 5. Model-ingestion trace — POST /api/nexus/chat, POST /api/chat, POST /api/conversations/:id/messages

**`POST /api/nexus/chat`** (`routes/nexus.ts:2358`, `router.post("/nexus/chat", ...)` — repository-proven):
- **Handler entry:** `nexus.ts:2358`.
- **Body-typing/validation:** `nexus.ts:2359-2395`.
- **Attachment conversion:** legacy base64 `attachments[]` + server-resolved `attachmentIds[]` merged into `allAttachments`; persisted concurrently (not blocking the stream) via `persistAttachmentsForMessage()` (`nexus.ts:3732-3760`, delegating to `lib/attachmentPersistence.ts`) after `res.flushHeaders()`. `IncomingAttachment` type takes a generic `mediaType: string` with no allowlist visible in the read code (`nexus.ts:3732-3743`) — repository-proven no explicit MIME allowlist in this handler.
- **Persistence of user turn:** inserted into `nexus_messages` **before** streaming begins (`nexus.ts:3700-3719`, including a schema-drift fallback insert path) — repository-proven.
- **Intent/mode:** WhisperGate intent classification, shared with `/api/chat` per `builderProtocols.ts`'s own docstring ("shared by /api/chat and /api/nexus/chat"). Nexus-only body fields confirmed absent from `chat.ts`'s typing: `surfaceContext`, `runId`/`_resumeRunId`/`_approvedPlanVersion`, `justTalk`, `askAtlasContextSeed` — repository-proven by comparing the two typing blocks.
- **Provider/model call and tool exec/stream lines:** **not pinned down to exact line numbers this pass — runtime-verification-required**: `rg -n "classifyIntent|anthropic|openai|claude|gpt-" artifacts/api-server/src/routes/nexus.ts`, then open the matched lines directly.
- **Response persistence:** assistant-turn write path not independently re-opened to an exact line this pass beyond the confirmed 108 occurrences of `nexusMessagesTable` in `nexus.ts` — **runtime-verification-required** for the exact post-stream assistant-message insert line.

**`POST /api/chat`** (`routes/chat.ts`, body-typing `chat.ts:3107-3131` — repository-proven):
- **Handler/validation:** `chat.ts:3107-3131` supports `flowMode`/`flowNodes` (confirms FlowPanel's payload shape, §3 row 5), `scenarioMode`, `buildMode`, `lens`/`workspaceLens`/`previousLens`, `fileContext`, `forgeContext`, `planMode`, `displayAs` — none of which appear in `nexus.ts`'s typing, confirming these are `/api/chat`-only features. `isFoundationMode = !body.projectId` (`chat.ts:3134`) supports project-less sends. Validation at `chat.ts:3137` rejects requests lacking session+message/attachments outside flow/foundation modes.
- **Attachment conversion:** legacy inline-base64 `attachments[]` accepted unconditionally; no explicit gating by `ATTACHMENTS_PERSISTENCE` was found (see §9) — repository-proven negative (single grep hit for that env var is the capabilities-response line, §9).
- **Intent/mode:** shared `builderProtocols.ts` token protocols with `nexus.ts`.
- **Provider/model call:** **exact line not traced this pass — runtime-verification-required**: `rg -n "classifyIntent|anthropic|openai|claude|gpt-" artifacts/api-server/src/routes/chat.ts`.
- **Persistence:** 12+ confirmed `chat_messages` insert/update/delete call sites (`chat.ts:4813, 4826, 5069, 5074, 5083, 5088, 6359, 6411, 6478, 7162, 7481, 7536, 7573-7575`) — repository-proven line list.
- **Stream:** SSE response consumed by `useChatStream` frontend hook (§2, §3 row 3).

**`POST /api/conversations/:conversationId/messages`** (`routes/runs.ts`, mounted authenticated — mount now repository-proven, `routes/index.ts:201`, §4):
- **Handler body, exact delegation to `/api/chat`, and `execution_runs` write sites were not opened in full this pass — runtime-verification-required**: `rg -n "router\.(post|get)\(" artifacts/api-server/src/routes/runs.ts` followed by a direct read of the matched handler.
- Per `docs/architecture/runtime-map.md:151-158` (doc-citation only, not independently re-verified this pass): the endpoint pre-inserts an `execution_runs` row (`received`→`thinking`), forwards internally to `POST /api/chat` on `localhost:{apiPort}` (backend-to-backend), and emits `run_created`/`run_status` events over a `RunEventBus`. This entire chain is **runtime-verification-required** until `runs.ts` is opened directly.
- **Run-creation double-writer question:** `nexus.ts`'s own comment states it "pre-inserts an execution_runs row in `running` status" for `runId`/`_resumeRunId` flows, and `routes/runs.ts` (V1.2) is expected to write the same table. Whether these are the same code path or independent writers to `execution_runs` was **not resolved this pass — runtime-verification-required**.

---

## 6. File-type handling matrix

Matrix of confirmed behavior per surface × file type. Cells marked "runtime-verification-required" indicate the relevant source file/route was not opened to the specific parsing logic this pass.

| Surface | Images | PDF | DOCX | XLSX | PPTX | Plain text | ZIP | Video | Unsupported/other |
|---|---|---|---|---|---|---|---|---|---|
| Ask Atlas (`AskAtlasSurface.tsx` → `useStagedAttachments` → `/api/nexus/chat`) | Base64 via `useStagedAttachments`/`fileToBase64Safe`, generic `mediaType: string` accepted server-side with no visible allowlist (`nexus.ts:3732-3743`) — repository-proven for the server side; exact frontend `accept=`/MIME-gating in `useStagedAttachments.ts` **runtime-verification-required**: `rg -n "accept=|mediaType|mimeType" artifacts/atlas-frontend/src/hooks/useStagedAttachments.ts` | runtime-verification-required (same command) | runtime-verification-required | runtime-verification-required | runtime-verification-required | runtime-verification-required | Not applicable — ZIP handled by separate `routes/zip.ts`/`routes/import.ts` (§3.1), structurally unrelated to chat attachments (repository-proven) | runtime-verification-required | runtime-verification-required (no allowlist found server-side, so likely accepted and forwarded as opaque base64 — repository-proven absence of allowlist code; whether the model provider can ingest it is external-verification-required) |
| Workspace canonical composer (`atlasConv.submit()` → `/api/nexus/chat`) | Same mechanism as Ask Atlas (shared `useAtlasConversation.submit()`) — repository-proven code-sharing | same | same | same | same | same | not applicable, same as above | same | same |
| ActiveRuns (`components/home/ActiveRuns.tsx`) | Raw `attachmentPayload.attachments` array (base64, `mediaType`), no `useStagedAttachments` state machine (`ActiveRuns.tsx:324-338`) — repository-proven | runtime-verification-required (picker/staging code above line 324 not opened this pass) | runtime-verification-required | runtime-verification-required | runtime-verification-required | runtime-verification-required | runtime-verification-required | runtime-verification-required | runtime-verification-required |
| FlowPanel (`components/workspace/FlowPanel.tsx`) | Single image only, via direct `fileToBase64Safe(imageFile)` (`FlowPanel.tsx:394-399`) — repository-proven | **Confirmed silently reduced to filename-only text suffix, never transmitted as binary data** (`FlowPanel.tsx:366-369`) — repository-proven | same as PDF (filename-only suffix) | same | same | same | same (any non-image file, including a `.zip`, would be reduced to filename text per this same code path — repository-proven by the generic `otherFiles` handling, not zip-specific) | same | same |
| Import routes (`routes/import.ts`) | Not chat-attachment related — handles project import, not message attachments | n/a | n/a | n/a | n/a | n/a | **Primary purpose** — mounted authenticated (§4); exact parsing/extraction logic not opened this pass — runtime-verification-required: `rg -n "router\.(post|get)\(" artifacts/api-server/src/routes/import.ts` | n/a | n/a |
| ZIP routes (`routes/zip.ts`) | n/a | n/a | n/a | n/a | n/a | n/a | **Primary purpose**, mounted authenticated (§4); exact handler logic — runtime-verification-required: `rg -n "router\.(post|get)\(" artifacts/api-server/src/routes/zip.ts` | n/a | n/a |

**Server-side document parsing (PDF/DOCX/XLSX/PPTX) existence check:** not run to completion this pass — **runtime-verification-required**: `rg -n "pdf-parse|mammoth|xlsx|pptx" artifacts/api-server/src package.json`. This audit does not assume parity between FlowPanel's filename-reduction behavior and the canonical Nexus attachment path — the canonical path may pass arbitrary MIME types through to the model provider unfiltered, but whether the downstream provider can actually ingest e.g. XLSX is an **external-verification-required** question (provider API contract, not repo code).

---

## 7. Database reader/writer map

All 43 files in `lib/db/src/schema/` were enumerated (`ls lib/db/src/schema/`) and every `pgTable(...)` export extracted (`grep -n "pgTable(" lib/db/src/schema/*.ts`) — **repository-proven, full enumeration, 51 distinct tables:**

`admin_notes`, `error_logs` (`admin.ts`) · `agent_runs` (`agent_runs.ts`) · `application_models`, `application_model_history`, `project_dna`, `design_plans`, `project_artifacts` (`application_model.ts`) · `artifacts` (`artifacts.ts`) · `atlas_error_logs` (`atlas_error_logs.ts`) · `atlas_incidents` (`atlas_incidents.ts`) · `atlas_self_map` (`atlas_self_map.ts`) · `blueprints` (`blueprints.ts`) · `capacity_pools` (`capacity_pools.ts`) · `chat_messages` (`chat_messages.ts`) · `connections` (`connections.ts`) · `home_conversations` (`conversations.ts`, exported as `conversationsTable`) · `deliveries` (`deliveries.ts`) · `embeddings` (`embeddings.ts`) · `entries` (`entries.ts`) · `execution_runs`, `execution_run_steps` (`execution_runs.ts`) · `project_flow_canvas` (`flowCanvas.ts`) · `gallery_images` (`gallery.ts`) · `generation_runs`, `generated_files` (`generation.ts`) · `project_genome` (`genome.ts`) · `image_versions` (`image_versions.ts`) · `invites` (`invites.ts`) · `library_items`, `conversation_context_items` (`library_items.ts`) · `mcp_connections` (`mcp_connections.ts`) · `message_attachments` (`message_attachments.ts`) · `message_feedback` (`message_feedback.ts`) · `nexus_conversations` (`nexus_conversations.ts`) · `nexus_messages` (`nexus_messages.ts`) · `plan_artifacts` (`plan_artifacts.ts`) · `project_sources`, `project_source_files`, `project_source_embeddings`, `project_source_snapshots` (`project_sources.ts`) · `project_stack` (`project_stack.ts`) · `project_tier1_memory` (`project_tier1_memory.ts`) · `projects` (`projects.ts`) · `readiness_snapshots` (`readiness_snapshots.ts`) · `user_resume_snapshots` (`resume_snapshots.ts`) · `scheduled_checks`, `check_results` (`scheduled_checks.ts`) · `secrets` (`secrets.ts`) · `sessions` (`sessions.ts`) · `thoughts` (`thoughts.ts`) · `users`, `user_sessions` (`users.ts`) · `vault` (`vault.ts`) · `project_zip_imports` (`zip_imports.ts`).

**Naming resolution — the "conversation_messages" ambiguity, resolved (repository-proven):** there is **no table literally named `conversation_messages`** anywhere in the schema. The prior architecture docs' prose term "conversation_messages" is a descriptive label, not an actual SQL identifier, and maps to two distinct real tables depending on which router wrote the row: **`nexus_messages`** (confirmed via 108 occurrences of `nexusMessagesTable` in `routes/nexus.ts`, including the user-message insert at `nexus.ts:3700-3720`) for `/api/nexus/chat` turns, and **`chat_messages`** (confirmed via 12+ insert/update/delete call sites in `routes/chat.ts`: lines 4813, 4826, 5069, 5074, 5083, 5088, 6359, 6411, 6478, 7162, 7481, 7536, 7573-7575) for `/api/chat` turns. Additionally, **`nexus.ts` itself reads from `chat_messages`** (`nexus.ts:1415-1476,1934-1943`) for legacy session history. Separately, **`home_conversations`** (`conversations.ts`'s `conversationsTable`) and **`nexus_conversations`** (`nexus_conversations.ts`'s `nexusConversationsTable`) are two distinct, both-live conversation-level tables: `nexus.ts:2348` reads `home_conversations`; `routes/chat.ts` and `lib/services/tier1.ts` read/write `nexus_conversations`. **Recommendation: stop using "conversation_messages"/"conversation" as a generic term in future docs — cite `nexus_messages`/`chat_messages`/`home_conversations`/`nexus_conversations` explicitly, since all four are simultaneously live and serve different purposes.**

**Confirmed high-traffic/canonical tables (repository-proven via named import sites):** `projects` (`projects.ts`) and `sessions` (`sessions.ts`) are each imported by `chat.ts`, `nexus.ts`, `manifest.ts`, `applicationModel.ts`, `blueprint.ts`, `agent-loop/runner.ts`, `genomeExtract.ts` — the two most cross-cutting tables in the schema.

**Confirmed stranded/duplicated findings:**
- **`libraryItemsTable` / `conversationContextItemsTable` (typed Drizzle exports in `library_items.ts`) — STRANDED (zero typed-import consumers), MEDIUM-CONFIDENCE deletion candidate for the export only (repository-proven).** `routes/library.ts` accesses the underlying SQL tables (`library_items`, `conversation_context_items`) exclusively via raw `sql\`...\`` template literals (`library.ts:147,222,265,311,338,372,427,465`); its own import line (`library.ts:15`) lists only `db, projectsTable, LIBRARY_ITEM_KINDS`. `rg -n "libraryItemsTable|conversationContextItemsTable" artifacts/api-server/src lib` returns zero hits outside `library_items.ts` itself. **The SQL tables themselves are very much live (do not delete data or the raw-SQL routes) — only the unused typed exports are a candidate**, and only after also checking `lib/api-zod`, `scripts/src` for consumers (not done this pass — runtime-verification-required): `rg -n "libraryItemsTable|conversationContextItemsTable" lib scripts`.
- **Four (not two) overlapping "artifact" tables confirmed live simultaneously (repository-proven) — the single largest unresolved architectural duplication surfaced by this audit:** `artifacts` (`artifacts.ts`, backing `artifactsRouter`), `project_artifacts` (`application_model.ts`, backing `projectArtifactsRouter`, also imported directly by `chat.ts` and `nexus.ts`), `plan_artifacts` (`plan_artifacts.ts`, imported by `blueprint.ts`), and `home_artifacts` (no Drizzle schema file at all — accessed exclusively via raw SQL in `routes/homeArtifacts.ts:15-17,46-47,93-94`, a legacy table with no typed schema representation whatsoever, confirmed superseded per `routes/index.ts:191`'s comment "Canonical Library — supersedes home_artifacts / project_bookmarks as the read path," yet still actively read/written, with a live migration bridge: `homeArtifacts.ts:100` calls `deleteLibraryByLegacy("home_artifacts", id, userId)` on delete). **Requires product-level clarification (external-verification-required) — code alone proves all four are live, not which should be canonical.**
- **`atlas_incidents` (`atlas_incidents.ts`, `atlasIncidentsTable`) — usage not confirmed either way this pass.** Verification command required: `rg -n "atlasIncidentsTable" artifacts/api-server/src lib` — runtime-verification-required.
- Two separate error-log tables confirmed live: `error_logs` (`admin.ts`) and `atlas_error_logs` (`atlas_error_logs.ts`, imported directly by `chat.ts:6`) — DUPLICATED-BY-PURPOSE, not resolved further; verification: `rg -n "errorLogsTable" artifacts/api-server/src` to see if `admin.ts`'s table has any writer besides the admin panel — runtime-verification-required.

All remaining tables not called out above (`admin_notes`, `agent_runs`, `application_models`/`application_model_history`/`project_dna`/`design_plans`, `blueprints`, `capacity_pools`, `connections`, `deliveries`, `embeddings`, `entries`, `execution_runs`/`execution_run_steps`, `project_flow_canvas`, `gallery_images`, `generation_runs`/`generated_files`, `project_genome`, `image_versions`, `invites`, `mcp_connections`, `message_attachments`, `message_feedback`, `project_sources`/`project_source_files`/`project_source_embeddings`/`project_source_snapshots`, `project_stack`, `project_tier1_memory`, `readiness_snapshots`, `user_resume_snapshots`, `scheduled_checks`/`check_results`, `secrets`, `thoughts`, `users`/`user_sessions`, `vault`, `project_zip_imports`) are classified **CANONICAL** on the strength of a confirmed router mount (§4) and/or a confirmed named importer in at least one of `chat.ts`, `nexus.ts`, `manifest.ts`, `applicationModel.ts`, `blueprint.ts`, `agent-loop/runner.ts`, or a startup worker (§8) — i.e. each has at least one repository-proven live consumer. Exact per-table read/write/update/delete line numbers beyond the ones cited above are **runtime-verification-required, table-by-table**, via `rg -n "<TableVarName>" artifacts/api-server/src lib` for each — a mechanical, reproducible follow-up.

`message_attachments` is confirmed as the live persistence target for the attachment-persistence subsystem: written by `lib/attachmentPersistence.ts` and invoked from `nexus.ts:3746-3760` via `persistAttachmentsForMessage(...)`, keyed to `nexus_messages` rows via a `nexusMessageId` field (`nexus.ts:3752`) — repository-proven.

---

## 8. Named capability sections

- **Library** — supersedes `home_artifacts` but has not fully cut over (repository-proven). `routes/index.ts:191` comment: "Canonical Library — supersedes home_artifacts / project_bookmarks as the read path." `routes/homeArtifacts.ts` still serves live raw-SQL reads/writes/deletes against `home_artifacts` (lines 15-17, 46-47, 93-94) and its delete path explicitly calls `deleteLibraryByLegacy("home_artifacts", id, userId)` (`homeArtifacts.ts:100`) — a live dual-write/migration bridge, not a completed cutover. `home_artifacts` has no Drizzle schema file at all; pure legacy raw SQL. Mount: `routes/index.ts:192` (§4).
- **Drafts** — as a named backend capability, **does not exist (repository-proven, resolved)**. Confirmed via full `ls artifacts/api-server/src/routes/` (78 files, none matching `*draft*`) and `find ... -iname "*draft*"` (zero results). If a "Drafts" UI concept exists in the frontend, it is not backed by a dedicated route in this repo; **runtime-verification-required**: `rg -in "draft" artifacts/atlas-frontend/src`.
- **Outputs / Artifacts** — map to (at least) four overlapping tables: `artifacts`, `project_artifacts`, `plan_artifacts`, `home_artifacts` (§7). **External-verification-required** to determine intended product boundaries between them.
- **Preview** — has two entry points: the pre-router inline `/api/preview/workspace/:projectId` handler (`app.ts:117`) and the full `previewRouter` (`routes/index.ts:156`) — whether these overlap or serve genuinely separate purposes (e.g. public share preview vs. authenticated in-app preview) is **runtime-verification-required**: read `app.ts:110-125` alongside `routes/preview.ts`'s route list.
- **Local Dev** — `routes/devserver.ts` (mounted authenticated, `router.use(requireAuth, devserverRouter)`) and `lib/localBootstrap.ts`; both confirmed registered (§4/§2); internal behavior not traced beyond registration — **runtime-verification-required**.
- **GitHub** — `routes/github.ts` (`router.use(requireAuth, githubRouter)`, `routes/index.ts:106`) and `lib/githubBootstrap.ts`; confirmed registered, internal route list not enumerated — **runtime-verification-required**.
- **Changes** — **does not map to a dedicated router (repository-proven negative).** No `changesRouter` import exists in `routes/index.ts`'s full 78-import list; it is most likely a frontend-only label layered over `execution_runs`/diff data (possibly via `architectureDiffRouter` or `deployRouter`, both confirmed mounted) — **runtime-verification-required** to confirm which.
- **Subscriptions & settings** — `routes/stripe.ts`, mounted unauthenticated (§4/§2) ahead of the auth gate, consistent with webhook signature verification. Full route/DB detail beyond the auth-posture confirmation — **runtime-verification-required**.
- **Workers** — `startScheduledChecksWorker()` and `startCapacityResetWorker()`, both imported at `index.ts:7-8` and called unconditionally at `index.ts:1634-1635` — repository-proven. `capacityResetWorker.ts:12,25` — `setInterval(() => { void tick(); }, POLL_INTERVAL_MS)`. `scheduledChecksWorker.ts:198-210` — module-level `workerHandle`, `startScheduledChecksWorker()`/`stopScheduledChecksWorker()`.
- **Scheduled jobs** — same as Workers above; also `pushSchema()` (drizzle-kit push) and `initStripe()` run at startup (`index.ts` ~lines 25-80) — repository-proven.
- **Startup backfills** — **resolved, all five confirmed unconditional at boot (repository-proven):** `index.ts:1583` `seedMissingGenomes()`, `index.ts:1587` `seedMissingSessionsForCommitted()`, `index.ts:1591` `backfillEmptyGenomes()`, `index.ts:1595` `seedMissingApplicationModels()`, `index.ts:1599` `migrateGenomeToApplicationModel()`, each wrapped only in `.catch((err) => {...})` for logging, not gated by any flag.
- **Handoff** — `lib/askAtlasHelpers.ts`, resolved, file read directly (repository-proven). Exports: `resolveConversationDestination` (line 25), `hasBuildIntent` (38), `buildAskAtlasHandoffSeed` (42), `triggerNexusHandoff` (86), `redirectAfterHandoff` (144), `HANDOFF_CONTINUATION_MESSAGE` (154), `seedHandoffContinuation` (167). Confirmed importers: `components/ProjectsDrawer.tsx`, `components/home/AskAtlasSurface.tsx`, `pages/home.tsx`. **CANONICAL.**
- **Programmatic sends / suggestion chips** — see §2.1; the suggestion-chip DOM-event call site (`workspace.tsx:8367`) is the clearest concrete duplicate-send race this audit surfaced. Whether it has fired in production is **runtime-verification-required** (the code-level reachability itself is repository-proven).
- **Run creation** — has two possible writers to `execution_runs`: `nexus.ts`'s own comment states it "pre-inserts an execution_runs row in `running` status" for `runId`/`_resumeRunId` flows, and `routes/runs.ts` (V1.2) is expected to write the same table — whether these are the same code path or independent writers is **runtime-verification-required** (§5).
- **Conversation recovery** — `useAtlasConversation.ts`'s `onRestoreToReady` (lines 24-37) documents network-failure recovery for canonical sends. **CANONICAL** per direct citation; not re-opened again this pass beyond the prior confirmation (§2).

---

## 9. Feature-flag & env-branch inventory

| Flag / env var | Where set | Where read | Effect | Evidence |
|---|---|---|---|---|
| `useNexusWorkspaceChat` | hardcoded `true`, `workspace.tsx:4738` — **directly opened and confirmed this pass (repository-proven)**, correcting the prior citation of line 4715 | `workspace.tsx` (gates 16 `doSend` call sites, 2 of which become unreachable as a result — §2.1) | Selects Nexus path vs. legacy `useChatStream` path for automated sends; also gates one dead JSX branch (`workspace.tsx:10009`) | `workspace.tsx:4738` direct read |
| `ATTACHMENTS_PERSISTENCE` | **resolved, fully traced (repository-proven).** Set: `.replit:80`, `ATTACHMENTS_PERSISTENCE = "true"` under `[userenv.shared]` | Exactly one read site repo-wide: `app.ts:254`, `attachmentPersistence: process.env.ATTACHMENTS_PERSISTENCE === "true"`, inside the public `/api/capabilities` inline handler (`app.ts:252-256`) | Exposed via the capabilities response as boolean field `attachmentPersistence` (resolves `true`), but **`rg -rn "attachmentPersistence" artifacts/atlas-frontend/src` returns zero hits — no frontend branch reads or expects this field.** No other `if (process.env.ATTACHMENTS_PERSISTENCE...)` branch exists anywhere in the repo. Source comments `routes/chat.ts:3123` ("Preferred when ATTACHMENTS_PERSISTENCE=true") and `routes/nexus.ts:2372` ("Rejected when ATTACHMENTS_PERSISTENCE=true") describe intended behavior with **no corresponding runtime conditional** — `persistAttachmentsForMessage` runs unconditionally whenever attachments are present (`nexus.ts:3746-3749`), and legacy inline-base64 `attachments[]` are accepted unconditionally by both endpoints. **Conclusion: set-and-read, but controls no observable behavior — vestigial.** | `.replit:80`; `app.ts:254`; `nexus.ts:3746-3749`; `chat.ts:3123`; `nexus.ts:2372` |
| `NODE_ENV` | set to `"production"` in `artifacts/api-server/.replit-artifact/artifact.toml` build/run env blocks | Express (`app.ts`, standard) | Standard prod/dev branching | artifact.toml content |
| `PORT`, `BASE_PATH` | `.replit` `[services.env]` blocks per artifact; also required (throws if unset) in `artifacts/atlas-frontend/vite.config.ts:10-31` | `vite.config.ts` build/serve; root `package.json:7-9` scripts | Controls dev server port and base path; `vite.config.ts:12-13` explicitly relaxes the requirement during `vite build` (`isBuild` check) | `vite.config.ts:9-31` |
| `REPL_ID` | Replit-injected env var | `vite.config.ts:41-50` — gates loading `@replit/vite-plugin-cartographer` and `@replit/vite-plugin-dev-banner`, only when `NODE_ENV !== "production" && REPL_ID !== undefined` | Dev-only Replit tooling plugins never load in production builds | `vite.config.ts:39-51` |
| `DATABASE_URL` | Replit-managed | `index.ts` `pushSchema()` (drizzle-kit push on every boot) and `initStripe()` | If unset, schema push is skipped with a warning rather than crashing | `index.ts` ~lines 52-56 |

**Remaining gap:** a full inventory would require `rg -n "process\.env\." artifacts/api-server/src artifacts/atlas-frontend/src --type ts` across the whole tree and manual classification of every hit — not performed this pass due to scope. Beyond the rows above, this is **runtime-verification-required**, not asserted either LIVE or DEAD.

---

## 10. File/system classification

| File / system | Classification | Evidence |
|---|---|---|
| `artifacts/atlas-frontend/` (entire app) | **LIVE** | Has production build (`artifact.toml` `[services.production]`), is the router-mounted app (`App.tsx`), root `package.json` build scripts target it exclusively — repository-proven |
| `artifacts/atlas-frontend-next/` (entire app) | **ORPHANED (production) / LIVE (dev-preview only)** | No `[services.production]` in its `artifact.toml`; only referenced by `.replit` dev workflow and its own `package.json` scripts. See §1.3. External deployment manifest — external-verification-required. |
| `artifacts/api-server/` | **LIVE** | Has production build+run+healthcheck in `artifact.toml`; is the sole backend process started by `index.ts` — repository-proven |
| `artifacts/crm-benchmark/` | Out of audit scope | Has its own `artifact.toml` (`previewPath = "/crm-benchmark/"`), no production block — not investigated further |
| `artifacts/mockup-sandbox/` | Out of audit scope | `kind = "design"`, `previewPath = "/__mockup"` — not investigated further |
| `useAtlasConversation.ts` | **CANONICAL / LIVE** | See §2 |
| `useNexusChatStream.ts` | **CANONICAL / LIVE** | See §2 |
| `useChatStream.ts` | **LIVE TRANSITIONAL** | See §2, §2.1 |
| `components/home/ActiveRuns.tsx` | **LEGACY BUT REACHABLE** | Self-documented in-source; imported by `AtlasComposerSheet.tsx` → `UnifiedShell.tsx` per `runtime-map.md:71-72` (not independently re-verified this pass — runtime-verification-required) |
| `components/workspace/FlowPanel.tsx` | **LEGACY BUT REACHABLE** | Self-documented in-source; imported conditionally by `workspace.tsx` per `runtime-map.md:92` (not independently re-verified this pass — runtime-verification-required) |
| `routes/chat.ts` (`/api/chat`) | **LIVE TRANSITIONAL** | Multiple confirmed live callers (§3, §5) |
| `routes/nexus.ts` (`/api/nexus/chat`) | **CANONICAL / LIVE** | Confirmed registration + multiple confirmed live callers |
| `routes/runs.ts` (V1.2, `/api/conversations/:id/messages`) | **CANONICAL for the backend route (mount repository-proven); frontend consumer ORPHANED (production)** | See §1.3, §4, §5 |
| App.tsx redirect-stub routes (`/atlas`, `/onboarding`, `/guard-report`, `/compass`, `/sessions`, `/workshop`, `/vault`, `/secrets`, `/dashboard`, `/nexus`, `/showcase`) | **COMPATIBILITY** | See §1.2 |
| `main.tsx` `React.StrictMode` wrapper | **REMOVED** (see §12) | `git log -p artifacts/atlas-frontend/src/main.tsx`, commit `d1083aa6` |

---

## 11. Duplicate-system register

| Duplicated capability | Canonical | Duplicate(s) | Divergence |
|---|---|---|---|
| Conversational send transport | `useAtlasConversation.submit()` → `POST /api/nexus/chat` | (a) `useChatStream.doSend()` → `POST /api/chat` (LIVE TRANSITIONAL, 14 of 16 call sites repository-proven reachable — §2.1), (b) `ActiveRuns.tsx` direct `fetch("/api/chat")`, (c) `FlowPanel.tsx` direct `fetch("/api/chat")`, (d) `routes/runs.ts` backend-to-backend forward to `/api/chat` for V1.2 (runtime-verification-required for the exact forward mechanics, §5) | Duplicates (a)/(b)/(c) skip WhisperGate, CLARIFY/DECIDE, memory chips, plan artifacts — all Nexus-only features; (b)/(c) also skip session creation conventions and `useStagedAttachments`. (a) additionally carries a **repository-proven concrete duplicate-send race at call site `workspace.tsx:8367`** (§2.1). |
| Attachment → base64 conversion | `useAtlasConversation.submit()` calling `fileToBase64Safe()` exactly once per send | (a) `home.tsx` direct `fileToBase64Safe` call outside `useAtlasConversation` (per `attachment-ownership.md:89,96`, not independently re-opened this pass — runtime-verification-required), (b) `FlowPanel.tsx` direct `fileToBase64Safe(imageFile)` call, image-only (repository-proven) | `attachment-ownership.md` states invariant #2: "`fileToBase64Safe` must only be called inside `useAtlasConversation.submit()` for canonical sends." Both duplicates violate this invariant by the doc's own admission. |
| `/api/capabilities` endpoint | inline public handler, `app.ts:252-256` | `capabilitiesRouter` (`routes/index.ts:195`, `router.use(capabilitiesRouter)`) — **resolved this pass: confirmed mounted, and confirmed shadowed** (§4) — repository-proven | The inline handler always answers first due to Express first-match dispatch and earlier registration order; `capabilitiesRouter`'s own route(s) for the same path are unreachable. Whether it also defines non-colliding sub-paths — runtime-verification-required. |
| Frontend app | `artifacts/atlas-frontend` (production) | `artifacts/atlas-frontend-next` (dev-preview only, separate `/atlas-next/` path, separate backend contract `/api/conversations/:id/messages`) | Not a strict duplicate of the same UI — a rewrite targeting the V1.2 backend contract — but represents parallel, only-partially-overlapping frontend investment; see §1.3 |
| Artifact/output storage | `artifacts` table (`artifactsRouter`) | `project_artifacts` (`projectArtifactsRouter`, also read by `chat.ts`/`nexus.ts`), `plan_artifacts` (`blueprint.ts`), `home_artifacts` (raw-SQL legacy, superseded-but-still-live per `routes/index.ts:191` comment and the live `deleteLibraryByLegacy` bridge, `homeArtifacts.ts:100`) | Four overlapping, simultaneously-live tables with no single canonical owner established in code — **external-verification-required** for product-level resolution (§7, §8, §15). |

---

## 12. StrictMode removal in `main.tsx` — dedicated analysis

### 12.1 Exact diff

Commit `d1083aa614fd0bc9eb7f36c0b5b34e9ce0b07a80`, message: `"Changes"`, author `gpt-engineer-app[bot]`, co-authored by `jochanae`, dated `Sun Jul 19 13:39:43 2026 +0000`:

```diff
--- a/artifacts/atlas-frontend/src/main.tsx
+++ b/artifacts/atlas-frontend/src/main.tsx
@@ -10,7 +10,5 @@ installSwGuard();
 installDebugGlobals();
 
 ReactDOM.createRoot(document.getElementById("root")!).render(
-  <React.StrictMode>
-    <App />
-  </React.StrictMode>,
+  <App />,
 );
```

Current file state (repository-proven by direct read, `artifacts/atlas-frontend/src/main.tsx:1-13`): no `React.StrictMode` wrapper exists anywhere in `main.tsx`. `import React from "react"` (line 1) remains, now used only for its default export's implicit JSX runtime dependency, not for `React.StrictMode`.

### 12.2 Commit message / stated intent

The commit message for `d1083aa6` is the generic `"Changes"` — it gives no explicit rationale for the StrictMode removal. No accompanying commit body, no linked issue, no code comment was added at the removal site. The immediately preceding commit in the same file's history (`a610c51c`, "Add detailed logging to track file attachment behavior") was an unrelated logging change. **There is no git-tracked evidence of *why* StrictMode was removed. Classification: UNKNOWN INTENT (repository-proven absence of rationale; the actual reason, if any, is external-verification-required.)**

### 12.3 What StrictMode can and cannot affect

By React's own documented semantics (general framework knowledge, not repo-specific):
- **Can affect:** development-mode-only double-invocation of component render functions, some lifecycle/effect hooks (double-mount/unmount/remount of effects in React 18+), and certain dev-only warnings/state-updater double-invocation.
- **Cannot affect:** production builds. `React.StrictMode` is a no-op in production builds — react-dom detects `process.env.NODE_ENV === "production"` internally and skips the double-invocation machinery. No modification to `react-dom` itself was found that would override this.

### 12.4 Did repo+runtime evidence show the affected environment was actually running a dev StrictMode mount?

1. **Vite config does not special-case StrictMode.** `artifacts/atlas-frontend/vite.config.ts` contains no reference to `StrictMode`/`NODE_ENV` branching beyond `isBuild` gating `PORT`/`BASE_PATH` requiredness (`vite.config.ts:10`) — repository-proven.
2. **Build script (`scripts/build-frontend-prod.sh`)** runs `pnpm --filter @workspace/atlas-frontend run build` (`vite build`), producing a production bundle where StrictMode is inert regardless of source wrapper — repository-proven.
3. **Root `package.json:7`** `dev` script runs plain `vite --host 0.0.0.0`, defaulting to Vite's development mode — the one context where `React.StrictMode`, had it remained, would have been behaviorally active — repository-proven.
4. **Replit deploy config** (`.replit` `[deployment]`) and `artifact.toml` `[services.production]` both point at the built, static `dist/public` output (`serve = "static"`) — production never runs Vite dev server or unminified React — repository-proven.
5. **No repo evidence (build logs, CI config, or runtime logs) is available in this checkout** to confirm which literal mode the *previously deployed, pre-commit-`d1083aa6`* build used at authoring time — **external-verification-required**.

**Conclusion:** repo evidence confirms StrictMode could only ever have had an observable effect in local/Replit `pnpm dev` (Vite dev-mode), never in the deployed production build (repository-proven). Repo evidence contains no log/issue/commit text asserting StrictMode caused a specific problem. Any such claim would require evidence from outside this checkout — **external-verification-required, not fabricated.**

### 12.5 Keep / revert recommendation

**LOW-confidence, non-blocking — no urgent action indicated by repo evidence either way.** Reverting has zero production risk (§12.3/§12.4) and restores a dev-time safety net; keeping it removed sacrifices that safety net without evidence of a current defect. The commit's generic auto-message ("Changes") reads as an incidental/bulk change rather than a documented engineering decision. No recommendation for or against is made here per audit scope ("no fixes, no rebuild plans").

---

## 13. Deletion candidates

### HIGH confidence

| Candidate | Evidence | Action-blocking caveat |
|---|---|---|
| None. | Every "LEGACY BUT REACHABLE" surface found (`ActiveRuns.tsx`, `FlowPanel.tsx`, 14 of 16 `useChatStream`/`doSend` call sites) is repository-proven still reachable and in active use by at least one live surface. No component in this audit was found to have zero importers/zero route registration/zero runtime reachability. | n/a — this is an intentional empty list, not an omission. |

### MEDIUM confidence

| Candidate | Evidence | Exact verification command required before deletion |
|---|---|---|
| App.tsx redirect-stub routes: `/atlas`, `/onboarding`, `/guard-report`, `/compass`, `/sessions`, `/workshop`, `/vault`, `/secrets`, `/dashboard`, `/nexus`, `/showcase` | Each is a `useEffect`-only component that immediately navigates to `/home` (App.tsx:204,276,283-289,296-299,302,305) — repository-proven, no distinct feature rendered | `rg -rn "/onboarding\|/guard-report\|/compass\|/sessions\|/workshop\|/vault\|/secrets\|/dashboard\|/nexus\b\|/showcase" docs/ README.md` plus external-verification-required check of marketing pages/emails/bookmarks that might still deep-link these paths |
| `libraryItemsTable` / `conversationContextItemsTable` typed Drizzle exports (`library_items.ts`) | Zero typed-import consumers confirmed in `artifacts/api-server/src`/`lib` this pass (§7) — repository-proven | `rg -n "libraryItemsTable\|conversationContextItemsTable" lib scripts` — runtime-verification-required before deleting the exports (do not touch the underlying raw-SQL tables) |
| `capabilitiesRouter`'s shadowed route(s) at `routes/index.ts:195` | Confirmed unreachable due to earlier registration of the inline `/api/capabilities` handler at `app.ts:252` (§4) — repository-proven | `rg -n "router\.(get\|post)\(" artifacts/api-server/src/routes/capabilities.ts` to confirm it defines no non-colliding sub-paths before removing the shadowed route(s) |
| `home.tsx` direct `fileToBase64Safe` call (per `attachment-ownership.md:89,96`, "pre-B2 path") | Doc-cited only, not independently re-opened this pass | Open `home.tsx` at the cited line (~148) to confirm the call is still present and whether it's dead code shadowed by `AskAtlasSurface`'s own `useAtlasConversation` usage — runtime-verification-required |

### LOW confidence

| Candidate | Evidence | Verification still required |
|---|---|---|
| `useChatStream.ts` legacy `doSend` machinery in general | Explicitly required by 14 of 16 live automated send paths (§2.1), with only 2 of 16 provably dead | Full migration is a multi-phase project already tracked in the source's own comment ("Migrate to atlasConv.submit() when possible") — not a simple deletion candidate |
| `artifacts/atlas-frontend-next/` | No production build config (§1.3) — repository-proven | External-verification-required: confirm with the team/deployment platform whether this artifact is deployed by some mechanism not visible in `/dev-server` before treating it as truly dead |
| `error_logs` (`admin.ts`) vs. `atlas_error_logs` (`atlas_error_logs.ts`) — one of the two may be a stale duplicate | Both confirmed live-imported (§7) | `rg -n "errorLogsTable" artifacts/api-server/src` to see if `admin.ts`'s table has any writer besides the admin panel — runtime-verification-required |

### KEEP (explicitly, not candidates for deletion)

| Item | Reason |
|---|---|
| `ATTACHMENTS_PERSISTENCE` env var and its single read site (`app.ts:254`) | Vestigial in effect (controls no observable behavior, §9) but **removal is gated on an external-verification-required check**: confirm no external dashboard/ops tool polls `GET /api/capabilities` and keys behavior off the `attachmentPersistence` field before deleting the `.replit` entry and the `app.ts:254` line. |
| `home_artifacts` raw-SQL table and `routes/homeArtifacts.ts` | Live dual-write bridge to Library (`homeArtifacts.ts:100`), not a completed cutover (§7/§8) — deleting either side without first completing the Library migration would break the delete-sync bridge. |
| `stripeRouter`'s unauthenticated mount posture | Consistent with, and likely required for, Stripe webhook signature verification — not a bug pending contrary evidence. |

### MIGRATE-BEFORE-DELETION (not simple deletions)

| Item | Migration prerequisite | Evidence |
|---|---|---|
| 14 reachable `doSend()` call sites in `workspace.tsx` (5068, 6748, 6930, 6980, 7044, 7054, 7486, 7501, 8018, 8084, 8367, 9242, 9283, 9291) | Migrate each trigger (auto-apply, agentic loop, import-greeting, suggestion-chip DOM event, "Build Anyway") onto `atlasConv.submit()` one at a time, verifying the trigger still fires and the response still renders in `nexusBridge.messages` after each change | §2.1, repository-proven call-site list |
| `ActiveRuns.tsx` direct `/api/chat` sender | Migrate to `useAtlasConversation`/`useNexusChatStream` per the file's own comment ("Do NOT add new features here. Migrate to atlasConv.submit() when possible") | `ActiveRuns.tsx:316-341` |
| `FlowPanel.tsx` direct `/api/chat` sender + non-image filename-reduction behavior | Migrate to canonical stack; additionally decide product-level whether FlowPanel should gain real non-image attachment support or intentionally remain text-only | `FlowPanel.tsx:366-399` |
| `home.tsx` direct `fileToBase64Safe` call | Confirm reachability, then migrate onto `useAtlasConversation.submit()`'s single conversion point per `attachment-ownership.md` invariant #2 | `attachment-ownership.md:89,96` |

### EXTERNAL-VERIFICATION-REQUIRED (cannot be resolved from this repo checkout)

| Item | What external evidence is needed |
|---|---|
| Four-way artifact-table overlap (`artifacts`/`project_artifacts`/`plan_artifacts`/`home_artifacts`) | Product/architecture decision on which table is canonical for "Outputs"/"Artifacts" going forward |
| `atlas-frontend-next` deployment status | The actual Replit (or other) deployment manifest/target outside `/dev-server`, to confirm whether any production traffic reaches it despite the absence of a `[services.production]` block |
| `ATTACHMENTS_PERSISTENCE` capabilities-field consumer | Confirmation that no external dashboard/ops tool reads `GET /api/capabilities`'s `attachmentPersistence` field |
| StrictMode removal rationale | Any external record (support ticket, Replit Agent session transcript, deleted commit) explaining why `d1083aa6` removed `React.StrictMode` |
| Whether the model provider can ingest non-image MIME types forwarded unfiltered by `/api/nexus/chat` | Provider API contract/documentation for the specific model(s) in use |

---

## 14. Ordered deletion waves with verification requirements

> Per audit scope, this section lists an ORDER OF VERIFICATION, not an execution plan — no deletions are recommended without the listed verification steps being completed by someone with write access and a full test/staging cycle.

**Wave 0 (verification-only, must precede any deletion) — mostly resolved this pass, remaining items listed:**
1. ~~Resolve the mount lines for `homeArtifactsRouter`, `libraryRouter`, `capabilitiesRouter`, `verifyRouter`, `runsRouter`~~ — **DONE this pass, §4.**
2. ~~Confirm the literal value and context of `useNexusWorkspaceChat`~~ — **DONE this pass, §2.1/§9 (`workspace.tsx:4738`).**
3. ~~Reproduce the 16-call-site `doSend` table independently~~ — **DONE this pass, §2.1.**
4. ~~Confirm `askAtlasHelpers.ts` exports/importers~~ — **DONE this pass, §2/§8.**
5. Confirm the actual Replit deployment manifest/target for `atlas-frontend-next` outside this repo checkout — **still external-verification-required.**
6. Open `routes/runs.ts` directly to resolve the model-ingestion trace for `POST /api/conversations/:id/messages` (§5) — **still runtime-verification-required.**
7. Open `routes/capabilities.ts` to confirm whether it defines any non-colliding sub-paths beyond the shadowed `/capabilities` (§4/§13) — **still runtime-verification-required.**

**Wave 1 (lowest risk — after Wave 0):** Remove or consolidate the 11 redirect-stub routes in `App.tsx` (§13 MEDIUM) — contingent on confirming no external deep-links target them.

**Wave 2 (requires product sign-off, not just code verification):** Migrate `ActiveRuns.tsx`/`FlowPanel.tsx` legacy senders and the 14 reachable `doSend()` call sites onto `atlasConv.submit()` (§13 MIGRATE-BEFORE-DELETION) before any deletion of the legacy `useChatStream` stack — both source files explicitly mark themselves migration targets, not standalone deletion candidates.

**Wave 3 (architecture decision, not code cleanup):** Resolve `atlas-frontend-next`'s deployment status and the four-way artifact-table overlap (§13 EXTERNAL-VERIFICATION-REQUIRED) before any deletion of related code, since both require evidence outside this repo checkout.

---

## 15. Target-state canonical-owner map

For each area, states the current repository-proven canonical owner, or explicitly flags "ownership decision required" where code alone does not establish one.

| Area | Current canonical owner (repository-proven) | Ownership decision required? |
|---|---|---|
| Frontend app | `artifacts/atlas-frontend/` (production build, router-mounted `App.tsx`) | No — `atlas-frontend-next` is dev-preview-only per repo config (§1.3); confirming no hidden external deployment target is external-verification-required, but *within this repo* ownership is unambiguous. |
| Router (frontend) | `wouter`, `App.tsx` `Switch`/`WouterRouter` | No. |
| Router (backend) | `routes/index.ts` (65 routers, all mounted exactly once, §4) mounted under `app.ts:258` `/api` prefix, plus a small set of deliberate pre-router mounts in `app.ts` | No, for mounting. **Yes** for `/api/capabilities`: two implementations exist (`app.ts:252` inline, `capabilitiesRouter` at `routes/index.ts:195`), one silently shadowing the other — **ownership decision required**: pick one implementation and delete/merge the other (§4, §13). |
| Ask Atlas | `pages/home.tsx` → `components/home/AskAtlasSurface.tsx` → `useAtlasConversation.submit()` → `/api/nexus/chat` | No. |
| Workspace conversation | `pages/workspace.tsx` (`Workspace`) → `atlasConv.submit()` (canonical) for user-composer sends; `useChatStream`/`doSend()` still owns 14 reachable automated/side-path sends (§2.1) | **Yes** — the automated/side-path sends (auto-apply, agentic loop, import-greeting, suggestion-chip DOM event, "Build Anyway") have no single owner today; they are split across `doSend()`/`useChatStream` and the canonical `atlasConv.submit()`, with a proven duplicate-send race at `workspace.tsx:8367`. **Decision required: migrate all automated triggers onto `atlasConv.submit()`, or formally document the dual-path design and add a shared in-flight lock.** |
| Composer | `useStagedAttachments.ts` (canonical, feeds `useAtlasConversation.submit()`) for Ask Atlas + Workspace user composer; `ActiveRuns.tsx`/`FlowPanel.tsx` each maintain their own ad-hoc, non-`useStagedAttachments` staging | **Yes** for ActiveRuns/FlowPanel — both are self-documented as intended to migrate onto the canonical composer/staging stack. |
| Attachment staging | `useStagedAttachments.ts` | No, for the canonical path itself. |
| Conversation submission | `useAtlasConversation.submit()` (`hooks/useAtlasConversation.ts`) — the sole documented single conversion point for `fileToBase64Safe()` | **Yes** — `home.tsx`'s direct `fileToBase64Safe` call and `FlowPanel.tsx`'s direct call both violate the documented single-conversion-point invariant; ownership decision required to either eliminate them or formally amend the invariant. |
| Chat endpoint | `POST /api/nexus/chat` (`routes/nexus.ts:2358`) is the CANONICAL endpoint; `POST /api/chat` (`routes/chat.ts`) is LIVE TRANSITIONAL and still the exclusive endpoint for `useChatStream`/`ActiveRuns.tsx`/`FlowPanel.tsx`; `POST /api/conversations/:id/messages` (`routes/runs.ts`) is a third, V1.2-only endpoint whose internal delegation is unresolved (§5) | **Yes** — three live chat-ingestion endpoints exist simultaneously with only one ("Nexus") documented as the long-term target; a decision is required on whether/when `/api/chat` and `/api/conversations/:id/messages` are retired or formally kept as parallel surfaces. |
| Model ingestion | Split: WhisperGate intent classification is shared (`builderProtocols.ts`) between `nexus.ts` and `chat.ts`; exact provider/model call lines in both files are runtime-verification-required (§5) | Cannot fully assess ownership without the runtime-verification-required trace; no code-level evidence of a single shared model-ingestion module — **candidate decision required** once traced: whether model-call logic should be consolidated into one shared module rather than duplicated per-endpoint. |
| Message persistence | `nexus_messages` (Nexus turns), `chat_messages` (`/api/chat` turns), `message_attachments` (all attachment metadata via `persistAttachmentsForMessage`) — all repository-proven live and distinct (§7) | No, for what currently writes what. **Yes** for whether `chat_messages` should eventually be retired once `/api/chat` is retired — contingent on the chat-endpoint decision above. |
| Outputs / Artifacts | No single owner: `artifacts`, `project_artifacts`, `plan_artifacts`, `home_artifacts` all live (§7, §8) | **Yes — explicit ownership decision required.** This is the single largest unresolved architectural duplication in this audit. |
| Preview | Two entry points (`app.ts:117` inline, `previewRouter` at `routes/index.ts:156`); relationship unresolved (§8) | **Yes**, pending the runtime-verification-required trace of whether they overlap. |
| GitHub / Changes | GitHub: `routes/github.ts` (registered, uncontested). "Changes": no dedicated router exists at all (§8) | **Yes** for "Changes" — if this is a real product surface, it needs an explicit backend owner; currently it is (at best) a frontend label over other routers' data with no code-level owner. |
| Library | `routes/library.ts` (raw SQL against `library_items`/`conversation_context_items`), superseding `home_artifacts` per an in-code comment, but the cutover is incomplete (live dual-write bridge, §7/§8) | **Yes** — decision required on when to complete the `home_artifacts` → Library cutover and delete the legacy raw-SQL table/bridge. |
| Deployment | `artifacts/api-server/` (backend) and `artifacts/atlas-frontend/` (frontend) both have full `[services.production]` blocks and are the only two artifacts with a production build/run/health-check path in this repo (§1.3, §10) | No, within this repo. `atlas-frontend-next`'s real-world deployment status is external-verification-required, not an in-repo ownership question. |
| Workers | `startScheduledChecksWorker()`, `startCapacityResetWorker()` (both unconditional at boot, `index.ts:1634-1635`), plus five startup backfills (`index.ts:1583-1599`, §8) | No — all confirmed single-owner, unconditional startup functions with no competing implementation found. |

---

## Appendix: Remaining external/runtime-only unknowns

The following items could not be resolved from static repository inspection alone and are the only items still marked UNKNOWN in this document. Each states the specific external or runtime evidence needed.

| Item | What is needed |
|---|---|
| `atlas-frontend-next` real-world deployment status | The actual Replit deployment manifest/target configuration outside `/dev-server` (or equivalent ops/infra record), to determine whether any production traffic reaches this artifact despite the absence of a `[services.production]` block in its `artifact.toml`. — **external-verification-required** |
| StrictMode removal rationale (`main.tsx`, commit `d1083aa6`) | Any external record — support ticket, Replit Agent session transcript, deleted/squashed commit message, Slack/issue-tracker thread — explaining the intent behind removing `<React.StrictMode>`; none exists in git history for this repo. — **external-verification-required** |
| `ATTACHMENTS_PERSISTENCE` capabilities-field consumer | Confirmation (from an external dashboard, ops tool, or client integration outside this repo) that nothing polls `GET /api/capabilities` and keys behavior off the `attachmentPersistence` field, before it is safe to delete the `.replit` entry and the `app.ts:254` computation. — **external-verification-required** |
| Four-way artifact-table product ownership (`artifacts`/`project_artifacts`/`plan_artifacts`/`home_artifacts`) | A product/architecture decision from the team on which table is the intended long-term canonical store for "Outputs"/"Artifacts" — this is a design question, not something code inspection can answer. — **external-verification-required** |
| Whether downstream model providers can ingest arbitrary non-image MIME types forwarded unfiltered by `/api/nexus/chat` | The specific model provider's API documentation/contract for the model(s) actually configured at runtime (which model/provider is selected was not pinned to an exact line this pass either, see §5) — **external-verification-required**, contingent also on the runtime-verification-required model-call trace in §5 |
| Whether `runsRouter`'s (`routes/runs.ts`) `POST /api/conversations/:id/messages` handler is exercised by any traffic in practice, given its frontend consumer (`atlas-frontend-next`) has no production build | Production/staging traffic logs or APM data for this specific route, which are not present in this repository — **external-verification-required** (the code-level reachability itself is repository-proven; only actual usage is external) |

Every item above requires evidence this repository checkout structurally cannot contain (external deployment configuration, external issue/ops records, live traffic data, or third-party API documentation). All other previously-UNKNOWN items from earlier drafts of this audit have been resolved to repository-proven findings or explicit runtime-verification-required commands in the sections above (see in particular §2.1, §4, §5, §6, §7, §8, §9, §13).
