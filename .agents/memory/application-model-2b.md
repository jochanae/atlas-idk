---
name: Application Model Phase 2B
description: How Genome, Ledger, and Flow Map now project from the Application Model; conversation extraction architecture
---

## What was built

### Conversation extraction (`lib/applicationModelExtraction.ts`)
- Fires after each main chat response (after `res.end()`) alongside `extractUserMemoryInBackground`
- Haiku call with current AM state + user message + assistant reply
- Returns a partial PATCH; only extracts explicitly mentioned content (conservative)
- Skips replies < 100 chars (greetings, acks)
- Merges arrays by id (never duplicates), merges text fields (latest wins)
- Writes `application_model_history` for each changed field with `reason: "conversation-extracted"`
- Import: `import { extractAndUpdateApplicationModel } from "../lib/applicationModelExtraction"`

### Genome clarity enrichment (`genome.ts`)
- `computeModelRichnessBoost(projectId)` — reads AM identity/intent/pages, returns 0–20 boost
- Breakdown: name=+3, purpose=+5, audience=+4, intent.summary=+4, coreProblems=+2, keyOutcomes=+2, pages=+1-2
- `clarityScore = Math.min(100, confidenceScore + modelBoost)`
- Explainability derivation shows formula (e.g. "45% confidence + 12 model richness (named, purpose, intent) = 57%")
- `applicationModelsTable` imported into genome.ts

**Why:** Genome clarity was purely from `confidenceScore` (genome table). AM richness provides structured signal. Zero boost if AM is empty — fully backward compatible.

### Ledger → history bridge (`entries.ts`)
- `POST /projects/:id/entries` — after Decision is committed, writes `application_model_history` row
- `reason: "ledger-decision:{entry.id}"`, `fieldChanged: "intent"`, `newValue: { decision, summary }`
- Fire-and-forget (never blocks response, silently catches errors)
- Imports: `applicationModelsTable`, `applicationModelHistoryTable` added to entries.ts static imports

### Flow Map sync (`applicationModel.ts`)
- `POST /api/projects/:id/model/sync-flow`
- Reads AM pages → blue UI nodes (#EFF6FF, #3B82F6 border)
- Reads AM data.entities → green data nodes (#F0FDF4, #22C55E border)
- Reads AM data.relationships → smoothstep edges
- Guard: only syncs when `project_flow_canvas.nodes` is empty — user layouts preserved
- Returns `{ synced: bool, reason: string, nodeCount: number, edgeCount: number }`
- `projectFlowCanvasTable` added to applicationModel.ts imports

## What was NOT done (intentional scope)
- Genome computation was NOT replaced with AM fields (would break all projects with empty AM)
- Plans migration (Phase 2B task item 3) deferred — complex, lower priority
- No new DB schema changes (all additive via imports and logic only)

## Key rule
Phase 2B is additive enrichment, not replacement. Genome still computes from entries/nexus/sessions. AM richness is a bonus signal. As conversation extraction fills the AM over time, the boost naturally grows.
