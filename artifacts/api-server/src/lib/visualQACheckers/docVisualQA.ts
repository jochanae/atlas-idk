// DOCX + PDF visual QA checker — F6B extension beyond the PPTX-first pass.
//
// Both renderers share one document-native content model (see
// docxRenderer.ts / pdfRenderer.ts preview: title, sectionHeadings,
// sectionCount), so one checker registers under both "docx" and "pdf"
// types and renders through the same pipeline (docx converts via
// LibreOffice, pdf skips that step — see renderToImages.ts).
//
// Rules:
//  - blank-page: a rendered page is visually near-uniform (no visible
//    text/content at all) — the pixel signature of a missing/failed
//    section render.
//  - low-contrast: page content barely differs in luminance from the
//    page background, making text hard to read.
//  - dense-heading: a section heading is long enough that it's likely to
//    wrap awkwardly or crowd its own page.
import sharp from "sharp";
import { registerVisualQAChecker, type VisualQAIssue } from "../visualQAEngine";

const BLANK_PAGE_STDDEV_THRESHOLD = 3; // documents are mostly white space; a near-zero-variance page is genuinely blank
const LOW_CONTRAST_RANGE_THRESHOLD = 35; // out of 255 luminance range
const DENSE_HEADING_CHAR_THRESHOLD = 100;

async function analyzePageImage(png: Buffer): Promise<{ stddev: number; luminanceRange: number }> {
  const image = sharp(png);
  const { data, info } = await image
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const pixelCount = info.width * info.height;

  let sum = 0;
  let sumSq = 0;
  let min = 255;
  let max = 0;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * channels;
    const r = data[off], g = data[off + 1], b = data[off + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += lum;
    sumSq += lum * lum;
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  const mean = sum / pixelCount;
  const variance = sumSq / pixelCount - mean * mean;
  return { stddev: Math.sqrt(Math.max(0, variance)), luminanceRange: max - min };
}

interface DocumentPreview {
  title?: string;
  sectionHeadings?: string[];
  sectionCount?: number;
}

function readDocumentPreview(preview: Record<string, unknown> | null): DocumentPreview {
  if (!preview) return {};
  return {
    title: typeof preview.title === "string" ? preview.title : undefined,
    sectionHeadings: Array.isArray(preview.sectionHeadings)
      ? preview.sectionHeadings.filter((h): h is string => typeof h === "string")
      : undefined,
    sectionCount: typeof preview.sectionCount === "number" ? preview.sectionCount : undefined,
  };
}

async function checkDocumentPages({ pages, preview }: { pages: Buffer[]; preview: Record<string, unknown> | null }): Promise<VisualQAIssue[]> {
  const issues: VisualQAIssue[] = [];
  const { sectionHeadings } = readDocumentPreview(preview);

  for (let i = 0; i < pages.length; i++) {
    const { stddev, luminanceRange } = await analyzePageImage(pages[i]);

    if (stddev < BLANK_PAGE_STDDEV_THRESHOLD) {
      issues.push({
        rule: "blank-page",
        severity: "error",
        pageIndex: i,
        message: `Page ${i + 1} renders as visually blank (pixel variance ${stddev.toFixed(2)}) — likely missing content.`,
      });
    } else if (luminanceRange < LOW_CONTRAST_RANGE_THRESHOLD) {
      issues.push({
        rule: "low-contrast",
        severity: "warning",
        pageIndex: i,
        message: `Page ${i + 1} has a narrow luminance range (${luminanceRange.toFixed(0)}/255) — text may be hard to read against its background.`,
      });
    }
  }

  if (sectionHeadings) {
    sectionHeadings.forEach((heading, idx) => {
      if (heading.length > DENSE_HEADING_CHAR_THRESHOLD) {
        issues.push({
          rule: "dense-heading",
          severity: "warning",
          message: `Section ${idx + 1} heading is ${heading.length} characters ("${heading.slice(0, 40)}...") — likely to wrap awkwardly.`,
        });
      }
    });
  }

  return issues;
}

registerVisualQAChecker({
  type: "docx",
  format: "docx",
  check: checkDocumentPages,
});

registerVisualQAChecker({
  type: "pdf",
  format: "pdf",
  check: checkDocumentPages,
});
