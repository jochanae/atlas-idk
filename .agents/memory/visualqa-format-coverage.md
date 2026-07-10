---
name: Visual QA multi-format coverage & UI surfacing
description: How F6B visual QA extended from PPTX to DOCX/PDF/XLSX, and the rule for surfacing results in the UI
---

DOCX and PDF share a single checker (`docVisualQA.ts`) rather than one each, because both render through the same document-native preview shape (title/sectionHeadings/sectionCount) — there was no format-specific signal to split on.

XLSX visual QA is inherently best-effort: LibreOffice's headless print-to-PDF pagination does not map 1:1 to worksheets, so page-level checks are approximate. Document this caveat at the checker rather than hiding it.

**Why:** `runVisualQA` in `artifactEngine.ts` looks up checkers generically by type from a registry — adding format support is just registering a new checker via a side-effect import, no engine changes needed. This makes "add format N" cheap once the pattern exists, but easy to under-scope if you don't know it.

**How to apply:** When adding a new visual-QA-checked format, check whether it shares a preview shape with an existing format before writing a new checker file. In the UI, only surface `metadata.verification.visualQA` when `status === "checked"` — "skipped"/"unavailable" means no checker exists yet for that type or the toolchain wasn't available, and must not render as a warning/error badge.
