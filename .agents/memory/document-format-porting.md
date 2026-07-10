---
name: Document Format Porting (3B.4-docx-pdf)
description: How DOCX and PDF became themed, document-native deliverables sharing one content model instead of copying the PPTX slide layout system.
---

DOCX and PDF do not reuse the Presentation Director's `SlidePlan`/layout-catalog system from PPTX — that's slide-shaped content, and forcing a document to render slide layouts literally would look wrong. Instead they share one new **document-native** content model.

**Why:** the user explicitly asked for "format-native" ports: DOCX/PDF should feel like real documents (cover page, executive summary, section headers, tables, quotes, checklists, callouts), not PowerPoint pretending to be Word. Treating PDF as a second independent design system (as it was before) let its typography/spacing drift from DOCX.

**How to apply:**
- `deliverable-theme/documentContentPlan.ts` defines the one shared schema (`DocumentContentPlanSchema`): `title` + optional `subtitle`/`executiveSummary` + `sections[]`, where each section is a `heading` + `blocks[]`. Blocks are a discriminated union: `paragraph`, `bullets`, `checklist`, `quote`, `callout` (with optional tone + optional icon), `table`. Both `docxRenderer.ts` and `pdfRenderer.ts` request and validate against this exact schema via `generateValidatedContentPlan`, so their content never diverges structurally.
- Both renderers now call `resolveDeliverableTheme()` (same function PPTX uses) with project theme signals, so fonts/colors/accent follow the same inference chain (user override > inferred project theme > Atlas default) across all three formats.
- DOCX (`docx` npm lib) renders true document constructs: a real cover page + `PageBreak`, `Header`/`Footer` with `PageNumber.CURRENT`, shaded callout paragraphs, bordered block-quotes, and real `Table`/`TableRow`/`TableCell` for tabular blocks.
- PDF (`pdfkit`, no DOM/object model) hand-draws the same visual vocabulary with primitives: `doc.rect` for callout boxes and quote rules, manual column math for tables, `bufferPages: true` + a post-render pass over `bufferedPageRange()` to draw a footer/page-number band on every page (pdfkit has no persistent header/footer concept).
- Icons are optional on `callout` blocks only, reusing the existing `IconKey` vocabulary/`renderIconPng` — deliberately not attempted on bullets/checklists/tables. Icon parity with PPTX was explicitly out of scope; visual consistency, not pixel-parity, is the acceptance bar.
- Verified end-to-end: rendered a real DOCX (valid OOXML zip, has header1.xml/footer1.xml) and a real 2-page PDF (`%PDF-1.3`, valid `/Page` objects) from the same context through both renderers.
- HTML was scoped out separately — no HTML deliverable renderer exists in the artifact registry at all yet (only pptx/docx/pdf/xlsx). Building one is a new-artifact-type subtask, not a port, and per the architecture decision should target the Presentation Director's full slide/layout catalog once it exists (HTML is the richest format), not this document-native model.
