---
name: Project Health computation
description: How Project Health (clarity, momentum, confidence, risk, nextAction) is computed server-side in the genome route
---

Health is computed in `artifacts/api-server/src/routes/genome.ts` → `computeProjectHealth()` on every GET /api/projects/:id/genome call.

- **Clarity** = `confidenceScore` (0-100, extraction-set only)
- **Confidence** = Low/Medium/High derived from confidenceScore (<35 / 35-69 / 70+)
- **Momentum** = Low/Medium/High from nexus message count in last 7 days (<6 / 6-15 / 16+); excludes 'briefing'/'reflection' types
- **Risk** = first non-archived Blocker entry title, falling back to first genome constraint
- **NextAction** = stage-aware string; prefers openQuestions[0] or constraints[0] where relevant

**Why:** Computed at read time rather than stored — health is always fresh relative to activity, no extra write path needed.

**How to apply:** When the health formula needs tuning (thresholds, stage labels, nextAction text), edit `computeProjectHealth` and the helper functions above `serializeGenome`. The frontend `GenomeCard` reads `genome.health` off the response and renders it directly.
