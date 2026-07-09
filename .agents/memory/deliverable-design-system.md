---
name: Deliverable Design System (Phase 3B)
description: Multi-phase plan to give every Atlas-generated deliverable (PPTX/DOCX/PDF/HTML) a shared brand identity instead of four independently-hardcoded plain templates.
---

Atlas's file renderers (PPTX/DOCX/PDF/HTML, under `artifacts/api-server/src/lib/renderers/`) each independently hardcode their own plain visual style (white background, black text, default fonts) — there was no shared design layer, so every format looked like generic library output instead of an Atlas-branded deliverable. Confirmed via user comparison against a competitor platform's themed pitch deck.

**Why:** the fix isn't "make PPTX prettier" — DOCX has the identical problem, so the right level to solve it at is architectural: one shared brand-token module every renderer consumes, not per-renderer patches.

**How to apply — approved phased plan (do not skip ahead):**
- **3B.1 (done)** — `artifacts/api-server/src/lib/deliverable-theme/tokens.ts` holds the shared `DeliverableTheme` token shape + `ATLAS_DEFAULT_THEME` (obsidian bg `#0B0A0F` / gold `#E6C687` accent, mirrors `artifacts/atlas-frontend/src/styles.css`). Wired into `pptxRenderer.ts` only: dark slide master via `pptx.defineSlideMaster`, gold accent dividers, Georgia headings / Calibri body, footer + page numbers. `resolveDeliverableTheme()` currently always returns the Atlas default — no branching logic yet.
- **3B.2 (not started)** — project-theme inference from `project_dna.experienceIntent.visualLanguage` / `visualSketches`, explicit user-style override parsing ("make it look like Pixar"), hierarchy = user override > project theme > Atlas default. Also add a "Generating presentation... Theme: X · Style: Y" status line.
- **3B.3 (not started)** — layout catalog (Hero/Problem-Solution/Two-column/Timeline/KPI dashboard/Quote/Feature grid/Closing) instead of title+bullets-only; content-plan generation picks a layout per slide.
- **3B.4 (not started)** — port the same token layer + layout catalog to DOCX/PDF/HTML so all four renderers converge on one identity.

Do not add project-theme/style-override logic to `resolveDeliverableTheme()` until 3B.2 is explicitly scoped — 3B.1 was intentionally kept to Atlas-default-only to prove the theming pipeline end-to-end first.
