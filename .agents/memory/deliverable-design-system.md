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
- **3B.3-icons (not started, deferred on purpose)** — real SVG/vector icon vocabulary (wallet, shield, family, etc.); shape-based visuals (progress bars/KPI cards/callout boxes) were cheap enough to fold into 3B.3 already, but a proper icon set is separate asset-pipeline work.
- **3B.4 (not started)** — port the same token layer + Director/layout catalog + theme inference to DOCX/PDF/HTML so all four renderers converge on one identity.

3B.2 and 3B.3 are both PPTX-only so far — 3B.4 is the porting phase for DOCX/PDF/HTML, do not skip ahead to it without explicit scoping.
