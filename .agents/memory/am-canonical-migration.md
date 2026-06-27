---
name: Application Model as Canonical DNA Source
description: Phase 2B migration — genome table replaced by AM; ProjectDNA adapter is the only DNA read/write path
---

## Rule
All genome reads and writes go through `artifacts/api-server/src/lib/projectDNA.ts`. Direct queries to `projectGenomeTable` are eliminated from route files. The genome table still exists in schema for the one-time migration path but must not be used for new features.

**Why:** "No Duplicate Truth" from Atlas Architecture 2.0. Genome was a parallel truth alongside AM; 2B collapsed them — AM wins.

**How to apply:**
- Import `getProjectDNA`, `getOrCreateProjectDNA`, `getMultipleProjectDNA`, `updateProjectDNA` from `../lib/projectDNA`
- Never import `projectGenomeTable` from `@workspace/db` in routes
- `migrateGenomeToApplicationModel()` runs on every boot (idempotent, no-ops if done)
- `getMultipleProjectDNA(ids)` returns `Map<number, ProjectDNA>` — no `.map(g => [g.projectId, g])` needed
- Boot confirmed: 12/12 projects migrated successfully on first post-migration boot
