---
name: Presentation Director architecture
description: Renderer-agnostic content/structure layer for Atlas-generated presentations — separates "what story, which layout" from "how to draw it in this format".
---

Phase 3B.3 replaced the old flat "title + bullets per slide" content plan with a two-stage pipeline:

```
Purpose → Slide Story → Layout choice → Theme → (Icons/visual assets, later) → Renderer
```

**Director** (`artifacts/api-server/src/lib/presentation-director/`) is the creative brain: one Haiku call infers the presentation's purpose from conversation context (investor pitch, training deck, etc.), decides the slide sequence, and picks one of 12 layouts per slide (hero, problem_opportunity, solution, feature_grid, timeline, kpi_metrics, comparison, process_flow, screenshot_showcase, quote, closing_cta, content_bullets fallback). Output is a renderer-agnostic `SlidePlan` (Zod discriminated union on `layout`). The Director knows nothing about pptxgenjs, colors, or fonts.

**Renderer** (`pptxLayouts.ts`) only executes: one draw function per layout, painted with whatever `DeliverableTheme` is active. This split is what makes the catalog portable — porting to DOCX/PDF/HTML (3B.4) means writing new draw functions against the same `SlidePlan`, not rebuilding the intelligence.

**Why this shape:** the user explicitly wanted the "creative brain" reusable across every future renderer (PPTX, HTML, PDF, Canva/Google Slides exports) rather than embedded in the PPTX generator. Structure (layout) and skin (theme) are now orthogonal — this is also why 3B.2 (project themes) was resequenced to come after 3B.3: theming a fixed layout catalog is a clean drop-in, but theming a monotone bullet deck wasn't the real bottleneck.

**Scope guardrail:** shape-based visuals (progress-bar-style KPI cards, callout card borders, timeline connector lines) are cheap and were included directly in the 3B.3 layout functions. A real SVG/vector icon vocabulary (wallet, shield, family, etc.) is heavier asset-pipeline work and was deliberately deferred to a follow-up phase after 3B.2, not bundled into 3B.3.

Verified end-to-end (Haiku call → validated SlidePlan → pptxgenjs buffer → valid OOXML zip) with a real CoinsBloom-style investor-pitch context; Director produced a 7-slide sequence (hero → problem_opportunity → solution → feature_grid → kpi_metrics → timeline → closing_cta) with no invented facts.
