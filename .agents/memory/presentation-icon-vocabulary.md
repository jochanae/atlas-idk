---
name: Presentation Icon Vocabulary (3B.3-icons)
description: How real SVG icons get chosen and rendered into PPTX KPI cards, feature grids, timelines, and process flows.
---

PPTX decks now show real vector icons (not just shapes/text) on `kpi_metrics`, `feature_grid`, `timeline`, and `process_flow` slides.

**Why:** pptxgenjs has no native SVG support (only PNG/JPG), so icons must be rasterized to PNG before being placed with `addImage`. A fixed, curated vocabulary (not free-form SVG generation by the LLM) keeps output visually consistent and avoids the LLM inventing malformed icon markup.

**How to apply:**
- `deliverable-theme/icons/iconLibrary.ts` holds ~32 curated stroke-based icons (Feather-style, 24x24 viewBox) as raw inner-SVG markup strings, keyed by a fixed `IconKey` union (`ICON_KEYS`). `buildIconSvg(key, colorHex)` wraps the markup into a full standalone SVG recolored to any hex.
- `deliverable-theme/icons/renderIcon.ts` rasterizes via `@resvg/resvg-js` (pure Rust/WASM, no headless browser, no system deps) and caches PNG buffers in-memory per `(icon, color, size)` key for the lifetime of the process.
- The Presentation Director's schema (`presentation-director/schema.ts`) adds an optional `icon: IconKey` field to KPI metric/feature/milestone/process-step items; `director.ts`'s prompt lists the exact allowed vocabulary and instructs the model to omit the field rather than invent a key outside it.
- `renderers/pptxLayouts.ts` has a shared `drawIcon()` helper; each of the four layouts calls it conditionally (`if (item.icon) drawIcon(...)`) so icons are optional per-item, not mandatory.
- **Build gotcha:** `@resvg/resvg-js` ships a native `.node` binary. esbuild cannot bundle `.node` files — even though `build.mjs` already externalizes `*.node` globs, the JS wrapper package itself (`@resvg/resvg-js`) must also be added to esbuild's `external` list, or the build fails with "No loader is configured for '.node' files". Same class of issue as `sharp`/`better-sqlite3` etc. already in that list.
- Verified end-to-end: all 32 icons rasterize to valid PNG signatures; a real Haiku-driven deck chose 15 icons across kpi/feature/timeline/process slides and the resulting PPTX zip contained the matching embedded PNGs in `ppt/media/`.
