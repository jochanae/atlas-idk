/**
 * useStagedAttachments — Shared staged-attachment controller.
 *
 * One hook for Ask Atlas and Workspace. Owns validation (support matrix +
 * limits), per-file upload progress, failure/retry, and send lifecycle.
 *
 * Lifecycle:
 *   addFiles → uploading → ready (uploaded) → sending → cleared
 *                      ↘ failed (retryable) / blocked (not sendable)
 *
 * Surfaces must not convert files or call the upload API directly.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { logEvent as _adbgLog, setStagedCount as _setStagedCount } from "@/lib/attachDebugLog";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_MAX_MESSAGE_BYTES,
  type StagedAttachment,
  type StagedFileError,
  type StagedFileStatus,
  type ProcessingStatus,
} from "@/lib/attachments/types";
import { resolveSupport } from "@/lib/attachments/supportMatrix";
import type { AttachmentAdapter } from "@/lib/attachments/adapter";
import { httpAttachmentAdapter } from "@/lib/attachments/adapter";
import { uploadAttachmentFile } from "@/lib/attachments/uploadService";

// ─── Re-exports for existing call sites ───────────────────────────────────────

export type {
  StagedAttachment,
  StagedFileError,
  StagedFileStatus,
  ProcessingStatus,
};

/** @deprecated Prefer StagedAttachment — kept as alias during migration. */
export type StagedFile = StagedAttachment;

/** @deprecated Prefer StagedAttachment.kind — mapped for AttachmentStrip. */
export type AttachmentCategory =
  | "image"
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "text"
  | "other";

export interface UseStagedAttachmentsReturn {
  files: StagedAttachment[];
  readyFiles: StagedAttachment[];
  uploadingFiles: StagedAttachment[];
  sendingFiles: StagedAttachment[];
  failedFiles: StagedAttachment[];
  blockedFiles: StagedAttachment[];
  /** True when at least one ready (uploaded) file exists. */
  canSubmitFiles: boolean;
  /** True while any file is still uploading. */
  isUploading: boolean;
  /** Sum of staged file sizes (excludes blocked). */
  totalBytes: number;
  addFiles: (files: FileList | File[] | null | undefined) => void;
  removeFile: (id: string) => void;
  /** Retry a single failed upload without touching successful files. */
  retryFile: (id: string) => void;
  /** Retry all failed uploads. */
  retryFailed: () => void;
  markSending: (ids: string[]) => void;
  markFailed: (id: string, error: StagedFileError) => void;
  restoreToReady: (ids: string[]) => void;
  clearSent: (ids: string[]) => void;
  clearFiles: () => void;
  /**
   * Legacy no-op kept so existing submit wiring compiles.
   * Upload now happens at addFiles time.
   */
  markConverting: (ids: string[]) => void;
  /** @deprecated alias — convertingFiles is always empty; use uploadingFiles. */
  convertingFiles: StagedAttachment[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectExtension(file: File): string {
  return (file.name.split(".").pop() ?? "").toLowerCase();
}

function detectMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = detectExtension(file);
  const support = resolveSupport("", file.name);
  return support.entry?.mimeTypes[0] ?? "application/octet-stream";
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

function revokeUrl(sf: StagedAttachment): void {
  if (sf.previewUrl) {
    try {
      URL.revokeObjectURL(sf.previewUrl);
    } catch {
      /* ignore */
    }
  }
}

function revokeAll(files: StagedAttachment[]): void {
  for (const sf of files) revokeUrl(sf);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStagedAttachments(opts?: {
  maxCount?: number;
  maxSizeBytes?: number;
  maxMessageBytes?: number;
  adapter?: AttachmentAdapter;
  /** When false, stage only — tests that assert validation without network. */
  autoUpload?: boolean;
}): UseStagedAttachmentsReturn {
  const maxCount = opts?.maxCount ?? ATTACHMENT_MAX_COUNT;
  const maxSize = opts?.maxSizeBytes ?? ATTACHMENT_MAX_BYTES;
  const maxMessage = opts?.maxMessageBytes ?? ATTACHMENT_MAX_MESSAGE_BYTES;
  const adapter = opts?.adapter ?? httpAttachmentAdapter;
  const autoUpload = opts?.autoUpload !== false;

  const [files, setFiles] = useState<StagedAttachment[]>([]);
  const filesRef = useRef(files);
  filesRef.current = files;
  const uploadGenRef = useRef(new Map<string, number>());

  useEffect(() => {
    return () => {
      setFiles((prev) => {
        revokeAll(prev);
        return prev;
      });
    };
  }, []);

  useEffect(() => {
    _setStagedCount(files.length);
  }, [files]);

  const patchFile = useCallback(
    (id: string, patch: Partial<StagedAttachment>) => {
      setFiles((prev) =>
        prev.map((sf) => (sf.id === id ? { ...sf, ...patch } : sf)),
      );
    },
    [],
  );

  const startUpload = useCallback(
    (id: string, file: File) => {
      if (!autoUpload) return;
      const gen = (uploadGenRef.current.get(id) ?? 0) + 1;
      uploadGenRef.current.set(id, gen);

      patchFile(id, {
        status: "uploading",
        uploadStatus: "uploading",
        uploadProgress: 0,
        error: null,
      });

      void (async () => {
        try {
          const result = await uploadAttachmentFile(file, {
            adapter,
            onProgress: (p) => {
              if (uploadGenRef.current.get(id) !== gen) return;
              patchFile(id, { uploadProgress: p, uploadStatus: "uploading" });
            },
          });
          if (uploadGenRef.current.get(id) !== gen) return;
          patchFile(id, {
            status: "ready",
            uploadStatus: "uploaded",
            uploadProgress: 1,
            attachmentId: result.attachmentId,
            processingStatus: result.persisted.processingStatus,
            error: null,
          });
        } catch (err) {
          if (uploadGenRef.current.get(id) !== gen) return;
          const message =
            err instanceof Error ? err.message : "Upload failed";
          patchFile(id, {
            status: "failed",
            uploadStatus: "failed",
            uploadProgress: 0,
            error: {
              code: "UPLOAD_FAILED",
              message,
              retryable: true,
            },
          });
        }
      })();
    },
    [adapter, autoUpload, patchFile],
  );

  const addFiles = useCallback(
    (incoming: FileList | File[] | null | undefined) => {
      if (!incoming) return;
      const arr = Array.from(incoming);
      if (arr.length === 0) return;
      _adbgLog("staged_files_add_called", {
        count: arr.length,
        files: arr.map((f) => ({
          name: f.name,
          mime: f.type || "unknown",
          size: f.size,
        })),
      });

      const toUpload: Array<{ id: string; file: File }> = [];

      setFiles((prev) => {
        const result: StagedAttachment[] = [...prev];
        let runningTotal = result
          .filter((sf) => sf.status !== "blocked")
          .reduce((sum, sf) => sum + sf.sizeBytes, 0);

        for (const file of arr) {
          const mimeType = detectMimeType(file);
          const extension = detectExtension(file);
          const support = resolveSupport(mimeType, file.name);
          const id = crypto.randomUUID();

          const activeCount = result.filter(
            (sf) => sf.status !== "blocked",
          ).length;

          if (activeCount >= maxCount) {
            result.push({
              id,
              file,
              name: file.name,
              mimeType,
              extension,
              sizeBytes: file.size,
              kind: support.kind,
              capability: support.capability,
              statusLabel: `Max ${maxCount} files`,
              previewUrl: null,
              status: "failed",
              uploadStatus: "failed",
              uploadProgress: 0,
              attachmentId: null,
              processingStatus: null,
              error: {
                code: "MAX_COUNT",
                message: `Max ${maxCount} files`,
                retryable: false,
              },
            });
            continue;
          }

          const isDup = result.some(
            (sf) => sf.file.name === file.name && sf.file.size === file.size,
          );
          if (isDup) continue;

          if (!support.allowed) {
            result.push({
              id,
              file,
              name: file.name,
              mimeType,
              extension,
              sizeBytes: file.size,
              kind: support.kind,
              capability: "blocked",
              statusLabel: support.statusLabel,
              previewUrl: null,
              status: "blocked",
              uploadStatus: "failed",
              uploadProgress: 0,
              attachmentId: null,
              processingStatus: "failed",
              error: {
                code: "UNSUPPORTED_TYPE",
                message: support.statusLabel,
                retryable: false,
              },
            });
            continue;
          }

          if (file.size > maxSize) {
            result.push({
              id,
              file,
              name: file.name,
              mimeType,
              extension,
              sizeBytes: file.size,
              kind: support.kind,
              capability: support.capability,
              statusLabel: support.statusLabel,
              previewUrl: null,
              status: "failed",
              uploadStatus: "failed",
              uploadProgress: 0,
              attachmentId: null,
              processingStatus: null,
              error: {
                code: "TOO_LARGE",
                message: `Too large (max ${Math.round(maxSize / 1024 / 1024)} MB)`,
                retryable: false,
              },
            });
            continue;
          }

          if (runningTotal + file.size > maxMessage) {
            result.push({
              id,
              file,
              name: file.name,
              mimeType,
              extension,
              sizeBytes: file.size,
              kind: support.kind,
              capability: support.capability,
              statusLabel: support.statusLabel,
              previewUrl: null,
              status: "failed",
              uploadStatus: "failed",
              uploadProgress: 0,
              attachmentId: null,
              processingStatus: null,
              error: {
                code: "MESSAGE_TOO_LARGE",
                message: `Total exceeds ${Math.round(maxMessage / 1024 / 1024)} MB`,
                retryable: false,
              },
            });
            continue;
          }

          runningTotal += file.size;
          const staged: StagedAttachment = {
            id,
            file,
            name: file.name,
            mimeType,
            extension,
            sizeBytes: file.size,
            kind: support.kind,
            capability: support.capability,
            statusLabel: support.statusLabel,
            previewUrl: makePreviewUrl(file, mimeType),
            status: autoUpload ? "uploading" : "ready",
            uploadStatus: autoUpload ? "uploading" : "pending",
            uploadProgress: 0,
            attachmentId: null,
            processingStatus:
              support.capability === "model_use"
                ? "understood"
                : support.capability === "storage_only"
                  ? "unsupported"
                  : null,
            error: null,
          };
          result.push(staged);
          if (autoUpload) toUpload.push({ id, file });
        }

        return result;
      });

      for (const item of toUpload) {
        startUpload(item.id, item.file);
      }
    },
    [autoUpload, maxCount, maxMessage, maxSize, startUpload],
  );

  const removeFile = useCallback((id: string) => {
    uploadGenRef.current.delete(id);
    setFiles((prev) => {
      const target = prev.find((sf) => sf.id === id);
      if (target) revokeUrl(target);
      return prev.filter((sf) => sf.id !== id);
    });
  }, []);

  const retryFile = useCallback(
    (id: string) => {
      const target = filesRef.current.find((sf) => sf.id === id);
      if (!target) return;
      if (!target.error?.retryable && target.status !== "failed") return;
      startUpload(id, target.file);
    },
    [startUpload],
  );

  const retryFailed = useCallback(() => {
    for (const sf of filesRef.current) {
      if (sf.status === "failed" && sf.error?.retryable) {
        startUpload(sf.id, sf.file);
      }
    }
  }, [startUpload]);

  const markConverting = useCallback((_ids: string[]) => {
    // Upload already happened at stage time.
  }, []);

  const markSending = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setFiles((prev) =>
      prev.map((sf) =>
        idSet.has(sf.id) && sf.status === "ready"
          ? { ...sf, status: "sending" as StagedFileStatus }
          : sf,
      ),
    );
  }, []);

  const markFailed = useCallback((id: string, error: StagedFileError) => {
    setFiles((prev) =>
      prev.map((sf) =>
        sf.id === id
          ? {
              ...sf,
              status: "failed" as StagedFileStatus,
              uploadStatus: "failed",
              error,
            }
          : sf,
      ),
    );
  }, []);

  const restoreToReady = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setFiles((prev) =>
      prev.map((sf) =>
        idSet.has(sf.id) &&
        (sf.status === "sending" || sf.status === "uploading") &&
        sf.attachmentId
          ? {
              ...sf,
              status: "ready" as StagedFileStatus,
              uploadStatus: "uploaded",
              error: null,
            }
          : idSet.has(sf.id) && sf.status === "sending"
            ? {
                ...sf,
                status: "failed" as StagedFileStatus,
                error: {
                  code: "SEND_FAILED",
                  message: "Send failed — retry upload",
                  retryable: true,
                },
              }
            : sf,
      ),
    );
  }, []);

  const clearSent = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setFiles((prev) => {
      const removed = prev.filter((sf) => idSet.has(sf.id));
      // Do not revoke blob URLs here — the optimistic chip in the chat stream
      // may still be rendering sf.previewUrl as contentUrl until the server
      // attachment_ack arrives with a persistent contentUrl. The browser
      // cleans up blob URLs on page unload.
      for (const sf of removed) uploadGenRef.current.delete(sf.id);
      return prev.filter((sf) => !idSet.has(sf.id));
    });
  }, []);

  const clearFiles = useCallback(() => {
    setFiles((prev) => {
      revokeAll(prev);
      uploadGenRef.current.clear();
      return [];
    });
  }, []);

  const readyFiles = files.filter(
    (sf) => sf.status === "ready" && !!sf.attachmentId,
  );
  const uploadingFiles = files.filter((sf) => sf.status === "uploading");
  const sendingFiles = files.filter((sf) => sf.status === "sending");
  const failedFiles = files.filter((sf) => sf.status === "failed");
  const blockedFiles = files.filter((sf) => sf.status === "blocked");
  const totalBytes = files
    .filter((sf) => sf.status !== "blocked")
    .reduce((sum, sf) => sum + sf.sizeBytes, 0);

  return {
    files,
    readyFiles,
    uploadingFiles,
    sendingFiles,
    failedFiles,
    blockedFiles,
    canSubmitFiles: readyFiles.length > 0,
    isUploading: uploadingFiles.length > 0,
    totalBytes,
    addFiles,
    removeFile,
    retryFile,
    retryFailed,
    markSending,
    markFailed,
    restoreToReady,
    clearSent,
    clearFiles,
    markConverting,
    convertingFiles: [],
  };
}
