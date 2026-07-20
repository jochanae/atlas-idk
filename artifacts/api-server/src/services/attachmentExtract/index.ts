/**
 * Send-turn attachment extraction dispatcher.
 *
 * Formats promoted to model_use (PPTX/DOCX/XLSX/CSV) are extracted here so
 * resolveAttachmentIdsForModel can inject text (+ optional images) instead of
 * raw OOXML bytes the model cannot read.
 */
import { extract as extractPptx } from "./pptx";
import { extract as extractDocx } from "./docx";
import { extract as extractXlsx } from "./xlsx";
import { extract as extractCsv } from "./csv";
import {
  EXTRACT_IMAGE_BLOCK_CAP,
  EXTRACT_TEXT_BYTE_CAP,
  type AttachmentExtractFormat,
  type AttachmentExtractResult,
} from "./types";
import { logger } from "../../lib/logger";

export type {
  AttachmentExtractFormat,
  AttachmentExtractResult,
} from "./types";
export {
  EXTRACT_IMAGE_BLOCK_CAP,
  EXTRACT_TEXT_BYTE_CAP,
  PPTX_SLIDE_CAP,
  SPREADSHEET_ROW_CAP,
} from "./types";

const DOCX_MIME =
  /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/i;
const PPTX_MIME =
  /^application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation$/i;
const XLSX_MIME =
  /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet$/i;
const CSV_MIME = /^(text\/csv|application\/csv)$/i;

export function detectExtractFormat(
  mimeType: string,
  filename: string,
): AttachmentExtractFormat | null {
  const mime = (mimeType || "").trim().toLowerCase();
  const name = filename || "";
  if (PPTX_MIME.test(mime) || /\.pptx$/i.test(name)) return "pptx";
  if (DOCX_MIME.test(mime) || /\.docx$/i.test(name)) return "docx";
  if (XLSX_MIME.test(mime) || /\.xlsx$/i.test(name)) return "xlsx";
  if (CSV_MIME.test(mime) || /\.csv$/i.test(name)) return "csv";
  return null;
}

export function isExtractableAttachment(
  mimeType: string,
  filename: string,
): boolean {
  return detectExtractFormat(mimeType, filename) != null;
}

export async function extractAttachment(
  buf: Buffer,
  mimeType: string,
  filename: string,
): Promise<AttachmentExtractResult> {
  const format = detectExtractFormat(mimeType, filename);
  if (!format) {
    throw new Error(`No extractor for ${filename} (${mimeType})`);
  }

  let result: AttachmentExtractResult;
  switch (format) {
    case "pptx":
      result = await extractPptx(buf);
      break;
    case "docx":
      result = await extractDocx(buf);
      break;
    case "xlsx":
      result = await extractXlsx(buf);
      break;
    case "csv":
      result = await extractCsv(buf);
      break;
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unhandled extract format: ${_exhaustive}`);
    }
  }

  if (!result.text.trim()) {
    throw new Error(`${format.toUpperCase()} extraction returned empty text`);
  }

  // Cap images at the per-turn block budget (caller may further reduce).
  if (result.images && result.images.length > EXTRACT_IMAGE_BLOCK_CAP) {
    logger.info(
      {
        filename,
        dropped: result.images.length - EXTRACT_IMAGE_BLOCK_CAP,
      },
      "attachmentExtract: truncating image blocks to cap",
    );
    result = {
      ...result,
      images: result.images.slice(0, EXTRACT_IMAGE_BLOCK_CAP),
    };
  }

  return result;
}

const TEXT_TRUNCATION_SUFFIX =
  "\n\n[truncated — extracted text exceeded per-turn budget]";

function utf8SliceToBytes(s: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  const byteLen = (t: string) => Buffer.byteLength(t, "utf8");
  if (byteLen(s) <= maxBytes) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (byteLen(s.slice(0, mid)) <= maxBytes) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, lo);
}

/**
 * Enforce the per-turn extracted-text byte budget across resolved texts.
 * Truncates the longest texts first; returns the list of filenames truncated.
 */
export function applyExtractedTextByteCap(
  items: Array<{ name: string; text: string }>,
  capBytes: number = EXTRACT_TEXT_BYTE_CAP,
): { texts: string[]; truncatedNames: string[] } {
  const texts = items.map((i) => i.text);
  const byteLen = (s: string) => Buffer.byteLength(s, "utf8");
  let total = texts.reduce((n, t) => n + byteLen(t), 0);
  if (total <= capBytes) {
    return { texts, truncatedNames: [] };
  }

  const truncatedNames: string[] = [];
  const suffixBytes = byteLen(TEXT_TRUNCATION_SUFFIX);

  // Repeat until under budget — always shrink the current longest first.
  while (total > capBytes) {
    let longestIdx = -1;
    let longestBytes = 0;
    for (let i = 0; i < texts.length; i++) {
      const len = byteLen(texts[i]!);
      if (len > longestBytes) {
        longestBytes = len;
        longestIdx = i;
      }
    }
    if (longestIdx < 0 || longestBytes <= 0) break;

    const overflow = total - capBytes;
    const maxKeep = Math.max(0, longestBytes - overflow);
    const current = texts[longestIdx]!;
    let truncated: string;
    if (maxKeep === 0) {
      truncated = "";
    } else if (maxKeep <= suffixBytes) {
      // Not enough room for a useful body + notice — keep a hard cut.
      truncated = utf8SliceToBytes(current, maxKeep);
    } else {
      const body = utf8SliceToBytes(current, maxKeep - suffixBytes).trimEnd();
      truncated = body + TEXT_TRUNCATION_SUFFIX;
      // Guard against measurement drift pushing us over maxKeep.
      if (byteLen(truncated) > maxKeep) {
        truncated = utf8SliceToBytes(truncated, maxKeep);
      }
    }

    total = total - longestBytes + byteLen(truncated);
    texts[longestIdx] = truncated;
    const name = items[longestIdx]!.name;
    if (!truncatedNames.includes(name)) truncatedNames.push(name);
    logger.info(
      {
        filename: name,
        beforeBytes: longestBytes,
        afterBytes: byteLen(truncated),
        totalBytes: total,
        capBytes,
      },
      "attachmentExtract: truncated longest extracted text to fit budget",
    );

    // Safety: if we couldn't shrink (shouldn't happen), bail.
    if (byteLen(truncated) >= longestBytes && overflow > 0) break;
  }

  return { texts, truncatedNames };
}
