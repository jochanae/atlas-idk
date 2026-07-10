---
name: Deliverable Design System (Phase 3B)
description: Multi-phase plan to give every Atlas-generated deliverable (PPTX/DOCX/PDF/HTML) a shared brand identity instead of four independently-hardcoded plain templates.
---

Atlas's file renderers (PPTX/DOCX/PDF/HTML, under `artifacts/api-server/src/lib/renderers/`) each independently hardcode their own plain visual style (white background, black text, default fonts) — there was no shared design layer, so every format looked like generic library output instead of an Atlas-branded deliverable. Confirmed via user comparison against a competitor platform's themed pitch deck.

**Why:** the fix isn't "make PPTX prettier" — DOCX has the identical problem, so the right level to solve it at is architectural: one shared brand-token module every renderer consumes, not per-renderer patches.

**Order was reordered after 3B.1 shipped** — once the CoinsBloom deck was themed, the user judged monotone layout (not missing brand) as the next bottleneck, so 3B.3 now runs before 3B.2. See `presentation-director.md` for why and for the architecture that came out of that reorder.

**How to apply — approved phased plan (do not skip ahead):**
- **3B.1 (done)** — `artifacts/api-server/src/lib/deliverable-theme/tokens.ts` holds the shared `DeliverableTheme` token shape + `ATLAS_DEFAULT_THEME` (obsidian bg `#0B0A0F` / gold `#E6C687` accent, mirrors `artifacts/atlas-frontend/src/styles.css`). Wired into `pptxRenderer.ts` only: dark slide master via `pptx.defineSlideMaster`, gold accent dividers, Georgia headings / Calibri body, footer + page numbers. `resolveDeliverableTheme()` currently always returns the Atlas default — no branching logic yet.
- **3B.3 (done, PPTX only)** — Presentation Director + 12-layout catalog replaces the old title+bullets-only content plan. See `presentation-director.md`.
- **3B.2 (done, PPTX only)** — project-theme inference is live. See `project-theme-inference.md`.
- **3B.3-icons (done, PPTX only)** — real SVG icon vocabulary is live. See `presentation-icon-vocabulary.md`.
- **3B.4-docx-pdf (done)** — DOCX + PDF now themed and document-native. See `document-format-porting.md`.
- **3B.4-html (not started, separate subtask)** — no HTML deliverable renderer exists yet at all (only pptx/docx/pdf/xlsx are registered). Creating one is scoped as its own subtask, not a "port" — it would be a new format, and per architecture decision it should reuse the Presentation Director's full slide/layout catalog (the richest of any format) once built, not the document-native DOCX/PDF model.

3B.2, 3B.3, 3B.3-icons, and 3B.4-docx-pdf are done. 3B.4-html is a new-artifact-type subtask, not yet started — do not skip ahead to it without explicit scoping.
