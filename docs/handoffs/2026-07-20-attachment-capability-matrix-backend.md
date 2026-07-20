# Handoff: Attachment Capability Matrix — Backend Extraction

**Date:** 2026-07-20
**Repo:** `jochanae/atlas-idk` (monorepo — Replit)
**Owner:** Cursor
**Priority:** P1

## Problem

Today `artifacts/api-server/src/lib/attachmentClassify.ts` hard-codes
PPTX / DOCX / XLSX / CSV / ZIP as `processingStatus: "unsupported"`. Users
attach a deck for inspiration or ask questions about their own docs, and
Atlas can only reply with prose about the filename. The frontend now
surfaces the honest limit via `CapabilityHint` + the shared
`supportMatrix.ts`, but the ceiling is backend — Atlas literally never
receives the bytes.

## Goal

Promote at least one non-image, non-PDF format from `storage_only` →
`model_use` in the same turn the user sends it. Ordered by leverage:

1. **PPTX** — decks are the top failure mode. Extract text per slide +
   speaker notes; optionally rasterize each slide to PNG and inject as an
   image block (Gemini/Claude can then reason visually).
2. **DOCX** — extract paragraphs + headings via `mammoth` / OOXML XML walk.
3. **XLSX / CSV** — extract sheet-per-sheet as markdown tables, cap at
   ~200 rows/sheet.

Existing OOXML helpers already live at
`artifacts/api-server/src/lib/verifiers/ooxmlUtils.ts` — reuse them.

## Contract (do not break)

The frontend enforces this and will keep enforcing it:

- `supportMatrix.ts` (frontend) and `attachmentClassify.ts` (backend) MUST
  return the same `capability` / `processingStatus` for every ext + mime.
  When you flip PPTX to `understood`, flip both in the same PR.
- `capability = "model_use"` means bytes reach the model. If extraction
  fails at request time, downgrade to `processingStatus = "failed"` on
  that specific attachment row and emit `attachment_unsupported` (see the
  companion timeline-verbs handoff) — never silently drop.
- Never claim understanding you didn't deliver. If PPTX extraction returns
  0 slides, treat as failed.

## Suggested implementation

- New service: `artifacts/api-server/src/services/attachmentExtract/` with
  one file per format (`pptx.ts`, `docx.ts`, `xlsx.ts`). Each exports
  `extract(buf: Buffer): Promise<{ text: string; images?: Buffer[] }>`.
- Wire into whatever assembles the model request body (search for
  `normalizeModelMediaType` callers). Extracted text goes in as a text
  block; rasterized slide PNGs go in as image blocks.
- Cap total injected bytes per turn — suggest 500 KB text + 8 image
  blocks. Truncate longest first, log what was dropped.
- Update `docs/architecture/attachment-support-matrix.md` in the same PR.

## Verification checklist

- [ ] Send a 10-slide PPTX in Ask Atlas → Atlas quotes actual slide text.
- [ ] Send a DOCX with headings → Atlas references a heading by name.
- [ ] Send an oversized PPTX (>50 slides) → extraction caps + emits
      `attachment_unsupported` with `reason: "deck too large — first 20 slides analyzed"`.
- [ ] Frontend `supportMatrix.ts` updated in same PR; unit test
      `attachmentClassify.test.ts` covers new statuses.

## Out of scope

- Video, audio, images beyond current PNG/JPG/WEBP.
- OCR on scanned PDFs (separate handoff).
- Full Files browser indexing — this handoff is about the send-turn only.
