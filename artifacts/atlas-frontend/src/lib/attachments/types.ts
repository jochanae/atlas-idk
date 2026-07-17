/**
 * Attachment lifecycle — shared types.
 *
 * Frontend-only in this pass. Server owns persistence, storage paths,
 * signed URLs, retention math, model ingestion, and Library promotion.
 * Frontend never computes `expiresAt` and never sends signed URLs to Nexus.
 *
 * See docs/attachment-pipeline-audit.md + .lovable/plan.md (Section A).
 */

export type AttachmentKind =
  | "image"
  | "pdf"
  | "doc"
  | "spreadsheet"
  | "code"
  | "text"
  | "other";

/** File → object storage transfer state (frontend-observed). */
export type UploadStatus = "uploading" | "uploaded" | "failed";

/** Server-authoritative: is the underlying object still retrievable? */
export type AvailabilityStatus = "active" | "expiring" | "expired" | "library";

/** Server-authoritative: can Atlas actually read/interpret the file? */
export type ProcessingStatus =
  | "pending"
  | "understood"
  | "unsupported"
  | "failed";

/** Composer-staged, not yet acknowledged as persisted by the server. */
export interface StagedAttachment {
  clientId: string;
  file: File;
  kind: AttachmentKind;
  uploadStatus: UploadStatus;
  /** 0..1 — driven by XHR/fetch progress event when adapter exposes it. */
  uploadProgress: number;
  /** Assigned by the server on `requestUpload`. Present once known. */
  attachmentId?: string;
  error?: string;
}

/** Server-returned record. Frontend renders these; it does not synthesize them. */
export interface PersistedAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind;
  availabilityStatus: AvailabilityStatus;
  processingStatus: ProcessingStatus;
  /** ISO timestamp; null once promoted to Library (Library owns retention). */
  expiresAt: string | null;
  libraryItemId: string | null;
  /** Short-lived signed URL; only present after an explicit open/download fetch. */
  openUrl?: string;
}

/**
 * Send contract to Nexus / Ask Atlas when the persistence flag is on.
 * Server verifies ownership, resolves the objects, and constructs the model
 * payload itself. The browser MUST NOT pass a signed URL as trusted input.
 */
export interface AttachmentSendPayload {
  text: string;
  attachmentIds: string[];
}

// ─── Pure helpers (no I/O, no globals) ────────────────────────────────────────

const KIND_BY_MIME: Array<[RegExp, AttachmentKind]> = [
  [/^image\//, "image"],
  [/^application\/pdf$/, "pdf"],
  [/wordprocessingml|msword|officedocument\.wordprocessingml/, "doc"],
  [/spreadsheetml|excel|officedocument\.spreadsheetml|csv/, "spreadsheet"],
  [/^text\/(?:plain|markdown|md)$/, "text"],
];

const KIND_BY_EXT: Array<[RegExp, AttachmentKind]> = [
  [/\.(png|jpe?g|gif|webp|heic|avif|svg)$/i, "image"],
  [/\.pdf$/i, "pdf"],
  [/\.(docx?|rtf|odt)$/i, "doc"],
  [/\.(xlsx?|ods|csv|tsv)$/i, "spreadsheet"],
  [/\.(ts|tsx|js|jsx|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|sh|sql|yml|yaml|json|toml)$/i, "code"],
  [/\.(md|markdown|txt|log)$/i, "text"],
];

export function classifyKind(mimeType: string, filename: string): AttachmentKind {
  for (const [re, k] of KIND_BY_MIME) if (re.test(mimeType)) return k;
  for (const [re, k] of KIND_BY_EXT) if (re.test(filename)) return k;
  return "other";
}

export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const ATTACHMENT_MAX_COUNT = 10;
/** Server-defined "expiring" threshold for chip amber state. */
export const EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000;

export function isExpiringSoon(
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return false;
  const delta = t - now;
  return delta > 0 && delta <= EXPIRING_SOON_MS;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log10(n) / 3));
  const v = n / Math.pow(1000, i);
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function formatExpiryDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
