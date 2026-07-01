# Handoff: Unify readiness source of truth (B1 + B2)

**Repo:** `Axiom-Atlas` (Cloud Run) · **Date:** 2026-07-01
**Frontend counterparts:**
- `artifacts/atlas-frontend/src/components/ProjectPulsePanel.tsx` (Home cards)
- `artifacts/atlas-frontend/src/components/SovereignReadinessSheet.tsx` (Core Mix + phase bars)
- `artifacts/atlas-frontend/src/hooks/useProjectIntelligence.ts` + `UnifiedShell.tsx` (header ring — already canonical)

## Why

Frontend audit found two remaining source-of-truth conflicts:

1. **Home project cards vs Header ring show different %s for the same project.** Home reads `latestSnapshotScore` (denorm from `readiness_snapshots`), header reads `intelligence.readiness.overall` computed live. Snapshot is stale/absent for most projects → cards read 0 or old numbers while the header shows the real score.
2. **Sovereign Readiness Sheet's "Core Mix" and phase bars are invented on the client** from raw `nodeState`. That's why the sheet showed 0% for a project the header ring said was 40%. These bars need to be server-authoritative so every surface agrees.

Frontend fixes for hydrate propagation, InsightsPanel dedupe, and header/HUD unification are already shipped. These two are the last drift sources and both live on the backend.

---

## B1 — `GET /api/projects` should return canonical readiness

### Current

`artifacts/api-server/src/routes/projects.ts` (~L107–L149) returns `latestSnapshotScore` from a `SELECT DISTINCT ON (project_id)` over `readiness_snapshots`. That table is written sparsely and does not reflect the live `computeProjectReadiness` output.

### Change

For each project in the list response, compute (or reuse the cached value of) `computeProjectReadiness(projectId).overallScore` and return it as a new field `readinessScore` alongside the existing `latestSnapshotScore` (keep the old field for one release for backward compat, then drop).

Response shape addition per project:

```ts
{
  ...existing fields,
  readinessScore: number | null,   // NEW — canonical, matches intelligence.readiness.overall
  readinessLabel: string | null,   // NEW — same label the header uses
  latestSnapshotScore: number | null, // KEEP for one release, mark deprecated
}
```

### Implementation notes

- `computeProjectReadiness` already exists in `artifacts/api-server/src/routes/readiness.ts` — export it (already exported) and call it per project.
- N projects × per-project queries will be slow. Two acceptable options:
  - **Preferred:** batch — refactor `computeProjectReadiness` to accept `projectId[]` and issue grouped queries (`WHERE project_id = ANY($1)`) for entries + genome + snapshots, then compute in-memory per project.
  - **Acceptable short-term:** `Promise.all(projects.map(p => computeProjectReadiness(p.id)))` with a 5s timeout guard; log slow calls.
- Do NOT remove the `readiness_snapshots` write path — snapshots are still used for history/trend. Just stop reading them for "current score."

### Definition of done

- `curl "$BACKEND/api/projects"` returns each project with a `readinessScore` matching what `curl "$BACKEND/api/projects/<id>/intelligence"` reports under `readiness.overall`.
- Home project cards and the workspace header ring show the same number for the same project, always.

---

## B2 — `GET /api/projects/:id/readiness` should return `layerMix` and `phases`

### Current

`ProjectReadiness` returns `overallScore`, `overallLabel`, `projectKind`, `dimensions{build,strategy,activity,delivery}`, `warnings`, `sourceBreakdown`. The Sovereign Readiness Sheet renders a **Core Mix** row (strategy / build / activity / delivery layer weights) and a **phase progress** row (Think / Decide / Build / Ship) — both computed client-side from raw `nodeState`, which is why they drift from the ring.

### Change

Extend the response with two new top-level fields:

```ts
type ProjectReadiness = {
  ...existing fields,
  layerMix: {
    strategy: number;   // 0–100, share of readiness attributable to strategy signals
    build: number;
    activity: number;
    delivery: number;
  };
  phases: {
    think:  { score: number; label: "Not started" | "In progress" | "Complete"; evidence: string };
    decide: { score: number; label: "Not started" | "In progress" | "Complete"; evidence: string };
    build:  { score: number; label: "Not started" | "In progress" | "Complete"; evidence: string };
    ship:   { score: number; label: "Not started" | "In progress" | "Complete"; evidence: string };
  };
};
```

### Suggested mapping (align with existing dimension math so numbers reconcile)

- **`layerMix`** — just re-expose the normalized dimension scores that already drive `overallScore`. Each entry = `dimensions[key].score` weighted by `dimensions[key].weight`, scaled to 100. Sum should equal `overallScore` (within rounding).
- **`phases`** —
  - `think.score` = `dimensions.strategy.score` gated on genome confidence < 50 (i.e. still shaping).
  - `decide.score` = share of committed vs total entries × 100 (already computed inside `activity`).
  - `build.score` = `dimensions.build.score` (already computed).
  - `ship.score` = `dimensions.delivery.score` (already computed).
  - Labels: `>= 80 → Complete`, `> 0 → In progress`, `else Not started`.
  - `evidence` reuses the same strings currently on `dimensions[*].evidence`.

If the mapping above needs tweaking, own the definition on the backend — the frontend will render whatever `layerMix` and `phases` you return. The rule is: **no math on the client**.

### Mirror into `/intelligence`

Add the same `layerMix` and `phases` under `intelligence.readiness` so both endpoints agree by construction. Frontend already reads `intelligence.readiness` for the header ring.

### Definition of done

- `curl "$BACKEND/api/projects/<id>/readiness"` returns `layerMix` (4 numbers summing ≈ `overallScore`) and `phases` (4 phase objects).
- Same fields present under `intelligence.readiness`.
- Sovereign Readiness Sheet Core Mix + phase bars render non-zero values for any project whose header ring is non-zero.

---

## Auth / access control

Both endpoints already authorize per project. No new guards needed.

## Backward compat

- B1: additive — old `latestSnapshotScore` stays for one release.
- B2: additive — old consumers ignoring `layerMix`/`phases` unaffected.

## Files likely touched (in Cursor)

- `artifacts/api-server/src/routes/projects.ts` — list handler
- `artifacts/api-server/src/routes/readiness.ts` — `computeProjectReadiness` + route
- Wherever `/intelligence` is assembled (search for `readiness:` composition) — mirror fields
- `lib/api-spec/openapi.yaml` → regenerate `lib/api-zod` + `lib/api-client-react`

## What the frontend will do next (do NOT do this on the backend)

- `ProjectPulsePanel.tsx`: swap `latestSnapshotScore` → `readinessScore`.
- `SovereignReadinessSheet.tsx`: delete client-side `nodeState` math; render `readiness.layerMix` + `readiness.phases` directly.
- Remove the audit's "F2 fallback" line in `UnifiedShell.tsx` once B1 lands.
