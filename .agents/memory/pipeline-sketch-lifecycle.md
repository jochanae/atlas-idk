---
name: Pipeline Sketch lifecycle
description: Architecture of the structured screen-layout sketch generated from AM + archetype, distinct from image-gen visual_sketch artifacts
---

## The rule
Pipeline sketches use type `pipeline_sketch`, NOT `visual_sketch`. Image-gen chat sketches keep `visual_sketch`. The orchestrator's `SketchState` (and the R003/R004 approval gate) only counts `pipeline_sketch` type.

**Why:** The two sketch concepts are fundamentally different — image-gen produces a visual artifact, pipeline sketch is a structured UI layout document. Mixing them would cause image-gen activity to incorrectly unlock the Design Plan gate.

## How to apply
- All generate/approve/delete operations go through `projectArtifacts.ts` routes
- `POST /api/projects/:id/sketches/generate` — Haiku call using AM pages+entities+archetype; stores `pipeline_sketch` with `metadata.source='pipeline', status='suggested', approved=false`
- `POST /api/projects/:id/artifacts/:id/approve` — sets `metadata.approved=true, status='approved', approvedAt`
- `DELETE /api/projects/:id/artifacts/:id` — hard-delete (dismiss)
- `classifyProductArchetype` takes 4 required args: (purposeText, audienceText, pageNames, entityNames) — not a single combined corpus string
- Frontend: `usePipelineSketch` hook + `PipelineSketchPanel` component; "Sketch" tab in `BlueprintPanel` between Soul and Design
- Approval sets `metadata.approved=true` which satisfies `SketchState.approvedCount >= 1` → unlocks R004 (Design Plan)
