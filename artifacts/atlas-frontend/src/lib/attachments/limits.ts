/**
 * Shared attachment limits — single source of truth for Ask Joy, Workspace,
 * and the upload service. Backend mirrors these in attachmentStorage.ts.
 */

/** Max files per staged message. */
export const ATTACHMENT_MAX_COUNT = 10;

/** Max bytes per individual file. */
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

/** Max total bytes across all staged files in one message. */
export const ATTACHMENT_MAX_MESSAGE_BYTES = 50 * 1024 * 1024;

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log10(n) / 3));
  const v = n / Math.pow(1000, i);
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
