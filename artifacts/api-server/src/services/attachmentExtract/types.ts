/**
 * Shared types for send-turn attachment extraction.
 * Extracted text is injected as a model text block; optional images as image blocks.
 */

export type AttachmentExtractResult = {
  /** Human-readable extracted content for the model. Empty string is treated as failure. */
  text: string;
  /** Optional rasterized page/slide PNGs (best-effort). */
  images?: Buffer[];
  /** Non-fatal notices (e.g. slide/row caps). */
  warnings?: string[];
  /** Structured stats for activity verbs / logging. */
  stats?: {
    slides?: number;
    slidesAnalyzed?: number;
    sheets?: number;
    rows?: number;
    paragraphs?: number;
    truncated?: boolean;
  };
};

export type AttachmentExtractFormat = "pptx" | "docx" | "xlsx" | "csv";

/** Soft caps for model injection per turn. */
export const EXTRACT_TEXT_BYTE_CAP = 500 * 1024; // 500 KB
export const EXTRACT_IMAGE_BLOCK_CAP = 8;
export const PPTX_SLIDE_CAP = 20;
export const SPREADSHEET_ROW_CAP = 200;
