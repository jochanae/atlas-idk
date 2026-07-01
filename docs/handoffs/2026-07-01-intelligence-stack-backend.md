# Handoff: Add `stack` to Project Intelligence payload

**Repo:** `Axiom-Atlas` (Cloud Run) · **Date:** 2026-07-01
**Frontend counterpart:** `artifacts/atlas-frontend/src/components/InsightsPanel.tsx` → renders under `Project DNA` section as a new "Stack" row.

## Why

The Insights panel already shows Project DNA (Purpose, Audience, Wedge, Identity, Differentiator) pulled from `/api/projects/:id/intelligence`. The user's tech stack lives in `project_stack` (DB), but it's not exposed anywhere on this endpoint, so the frontend can't display it. Adding it here lets the DNA section show the concrete stack alongside the strategic fields — one payload, one query.

## Route

`GET /api/projects/:id/intelligence`

## Response addition

Extend the response object with a top-level `stack` field:

```ts
type ProjectIntelligence = {
  // ...existing fields (projectId, projectName, dna, health, readiness, entries, hasFlow, computedAt)
  stack: ProjectStackSummary | null;
};

type ProjectStackSummary = {
  // Everything nullable so the frontend can render partial state.
  frontend: string | null;      // e.g. "React + Vite + TypeScript"
  backend: string | null;       // e.g. "Node/Express on Cloud Run"
  database: string | null;      // e.g. "Supabase Postgres (project osuas…)"
  hosting: string | null;       // e.g. "Cloud Run (backend) + Vercel (frontend)"
  auth: string | null;          // e.g. "Supabase JWT + atlas-session cookie"
  integrations: string[];       // e.g. ["OpenAI", "Stripe", "GitHub"] — [] when none
  repo: string | null;          // e.g. "github.com/user/Old-Quinn" or null
  language: string | null;      // dominant language, e.g. "TypeScript"
  packageManager: string | null;// "pnpm" | "npm" | "bun" | null
  lastUpdatedAt: string | null; // ISO from project_stack.updated_at
};
```

Return `stack: null` when there is no `project_stack` row for the project (frontend renders "Not captured yet").

## Data source

Read from the existing `project_stack` table (whatever the current schema is). Map the columns into the shape above. If a column doesn't exist yet for one of these fields, return `null` for that field — do **not** invent a value and do **not** block on adding the column.

Preferred implementation location: whatever lib composes the intelligence response (likely `artifacts/api-server/src/lib/projectIntelligence.ts` or the route handler that assembles it). Fetch `project_stack` in the same `Promise.all` as the other reads, then attach `stack` to the returned object.

## Auth / access control

Same as the rest of the intelligence endpoint — no additional guards needed. The user is already authorized on the project.

## Backward compat

Frontend treats `stack` as optional — missing field or `null` renders the "Stack" row as `Not captured yet — Atlas hasn't seen this project's stack.` Ship as an additive change; no client version pinning required.

## What the frontend will do next (do NOT do this on the backend)

Once the field lands, `InsightsPanel.tsx` will:
1. Extend the `Intelligence` type with `stack?: ProjectStackSummary | null`.
2. Insert a "Stack" block inside the existing `DnaGrid` (or as its own subsection titled "Stack" directly beneath Project DNA) showing the non-null fields in a small key/value list, plus a "Repo" chip when present.
3. Feed the stack presence into the Build Readiness drawer's "Architecture" explain observations ("Stack captured: frontend, backend, database.").

## Definition of done

- `curl "$BACKEND/api/projects/<id>/intelligence"` returns a JSON body whose top level has a `stack` key (either the object above or `null`).
- Existing fields unchanged (no regressions on dna/health/readiness/entries).
- Response time not materially worse (one extra indexed lookup).

## Files likely touched (in Cursor)

- `artifacts/api-server/src/lib/projectIntelligence.ts` (or wherever the intelligence payload is assembled — search for `hasFlow` to find the composer)
- Any OpenAPI/zod schema in `lib/api-spec/openapi.yaml` + regenerate `lib/api-zod` + `lib/api-client-react`
