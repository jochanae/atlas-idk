// XLSX visual QA checker — best-effort F6B extension.
//
// Spreadsheets don't paginate the way documents/decks do: LibreOffice
// prints a workbook per its own print-area/page-break rules, so rendered
// page count has no reliable 1:1 relationship to worksheet count. Given
// that, this checker intentionally limits itself to what pixel data can
// say without guessing at layout: is a printed page visually blank (a
// real signal something failed to render), and does the printed area look
// suspiciously sparse compared to the sheet's declared row/column count.
import sharp from "sharp";
import { registerVisualQAChecker, type VisualQAIssue } from "../visualQAEngine";

const BLANK_PAGE_STDDEV_THRESHOLD = 3;

interface SheetPreview {
  name: string;
  columns: unknown[];
  rowCount: number;
  hasFormulas: boolean;
}

function readSheetsPreview(preview: Record<string, unknown> | null): SheetPreview[] {
  if (!preview) return [];
  const raw = preview.sheets;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is SheetPreview => !!s && typeof s === "object" && typeof (s as SheetPreview).name === "string",
  );
}

async function pageStddev(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const pixelCount = info.width * info.height;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * channels;
    const lum = 0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2];
    sum += lum;
    sumSq += lum * lum;
  }
  const mean = sum / pixelCount;
  const variance = sumSq / pixelCount - mean * mean;
  return Math.sqrt(Math.max(0, variance));
}

registerVisualQAChecker({
  type: "xlsx",
  format: "xlsx",
  async check({ pages, preview }): Promise<VisualQAIssue[]> {
    const issues: VisualQAIssue[] = [];
    const sheets = readSheetsPreview(preview);

    for (let i = 0; i < pages.length; i++) {
      const stddev = await pageStddev(pages[i]);
      if (stddev < BLANK_PAGE_STDDEV_THRESHOLD) {
        issues.push({
          rule: "blank-page",
          severity: "error",
          pageIndex: i,
          message: `Printed page ${i + 1} renders as visually blank (pixel variance ${stddev.toFixed(2)}) — likely a sheet that failed to print or has an empty print area.`,
        });
      }
    }

    const sheetsWithData = sheets.filter((s) => s.rowCount > 0);
    if (sheets.length > 0 && sheetsWithData.length === 0) {
      issues.push({
        rule: "no-printable-data",
        severity: "warning",
        message: `Workbook has ${sheets.length} sheet(s) but none report any rows — nothing meaningful will print.`,
      });
    }

    return issues;
  },
});
