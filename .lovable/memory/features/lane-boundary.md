---
name: Repo & infrastructure truth (corrected 2026-07-06)
description: Monorepo — backend + frontend live in this repo (jochanae/atlas-idk), running on Replit. No Cloud Run, no separate backend repo.
type: constraint
---

**CORRECTED 2026-07-06.** Prior "frontend-only / backend in separate Axiom-Atlas repo on Cloud Run" memory is WRONG and must not be used.

## Truth
- **Repo:** `jochanae/atlas-idk` — public, single monorepo, same one connected to this Lovable project.
- **Backend:** `artifacts/api-server/` (Express routes in `src/routes/`, services in `src/services/`, shared lib in `src/lib/`).
- **Frontend:** `artifacts/atlas-frontend/`.
- **Shared:** `lib/db/` (Drizzle schema), `lib/api-client-react/`, `lib/api-zod/`, `lib/api-spec/openapi.yaml`.
- **Infra:** Replit (see `.replit`). Not Cloud Run. Not Vercel (current WIP is not published).
- **DB:** Supabase project `osuasytymbzurjvklhde` (unchanged).

## What this means for me
- I CAN read/edit backend files directly — no handoff spec to Cursor for backend changes.
- I CAN trace full request paths (route → service → schema → client hook) in one pass.
- `PROJECT_TRUTH.md` and any doc referencing Cloud Run / `axiom-atlas-689827072865.us-east1.run.app` / a separate backend repo is STALE — verify against `artifacts/api-server/src/` before citing.
- OpenAPI spec (`lib/api-spec/openapi.yaml`) + generated clients are the contract; regenerate after backend changes.

## Why
User confirmed 2026-07-06 in chat: "Everything is in this repository... backend is here in this same repository, but it is running on replit infrastructure." Cloud Run is gone.
