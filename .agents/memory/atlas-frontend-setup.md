---
name: Atlas frontend setup
description: How the atlas-idk frontend is integrated — local API client alias, auth system, and key gotchas
---

## Key facts

- Frontend sourced from github.com/jochanae/atlas-idk — all 263 src files in `artifacts/atlas-frontend/src/`
- `workspace.tsx` is 400KB+ — NEVER read into context, use `cp` or `sed -n` line-range reads only
- API client: `src/_workspace/api-client-react/` is the local copy (NOT the monorepo `lib/api-client-react`). Aliased as `@workspace/api-client-react` in vite.config.ts
- Auth: fully custom (email/password, scrypt, session cookies + localStorage Bearer token). NOT Supabase auth. `useAuth.ts` uses hardcoded `/api/auth/*` relative paths
- `VITE_API_URL=""` (empty) → all API calls are relative → go through Replit proxy to local `/api` backend
- `lib/api.ts` has `DEFAULT_API_BASE = "https://axiom-atlas-689827072865.us-east1.run.app"` (Cloud Run) — overridden by empty VITE_API_URL

**Why:** The original repo used both Supabase and Cloud Run, but auth is 100% custom email/password — Supabase env vars were for storage/other purposes only.

**How to apply:** When debugging auth issues, check `artifacts/atlas-frontend/src/hooks/useAuth.ts` and `src/lib/api.ts`. If API calls go to Cloud Run instead of local backend, check VITE_API_URL env var.
