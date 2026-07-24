---
name: Flow Projection Simplification
description: Deferred architecture milestone — audit projects.nodeState as a projection of project_flow_canvas; shrink mirrored graph fields; do not delete nodeState
---

# Future milestone: Flow Projection Simplification

**Status:** Deferred — technical debt, not a production fire.  
**Do not start** while validating user-facing Master Map / Axiom Flow / Parking Lot / artifact work.

## What we have (confirmed)

```
User Conversation / Forge / Hydrate
                 │
                 ▼
        project_flow_canvas
     (authoritative graph model)
                 │
        projection / mirror
                 ▼
         projects.nodeState
  (readiness + Nexus context + scoring
   + SystemMap arch booleans)
```

This is a **projection architecture**, not persistent-vs-UI state.

- **Canvas SoT:** `project_flow_canvas` (`nodes` / `edges` / `drillCache`) — Axiom Flow UI via `GET/PUT /api/projects/:id/flow`.
- **Projection:** `projects.node_state` — mirrored from FlowPanel `onNodesChange` for readiness (`readiness.ts`), Nexus (`extractFlowMapNodes`), home rings, UnifiedShell.

## The real issue

The projection currently copies **graph fields**, not only derived metrics:

- `label`, `type`, `strategicAnswer`, `x` / `y`, `details`, `meta` / `moscow`, `question`

Those belong to the canvas. Readiness likely needs answered/resolved (and maybe confidence) — not coordinates or visual metadata.

`nodeState` also legitimately holds **SystemMap** arch keys (`auth`/`db`/`api`/…) as booleans — that is not canvas duplication.

## Milestone goal (when scheduled)

**Not:** Delete `nodeState`.  
**Yes:** Reduce `nodeState` until it contains only what other systems genuinely need.

Candidate end-states to evaluate (do not pick in advance):

1. Per-id slim projection: `{ answered, resolved, confidence? }`
2. Aggregated Flow Summary: `{ nodes, answered, resolved, blockers, readiness }`
3. Hybrid: keep type/meta only if Nexus prompts demonstrably require them

## Audit checklist (when this milestone starts)

1. List every **reader** of `projects.nodeState` (readiness, nexus, home, UnifiedShell, FlowPanel extract, repo ingest, handoff).
2. For each field mirrored from canvas (`label`, `type`, `x`, `y`, `strategicAnswer`, …), record: required by which reader? can it be derived from canvas at read time?
3. Separate SystemMap boolean keys from strategic Flow keys — do not collapse them by accident.
4. Prove or falsify desync paths (canvas updated without mirror; `PATCH nodeState` without `/flow`).
5. Only then eliminate mirrored graph fields that duplicate `project_flow_canvas` unless demonstrably required.

## Why defer

Risk is **desync / developer confusion**, not an always-broken feature. The mirror keeps both stores synchronized most of the time. Prefer architecture time after user-facing surfaces are frozen.

**How to apply:** If asked to “clean up dual Flow stores” or “delete nodeState,” point here. Scope = audit + shrink projection, not delete the projection role.
