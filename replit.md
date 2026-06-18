# Axiom — Strategic Thinking Partner

A unified development environment combining the Axiom frontend (atlas-idk) and backend (Axiom-Atlas) in one place.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, path: /api)
- `pnpm --filter @workspace/atlas-frontend run dev` — run the frontend (port 22883, path: /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required env: `DATABASE_URL` — Replit built-in PostgreSQL (auto-provided, do NOT override with Supabase)

## Sync Scripts (run these when source repos change)

- `bash scripts/sync-frontend.sh` — pull latest from `jochanae/atlas-idk` (Lovable frontend repo) into `artifacts/atlas-frontend/src`
- `bash scripts/sync-backend.sh` — pull latest from `jochanae/Axiom-Atlas` for backend migration review

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS v4, Radix UI
- API: Express 5
- DB: Replit built-in PostgreSQL (Drizzle ORM, schema auto-pushed on boot)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle)

## How the pieces connect

```
Browser (Replit preview)
  └─► Frontend (Vite, port 22883)
        └─► ALL /api/* calls → Cloud Run (production backend)
                                  └─► Supabase osuasytymbzurjvklhde (production DB)
        └─► Local /api/* (future, once Axiom-Atlas is migrated here)
                                  └─► Replit built-in PostgreSQL
```

- Frontend API calls go to Cloud Run by default (`lib/api.ts` DEFAULT_API_BASE)
- `install-api-fetch.ts` rewrites relative `/api/` URLs to Cloud Run automatically
- Auth (login/session) flows through Cloud Run → production Supabase
- Local Express backend handles NEW features only until full migration

## Where things live

- `artifacts/atlas-frontend/` — Axiom frontend (synced from github.com/jochanae/atlas-idk)
- `artifacts/atlas-frontend/src/_workspace/api-client-react/` — API client hooks matching Axiom-Atlas OpenAPI spec
- `artifacts/api-server/` — Express backend (Axiom-Atlas migration in progress)
- `scripts/sync-frontend.sh` — one-command sync from atlas-idk GitHub
- `scripts/sync-backend.sh` — pull Axiom-Atlas for backend migration review
- `lib/db/src/schema/index.ts` — DB schema (⚠️ DO NOT TOUCH lib/db/src/index.ts)

## Product

Axiom is a strategic thinking partner — a workspace where ideas hold their shape long enough to become real. Workspace, project management, decision ledger, parking lot, sessions, vault, and AI chat.

## User preferences

- Never touch `lib/db/src/index.ts`
- No visual deviations from the original atlas-idk frontend
- `workspace.tsx` is 400KB+ — handle with care (use bash cp, never read into context)
- When Lovable pushes frontend changes: run `bash scripts/sync-frontend.sh`

## Gotchas

- `workspace.tsx` is 400KB+ — never read into context, use `cp` or line-range reads only
- `DATABASE_URL` secret must NOT be set — Replit provides it automatically for the built-in DB. Setting it manually points to external DBs.
- `vite.config.ts` is Replit-patched (PORT/BASE_PATH + workspace alias) — never overwrite from GitHub/zip
- `onboarding.tsx` needs scroll fix re-applied after every sync (`overflow: hidden` → `overflowX/Y`)
- The `src/_workspace/api-client-react/` is NOT auto-generated — sourced from atlas-idk, update manually when Axiom-Atlas OpenAPI spec changes
- 401s on `/api/auth/me` on page load are expected (not logged in yet)

## Databases

- **Replit built-in PostgreSQL** — local backend DB, isolated, auto-provisioned, schema auto-pushed on boot
- **Supabase `osuasytymbzurjvklhde`** — production Axiom DB (Cloud Run uses this, NEVER touch from here)
- **Supabase `lmrpnsjckljdwqudtelk`** — Lovable project DB (unrelated, do not use here)

## Pointers

- Original frontend repo: https://github.com/jochanae/atlas-idk
- Original backend repo: https://github.com/jochanae/Axiom-Atlas
- Live frontend: https://axiomsystem.app
- Live backend: https://axiom-atlas-689827072865.us-east1.run.app
- Production Supabase: osuasytymbzurjvklhde
