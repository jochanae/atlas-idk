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

- **Home** — project dashboard and launcher only. No chat UI. Shows project list, ambient state, portfolio intelligence (NEXT MOVE, Resume, Recent Activity). Entry point to Workspace.
- **Workspace** — the single conversation surface. All Atlas interaction happens here. Persistent threads, full history. Has a **Conversation Mode / Build Mode toggle** on the same thread — Conversation Mode = clean dialogue, no run cards, no tool noise; Build Mode = full agentic execution. No handoff between them, no separate chat instance.

> ⚠️ Ask Atlas (home hero chat) and Global Insight (home full-screen takeover) have been retired. They were confusing and kept breaking. Everything is now in the Workspace.

## ⚠️ Surface boundary table — read before touching home/ or workspace/

Agents frequently write run card / chat / UI code into the wrong component. This table is the authority. Do NOT cross these lines without an explicit task that names the target surface.

| Component | What it IS | What it is NOT |
|---|---|---|
| `components/home/ActiveRuns.tsx` | **Atlas Composer** — shortcut run launcher in Projects drawer → Tools sheet. Shows Composer-started runs. The `RunCard` inside it is the compact Composer card. | NOT the workspace chat. NOT a homepage chat. Never apply workspace designs here. |
| `components/AtlasComposerSheet.tsx` | Shell that opens the Composer drawer. Wraps `ActiveRuns`. | Do not touch. |
| `components/workspace/ChatStream.tsx` | **Workspace chat stream** — the only Atlas conversation surface. Renders per-message history. Conversation Mode suppresses run cards/tool activity. | NOT the Composer. There is no separate homepage chat. |
| `pages/home.tsx` + `components/home/` (excl. `ActiveRuns.tsx`) | **Homepage** — project dashboard and launcher. Ambient state, portfolio intelligence, project list. No chat UI. | Not the workspace. Not a chat surface. Do NOT add any chat, composer hero, or Ask Atlas UI here. |
| `components/workspace/ConversationViewSwitcher.tsx` | **Mode toggle** — Conversation / Build segmented pill in the workspace header. Switches `conversationMode` state in workspace.tsx. | Do not repurpose for navigation. |
| `components/workspace/ViewChangesPanel.tsx` | **Changes surface** — Timeline/Changes lenses, runId pill, GitHub block. Fully implemented. | Do not modify unless the task explicitly says "ViewChangesPanel". |
| `features/runs/` | Shared run data hooks and types only (`useRun`, `useRuns`, `adaptRun`). | No surface-specific UI components here. |

**Rule:** If a task says "run card" without naming the surface, stop and ask. The Composer card (`ActiveRuns.RunCard`) and the workspace chat card are different components with different designs. Never apply one surface's design to another.
