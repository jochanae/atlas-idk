---
name: Artifact Engine Architecture
description: Shared pipeline for every file-backed deliverable (DOCX/PPTX/XLSX/PDF/Mermaid/Charts/Drafts); renderers are plug-ins, not independent systems.
---

Every generated deliverable goes through one engine (`artifacts/api-server/src/lib/artifactEngine.ts`), not per-format pipelines. A renderer registers via `registerArtifactRenderer({ type, category, render })` and only implements content generation → file buffer. The engine owns everything else: object storage upload (reuses the existing presigned-PUT-URL pattern from `objectStorage.ts`), persistence into `project_artifacts` (file metadata lives in the existing `metadata`/`payload` jsonb columns — no schema migration needed), Ledger linkage (same `enrichmentJson` pattern as `decisionArtifacts.ts`), and generic download/preview routes (`/projects/:id/deliverables/:type/generate`, `/projects/:id/artifacts/:artifactId/{download,preview}`).

**Why:** Phase 2 requires DOCX/PPTX/XLSX/PDF/Mermaid/Charts/Drafts to all plug into one engine rather than duplicating generation/persistence/Ledger code per file type (explicit user architecture requirement). Reusing existing jsonb columns avoided touching `lib/db/src/index.ts` (forbidden) or migrating `project_artifacts` schema.

**How to apply:** Adding a new file-backed deliverable type (PPTX, XLSX, PDF, Mermaid, charts) = write one new renderer file under `artifacts/api-server/src/lib/renderers/`, side-effect-import it once in `projectArtifacts.ts`, and register it. No new routes, no schema changes, no Ledger code needed — the existing generate/download/preview routes are generic over `type`. Draft generators (Email/Slack/PR/Changelog) should also register as renderers with `category: "draft"` even though they may not need real files (still get preview/Ledger/download consistency for free).
