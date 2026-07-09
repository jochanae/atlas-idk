---
name: Project Theme Inference (3B.2)
description: How PPTX deliverables get a per-project color/font theme instead of always using the Atlas default.
---

`resolveDeliverableTheme(input?)` in `deliverable-theme/tokens.ts` is async and resolves in priority order: explicit user style override > inferred project theme (from Project DNA signals) > `ATLAS_DEFAULT_THEME`.

**Why:** decks for different projects (e.g. a fintech app vs. an archival-history app) should not all look like Atlas's own obsidian/gold brand — but Atlas's own identity must still be the safe fallback when there isn't enough signal to infer something better.

**How to apply:**
- `deliverable-theme/inferTheme.ts` (`inferProjectTheme`) makes a single Haiku call against `projectName` / `creativePrinciples` / `experienceIntent.visualLanguage` / an optional free-text `styleOverride`, producing a full theme (colors + heading/body fonts from a whitelist). It validates background/text contrast (relative luminance, threshold ~3.2) and falls back to `null` on low contrast or any LLM/parsing error — callers must treat `null` as "use Atlas default", never surface a broken theme.
- `deliverable-theme/projectSignals.ts` (`loadProjectThemeSignals(projectId, styleOverride?)`) is the DB-facing loader that pulls the DNA fields + project name needed by `inferTheme`.
- Both the `generate_deliverable` agent tool and the generic `/api/projects/:id/artifacts/:type/generate` route now pass `projectId` (+ optional `styleOverride`, exposed as a `style` param on the agent tool) into the renderer input so `resolveDeliverableTheme` can do the lookup. Only `pptxRenderer.ts` consumes this today — DOCX/PDF/HTML renderers don't exist yet (3B.4).
- Manual verification pattern: write a throwaway `__manual_test.ts` under the relevant lib dir and run with `pnpm exec tsx <path>` (not `npx tsx -e`), delete it when done. Confirmed real Haiku calls produce sensible, on-brand, contrast-safe themes for both DNA-inferred (fintech → emerald palette) and explicit-override (parchment/gold "old library" feel) cases, and that no-signal correctly returns `null`.
