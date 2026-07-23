/**
 * Shared attachment types — one model for Ask Joy and Workspace.
 */

import type { AttachmentCapability, AttachmentKind } from "./supportMatrix";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_MAX_MESSAGE_BYTES,
  formatBytes,
} from "./limits";

export type {
  AttachmentCapability,
  AttachmentKind,
} from "./supportMatrix";

export {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_MAX_MESSAGE_BYTES,
  formatBytes,
};

export type UploadStatus =
  | "pending"
  | "uploading"
  | "uploaded"
  | "failed";

export type AvailabilityStatus =
  | "active"
  | "expiring"
  | "expired"
  | "library";

export type ProcessingStatus =
  | "pending"
  | "understood"
  | "unsupported"
  | "failed";

/**
 * Lifecycle for a staged composer file:
 *   ready      — uploaded (or storage-ready) and waitlisted for Send
 *   uploading  — request-upload / PUT / finalize in flight
 *   sending    — included in an in-flight message submit
 *   failed     — validation or upload failed; retryable when error.retryable
 *   blocked    — support-matrix reject; not sendable
 */
export type StagedFileStatus =
  | "ready"
  | "uploading"
  | "sending"
  | "failed"
  | "blocked";

export type StagedFileError = {
  code: string;
  message: string;
  retryable: boolean;
};

/** Composer-staged attachment — single shared model. */
export interface StagedAttachment {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  kind: AttachmentKind;
  capability: AttachmentCapability;
  /** User-facing capability copy from the support matrix. */
  statusLabel: string;
  previewUrl: string | null;
  status: StagedFileStatus;
  uploadStatus: UploadStatus;
  /** 0..1 while uploading. */
  uploadProgress: number;
  /** Server id after request-upload / finalize. */
  attachmentId: string | null;
  processingStatus: ProcessingStatus | null;
  error: StagedFileError | null;
}

/** Server-authoritative persisted record. */
export interface PersistedAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
  availabilityStatus: AvailabilityStatus;
  processingStatus: ProcessingStatus;
  expiresAt: string | null;
  libraryItemId: string | null;
  openUrl?: string;
}

/** Canonical send payload — IDs only; server resolves bytes. */
export interface AttachmentSendPayload {
  text: string;
  attachmentIds: string[];
}

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

export function formatExpiryDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Pure send-gate — identical on Ask Joy and Workspace. */
export function shouldIncludeAttachmentsOnSend(args: {
  text: string;
  attachmentCount: number;
}): { ok: boolean; reason?: string } {
  const trimmed = args.text.trim();
  if (!trimmed && args.attachmentCount === 0) {
    return { ok: false, reason: "empty" };
  }
  return { ok: true };
}
