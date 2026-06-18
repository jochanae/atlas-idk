---
name: Database isolation
description: Which databases exist, what they're for, and what must never be touched
---

## Database map

| ID | Project | Status | Used by |
|---|---|---|---|
| `osuasytymbzurjvklhde` | Production Axiom | ✅ LIVE — never touch from Replit | Cloud Run backend |
| `lmrpnsjckljdwqudtelk` | Lovable project | ⚠️ Affected by drizzle push mistake | Lovable frontend preview |
| Replit built-in PostgreSQL | This Replit project | ✅ Safe, isolated | Local Express backend |

## Critical rule
DATABASE_URL secret must NOT be set in this Replit project. Replit provides it automatically for the built-in DB. If a user sets it manually, it points to an external DB and any drizzle-kit push will hit that external DB.

## What happened
Early in the project, DATABASE_URL was set to the Lovable Supabase (`lmrpnsjckljdwqudtelk`). drizzle-kit push ran against it, adding 16 extra tables (from 16 → 32). The Lovable app data was not wiped but the schema was modified.

**Why:** The user had pasted the wrong Supabase URL. Production Axiom DB (`osuasytymbzurjvklhde`) was never touched.

## Local backend DB
Schema is pushed automatically on API server boot (see `artifacts/api-server/src/app.ts` boot migrate logic). No manual push needed.
