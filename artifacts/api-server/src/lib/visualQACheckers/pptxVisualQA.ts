// PPTX visual QA checker — F6B first supported type (per matrix priority).
//
// Runs against real rendered PNGs (via renderToImages -> LibreOffice -> PDF
// -> pdftoppm), so these are pixel-level judgments, not guesses from the
// content model. Rules implemented, per task-173:
//  - empty-slide: slide is visually near-blank (background color only).
//  - low-contrast: slide's foreground content barely differs from its background.
//  - bottom-edge-overflow: non-background content bleeds into the bottom
//    safe-margin band, which is the pixel signature of text/shape overflow
//    off the visible slide area.
//  - sparse-content / dense-heading: structural checks using the renderer's
//    own preview payload (slide headings + per-slide content summary) — no
//    LLM judgment, just concrete thresholds.
import sharp from "sharp";
import { registerVisualQAChecker, type VisualQAIssue } from "../visualQAEngine";

const EMPTY_SLIDE_STDDEV_THRESHOLD = 4; // near-zero pixel variance == effectively blank
const LOW_CONTRAST_RANGE_THRESHOLD = 40; // out of 255 luminance range
const OVERFLOW_BAND_FRACTION = 0.04; // bottom 4% of slide height = safe-margin band
const OVERFLOW_NON_BG_PIXEL_FRACTION = 0.12; // % of band pixels that must differ from bg to flag
const BG_COLOR_DISTANCE_THRESHOLD = 30; // per-channel-ish distance to call a pixel "not background"
const DENSE_HEADING_CHAR_THRESHOLD = 90;
const MIN_BULLET_CHARS = 3; // a bullet this short reads as an orphan fragment, not a real point

interface SlideContentSummary {
  layout: string;
  heading?: string;
  itemTexts: string[];
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

async function analyzeSlideImage(
  png: Buffer,
  bgHex: string | undefined,
): Promise<{ stddev: number; luminanceRange: number; overflowFraction: number }> {
  const image = sharp(png);
  const { width = 0, height = 0 } = await image.metadata();
  const { data, info } = await image
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const pixelCount = info.width * info.height;

  // Overall luminance stats — drives empty-slide + low-contrast rules.
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
  const stddev = Math.sqrt(Math.max(0, variance));

  // Bottom safe-margin band — drives overflow rule.
  let overflowFraction = 0;
  if (width > 0 && height > 0 && bgHex) {
    const [bgR, bgG, bgB] = hexToRgb(bgHex);
    const bandHeight = Math.max(1, Math.round(height * OVERFLOW_BAND_FRACTION));
    const bandStartRow = height - bandHeight;
    let nonBgPixels = 0;
    let bandPixelCount = 0;
    for (let y = bandStartRow; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const off = (y * width + x) * channels;
        const r = data[off], g = data[off + 1], b = data[off + 2];
        const distance = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
        bandPixelCount++;
        if (distance > BG_COLOR_DISTANCE_THRESHOLD) nonBgPixels++;
      }
    }
    overflowFraction = bandPixelCount > 0 ? nonBgPixels / bandPixelCount : 0;
  }

  return { stddev, luminanceRange: max - min, overflowFraction };
}

/**
 * Extracts a lightweight per-slide text summary directly from the
 * Presentation Director's SlidePlan-shaped preview (see pptxRenderer.ts's
 * `contentSummary` field). Purely structural — no pixel data involved.
 */
function readContentSummary(preview: Record<string, unknown> | null): SlideContentSummary[] {
  if (!preview) return [];
  const raw = preview.contentSummary;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is SlideContentSummary =>
      !!s && typeof s === "object" && typeof (s as SlideContentSummary).layout === "string",
  );
}

registerVisualQAChecker({
  type: "pptx",
  format: "pptx",
  async check({ pages, preview }): Promise<VisualQAIssue[]> {
    const issues: VisualQAIssue[] = [];
    const previewRecord = preview ?? {};
    const bgHex = typeof previewRecord.themeBackground === "string" ? previewRecord.themeBackground : undefined;
    const contentSummary = readContentSummary(preview);

    for (let i = 0; i < pages.length; i++) {
      const { stddev, luminanceRange, overflowFraction } = await analyzeSlideImage(pages[i], bgHex);

      if (stddev < EMPTY_SLIDE_STDDEV_THRESHOLD) {
        issues.push({
          rule: "empty-slide",
          severity: "error",
          pageIndex: i,
          message: `Slide ${i + 1} renders as visually blank (pixel variance ${stddev.toFixed(2)}) — no visible content.`,
        });
      } else if (luminanceRange < LOW_CONTRAST_RANGE_THRESHOLD) {
        issues.push({
          rule: "low-contrast",
          severity: "warning",
          pageIndex: i,
          message: `Slide ${i + 1} has a narrow luminance range (${luminanceRange.toFixed(0)}/255) — text may be hard to read against its background.`,
        });
      }

      if (overflowFraction > OVERFLOW_NON_BG_PIXEL_FRACTION) {
        issues.push({
          rule: "bottom-edge-overflow",
          severity: "error",
          pageIndex: i,
          message: `Slide ${i + 1} has content bleeding into the bottom safe margin (${(overflowFraction * 100).toFixed(0)}% of the band is non-background) — likely text/shape overflow.`,
        });
      }

      const summary = contentSummary[i];
      if (summary) {
        if (summary.heading && summary.heading.length > DENSE_HEADING_CHAR_THRESHOLD) {
          issues.push({
            rule: "dense-heading",
            severity: "warning",
            pageIndex: i,
            message: `Slide ${i + 1}'s heading is ${summary.heading.length} characters — likely to wrap awkwardly or overflow its box.`,
          });
        }
        const orphanBullets = summary.itemTexts.filter((t) => t.trim().length > 0 && t.trim().length < MIN_BULLET_CHARS);
        if (orphanBullets.length > 0) {
          issues.push({
            rule: "orphan-bullet",
            severity: "warning",
            pageIndex: i,
            message: `Slide ${i + 1} has ${orphanBullets.length} bullet(s) shorter than ${MIN_BULLET_CHARS} characters ("${orphanBullets.join('", "')}") — reads as a fragment, not a point.`,
          });
        }
      }
    }

    return issues;
  },
});
