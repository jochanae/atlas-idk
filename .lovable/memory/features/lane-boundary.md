---
name: Lane boundary (frontend-only)
description: Lovable works on frontend only. Backend is separate Cloud Run repo (Axiom-Atlas) + Supabase DB. Never edit backend, never run SQL.
type: constraint
---

**Lovable's lane is frontend only.** Backend lives in a separate GitHub repo called `Axiom-Atlas`, runs on Google Cloud Run, and uses Supabase as its database. The user runs backend changes through Cursor.

## Lovable MUST NOT
- Edit backend code (no backend lives in this repo)
- Write or execute SQL against Supabase
- Modify Supabase schema, RLS policies, GRANTs, or migrations
- Make assumptions about backend routes without verifying with the user
- Attempt to "fix" a backend issue — hand it back as a spec instead

## Lovable MUST
- When a frontend change needs backend support, produce a handoff spec: route, method, request body, response shape, auth requirement, consuming frontend file. User runs it through Cursor.
- Treat the Cloud Run base URL (`https://axiom-atlas-689827072865.us-east1.run.app`) as immutable infrastructure.
- Read `PROJECT_STRUCTURE.md` before any change that touches data or API calls.

**Why:** Two-repo split. Lovable touching backend creates drift between this repo and Axiom-Atlas, and SQL run from Lovable bypasses the user's Cursor-managed migrations.
