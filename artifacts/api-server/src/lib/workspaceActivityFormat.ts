/**
 * Pure formatting helpers for workspace activity verbs.
 * Kept separate from DB emit so unit tests don't need DATABASE_URL.
 */

/** Human-readable byte size for attachment_received subtitles. */
export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb >= 10 ? Math.round(kb) : kb.toFixed(1)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

/** File extension label (lowercase, no dot) for subtitles. */
export function attachmentExtLabel(filename: string, mimeType?: string): string {
  const fromName = (filename || "").split(".").pop()?.trim().toLowerCase();
  if (fromName && fromName !== filename.toLowerCase() && fromName.length <= 8) {
    return fromName;
  }
  const mime = (mimeType || "").toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("presentation")) return "pptx";
  if (mime.includes("wordprocessing")) return "docx";
  if (mime.includes("spreadsheet")) return "xlsx";
  return "file";
}

/**
 * Human reason for attachment_unsupported.
 * Wire contract example: "PPTX not yet readable".
 */
export function unsupportedAttachmentReason(
  filename: string,
  mimeType?: string,
  machineReason?: string,
): string {
  if (machineReason === "download_failed") {
    return "Could not load file from storage";
  }
  if (machineReason === "expired") {
    return "Attachment expired";
  }
  if (machineReason === "not_uploaded" || machineReason === "not_found_or_forbidden") {
    return "Attachment unavailable";
  }
  if (
    machineReason === "message_attachment_bytes_exceeded" ||
    machineReason === "too_many_attachments"
  ) {
    return "Attachment too large for this turn";
  }
  if (machineReason === "processing_failed") {
    return "Attachment processing failed";
  }

  const ext = attachmentExtLabel(filename, mimeType).toUpperCase();
  const known = new Set(["PPTX", "PPT", "DOCX", "DOC", "XLSX", "XLS", "CSV", "ZIP"]);
  if (known.has(ext)) {
    return `${ext} not yet readable`;
  }
  return "File type not yet readable";
}

export function documentAnalyzedSubtitle(text: string): string {
  const trimmed = (text || "").trim();
  const slideMatches = trimmed.match(/\[Slide\s+\d+\]/gi);
  const slides = slideMatches?.length ?? 0;
  const withoutSlideMarkers = trimmed.replace(/\[Slide\s+\d+\]/gi, " ");
  const words = withoutSlideMarkers
    ? withoutSlideMarkers.split(/\s+/).filter(Boolean).length
    : 0;
  const wordLabel = `${words.toLocaleString("en-US")} word${words === 1 ? "" : "s"}`;
  if (slides > 0) {
    return `${slides} slide${slides === 1 ? "" : "s"} · ${wordLabel}`;
  }
  return wordLabel;
}

export function responseGeneratedSubtitle(opts: {
  executionTimeMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): string | undefined {
  const parts: string[] = [];
  if (opts.executionTimeMs != null && opts.executionTimeMs > 0) {
    parts.push(`${Math.round(opts.executionTimeMs)} ms`);
  }
  const inTok = opts.inputTokens;
  const outTok = opts.outputTokens;
  const total =
    inTok != null || outTok != null
      ? (inTok ?? 0) + (outTok ?? 0)
      : null;
  if (total != null && total > 0) {
    parts.push(`${total.toLocaleString("en-US")} tokens`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
