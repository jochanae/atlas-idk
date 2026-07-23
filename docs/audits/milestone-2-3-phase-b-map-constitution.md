# Milestone 2.3 Phase B — Constitution on Map

**Date:** 2026-07-23  
**Branch:** `cursor/milestone-2-3-lens-design-2010`  
**Prerequisite:** Phase A PASS (plumbing only; no behavioral differentiation)

## Objective

Implement Lens Constitution (§3) on the **Map generative + presentation path**:
`expand-node` and Map-bound Flow chat — policy packs, evidence weighting, output contracts.

## What landed

| Piece | Location |
|-------|----------|
| Constitution packs (§3) | `artifacts/api-server/src/lib/lensConstitution.ts` |
| Expand-node wiring | `artifacts/api-server/src/routes/forge.ts` `POST /expand-node` |
| Map-bound chat wiring | `FlowPanel` → `/api/chat` `flowMode` + `perspective`; constitution in `chat.ts` |
| Presentation tooltips | Map tabs use `PERSPECTIVE_CONTRACT` |
| Unit tests | `artifacts/api-server/src/lib/__tests__/lensConstitution.test.ts` |

## Differentiation mechanisms (not adjective swaps)

1. **Policy pack** — mission, primary questions, preferred evidence, blind spots, failure modes, disagreement rules.
2. **Evidence filter** — same transcript / DNA / Flow store; lens-weighted retrieval.
3. **Output contract** — Designer = experience states/interaction; Builder = execution/schema-true; Storyteller = meaning/commitment beats. Shared JSON array transport preserved for Flow UI.

## Explicitly out of Phase B

- Nexus live Workspace chat Constitution (Phase C)
- Auto-merge / disagreement UI (Phase D)
- Full T1–T6 scored battery sheet (run after deploy; gate for Phase B close)

## Eval gate (to close Phase B)

Re-run battery on **Map** expand (+ optional Map chat):

- T1 Pass mandatory
- ≥5/6 Pass
- L2 improves vs pre-Constitution baseline
- Builder remains schema-true (presentation + generative)
