/**
 * useStagedAttachments — Shared staged-attachment controller.
 *
 * Owns the full lifecycle for every file from selection to cleared-after-confirmed-send:
 *   addFiles → ready → converting → sending → cleared (clearSent) on stream success
 *                               ↘ failed (markFailed) on conversion error
 *   on network failure after send(): sending → restoreToReady
 *   on transport layer failure before send(): converting → restoreToReady
 *
 * Surfaces NEVER call clearFiles() before submit() completes.
 * The conversation controller (useAtlasConversation.submit) calls the lifecycle
 * callbacks — onMarkConverting, onMarkSending, onMarkFailed, onRestoreToReady,
 * onClearSent — which drive state transitions here.
 *
 * Both Ask Atlas and Workspace consume this hook directly.
 * No surface-specific file conversion or send logic may live outside this
 * controller or useAtlasConversation.
 */
import { useCallback, useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Lifecycle:
 *   ready       — validated, waiting for user to send
 *   converting  — base64 conversion in progress; file is visible with a spinner
 *   sending     — conversion complete; send() returned; optimistic message owns the data.
 *                 Chip is shown as accepted/faded (no spinner). Transitions →
 *                 cleared (clearSent) on stream success, or → ready (restoreToReady)
 *                 on network-level failure so the user can retry without reselecting.
 *   failed      — validation OR conversion failed; file is visible with an error badge;
 *                 user can remove or retry
 */
export type StagedFileStatus = "ready" | "converting" | "sending" | "failed";

export type StagedFileError = {
  /** Machine-readable code for programmatic handling (e.g. "TOO_LARGE", "CONVERSION_FAILED"). */
  code: string;
  /** Human-readable message shown in the AttachmentStrip error badge. */
  message: string;
  /** True when re-attempting the operation may succeed (network blip, recoverable). */
  retryable: boolean;
};

export type AttachmentCategory =
  | "image"
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "text"
  | "other";

export interface StagedFile {
  /** Stable client-side ID — safe for React keys and targeted operations. */
  id: string;
  file: File;
  name: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  category: AttachmentCategory;
  /**
   * Object URL created via URL.createObjectURL for image preview in the composer.
   * Null for non-image files (PDF, doc, etc.) and SVG.
   * Revoked automatically: on removeFile, clearSent, clearFiles, or component unmount.
   * The sent-message preview in UserBubble uses base64 data URIs, NOT this URL.
   */
  previewUrl: string | null;
  status: StagedFileStatus;
  /** Non-null iff status === "failed". */
  error: StagedFileError | null;
}

export interface UseStagedAttachmentsReturn {
  /** All staged files including failed ones. */
  files: StagedFile[];
  /** Files with status === "ready". Safe to pass to submit(). */
  readyFiles: StagedFile[];
  /** Files with status === "converting". In-flight: do not re-submit. */
  convertingFiles: StagedFile[];
  /** Files with status === "sending". HTTP request accepted; stream in progress. Do not re-submit. */
  sendingFiles: StagedFile[];
  /** Files with status === "failed". Visible with error badge; can be removed or retried. */
  failedFiles: StagedFile[];
  /** True when at least one ready file exists. */
  canSubmitFiles: boolean;
  /** Add one or more files. Normalises MIME/extension, deduplicates, validates. */
  addFiles: (files: FileList | File[] | null | undefined) => void;
  /** Remove a single staged file and revoke its preview URL. */
  removeFile: (id: string) => void;
  /**
   * Transition specific files from "ready" → "converting".
   * Called by useAtlasConversation.submit() before conversion begins.
   */
  markConverting: (ids: string[]) => void;
  /**
   * Transition specific files from "converting" → "sending".
   * Called by useAtlasConversation.submit() immediately after send() returns the
   * clientMessageId — before the SSE stream completes — so the chip transitions
   * from the conversion spinner to the "accepted/sending" state. The optimistic
   * user message already owns the base64 data at this point.
   */
  markSending: (ids: string[]) => void;
  /**
   * Transition a single file to "failed" with a structured error.
   * Called by useAtlasConversation.submit() when base64 conversion throws.
   */
  markFailed: (id: string, error: StagedFileError) => void;
  /**
   * Restore "converting" or "sending" files back to "ready".
   * Called by useAtlasConversation.submit() when the transport layer fails —
   * so the user can fix the issue and retry without re-selecting files.
   * Pass specific ids to restore a subset.
   */
  restoreToReady: (ids: string[]) => void;
  /**
   * Remove and revoke only the successfully submitted files.
   * Called by useAtlasConversation.submit() on confirmed transport success.
   * Files that failed conversion remain staged (status "failed") for user action.
   */
  clearSent: (ids: string[]) => void;
  /**
   * Revoke all preview URLs and empty the list.
   * Use only for explicit cancel actions (user clicks "clear all") or component unmount.
   * Do NOT call this before submit() succeeds — use the lifecycle callbacks instead.
   */
  clearFiles: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_FILE_COUNT = 10;

const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  return EXTENSION_MIME_MAP[ext] ?? "application/octet-stream";
}

function detectExtension(file: File): string {
  return (file.name.split(".").pop() ?? "").toLowerCase();
}

function detectCategory(mimeType: string, extension: string): AttachmentCategory {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) return "document";
  if (
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) return "spreadsheet";
  if (
    mimeType === "application/vnd.ms-powerpoint" ||
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) return "presentation";
  if (mimeType.startsWith("text/") || ["json", "md", "markdown", "csv"].includes(extension)) {
    return "text";
  }
  return "other";
}

function makePreviewUrl(file: File, mimeType: string): string | null {
  if (mimeType.startsWith("image/") && !mimeType.includes("svg")) {
    try {
      return URL.createObjectURL(file);
    } catch {
      return null;
    }
  }
  return null;
}

function revokeUrl(sf: StagedFile): void {
  if (sf.previewUrl) {
    try { URL.revokeObjectURL(sf.previewUrl); } catch {}
  }
}

function revokeAll(files: StagedFile[]): void {
  for (const sf of files) revokeUrl(sf);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStagedAttachments(opts?: {
  maxCount?: number;
  maxSizeBytes?: number;
}): UseStagedAttachmentsReturn {
  const maxCount = opts?.maxCount ?? MAX_FILE_COUNT;
  const maxSize = opts?.maxSizeBytes ?? MAX_FILE_SIZE_BYTES;

  const [files, setFiles] = useState<StagedFile[]>([]);

  useEffect(() => {
    return () => {
      setFiles(prev => { revokeAll(prev); return prev; });
    };
  }, []);

  const addFiles = useCallback(
    (incoming: FileList | File[] | null | undefined) => {
      if (!incoming) return;
      const arr = Array.from(incoming);
      if (arr.length === 0) return;

      setFiles(prev => {
        const result: StagedFile[] = [...prev];

        for (const file of arr) {
          // Hard cap — add an error entry for the first file that would exceed it.
          if (result.length >= maxCount) {
            result.push({
              id: crypto.randomUUID(),
              file,
              name: file.name,
              mimeType: detectMimeType(file),
              extension: detectExtension(file),
              sizeBytes: file.size,
              category: "other",
              previewUrl: null,
              status: "failed",
              error: {
                code: "MAX_COUNT",
                message: `Max ${maxCount} files`,
                retryable: false,
              },
            });
            break;
          }

          // Deduplicate: same name + size already staged.
          const isDup = result.some(
            sf => sf.file.name === file.name && sf.file.size === file.size,
          );
          if (isDup) continue;

          const mimeType = detectMimeType(file);
          const extension = detectExtension(file);
          const category = detectCategory(mimeType, extension);

          if (file.size > maxSize) {
            result.push({
              id: crypto.randomUUID(),
              file,
              name: file.name,
              mimeType,
              extension,
              sizeBytes: file.size,
              category,
              previewUrl: null,
              status: "failed",
              error: {
                code: "TOO_LARGE",
                message: `Too large (max ${Math.round(maxSize / 1024 / 1024)} MB)`,
                retryable: false,
              },
            });
          } else {
            result.push({
              id: crypto.randomUUID(),
              file,
              name: file.name,
              mimeType,
              extension,
              sizeBytes: file.size,
              category,
              previewUrl: makePreviewUrl(file, mimeType),
              status: "ready",
              error: null,
            });
          }
        }

        return result;
      });
    },
    [maxCount, maxSize],
  );

  const removeFile = useCallback((id: string) => {
    setFiles(prev => {
      const target = prev.find(sf => sf.id === id);
      if (target) revokeUrl(target);
      return prev.filter(sf => sf.id !== id);
    });
  }, []);

  const markConverting = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setFiles(prev =>
      prev.map(sf =>
        idSet.has(sf.id) && sf.status === "ready"
          ? { ...sf, status: "converting" as StagedFileStatus }
          : sf,
      ),
    );
  }, []);

  const markSending = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setFiles(prev =>
      prev.map(sf =>
        idSet.has(sf.id) && sf.status === "converting"
          ? { ...sf, status: "sending" as StagedFileStatus }
          : sf,
      ),
    );
  }, []);

  const markFailed = useCallback((id: string, error: StagedFileError) => {
    setFiles(prev =>
      prev.map(sf =>
        sf.id === id
          ? { ...sf, status: "failed" as StagedFileStatus, error }
          : sf,
      ),
    );
  }, []);

  const restoreToReady = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setFiles(prev =>
      prev.map(sf =>
        idSet.has(sf.id) && (sf.status === "converting" || sf.status === "sending")
          ? { ...sf, status: "ready" as StagedFileStatus, error: null }
          : sf,
      ),
    );
  }, []);

  const clearSent = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setFiles(prev => {
      const removed = prev.filter(sf => idSet.has(sf.id));
      revokeAll(removed);
      return prev.filter(sf => !idSet.has(sf.id));
    });
  }, []);

  const clearFiles = useCallback(() => {
    setFiles(prev => {
      revokeAll(prev);
      return [];
    });
  }, []);

  const readyFiles = files.filter(sf => sf.status === "ready");
  const convertingFiles = files.filter(sf => sf.status === "converting");
  const sendingFiles = files.filter(sf => sf.status === "sending");
  const failedFiles = files.filter(sf => sf.status === "failed");

  return {
    files,
    readyFiles,
    convertingFiles,
    sendingFiles,
    failedFiles,
    canSubmitFiles: readyFiles.length > 0,
    addFiles,
    removeFile,
    markConverting,
    markSending,
    markFailed,
    restoreToReady,
    clearSent,
    clearFiles,
  };
}
