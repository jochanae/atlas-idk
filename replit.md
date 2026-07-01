# Axiom — Strategic Thinking Partner

A unified development environment: React+Vite frontend + Express API + Replit PostgreSQL. Fully self-contained — no Cloud Run, no Supabase.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, path: /api)
- `pnpm --filter @workspace/atlas-frontend run dev` — run the frontend (port 22883, path: /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required env: `DATABASE_URL` — Replit built-in PostgreSQL (auto-provided, do NOT set manually)

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
        └─► ALL /api/* calls → Local Express server (port 8080)
                                  └─► Replit built-in PostgreSQL
```

- `src/lib/api.ts` resolves `API_BASE = ""` (same-origin) — no external backend
- `src/lib/install-api-fetch.ts` patches `window.fetch` so `/api/*` calls stay local
- Auth (login/session) is handled entirely by the local Express auth routes

## Where things live

- `artifacts/atlas-frontend/` — Axiom frontend
- `artifacts/atlas-frontend/src/_workspace/api-client-react/` — API client hooks (update manually when OpenAPI spec changes)
- `artifacts/api-server/` — Express backend with all routes
- `lib/db/src/schema/index.ts` — DB schema (⚠️ DO NOT TOUCH lib/db/src/index.ts)

## Philosophy

**Read this before planning or building anything new:**
`.local/atlas-architecture-2.0.md` — the Atlas Architecture 2.0 constitution. Defines the five pillars, the Application Model, the "No Duplicate Truth" rule, the canonical ownership table, and the three-question evaluation test every feature must pass.

The governing sentence: *"Atlas remembers what it agreed to build."*

## Product

Axiom is an application-modeling system that uses conversation as its interface. It captures intent, builds a structured model of what is being built, holds that model across sessions, and generates code, visual representations, and decisions from the same source of truth.

## User preferences

- Never touch `lib/db/src/index.ts`
- No visual deviations from the original atlas-idk frontend design
- `workspace.tsx` is 400KB+ — handle with care (use bash cp, never read into context)

## Gotchas

- `workspace.tsx` is 400KB+ — never read into context, use `cp` or line-range reads only
- `DATABASE_URL` must NOT be set manually — Replit provides it automatically. Setting it points to an external DB.
- `vite.config.ts` is Replit-patched (PORT/BASE_PATH + workspace alias) — never overwrite
- `onboarding.tsx` needs scroll fix re-applied after any sync (`overflow: hidden` → `overflowX/Y`)
- `src/_workspace/api-client-react/` is NOT auto-generated — update manually when the API spec changes
- 401s on `/api/auth/me` on page load are expected (not logged in yet)

## Databases

- **Replit built-in PostgreSQL** — local backend DB. Auto-provisioned, schema auto-pushed on boot via Drizzle ORM.
- **Supabase `osuasytymbzurjvklhde`** — production Axiom DB. Still wired in — do NOT touch from here.
- **Supabase `lmrpnsjckljdwqudtelk`** — Lovable project DB (unrelated, do not use here).

## Key surfaces

- **Ask Atlas** — inline chat in the home page hero. Ephemeral: starts with no conversationId, creates a new thread on first message. Calls `/api/nexus/chat` locally.
- **Global Insight** — full-screen layout takeover on the home page. Uses the active session thread. Same `/api/nexus/chat` endpoint, same AI. Different surface, same core.
- **Workspace** — per-project AI conversation. Full history, persistent threads.
