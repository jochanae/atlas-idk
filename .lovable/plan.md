# Atlas + Axiom Integration Plan (v3 — Railway commands corrected)

A workflow contract for splitting work cleanly between **Lovable** (frontend) and **Railway + Neon + Drizzle + Cursor/Claude** (backend). Reflects pnpm monorepo structure and exact `@workspace/api-server` package name.

## 1. The lanes (who owns what)

| Area | Owner | Tool |
|---|---|---|
| React UI, routes, components, styles | **Lovable** | Lovable agent |
| TanStack Router + page-level state | **Lovable** | Lovable agent |
| Frontend `fetch()` calls to backend | **Lovable** | Lovable agent |
| Express server, 40+ routes | **Backend** | Cursor / Claude |
| Drizzle schema + migrations | **Backend** | Cursor / Claude |
| Neon Postgres | **Backend** | Cursor / Claude |
| Anthropic API calls, GitHub integration | **Backend** | Cursor / Claude |
| Auth (sessions, cookies) | **Backend** (see §4) | Cursor / Claude |
| Deploy frontend | Lovable preview → Vercel (prod) | — |
| Deploy backend | Railway | — |

**Rule:** Lovable never edits anything under `/axiom/artifacts/api-server/`, `/axiom/lib/db/`, or any other backend path. Backend tools never edit anything under `/src/`.

## 2. Repo layout after the zip lands

```text
/  (this repo, stays on Lovable)
├── src/                              ← Lovable's Atlas frontend
├── supabase/                         ← Lovable Cloud (retired after cutover — see §4)
├── axiom/                            ← Axiom dropped in as-is (pnpm monorepo intact)
│   ├── artifacts/
│   │   ├── atlas/                     ← Axiom's frontend → dissolved into /src/
│   │   └── api-server/                ← Express backend → Railway deploy
│   │       └── package.json              (name: "@workspace/api-server")
│   ├── lib/
│   │   └── db/                        ← Drizzle schema + migrations
│   ├── pnpm-workspace.yaml
│   └── package.json                   ← Axiom's monorepo root (untouched)
├── PROJECT_STRUCTURE.md
└── package.json                      ← Lovable's, untouched
```

After merge: `axiom/artifacts/atlas/` dissolves into `/src/` and is deleted. Everything else under `/axiom/` stays put.

**pnpm note:** Two lockfiles, two install scopes. Lovable/Vercel runs npm/bun at repo root. Railway runs pnpm inside `/axiom/`. Don't unify.

## 3. The two-repo question

**Option A (recommended): one repo, two deploy targets.** Vercel from repo root, Railway from `/axiom/`.

**Option B: split later** only if Lovable's agent starts editing backend files despite the contract.

Start with A.

## 4. Auth boundary (the critical decision)

| | Lovable Cloud Auth | Axiom Express Sessions |
|---|---|---|
| Storage | Supabase JWT in localStorage | `express-session` + cookie |
| Used by | Atlas frontend today | Axiom backend today |
| Survives? | **No** | **Yes** |

**Decision: Axiom's Express session auth wins.** It's live, tied to 40+ routes; replacing it is dozens of changes vs. one frontend swap.

**Frontend impact:**
- All `fetch()` calls use `credentials: 'include'`.
- Backend CORS: `Access-Control-Allow-Origin: <frontend-domain>`, `Access-Control-Allow-Credentials: true`.
- Cookie: `SameSite=None; Secure` in prod.
- Login/signup POST to `/api/auth/login` on Railway, not Supabase.
- Replace `useAuth()` with a hook calling `GET /api/auth/me`.
- Delete `src/integrations/supabase/` after cutover verified. Lovable Cloud stays enabled but unused.

**Local dev:**
- Frontend dev server proxies `/api/*` → `localhost:<api-server-port>`.
- Frontend `.env.local`: `VITE_API_URL=http://localhost:3001`.
- Backend `.env` (in `/axiom/artifacts/api-server/`): Neon connection string, session secret, Anthropic key, GitHub token.

## 5. Drizzle / Neon / Railway specifics

- Drizzle config: `/axiom/lib/db/drizzle.config.ts`. Schema and migrations in `/axiom/lib/db/`.
- **Railway settings (exact):**
  - Root directory: `axiom/`
  - Install command: `pnpm install --frozen-lockfile`
  - Build command: `pnpm --filter @workspace/api-server build`
  - Start command: `pnpm --filter @workspace/api-server start`
- Neon connection string lives in Railway env vars, never the repo. Lovable never sees it.
- Migrations run on Railway deploy via a `release` / `postbuild` script in `@workspace/api-server`'s package.json — not from Lovable.
- Cursor handles all Drizzle schema edits in `/axiom/lib/db/`. Generated types imported by frontend via path alias.

## 6. The merge step (after this plan is approved)

1. Drop the Axiom zip into `/axiom/` — full pnpm workspace structure lands intact.
2. Scan `/axiom/artifacts/atlas/` and classify each file: net-new vs. duplicate of `/src/`.
3. Net-new pieces (flow map, home variants Atlas doesn't have): move into `/src/`, rewrite imports.
4. Duplicates: keep Atlas's version, discard Axiom's.
5. Rewrite all frontend API calls to hit `VITE_API_URL`.
6. Replace Supabase auth calls with session-cookie calls.
7. Delete `/axiom/artifacts/atlas/` once dissolved.
8. Leave `/axiom/artifacts/api-server/`, `/axiom/lib/`, `/axiom/pnpm-workspace.yaml`, `/axiom/package.json` untouched.
9. Commit `PROJECT_STRUCTURE.md`.

## 7. Risk register

| Risk | Mitigation |
|---|---|
| Lovable edits backend files | `PROJECT_STRUCTURE.md` lists backend folders as off-limits |
| Session cookie blocked cross-origin | `SameSite=None; Secure` + correct CORS, tested pre-cutover |
| Schema drift Drizzle ↔ frontend | Generated types in `/axiom/lib/db/` imported via path alias |
| Two AIs editing same file | Lane contract makes overlap impossible by folder |
| pnpm vs npm/bun confusion | Two lockfiles, two install scopes, scoped by directory |
| Cutover breaks Atlas auth | Run Supabase auth in parallel until session auth verified end-to-end |
| Railway filter name mismatch | Use exact package name `@workspace/api-server` in all `pnpm --filter` commands |

## 8. What stays Lovable's job forever

Visual design, components, animations, routes, copy, layouts, frontend bug fixes, new UI features without backend changes.

## 9. What moves out of Lovable's job

Everything in `/axiom/artifacts/api-server/` and `/axiom/lib/`. All auth logic (post-cutover). All schema work. All Anthropic/GitHub API integration.

---

**Next step after approval:** drop the Axiom zip into `/axiom/` and begin §6.
