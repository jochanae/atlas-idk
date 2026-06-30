---
name: ArtifactOrchestrator architecture
description: v1 skeleton lives at artifacts/api-server/src/lib/artifactOrchestrator.ts; post-turn evaluator, read-only, structured log only
---

## The subsystem

`artifactOrchestrator.ts` is a post-turn evaluator wired fire-and-forget into the `/api/chat` handler (after visual memory extraction). It evaluates `OrchestratorRule[]` against `ProjectArtifactState` and writes a structured pino log. v1 is read-only — no artifact creation or modification.

## Key types

- `ProjectArtifactState` — snapshot of genome / AM / productIntelligence / sketch / designPlan / flow / memory for a project
- `OrchestratorRule` — `{ id, description, pillar, confidence, evaluate(state) → RuleEvaluation }`
- `OrchestratorAction` — `{ type: generate_artifact|seed_artifact|classify|notify_user|noop, artifact?, reason, metadata? }`
- `OrchestratorConfidence` — `automatic | threshold | requires_approval`
- `OrchestratorResult` — full evaluation result with stateSnapshot, rules[], actionableRules, blockedRules

## The 8 v1 rules

| ID | Trigger | Confidence |
|----|---------|-----------|
| R001_GENOME_SEEDS_AM | Genome ≥ 30% → create AM | automatic |
| R002_AM_TRIGGERS_PRODUCT_INTEL | AM ≥ 2 pages + 3 entities → classify archetype | automatic |
| R003_PRODUCT_INTEL_UNLOCKS_SKETCH | PI classified + AM ≥ 50% → generate Sketch | threshold |
| R004_SKETCH_UNLOCKS_DESIGN_PLAN | ≥ 1 approved Sketch → generate Design Plan | requires_approval |
| R005_DESIGN_PLAN_SEEDS_FLOW | Design Plan committed → seed Flow | automatic |
| R006_FLOW_ENRICHES_BUILD_CONTEXT | Flow ≥ 3 nodes → enrich build context | automatic |
| R007_AM_STALLED_WITHOUT_PRODUCT_INTEL | AM shaped but PI not built → noop (log blocker) | automatic |
| R008_LOW_GENOME_COMPLETENESS | Genome < 20% → notify user | threshold |

## State loading

Promise.all over 5 queries with explicit typed fallbacks (`.catch((): T[] => []`) — avoids `never[]` inference on empty-array catch returns.

Genome completeness: 6 key fields (purpose, audience, differentiator, wedge, identity, constraints). AM completeness: weighted (pages/5)×0.4 + (entities/8)×0.4 + (rels/10)×0.2. Sketch detection: `projectArtifactsTable` where `type = 'visual_sketch'`.

## Product Intelligence slot

`productIntelligence` is always `null` in v1. R002 correctly reports `product_intelligence_subsystem_not_built` as a missing input. R007 logs the pipeline blockage.

**Why:** Pipeline honesty — rules that can't fire because a dependency doesn't exist yet should say so explicitly, not silently pass.

## Wiring point in chat.ts

After `extractVisualMemoryFromAttachments`, before the closing `});` of the POST /chat route handler. Same pattern as genome extraction and AM extraction.

## Next phase

Phase 2: Product Intelligence — static archetype library (8–10 archetypes), feeds `productIntelligence.archetypeId + impliedRequirements` into state. Unlocks R002, R003.
