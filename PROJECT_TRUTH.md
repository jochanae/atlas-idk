# PROJECT_TRUTH.md

**Generated:** 2026-06-16 from the actual codebase. Source of truth for what this frontend expects, where it points, and what's real.

> **Editing rule:** When anything below changes, update this file in the same commit. Stale truth is worse than no truth.

---

## 1. Backend

| Item | Value | Source |
|---|---|---|
| Backend repo | `Axiom-Atlas` (GitHub, separate repo) | User-stated |
| Runtime | **Google Cloud Run** (not Railway, not Render) | User-stated |
| Base URL | `https://axiom-atlas-689827072865.us-east1.run.app` | `.env` `VITE_API_URL`, `src/lib/api.ts:4` |
| Override env | `VITE_API_URL`, fallback `VITE_API_BASE_URL` | `src/lib/api.ts:5` |
| Edited by | Cursor only (Lovable is forbidden — see `PROJECT_STRUCTURE.md`) | Lane contract |

The frontend fetch shim (`src/lib/install-api-fetch.ts`) intercepts every bare `fetch("/api/...")` call and rewrites it to `${API_BASE}/api/...`. So any string starting with `/api/` in `src/` is a backend call.

---

## 2. Auth model

| Layer | Detail | Source |
|---|---|---|
| Token storage | `localStorage["atlas-auth-token"]` | `src/hooks/useAuth.ts:15` (`AUTH_TOKEN_KEY`) |
| Header sent | `Authorization: Bearer <token>` | `src/hooks/useAuth.ts:40` (`authHeaders()`) |
| Cookie | `atlas-session` (httpOnly, sameSite=lax) — backend-owned | `src/lib/api.ts:13` comment |
| Cross-origin | Both cookie + bearer sent. `credentials: 'include'` on all `/api/auth/me` calls | `src/hooks/useAuth.ts:46` |
| Identity probe | `GET /api/auth/me` → returns `AuthUser` or 401 | `src/hooks/useAuth.ts:44-54` |
| Token bridge | `/token-bridge` page receives token after OAuth and stores it | `src/pages/token-bridge.tsx` |
| Sign-in routes | `/api/auth/login`, `/api/auth/signup`, `/api/auth/google`, `/api/auth/session/exchange` | grep |

**Why both:** the Lovable preview origin differs from Cloud Run, so cookies alone aren't reliable cross-origin. The bearer token is the durable identity; the cookie is the convenience.

---

## 3. Backend routes referenced by the frontend

**102 unique `/api/*` paths** appear in `src/`. Status column is **`unknown`** for every route — Lovable cannot verify runtime status without re-running the curl audit. The user reported on 2026-06-15 that "33 routes returned 401 not 404" (i.e. live + gated by auth), but did not save the exact list. **Action: re-run audit and fill the Status column.**

<details>
<summary>Grouped route list (click to expand)</summary>

### Auth
- `POST /api/auth/login` · `POST /api/auth/signup` · `POST /api/auth/logout`
- `GET  /api/auth/me` · `GET /api/auth/account` · `GET /api/auth/profile`
- `POST /api/auth/change-password` · `POST /api/auth/forgot-password` · `POST /api/auth/reset-password`
- `GET  /api/auth/google` · `POST /api/auth/session/exchange`

### Nexus (chat)
- `POST /api/nexus/chat` · `POST /api/nexus/handoff` · `POST /api/nexus/name`
- `GET  /api/nexus/conversations` · `POST /api/nexus/conversation/save`
- `GET  /api/nexus/thread` · `GET /api/nexus/briefing` · `GET /api/nexus/activity`
- `POST /api/nexus/visualize`

### Projects / Entries / Sessions / Ledger
- `/api/projects` · `/api/projects/:id` · `/api/projects/:id/blueprint` · `/api/projects/tensions`
- `/api/entries/all` · `/api/entries/:id`
- `/api/sessions/:id` · `/api/sessions/:id/reflection-mode`
- `/api/thoughts` · `/api/thoughts/:id`
- `/api/parked` (via `/api/state`)

### Forge / Codegen / Build
- `POST /api/forge` · `POST /api/forge/intake`
- `POST /api/codegen` · `POST /api/quick-prompt` · `POST /api/shaping/hold`
- `POST /api/chat` · `POST /api/chat/scenario-keep`

### GitHub integration
- `/api/github/oauth/start` · `/api/github/token` · `/api/github/status` · `/api/github/auto-link`
- `/api/github/repos` · `/api/github/repos/:id` · `/api/github/branch` · `/api/github/tree` · `/api/github/file`
- `/api/github/commit` · `/api/github/pr` · `/api/github/revert` · `/api/github/apply-local`
- `/api/github/analyze` · `/api/github/full-import` · `/api/github/typecheck` · `/api/github/deployment`

### Dev server / preview / deploy
- `/api/devserver/start` · `/api/devserver/stop` · `/api/devserver/status`
- `/api/preview/session/:id` · `/api/deploy/after-push`
- `/api/terminal/exec` · `/api/terminal/explain`

### Storage / artifacts / gallery / vault / secrets
- `/api/artifacts` · `/api/artifacts/:id`
- `/api/gallery` · `/api/gallery/:id` · `/api/gallery/request-url`
- `/api/vault` · `/api/vault/:id` · `/api/secrets` · `/api/secrets/:id`
- `/api/storage` · `/api/upload/code-context` · `/api/import`

### Connectors / MCP
- `/api/connectors/directory` · `/api/connectors/active` · `/api/connectors/active/:id`
- `/api/connectors/connect` · `/api/connectors/custom`
- `/api/connections` · `/api/connections/status` · `/api/connections/:id`
- `/api/mcp/discover` · `/api/mcp/connect` · `/api/mcp/connections` · `/api/mcp/connections/:id`

### Self-map / admin / state
- `/api/selfmap/refresh` · `/api/self/modified` · `/api/self/apply` · `/api/self/push`
- `/api/state` · `/api/state/ui/logic`
- `/api/stats/dashboard` · `/api/jobs`
- `/api/admin/users` · `/api/admin/users/:id` · `/api/admin/notes` · `/api/admin/notes/:id`
- `/api/admin/invites` · `/api/admin/invites/:id` · `/api/admin/stats` · `/api/admin/errors`
- `/api/errorlog/ingest`

### Image / AI
- `POST /api/image/generate`

### Stripe
- `/api/stripe/checkout` · `/api/stripe/portal` · `/api/stripe/products` · `/api/stripe/subscription`

### Misc
- `/api/health` · `/api/healthz` · `/api/users/me` · `/api/waitlist`

</details>

---

## 4. Database

| Item | Value | Source |
|---|---|---|
| DB engine | **Supabase PostgreSQL** (cutover from Neon on 2026-06-15) | User-stated, mem://features/backend-stack |
| Owned by | Cloud Run's `DATABASE_URL` env var | Backend repo (not visible to Lovable) |
| Edited by | Cursor + manual SQL by user. **Lovable never writes SQL.** | Lane contract |

### Two Supabase projects exist — do not confuse them

| Role | Project ref | Where it shows up |
|---|---|---|
| **Backend DB (user's project)** | `osuasytymbzurjvklhde` | `.env` `SUPABASE_URL` — this is what Cloud Run reads. **The "32 tables" live here.** |
| **Lovable Cloud (this preview)** | `lmrpnsjckljdwqudtelk` | `.env` `VITE_SUPABASE_*` — only powers the in-preview Supabase client and Lovable Cloud edge functions. |

**Critical:** the `<supabase-tables>` Lovable sees in context (16 tables: `bought_lessons`, `build_states`, `chat_messages`, `entries`, `generated_files`, `knowledge_entries`, `ledger_entries`, `parked_items`, `profiles`, `project_compass`, `project_invitations`, `projects`, `recommendations`, `session_comments`, `sessions`, `workspace_nodes`) is the **Lovable Cloud project**, NOT the backend DB. Lovable cannot enumerate the production tables — the user must paste the list from `osuasytymbzurjvklhde` if needed here.

### Production tables (32, confirmed 2026-06-16 by user paste from `osuasytymbzurjvklhde`)

| # | Table | # | Table |
|---|---|---|---|
| 1 | `admin_notes` | 17 | `image_versions` |
| 2 | `artifacts` | 18 | `invites` |
| 3 | `atlas_error_logs` | 19 | `mcp_connections` |
| 4 | `atlas_incidents` | 20 | `messages` |
| 5 | `atlas_self_map` | 21 | `nexus_messages` |
| 6 | `blueprints` | 22 | `project_flow_canvas` |
| 7 | `chat_messages` | 23 | `project_forge_state` |
| 8 | `check_results` | 24 | `projects` |
| 9 | `connections` | 25 | `readiness_snapshots` |
| 10 | `conversations` | 26 | `scheduled_checks` |
| 11 | `entries` | 27 | `secrets` |
| 12 | `error_logs` | 28 | `sessions` |
| 13 | `gallery_images` | 29 | `thoughts` |
| 14 | `generated_files` | 30 | `user_sessions` |
| 15 | `generation_runs` | 31 | `users` |
| 16 | `home_conversations` | 32 | `vault` |

**Heads-up: multiple chat-shaped tables exist** — `chat_messages`, `messages`, `nexus_messages`, `conversations`, `home_conversations`. The frontend should not assume which one a given `/api/*` route writes to; treat each as opaque to Lovable. Confirm with Cursor before changing any chat UI that depends on persistence shape.

**In Lovable Cloud preview but NOT in prod** (preview-only — do NOT assume frontend can use these in production): `bought_lessons`, `build_states`, `knowledge_entries`, `ledger_entries`, `parked_items`, `profiles`, `project_compass`, `project_invitations`, `recommendations`, `session_comments`, `workspace_nodes`.

**In prod but NOT in Lovable Cloud preview** (must go through Cloud Run `/api/*` — frontend never reads direct): `admin_notes`, `artifacts`, `atlas_error_logs`, `atlas_incidents`, `atlas_self_map`, `blueprints`, `check_results`, `connections`, `conversations`, `error_logs`, `gallery_images`, `generation_runs`, `home_conversations`, `image_versions`, `invites`, `mcp_connections`, `messages`, `nexus_messages`, `project_flow_canvas`, `project_forge_state`, `readiness_snapshots`, `scheduled_checks`, `secrets`, `thoughts`, `user_sessions`, `users`, `vault`.

---

## 5. Frontend folder map (`src/`)

```
src/
├── App.tsx                  # Root component, route mounting, fetch shim install
├── main.tsx                 # ReactDOM entry
├── router.tsx               # TanStack route config
├── routeTree.gen.ts         # Generated route tree
├── styles.css               # Global Tailwind layer + custom tokens
│
├── pages/                   # Top-level route pages (login, home, nexus, ledger, projects, code, vault, admin, …)
├── routes/                  # TanStack file-based route shells (__root, index, $)
│
├── components/
│   ├── ui/                  # shadcn primitives (button, card, dialog, …)
│   ├── workspace/           # IDE-style workspace (ChatComposer, ChatStream, LedgerPanel, PreviewPanel, FilesPanel, …)
│   ├── home/                # Home/landing surfaces (GenesisCard, GlobalInsightSurface, QuickEditRow)
│   ├── landing/             # Marketing/landing header + manifest
│   ├── chat/                # Inline chat affordances (SketchOffer, SketchReveal)
│   ├── composer/            # Composer actions + sketch sheet
│   ├── code/                # Code editor, diff viewer, forge sync panel
│   └── *.tsx                # Standalone feature components (TheForge, ProjectsDrawer, etc.)
│
├── hooks/
│   ├── useAuth.ts           # `/api/auth/me`, token storage
│   ├── useNexusChatStream.ts# Streaming chat against /api/nexus/chat
│   ├── useChatStream.ts     # Legacy chat stream
│   ├── useAtlasStream.ts    # Atlas thinking stream
│   ├── useCodegen.ts        # /api/codegen
│   ├── useGitHub.ts         # /api/github/*
│   ├── useParkingLot.ts     # /api/state parked items
│   ├── useProjectState.ts   # /api/state project read/write
│   └── …
│
├── lib/
│   ├── api.ts               # API_BASE, apiUrl(), auth header stub
│   ├── install-api-fetch.ts # Global fetch shim — rewrites /api/* + attaches bearer
│   ├── errorReporter.ts     # /api/errorlog/ingest
│   ├── DecisionCatchEngine.ts
│   ├── atlas-history.ts, atlas-utils.ts, atlas-voice.ts
│   ├── forgeIntake.ts, forgeExtract.ts
│   ├── githubRepo.ts, repoIngest.ts
│   └── …
│
├── integrations/
│   └── supabase/            # Lovable Cloud client (preview-only Supabase project; NOT the backend DB)
│
├── store/
│   └── shellStore.ts        # Global UI store (zustand)
│
└── _workspace/
    └── api-client-react/    # Generated REST client (Orval), used in parallel with bare fetch
```

---

## 6. Real vs. visual-only

### Confirmed real (backend wire-up present in code)
- **Auth flow** — `/api/auth/me`, `/api/auth/login`, `/api/auth/google`, `/api/auth/session/exchange` (`useAuth`)
- **Nexus chat** — streaming `/api/nexus/chat` with handoff signaling (`useNexusChatStream`)
- **Projects CRUD** — `/api/projects` (`ProjectsDrawer`, `useProjectState`)
- **Entries / Ledger** — `/api/entries/all` (`LedgerPanel`, `DecisionLedgerGrouped`)
- **Forge intake** — `/api/forge/intake` (`ForgeIntakeSheet`)
- **GitHub integration** — `/api/github/*` (`GitHubConnect`, `useGitHub`, `GitHubPushModal`)
- **Codegen** — `/api/codegen` (`useCodegen`, `LiveGenerationCard`)
- **Image generation** — `/api/image/generate` (`generateImage.ts`, `ImageGenerator`)
- **Error reporting** — `/api/errorlog/ingest` (`errorReporter.ts`)
- **Stripe** — `/api/stripe/*` (`useSubscription`, `UpgradeModal`)

### Visual-only / illusion (UI exists, no live wire — verify)
**Lovable cannot prove negatives without runtime testing.** Candidates that look thin in code (no fetch found in the obvious component, or relies on local state only):
- `BlueprintsTab` — partly local fixture data
- `SystemMap` / `MapTab` — uses local master-map-store
- `VisualVault` — gallery routes exist but UI may not call them yet
- `AccountHubPanel` — some sections may be static
- `ProjectPulsePanel` — verify whether stats come from `/api/stats/dashboard`

**Action:** mark each as confirmed-real or visual-only after the next end-to-end smoke test.

### Lovable Cloud edge functions (separate from Cloud Run backend)
`supabase/functions/` contains: `atlas-chat`, `atlas-codegen`, `atlas-commit`, `atlas-glossary`, `atlas-image`, `atlas-research`, `atlas-thinking`, `atlas-whisper`. These run on the **Lovable Cloud** project (`lmrpnsjckljdwqudtelk`), not Cloud Run. They are an alternate / experimental chat surface — production Atlas chat goes through Cloud Run `/api/nexus/chat`.

---

## 7. Known gaps & open questions

1. **Route audit:** the 102 routes above need a fresh curl run against Cloud Run. Save the result back into this file's Status column.
2. **Production table list:** paste the full 32-table list from the `osuasytymbzurjvklhde` project (`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1;`).
3. **Dual Supabase confusion risk:** anything Lovable says about "the database" almost always means the Lovable Cloud preview DB, not the production DB. Reader beware.
4. **`/api/state` family:** loosely typed — the same endpoint serves parking lot, UI logic, and project state via path segments. Document the contract here once stable.

---

*Last regenerated by Lovable: 2026-06-16. To regenerate: ask Lovable "rebuild PROJECT_TRUTH.md from the codebase".*
