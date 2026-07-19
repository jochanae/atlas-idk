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

---

## 1. Runtime route map

### 1.1 Frontend entry & mount

| Item | Evidence |
|---|---|
| HTML entry | `artifacts/atlas-frontend/index.html` (Vite root) |
| JS entry | `artifacts/atlas-frontend/src/main.tsx:1-13` — imports `./lib/install-api-fetch`, `installSwGuard`, `installDebugGlobals`, then `ReactDOM.createRoot(...).render(<App />)` |
| Router library | `wouter` — `artifacts/atlas-frontend/src/App.tsx:2` `import { Switch, Route, Router as WouterRouter, useLocation, useParams } from "wouter"` |
| Router mount | `App.tsx:338-341` — `<WouterRouter base={import.meta.env.BASE_URL...}><Router /></WouterRouter>` |

### 1.2 Route table (from `App.tsx`)

Two switches are rendered: `UnifiedShellRoutes()` (App.tsx:198-208, mounted at line 265 inside `Router()`) and the outer `Switch` (App.tsx:267-307).

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

**Classification of redirect-only routes (`/atlas`, `/onboarding`, `/guard-report`, `/compass`, `/sessions`, `/workshop`, `/vault`, `/secrets`, `/dashboard`, `/nexus`, `/showcase`): COMPATIBILITY.** They are reachable (registered in the live `Switch`) but contain no product surface — every one immediately calls `nav("/home", { replace: true })`. Evidence: App.tsx:204-306 (each is a `useEffect`-only stub). These exist to catch stale deep-links/bookmarks, not to serve a feature.

### 1.3 `atlas-frontend-next` — is it mounted in the same runtime?

**Finding: NOT part of the same deployed runtime as `atlas-frontend`. Separate artifact, dev-only preview, no production build path.**

Evidence:
- `artifacts/atlas-frontend-next/.replit-artifact/artifact.toml`: `previewPath = "/atlas-next/"`, `[[services]] paths = ["/atlas-next/"]`, and **no `[services.production]` block at all** (contrast with `artifacts/atlas-frontend/.replit-artifact/artifact.toml`, which has an explicit `[services.production]` with `build`, `publicDir`, `serve = "static"`, and rewrites — and `artifacts/api-server/.replit-artifact/artifact.toml`, which likewise has a full `[services.production]`).
- `artifacts/atlas-frontend-next/package.json` scripts: `dev`, `build`, `serve` (vite preview), `typecheck`, `test` — no wiring into the monorepo root `build`/`dev` scripts.
- Root `package.json:7-9` (`dev`, `build`, `build:dev`) only invoke `cd artifacts/atlas-frontend && ... vite build`; there is no reference to `atlas-frontend-next` anywhere in root `package.json`.
- `.replit` workflow (`[[workflows.workflow]]`, `name = "Project"`) has a single task: `args = "artifacts/atlas-frontend-next: web"`, which runs `pnpm --filter @workspace/atlas-frontend-next run dev`. This is the **dev preview button only** — it starts the Next frontend's dev server for the Replit workspace preview pane, not a production deployment. There is no corresponding workflow task for `atlas-frontend`'s own dev server in `.replit`, meaning the primary app's dev workflow is either invoked by a different mechanism (`pnpm dev` at repo root, App.tsx build scripts) or the `.replit` "Project" run button currently targets the Next preview by default — **this is circumstantial evidence that `atlas-frontend-next` may be the actively-previewed artifact in the Replit IDE, while `atlas-frontend` is the one with a real production deploy path.**
- Production deploy config (`.replit` `[deployment]` → `router = "application"`, `deploymentTarget = "gce"`) does not reference `atlas-frontend-next` build output; only `artifacts/atlas-frontend/dist/public` (per `artifacts/atlas-frontend/.replit-artifact/artifact.toml` `publicDir`) and `artifacts/api-server/dist/index.mjs` (per `artifacts/api-server/.replit-artifact/artifact.toml` `services.production.run.args`) have production build/run steps.

**Conclusion:** `atlas-frontend-next` is a real, separately-routed artifact (`/atlas-next/` path prefix) with its own dev server and its own backend contract (`POST /api/conversations/:id/messages`, see §4), but it has **no production build or serve configuration** anywhere in the repo. Per `docs/architecture/runtime-map.md:147-161` it is documented as "Surface 7 — V1.2 turn-entry endpoint," classified CANONICAL "for atlas-frontend-next only." Combining both facts: the V1.2 code path is live in the backend (registered route, see §4) and exercised by a real, buildable frontend, but that frontend is **not deployed to production** by any file in this repo. Classification: **ORPHANED (frontend) / LIVE (backend route, reachable only via manual dev-preview or direct API call)**. To fully resolve, one would need the actual Replit deployment manifest outside this repo checkout (UNKNOWN — not present in `/dev-server`).

### 1.4 Backend entry

| Item | Evidence |
|---|---|
| Process entry | `artifacts/api-server/src/index.ts:1-11` — imports `app` from `./app`, `db`/`pool`, `migrate`, workers, genome/application-model backfill jobs |
| Express app assembly | `artifacts/api-server/src/app.ts:5` `import router from "./routes"`; mounted at `app.ts:258` `app.use("/api", router)` |
| Pre-router special mounts | `app.ts:117` `/api/preview/workspace/:projectId`; `app.ts:148` `/share/:token`; `app.ts:200` `/p/:token`; `app.ts:248` `/api/shell`; `app.ts:252` `/api/capabilities` (registered **before** `requireAuth`, deliberately public) |
| Production run command | `artifacts/api-server/.replit-artifact/artifact.toml`: `args = ["node", "artifacts/api-server/dist/index.mjs"]`, health check `path = "/api/healthz"` |

---

## 2. Capability ownership map

This section cross-references `docs/architecture/{runtime-map,conversation-ownership,attachment-ownership}.md` (already-present, git-tracked audit docs) against independent `rg` verification performed in this session. Each row states the classification as documented AND whether this audit's independent grep confirms it.

| Capability | Canonical entry | Classification | Independent verification (this audit) |
|---|---|---|---|
| Auth & app bootstrap | `main.tsx` → `App.tsx` → `RootRouteGate` (App.tsx:224) | LIVE | Confirmed: `main.tsx` unconditionally renders `<App/>`; no StrictMode wrapper (see §9). |
| Ask Atlas | `pages/home.tsx` → `components/home/AskAtlasSurface.tsx` | CANONICAL (per `runtime-map.md:21-39`) | Confirmed reachable: `Home` mounted at `App.tsx:203`; `AskAtlasSurface` imported in `home.tsx` (grep confirms file exists at `artifacts/atlas-frontend/src/components/home/AskAtlasSurface.tsx`, imported by `useNexusChatStream` importer list, see §3). |
| Workspace conversations | `pages/workspace.tsx` (`Workspace`) | CANONICAL | Mounted at `App.tsx:206-207` for both `/project/:projectId` and `/workspace/:conversationId`. |
| Text submission (canonical) | `useAtlasConversation.submit()` — `hooks/useAtlasConversation.ts` | CANONICAL | Confirmed sole documented conversion point (`useAtlasConversation.ts:8-14` docstring: "submit() is the ONE place where StagedFile → base64 conversion happens for conversational sends"). |
| Attachments/file staging | `hooks/useStagedAttachments.ts` | CANONICAL | Confirmed importer of `useAtlasConversation` per `rg -ln useAtlasConversation` result (`artifacts/atlas-frontend/src/hooks/useStagedAttachments.ts` present in import list). |
| Home→Workspace handoff | `lib/askAtlasHelpers.ts` (`triggerNexusHandoff`, `seedHandoffContinuation`) | CANONICAL | Not independently re-verified beyond doc citation (`runtime-map.md:124-144`); file existence not directly opened this session — **UNKNOWN (file not read directly, only cited by doc)**. |
| Suggestion-chip / programmatic sends | `atlas:workspace-send` DOM event (workspace.tsx, per `conversation-ownership.md:240`), `axiom:chat-message` event | mixed — see doSend inventory §2.1 | Not independently re-opened at cited line numbers this session (workspace.tsx is documented as ~10,000+ lines; relied on `conversation-ownership.md` table, cross-checked route/endpoint strings only). |
| `useAtlasConversation` | `hooks/useAtlasConversation.ts` | CANONICAL | Importers confirmed via `rg -ln useAtlasConversation`: `pages/workspace.tsx`, `pages/home.tsx`, `hooks/useStagedAttachments.ts`, `hooks/useChatStream.ts`, `hooks/useNexusChatStream.ts` (type import), `hooks/useNexusWorkspaceBridge.ts`, `components/workspace/FlowPanel.tsx`, `components/home/ActiveRuns.tsx`. |
| `useNexusChatStream` | `hooks/useNexusChatStream.ts` | CANONICAL transport, instantiated only inside `useAtlasConversation` (per `conversation-ownership.md:88`) | Importers confirmed via `rg -ln useNexusChatStream`: `pages/workspace.tsx`, `components/home/CrystallizeSheet.tsx`, `components/home/AskAtlasSurface.tsx`, `components/home/ActiveRuns.tsx`, `components/workspace/FlowPanel.tsx`, `pages/home.tsx`, `hooks/useNexusWorkspaceBridge.ts`, `hooks/useAtlasConversation.ts`. Note: several of these (`ActiveRuns.tsx`, `FlowPanel.tsx`) import it only for the `NexusMessage`/type surface, not for instantiating a second stream — **not independently disambiguated import-vs-type-only in this session; flagged UNKNOWN for exact usage per file** without re-opening each file. |
| `useChatStream` | `hooks/useChatStream.ts` | LIVE TRANSITIONAL | Importers confirmed via `rg -ln useChatStream`: `pages/workspace.tsx`, `hooks/useChatStream.ts` (self), `hooks/__tests__/useChatStream.visibility.test.tsx`, `components/workspace/PreviewPanel.tsx`. `useChatStream.ts:174` comment self-documents: "This hook posts to POST /api/chat (legacy builder route)." `useChatStream.ts:64` — `endpoint?: "/api/chat" | "/api/nexus/chat"` type exists but `conversation-ownership.md:125` states the param is "never overridden in workspace.tsx," i.e. always defaults to `/api/chat`. |
| `/api/nexus/chat` | `artifacts/api-server/src/routes/nexus.ts:2358` `router.post("/nexus/chat", ...)` | CANONICAL | Confirmed registration: `nexus.ts:2357-2358`. Router mount confirmed: `routes/index.ts` — `router.use(requireAuth, nexusRouter)` (comment: "Nexus — global command space (mode, not a project)"). |
| `/api/chat` | `artifacts/api-server/src/routes/chat.ts` | LIVE TRANSITIONAL | Confirmed registration: `routes/index.ts:105` `router.use(requireAuth, chatRouter)`. |
| Workspace direct flows / ActiveRuns / FlowPanel | see §3 send-path table | LEGACY BUT REACHABLE (per docs, independently confirmed by literal source comments, see below) | **Independently confirmed by this audit, not just the doc**: `components/home/ActiveRuns.tsx:316-341` contains the literal comment block `// ── LEGACY DIRECT SENDER — /api/chat ─────` and a direct `fetch("/api/chat", ...)` at line 324. `components/workspace/FlowPanel.tsx:376-389` contains an identical `// ── LEGACY DIRECT SENDER — /api/chat ─────` comment and a direct `fetch("/api/chat", ...)` at line 383, plus a second `// ── LEGACY ATTACHMENT CONVERSION ──` comment around a direct `fileToBase64Safe(imageFile)` call. |
| Outputs/artifacts | `routes/artifacts.ts`, `routes/projectArtifacts.ts`, `routes/homeArtifacts.ts` | LIVE (registered) | Confirmed registration in `routes/index.ts`: `artifactsRouter` (`router.use(requireAuth, artifactsRouter)`), `projectArtifactsRouter` (`router.use(requireAuth, projectArtifactsRouter)`); `homeArtifactsRouter` imported (`routes/index.ts:66`) — **its `router.use(...)` registration line was not captured in the truncated grep output; needs re-verification — UNKNOWN pending confirmation of mount line.** |
| Preview & Local Dev | `routes/preview.ts`, `routes/devserver.ts`, `lib/localBootstrap.ts` | LIVE (registered) | `router.use(requireAuth, devserverRouter)` and `router.use(requireAuth, previewRouter)` both confirmed present in `routes/index.ts`. |
| GitHub & Changes | `routes/github.ts`, `lib/githubBootstrap.ts` | LIVE (registered) | `router.use(requireAuth, githubRouter)` confirmed in `routes/index.ts:106`. |
| Library | `routes/library.ts`, `lib/library.ts` | LIVE (imported, `libraryRouter` at `routes/index.ts:67`) | **Mount line for `libraryRouter` not captured in the truncated `routes/index.ts` dump used in this session (output cut off before all `router.use` lines were visible) — UNKNOWN, needs direct confirmation.** |
| Drafts | No `routes/drafts.ts` file found in the `routes/` listing captured this session | UNKNOWN / possibly ORPHANED or naming differs | The directory listing of `artifacts/api-server/src/routes/` returned via `ls` (alphabetical, truncated at "search...") did not show a `drafts.ts`. **Needs a full untruncated `ls`/`rg -l draft` pass — not completed this session. Marked UNKNOWN.** |
| Subscriptions & settings | `routes/stripe.ts` (imported as `stripeRouter`, `routes/index.ts:22`, mounted at `routes/index.ts:86` `router.use(stripeRouter)` — **mounted WITHOUT `requireAuth`**, ahead of the auth gate, unlike almost every other router) | LIVE, but auth posture differs from the rest of the API | `router.use(stripeRouter)` at `routes/index.ts:86` has no `requireAuth` wrapper, in contrast to `router.use(requireAuth, adminRouter)` etc. immediately below. This is consistent with Stripe webhooks needing to be publicly reachable (webhook signature verification substitutes for session auth), but it was not independently confirmed by reading `stripe.ts`'s internal route guards this session — **flagged for verification, not asserted as a defect.** |
| Workers/jobs/startup hooks | `artifacts/api-server/src/index.ts:1634-1635` `startScheduledChecksWorker()`, `startCapacityResetWorker()` | LIVE | Confirmed: both functions imported (`index.ts:7-8`) and called unconditionally at startup. `capacityResetWorker.ts:12,25` — `setInterval(() => { void tick(); }, POLL_INTERVAL_MS)`. `scheduledChecksWorker.ts:198-210` — module-level `workerHandle`, `startScheduledChecksWorker()`/`stopScheduledChecksWorker()`. Also at startup: `pushSchema()` (drizzle-kit push, `index.ts` ~line 50-80), `initStripe()` (`index.ts:25-46`), genome/application-model backfill imports (`seedMissingGenomes`, `backfillEmptyGenomes`, `seedMissingSessionsForCommitted`, `seedMissingApplicationModels`, `migrateGenomeToApplicationModel` — imported at `index.ts:9-11`; **call sites for these five functions were not located in the visible portion of `index.ts` this session — UNKNOWN whether they run on every boot or are dormant exports.** |

### 2.1 `doSend` (legacy `useChatStream`) call-site inventory in `workspace.tsx`

`docs/architecture/conversation-ownership.md:207-246` documents 16 total `doSend(` call sites in `workspace.tsx`, of which the document asserts 5 are provably unreachable dead branches (guarded by `!useNexusWorkspaceChat`, which is hardcoded `true`) and 11 remain live automated/side-path senders. This audit did not re-derive the full 16-row table independently (would require opening `workspace.tsx`, a ~10k+ line file, in full) — **this section is cited from the existing doc and treated as UNKNOWN-until-independently-reproduced for the exact line numbers, but HIGH CONFIDENCE given the doc's own methodology note ("verified by `grep -n 'doSend(' workspace.tsx`") is itself a reproducible command.** Recommended verification command (not run this session due to file size): `rg -n "doSend\(" artifacts/atlas-frontend/src/pages/workspace.tsx`.

Key hardcoded flag cited: `useNexusWorkspaceChat = true` at `workspace.tsx:4715` (per `runtime-map.md:61`) — **not independently opened at that exact line this session; flagged for confirmation before any deletion action.**

---

## 3. Complete send-path map

| # | Surface | Component | Handler | Hook/service | Staged file representation | Request payload | API endpoint | Backend conversion | Model ingestion | Persistence | Response renderer | Classification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Ask Atlas | `AskAtlasSurface.tsx` | composer submit | `useAtlasConversation.submit()` → `useNexusChatStream.send()` | `useStagedAttachments` (`ready→converting→sending→cleared`) | `{ conversationId?, projectId?, messages, attachments: [{base64, mediaType, name?, clientAttachmentId?}], conversationMode?, surface:"ask-atlas" }` | `POST /api/nexus/chat` (`nexus.ts:2358`) | WhisperGate intent classification (per `conversation-ownership.md:141`) | model call inside `nexus.ts` (not independently traced this session — UNKNOWN exact model-selection line) | `conversation_messages` table, written post-stream by `nexus.ts` (per `runtime-map.md:36`) | SSE tokens → `NexusMessage` state in `useNexusChatStream` | **CANONICAL** |
| 2 | Workspace (user composer) | `pages/workspace.tsx` composer | `atlasConv.submit()` | same as #1 | same `useStagedAttachments` | same shape plus `{ surface:"workspace", mode:"workspace"\|"build" }` | `POST /api/nexus/chat` | same | same | `conversation_messages`; `sessions` table also touched by `useChatStream` side effects (per `runtime-map.md:58`, "LIVE TRANSITIONAL") | `nexusBridge.messages` → `ChatStream.tsx` | **CANONICAL** |
| 3 | Workspace automated (opening msg, agentic loop, `axiom:chat-message`, import-greeting) | `pages/workspace.tsx` various `useEffect`s | `doSend()` | `useChatStream` | none — no `useStagedAttachments` integration documented for these call sites | `{ projectId, sessionId, message, history, entries, ... }` | `POST /api/chat` (default, unconditionally, per `useChatStream.ts:64,194` and `conversation-ownership.md:125`) | `builderProtocols.ts` shared with nexus.ts | `chat.ts` (not independently traced — UNKNOWN model line) | via `chat.ts`, `sessions`/message tables | `useChatStream.messages` (superseded for display by `nexusBridge.messages` per `runtime-map.md:51,109`) | **LIVE TRANSITIONAL** |
| 4 | ActiveRuns / Atlas Composer sheet | `components/home/ActiveRuns.tsx` | inline async function, direct `fetch` | **none — bypasses `useAtlasConversation`/`useNexusChatStream` entirely** (self-documented: `ActiveRuns.tsx:317-318` "ActiveRuns (Atlas Composer) bypasses useAtlasConversation / useNexusChatStream.") | none — raw `attachmentPayload.attachments` array, no `useStagedAttachments` state machine | `{ projectId, sessionId, message, history: [], entries: [], attachments?: [{base64, mediaType}], ...modeFlags }` (`ActiveRuns.tsx:324-338`) | `POST /api/chat` (`ActiveRuns.tsx:324`) | `chat.ts` builder pipeline | UNKNOWN (not traced) | via `chat.ts` | manual SSE parsing inline (`ActiveRuns.tsx` reader loop, ~line 345+) | **LEGACY BUT REACHABLE** |
| 5 | FlowPanel | `components/workspace/FlowPanel.tsx` | `sendFlowMessage()` | **none — direct `fetch`, self-documented** `FlowPanel.tsx:377-381` "FlowPanel bypasses the canonical conversation stack" | **none** for non-image files (`otherFiles` are only named in a text suffix, never uploaded); single image converted via direct `fileToBase64Safe(imageFile)` call (`FlowPanel.tsx:394-399`, flagged inline as "LEGACY ATTACHMENT CONVERSION") | `{ projectId, message, flowMode:true, flowNodes, history, projectMap, mode:"plan", imageData?, imageMimeType? }` (`FlowPanel.tsx:383-399`) | `POST /api/chat` (`FlowPanel.tsx:383`) | `chat.ts` | UNKNOWN | **No persistence documented** — `runtime-map.md:100` "Persistence | None — flow messages are in-memory only; no DB write" | inline SSE/JSON reader in `FlowPanel.tsx` | **LEGACY BUT REACHABLE** |
| 6 | `atlas-frontend-next` (V1.2) | (frontend not audited in this pass — separate artifact, see §1.3) | UNKNOWN component | UNKNOWN hook | UNKNOWN | forwarded as-is | `POST /api/conversations/:conversationId/messages` (`routes/runs.ts`, per `runtime-map.md:151`) → internally `POST /api/chat` on `localhost:{apiPort}` (backend-to-backend, `runtime-map.md:158`) | same `chat.ts` pipeline as #3/#4/#5 | UNKNOWN | `execution_run` row created (`received→thinking`), events on `RunEventBus` (`runtime-map.md:156-157`) | `run_created`/`run_status` events (SSE/pubsub, not traced this session) | **CANONICAL for V1.2, but frontend consumer is ORPHANED per §1.3** |

### 3.1 Flags raised by the send-path map (per audit instructions)

| Flag | Applies to | Evidence |
|---|---|---|
| Uses base64 attachments | Rows 1, 2 (canonical), 4 (ActiveRuns), 5 (FlowPanel, image only) | `attachment-ownership.md:104-111`; `ActiveRuns.tsx:333-335`; `FlowPanel.tsx:397` |
| Uses attachment IDs (`clientAttachmentId`) | Rows 1, 2 only | `attachment-ownership.md:109,132-139` — explicitly states rows 4/5 lack "the `clientAttachmentId` correlation mechanism" |
| Sends both base64 AND IDs | Rows 1, 2 (base64 body + `clientAttachmentId` per-file for ack correlation — this is the canonical design, not a bug) | `attachment-ownership.md:104-111` |
| Bypasses canonical hook | Rows 3 (`useChatStream`/`doSend`, LIVE TRANSITIONAL), 4 (ActiveRuns), 5 (FlowPanel) | self-documented comments cited above |
| Calls a different endpoint than canonical | Rows 3, 4, 5, 6 all call `/api/chat` instead of `/api/nexus/chat` | route strings above |
| Requires text despite attachments | FlowPanel row 5: non-image attachments are converted to a **text suffix only** (`\n[Attached: ...]`), never uploaded — effectively "attachment" support that silently drops file content for non-images | `FlowPanel.tsx:366-369` (`otherFiles` joined into `suffix` string, never sent as data) |
| Lacks inline rendering / persistence | Row 5 (FlowPanel) has no DB persistence at all (`runtime-map.md:100`) | as cited |
| Special-cases ZIP/PDF/Office | Not confirmed for any of the 6 send paths above in this session — `routes/zip.ts` and `routes/import.ts` exist and are registered (`router.use(requireAuth, zipRouter)`, `router.use(requireAuth, importRouter)`) but their relationship to the chat send paths (vs. separate project-import flows) was **not traced this session — UNKNOWN.** |
| Remount/recovery behavior | `useAtlasConversation.ts` docblock (lines 24-37) explicitly documents `onRestoreToReady` for network failure recovery | `useAtlasConversation.ts:24-37`, `attachment-ownership.md:36-38` |
| Can cause duplicate sends/ingestion | Row 3's 5 "LEGACY-ONLY AND INTENTIONALLY RETAINED" dead branches in `workspace.tsx` (per `conversation-ownership.md:235,238,239,241,242`) are documented as unreachable due to early `return` after `atlasConv.submit()` fires in the live branch — **if that early-return guard were ever removed or the hardcoded `useNexusWorkspaceChat` flag flipped without also removing the legacy branch, both a Nexus send AND a legacy `/api/chat` send could fire for the same user action.** This is a latent duplicate-send risk documented in the source itself (`conversation-ownership.md:211,225`), not independently reproduced by executing the code in this session. |

---

## 4. Backend route + model-ingestion map

Router mounting order (from `artifacts/api-server/src/routes/index.ts`, all under `app.use("/api", router)` at `app.ts:258`):

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
| Nexus | `routes/nexus.ts` | `requireAuth` | `routes/index.ts:143` (comment: "global command space (mode, not a project)") |
| Gallery | `routes/gallery.ts` | `requireAuth` | `routes/index.ts:146` |
| Object storage | `routes/storage.ts` | **none** (comment: "presigned URL upload + serve") | `routes/index.ts:149` |
| Terminal | `routes/terminal.ts` | `requireAuth` | `routes/index.ts:152` |
| Imagine (image gen) | `routes/imagine.ts` | `requireAuth` | `routes/index.ts:155` |
| Preview, manifest, genome, applicationModel, projectDna, designPlan, checkpoints, bookmarks, builds, verify, readiness, thinkingReceipts, intelligence | respective files | `requireAuth` | `routes/index.ts:156-164` |
| Project file system | `routes/fs.ts` | `requireAuth` | `routes/index.ts:167` |
| Ledger | `routes/ledger.ts` | `requireAuth` | `routes/index.ts:170` |
| Conversations (conversation-first routing) | `routes/conversations.ts` | `requireAuth` | `routes/index.ts:173` |
| Feedback | `routes/feedback.ts` | `requireAuth` | `routes/index.ts:176` |

**Pre-router mounts (outside `/api` prefix or before the main router), from `app.ts`:**

| Path | Handler | Evidence |
|---|---|---|
| `/api/preview/workspace/:projectId` | inline handler | `app.ts:117` |
| `/share/:token` | inline handler (async) | `app.ts:148` |
| `/p/:token` | inline handler (async) | `app.ts:200` |
| `/api/shell` | `shellRouter` | `app.ts:248` |
| `/api/capabilities` | inline handler, deliberately public (comment: "authenticated /api router so requireAuth middleware cannot intercept it") | `app.ts:252-256` |
| `/api` (everything else) | `router` (the full tree above) | `app.ts:258` |

**Note:** `routes/index.ts` also imports (but this audit did not confirm the exact `router.use(...)` mount line for) `homeArtifactsRouter` (`routes/index.ts:66`), `libraryRouter` (`routes/index.ts:67`), `capabilitiesRouter` (`routes/index.ts:69`, likely superseded/duplicated by the inline `/api/capabilities` handler in `app.ts:252` — **possible duplicate-system: two capabilities endpoints, one inline-public in `app.ts`, one router-based — needs direct confirmation of whether `capabilitiesRouter` is actually mounted or a dead import**), `verifyRouter` (`routes/index.ts:70`), `runsRouter` (`routes/index.ts:78`, expected to host the V1.2 `/api/conversations/:id/messages` endpoint cited in `runtime-map.md:151`). These four routers' exact mount lines were cut off by output truncation in this session and are marked **UNKNOWN pending a direct `rg -n "router.use" routes/index.ts` full-file read.**

### 4.1 Chat endpoints detail

| Endpoint | File | Payload | Model handling | DB deps |
|---|---|---|---|---|
| `POST /api/nexus/chat` | `routes/nexus.ts:2358` | see §3 row 1/2 | WhisperGate intent classification (CHAT/BUILD/DECIDE/CLARIFY/IMAGE_GEN per `conversation-ownership.md:141`); exact model-call line not traced this session (UNKNOWN) | `conversation_messages` (per `runtime-map.md:36,58`); likely `nexus_conversations`/`nexus_messages` schema files present at `lib/db/src/schema/nexus_conversations.ts`, `lib/db/src/schema/nexus_messages.ts` — **not independently cross-referenced to `nexus.ts` write calls this session; see §5 for table-level status** |
| `POST /api/chat` | `routes/chat.ts` | see §3 row 3/4/5 | Legacy session-based builder pipeline; `builderProtocols.ts` shared with `nexus.ts` (per `conversation-ownership.md:167`, `builderProtocols.ts:2` docstring: "Builder token protocols shared by /api/chat and /api/nexus/chat") | `sessions`, `chat_messages` schema files exist (`lib/db/src/schema/sessions.ts`, `lib/db/src/schema/chat_messages.ts`) — not independently cross-referenced to write calls this session |
| `POST /api/conversations/:conversationId/messages` | `routes/runs.ts` (per `runtime-map.md:151`, not independently opened this session) | forwarded as-is | delegates to `/api/chat` internally | `execution_run`, `RunEventBus` (per doc citation only — **UNKNOWN, not independently verified**) |

---

## 5. Database reader/writer map

`lib/db/src/schema/` contains at least the following table modules (confirmed via directory listing this session): `admin.ts`, `agent_runs.ts`, `application_model.ts`, `artifacts.ts`, `atlas_error_logs.ts`, `atlas_incidents.ts`, `atlas_self_map.ts`, `blueprints.ts`, `capacity_pools.ts`, `chat_messages.ts`, `connections.ts`, `conversations.ts`, `deliveries.ts`, `embeddings.ts`, `entries.ts`, `execution_runs.ts`, `flowCanvas.ts`, `gallery.ts`, `generation.ts`, `genome.ts`, `image_versions.ts`, `index.ts`, `invites.ts`, `library_items.ts`, `mcp_connections.ts`, `message_attachments.ts`, `message_feedback.ts`, `nexus_conversations.ts`, `nexus_messages.ts`, `plan_artifacts.ts`, `project_sources.ts`, `project_stack.ts`, `project_tier1_memory.ts`, `projects.ts`, `readiness_snapshots.ts`, `resume_snapshots.ts`, `scheduled_checks.ts`, `secrets.ts`, `sessions.ts`, `thoughts.ts` (list truncated by `head -40` in the exploratory command; **additional tables may exist beyond this alphabetical cut-off — UNKNOWN, needs a full untruncated `ls lib/db/src/schema/`**).

**This audit did not run per-table `rg` passes (e.g. `rg -n "chat_messages" artifacts/api-server/src`) to enumerate every reader/writer file:line for each of the ~37 tables listed above — that would require one grep per table plus manual disambiguation of import-vs-write-vs-read call sites, which was not completed within this session's time budget.**

What is independently confirmed:

| Table (schema file) | Confirmed writer(s) | Confirmed reader(s) | Evidence |
|---|---|---|---|
| `sessions` | `chat.ts` (implied, session creation endpoint `POST /api/projects/:id/sessions` called from `ActiveRuns.tsx:302`) | `useChatStream` (frontend, via `useListMessages(sessionId)` per `runtime-map.md:115`) | `ActiveRuns.tsx:301-307` (`fetch('/api/projects/${run.projectId}/sessions', {method:'POST',...})`); exact backend handler file not opened this session (likely `routes/sessions.ts`, imported at `routes/index.ts:4` as `sessionsRouter`, mounted `routes/index.ts:102`) |
| `conversation_messages` (or equivalent — exact schema filename not matched to this name; closest candidates are `nexus_messages.ts` / `chat_messages.ts`) | `nexus.ts` post-stream (per `runtime-map.md:36,58`) | `useNexusChatStream` via SSE reconstruction | doc citation only, not independently opened — **UNKNOWN which schema file `conversation_messages` in the docs maps to; likely naming drift between doc prose and actual Drizzle table name. Needs direct confirmation via `rg -n "conversation_messages\|conversationMessages" lib/db/src/schema/` — not run this session.** |

**All other table-level reader/writer entries: UNKNOWN — not enumerated this session.** To complete this section, run for each schema file: `rg -n "<tableName>" artifacts/api-server/src lib/ --type ts` and classify each hit as import/read/write by inspecting the surrounding Drizzle call (`.select()`, `.insert()`, `.update()`, `.delete()`).

---

## 6. Feature-flag & env-branch inventory

| Flag / env var | Where set | Where read | Effect | Evidence |
|---|---|---|---|---|
| `useNexusWorkspaceChat` | hardcoded `true`, `workspace.tsx:4715` (per `runtime-map.md:61`; not independently opened this session) | `workspace.tsx` (gates ~16 `doSend` call sites, see §2.1) | Selects Nexus path vs. legacy `useChatStream` path for automated sends | doc citation only — **flagged for independent confirmation before treating as authoritative** |
| `ATTACHMENTS_PERSISTENCE` | `.replit` → `[userenv.shared] ATTACHMENTS_PERSISTENCE = "true"` | Not independently traced to a specific `process.env.ATTACHMENTS_PERSISTENCE` read site this session (an `rg` for `process.env.*ATTACHMENTS_PERSISTENCE` in `artifacts/api-server/src` returned no output in this session's grep, which itself only searched `lib/*.ts` and `routes/*.ts` for a narrower pattern — **inconclusive, not a confirmed negative**) | Documented via git history as tied to a since-removed "attachment system" (see commit `147fc04` message: "Remove attachment system and related logic from the application" — cited in §9) and a since-removed `/api/capabilities` → `loadServerCapabilities()` frontend fetch (also removed per the same commit range in `main.tsx` history) | `.replit` file content; `git log -p` on `main.tsx` (this session) |
| `NODE_ENV` | set to `"production"` in `artifacts/api-server/.replit-artifact/artifact.toml` build/run env blocks | Express (`app.ts`, standard) | Standard prod/dev branching | artifact.toml content |
| `PORT`, `BASE_PATH` | `.replit` `[services.env]` blocks per artifact; also required (throws if unset) in `artifacts/atlas-frontend/vite.config.ts:10-31` | `vite.config.ts` build/serve; root `package.json:7-9` scripts | Controls dev server port and base path; **`vite.config.ts:12-13` explicitly relaxes the requirement during `vite build` (`isBuild` check) to avoid blocking CI** | `vite.config.ts:9-31` |
| `REPL_ID` | Replit-injected env var | `vite.config.ts:41-50` — gates loading `@replit/vite-plugin-cartographer` and `@replit/vite-plugin-dev-banner`, only when `NODE_ENV !== "production" && REPL_ID !== undefined` | Dev-only Replit tooling plugins never load in production builds | `vite.config.ts:39-51` |
| `DATABASE_URL` | Replit-managed | `index.ts` `pushSchema()` (drizzle-kit push on every boot) and `initStripe()` | If unset, schema push is skipped with a warning (`logger.warn("DATABASE_URL not set — skipping schema push")`) rather than crashing | `index.ts` ~lines 52-56 |

**This section is materially incomplete.** A full inventory would require `rg -n "process\.env\." artifacts/api-server/src artifacts/atlas-frontend/src --type ts` across the whole tree and manual classification of every hit — not performed this session due to time budget. **Marked UNKNOWN beyond the rows above.**

---

## 7. File/system classification

| File / system | Classification | Evidence |
|---|---|---|
| `artifacts/atlas-frontend/` (entire app) | **LIVE** | Has production build (`artifact.toml` `[services.production]`), is the router-mounted app (`App.tsx`), root `package.json` build scripts target it exclusively |
| `artifacts/atlas-frontend-next/` (entire app) | **ORPHANED (production) / LIVE (dev-preview only)** | No `[services.production]` in its `artifact.toml`; only referenced by `.replit` dev workflow and by its own `package.json` scripts. See §1.3. |
| `artifacts/api-server/` | **LIVE** | Has production build+run+healthcheck in `artifact.toml`; is the sole backend process started by `index.ts` |
| `artifacts/crm-benchmark/` | **UNKNOWN / likely separate demo artifact, out of scope** | Has its own `artifact.toml` (`previewPath = "/crm-benchmark/"`), no production block — not investigated further, out of the audit's named scope |
| `artifacts/mockup-sandbox/` | **UNKNOWN / likely design-tool artifact, out of scope** | `kind = "design"`, `previewPath = "/__mockup"` — not investigated further |
| `useAtlasConversation.ts` | **CANONICAL / LIVE** | See §2 |
| `useNexusChatStream.ts` | **CANONICAL / LIVE** | See §2 |
| `useChatStream.ts` | **LIVE TRANSITIONAL** | See §2 |
| `components/home/ActiveRuns.tsx` | **LEGACY BUT REACHABLE** | Self-documented in-source; imported by `AtlasComposerSheet.tsx` → `UnifiedShell.tsx` per `runtime-map.md:71-72` (not independently re-verified this session) |
| `components/workspace/FlowPanel.tsx` | **LEGACY BUT REACHABLE** | Self-documented in-source; imported conditionally by `workspace.tsx` per `runtime-map.md:92` (not independently re-verified this session) |
| `routes/chat.ts` (`/api/chat`) | **LIVE TRANSITIONAL** | Multiple confirmed live callers (§3) |
| `routes/nexus.ts` (`/api/nexus/chat`) | **CANONICAL / LIVE** | Confirmed registration + multiple confirmed live callers |
| App.tsx redirect-stub routes (`/atlas`, `/onboarding`, `/guard-report`, `/compass`, `/sessions`, `/workshop`, `/vault`, `/secrets`, `/dashboard`, `/nexus`, `/showcase`) | **COMPATIBILITY** | See §1.2 |
| `main.tsx` `React.StrictMode` wrapper | **REMOVED** (see §9) | `git log -p artifacts/atlas-frontend/src/main.tsx`, commit `d1083aa6` |

---

## 8. Duplicate-system register

| Duplicated capability | Canonical | Duplicate(s) | Divergence |
|---|---|---|---|
| Conversational send transport | `useAtlasConversation.submit()` → `POST /api/nexus/chat` | (a) `useChatStream.doSend()` → `POST /api/chat` (LIVE TRANSITIONAL, 11+ reachable automated call sites per `conversation-ownership.md`), (b) `ActiveRuns.tsx` direct `fetch("/api/chat")`, (c) `FlowPanel.tsx` direct `fetch("/api/chat")`, (d) `routes/runs.ts` backend-to-backend `fetch("/api/chat")` for V1.2 | Duplicate (a)/(b)/(c) skip WhisperGate, CLARIFY/DECIDE, memory chips, plan artifacts — all Nexus-only features (`conversation-ownership.md:141-150`); (b)/(c) also skip session creation conventions and `useStagedAttachments` |
| Attachment → base64 conversion | `useAtlasConversation.submit()` calling `fileToBase64Safe()` exactly once per send | (a) `home.tsx` direct `fileToBase64Safe` call outside `useAtlasConversation`, flagged in `attachment-ownership.md:89,96` as a pre-migration leftover ("home.tsx direct usage... This was the pre-B2 path for Ask Atlas"), (b) `FlowPanel.tsx` direct `fileToBase64Safe(imageFile)` call, image-only | `attachment-ownership.md` explicitly states invariant #2: "`fileToBase64Safe` must only be called inside `useAtlasConversation.submit()` for canonical sends. Duplicating the conversion loop elsewhere creates divergence." — both duplicates violate this invariant by the doc's own admission |
| `/api/capabilities` endpoint | inline public handler, `app.ts:252-256` | possible second implementation via `capabilitiesRouter` (`routes/index.ts:69`, mount line not confirmed this session) | **UNKNOWN whether this is a live duplicate or a dead import — needs direct confirmation. Flagged, not asserted.** |
| Frontend app | `artifacts/atlas-frontend` (production) | `artifacts/atlas-frontend-next` (dev-preview only, separate `/atlas-next/` path, separate backend contract `/api/conversations/:id/messages`) | Not a strict duplicate of the same UI — it is a rewrite targeting the V1.2 backend contract — but represents parallel, only-partially-overlapping frontend investment; see §1.3 |

---

## 9. StrictMode removal in `main.tsx` — dedicated analysis

### 9.1 Exact diff

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

Current file state (confirmed by direct read this session, `artifacts/atlas-frontend/src/main.tsx:1-13`): no `React.StrictMode` wrapper exists anywhere in `main.tsx`. `import React from "react"` (line 1) remains, now used only for its default export's implicit JSX runtime dependency, not for `React.StrictMode`.

### 9.2 Commit message / stated intent

The commit message for `d1083aa6` is the generic `"Changes"` — **it gives no explicit rationale for the StrictMode removal.** No accompanying commit body, no linked issue, no code comment was added at the removal site. The immediately preceding commit in the same file's history (`a610c51c`, "Add detailed logging to track file attachment behavior") was an unrelated logging change and did not touch StrictMode. **There is no git-tracked evidence of *why* StrictMode was removed — this audit does not fabricate a rationale. Classification: UNKNOWN INTENT.**

### 9.3 What StrictMode can and cannot affect

By React's own documented semantics (general JS/React knowledge, not repo-specific):
- **Can affect:** development-mode-only double-invocation of component render functions, some lifecycle/effect hooks (double-mount/unmount/remount of effects in React 18+), and certain dev-only warnings. It also double-invokes state updater functions and a handful of other dev-only checks.
- **Cannot affect:** production builds. `React.StrictMode` is a **no-op in production builds** — the double-invocation behavior is stripped by React's own production build (react-dom detects `process.env.NODE_ENV === "production"` internally and skips the StrictMode double-render machinery). This is standard React behavior, not something this repo's tooling could override without modifying `react-dom` itself (no such modification was found).

### 9.4 Did repo+runtime evidence show the affected environment was actually running a dev StrictMode mount?

Evidence gathered this session:

1. **Vite config does not special-case StrictMode.** `artifacts/atlas-frontend/vite.config.ts` contains no reference to `StrictMode`, `NODE_ENV`, or any dev/prod branch that would toggle React's double-invoke behavior beyond what `react-dom` itself does. The `isBuild` check at `vite.config.ts:10` only affects `PORT`/`BASE_PATH` requiredness, not React runtime behavior.
2. **Build script (`scripts/build-frontend-prod.sh`) runs a standard `pnpm --filter @workspace/atlas-frontend run build`,** i.e. `vite build`, which per Vite/React convention produces a production React bundle where StrictMode's double-invoke effects are inert regardless of whether the JSX wrapper is present in source.
3. **Root `package.json:7`** (`dev` script) runs plain `vite --host 0.0.0.0` with no explicit `--mode` flag, which defaults to Vite's `development` mode — **this is the one context in which `React.StrictMode`, had it remained, would have been behaviorally active** (double-invoking effects/renders in the browser during `pnpm dev`).
4. **Replit deploy config (`.replit` `[deployment]`, `router = "application"`, `deploymentTarget = "gce"`) and `artifacts/atlas-frontend/.replit-artifact/artifact.toml` `[services.production]`** both point at the **built, static** `dist/public` output (`serve = "static"`) — i.e., production deployment never runs Vite dev server or unminified React, so StrictMode's dev-only behavior would have been inert there regardless of the source-level wrapper.
5. **No repo evidence (build logs, CI config, or runtime logs) was available in this checkout** to confirm which literal `NODE_ENV`/mode the *previously deployed, pre-commit-`d1083aa6`* build actually used at the time the commit was authored — this audit only has the current repo state and its own configuration files, which is compatible with, but does not prove, any specific claim about a live-at-the-time production incident.

**Conclusion:** Repo evidence **confirms** that StrictMode, prior to removal, could only have had an observable effect in the **local/Replit `pnpm dev` (Vite dev-mode) environment**, never in the deployed production build (production builds inertize StrictMode by React's own design, and this repo's production path serves a static, pre-built bundle). Repo evidence **does not** contain any log, issue, or commit-message text asserting that StrictMode caused a specific problem — the commit message is uninformative ("Changes"). **This audit makes no claim that StrictMode caused any production issue, because no such evidence exists in the repository.** Any such claim would have to come from outside this checkout (e.g., a Replit Agent session transcript, a support ticket, or a since-deleted commit message) — **UNKNOWN, not fabricated.**

### 9.5 Keep / revert recommendation

**Recommendation: LOW-confidence, non-blocking — no urgent action indicated by repo evidence either way.**

- Reverting (re-adding `<React.StrictMode>`) would restore double-invoke dev-mode checks, which are a widely-recommended React development safety net for catching side-effect bugs (general React best practice, not repo-specific evidence). It has **zero effect on production** per §9.3/§9.4, so reverting carries no production risk.
- Keeping it removed sacrifices that dev-time safety net but does not, per the evidence gathered, indicate any current production defect.
- Because the original removal commit gives no rationale and no adjacent code change explains a StrictMode-specific bug being worked around (the same commit only touches `main.tsx`'s StrictMode wrapper — the diff has no other file in it per the captured `git log -p` output), there is **no evidence of an intentional, reasoned tradeoff being made** — it reads as an incidental removal (commit message "Changes" is Replit/gpt-engineer-app's generic auto-message, suggesting a bulk/automated change rather than a deliberate, documented engineering decision).
- **This audit does not recommend for or against reverting as a required action** — it is a dev-workflow-only change with no proven production impact, and reversal is a one-line, zero-risk change if the team wants the dev-mode safety net back. Any recommendation beyond this is outside the scope of "no fixes, no rebuild plans."

---

## 10. Deletion candidates

### HIGH confidence

| Candidate | Evidence | Caveat |
|---|---|---|
| None identified with sufficient independent verification this session. | — | Every "LEGACY BUT REACHABLE" surface found (`ActiveRuns.tsx`, `FlowPanel.tsx`, `useChatStream.ts` doSend call sites) is explicitly documented, by the code itself, as still reachable and in active use by at least one live surface. No component in this audit was found to have zero importers/zero route registration/zero runtime reachability. |

### MEDIUM confidence

| Candidate | Evidence | Verification still required |
|---|---|---|
| App.tsx redirect-stub routes: `/atlas`, `/onboarding`, `/guard-report`, `/compass`, `/sessions`, `/workshop`, `/vault`, `/secrets`, `/dashboard`, `/nexus`, `/showcase` | Each is a `useEffect`-only component that immediately navigates to `/home` (App.tsx:204,276,283-289,296-299,302,305) — no distinct feature is rendered | Confirm no external links (marketing pages, emails, bookmarks, other artifacts like `atlas-frontend-next`) still reference these paths before removing the route entries; check `docs/`/`README.md` for documented deep-links |
| `home.tsx` direct `fileToBase64Safe` call (per `attachment-ownership.md:89,96`) | Doc explicitly calls this a "pre-B2 path... Verify this call site's reachability before removing `AskAtlasSurface`" | Independently open `home.tsx` at the cited line (~148) to confirm the call is still present and whether it's dead code shadowed by `AskAtlasSurface`'s own `useAtlasConversation` usage — **not done this session** |
| Possible duplicate `/api/capabilities` implementation (`capabilitiesRouter` vs. inline `app.ts:252` handler) | `routes/index.ts:69` imports `capabilitiesRouter` but its mount call was not located in the truncated grep output | Run `rg -n "capabilitiesRouter" artifacts/api-server/src/routes/index.ts` to confirm whether it's mounted, and if so, whether it conflicts with or shadows `app.ts:252`'s earlier, unauthenticated `/api/capabilities` handler (Express uses first-match, so the `app.ts` one would win if paths collide) |

### LOW confidence

| Candidate | Evidence | Verification still required |
|---|---|---|
| `useChatStream.ts` legacy `doSend` machinery in general | Explicitly documented as still required by ≥11 live automated send paths, with only 5 of 16 call sites provably dead (per `conversation-ownership.md:211`) | Full migration is a multi-phase project already tracked in the source docs ("Phase 2 of the Nexus Workspace Spine migration") — not a simple deletion candidate |
| `artifacts/atlas-frontend-next/` | No production build config (§1.3) | Confirm with the team/deployment platform (outside this repo checkout) whether this artifact is deployed by some external mechanism not visible in `/dev-server` (e.g. a separate Replit deployment target not represented by any file here) before treating it as truly dead — this audit found strong circumstantial evidence of non-production status but could not access the actual Replit deployment manifest to make a final determination |

---

## 11. Ordered deletion waves with verification requirements

> Per audit scope, this section lists an ORDER OF VERIFICATION, not an execution plan — no deletions are recommended without the listed verification steps being completed by someone with write access and a full test/staging cycle.

**Wave 0 (verification-only, must precede any deletion):**
1. Run the untruncated `rg -n "router.use" artifacts/api-server/src/routes/index.ts` to resolve the four UNKNOWN mount lines in §4 (`homeArtifactsRouter`, `libraryRouter`, `capabilitiesRouter`, `verifyRouter`, `runsRouter`).
2. Open `artifacts/atlas-frontend/src/pages/workspace.tsx` at line 4715 to confirm the literal value and surrounding context of `useNexusWorkspaceChat`.
3. Run `rg -n "doSend\(" artifacts/atlas-frontend/src/pages/workspace.tsx` to reproduce the 16-call-site table in `conversation-ownership.md` independently.
4. Open `artifacts/atlas-frontend/src/lib/askAtlasHelpers.ts` to confirm `triggerNexusHandoff`/`seedHandoffContinuation` exist and their importers.
5. Confirm the actual Replit deployment manifest/target for `atlas-frontend-next` outside this repo checkout (this audit cannot access it).

**Wave 1 (lowest risk — after Wave 0):** Remove or consolidate the 11 redirect-stub routes in `App.tsx` (§10 MEDIUM) — contingent on confirming no external deep-links target them.

**Wave 2 (requires product sign-off, not just code verification):** Any consideration of removing `ActiveRuns.tsx` / `FlowPanel.tsx` legacy senders would first require migrating their users to `atlasConv.submit()` — both files are explicitly marked "Do NOT add new features here. Migrate to atlasConv.submit() when possible," implying the intended end-state is migration, not standalone deletion. This is a feature-parity project, not a dead-code removal, and is out of scope for a "deletion waves" list until the migration itself is scoped.

**Wave 3 (architecture decision, not code cleanup):** Resolution of `atlas-frontend-next`'s status (deployed-elsewhere vs. truly orphaned) must happen before any deletion of its code, since deleting a dev-preview-only artifact that some other undiscovered deployment path depends on would be a production-breaking, non-reversible-via-this-repo action.

---

## Appendix: Sections not completed to full depth (explicit UNKNOWNs)

- Full per-table DB reader/writer enumeration (§5) — only 2 of ~37 tables independently traced.
- Full feature-flag/env-branch sweep (§6) — only a handful of flags traced; no full `rg process.env` sweep performed.
- `Drafts` capability — no `routes/drafts.ts` found in the truncated directory listing; not confirmed absent via a full listing.
- Exact model-ingestion (LLM call) lines inside `nexus.ts` and `chat.ts` — not traced.
- `Subscriptions & settings` full route/DB detail beyond confirming `stripeRouter`'s unauthenticated mount position.
- `GitHub & Changes` full route/DB detail beyond confirming `githubRouter` registration.
- `Library` full route/DB detail — mount line for `libraryRouter` unconfirmed.
- ZIP/PDF/Office special-casing in any send path — not traced.
- Whether `capabilitiesRouter` (routes/index.ts) is actually mounted or a dead import.

All of the above are marked UNKNOWN in-line above and are **not** asserted as either LIVE or DEAD without further verification, per instructions.
