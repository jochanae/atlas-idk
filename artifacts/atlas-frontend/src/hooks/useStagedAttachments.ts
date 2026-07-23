/**
 * useStagedAttachments — Shared staged-attachment controller.
 *
 * One hook for Ask Joy and Workspace. Owns validation (support matrix +
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
import {
  clearStagingAttachmentMetaForSurface,
  loadStagingAttachmentMetaForSurface,
  removeStagingAttachmentMeta,
  upsertStagingAttachmentMeta,
  type StagingAttachmentMeta,
} from "@/lib/attachments/stagingPersistence";

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

/** Cap parallel PUTs — concurrent image uploads + memory pressure OOM mobile WebViews. */
const MAX_CONCURRENT_UPLOADS = 3;
/** Ignore progress ticks denser than this unless they jump meaningfully. */
const PROGRESS_MIN_INTERVAL_MS = 250;
const PROGRESS_MIN_DELTA = 0.08;

/**
 * Soft-remount survival (ErrorBoundary auto-reset / surface flip).
 * Full page reloads clear this — that is intentional (no File blob IDB).
 */
const softMemoryBySurface = new Map<string, StagedAttachment[]>();

function surfaceMemoryKey(ctx?: {
  surface?: string;
  projectId?: string;
}): string {
  return `${ctx?.surface ?? "default"}:${ctx?.projectId ?? ""}`;
}

/** Test helper — drop soft-remount survival state between cases. */
export function __resetStagedAttachmentsSoftMemoryForTests() {
  for (const files of softMemoryBySurface.values()) {
    revokeAll(files);
  }
  softMemoryBySurface.clear();
}

/**
 * INT-05: rebuild chips from sessionStorage metadata after a hard reload.
 * Never restores File blobs — finalized IDs are enough for submit.
 */
function metaToStagedAttachment(meta: StagingAttachmentMeta): StagedAttachment {
  const support = resolveSupport(meta.mimeType, meta.filename);
  const extension = (meta.filename.split(".").pop() ?? "").toLowerCase();
  // Empty placeholder File — pumpQueue skips when attachmentId is set;
  // retry without attachmentId asks the user to re-attach (no silent empty PUT).
  const placeholder = new File([], meta.filename, {
    type: meta.mimeType || "application/octet-stream",
  });
  const uploaded = meta.uploadStatus === "uploaded" && !!meta.attachmentId;
  return {
    id: meta.clientAttachmentId,
    file: placeholder,
    name: meta.filename,
    mimeType: meta.mimeType || "application/octet-stream",
    extension,
    sizeBytes: meta.sizeBytes,
    kind: support.kind,
    capability: support.capability,
    statusLabel: support.statusLabel,
    previewUrl: null,
    status: uploaded ? "ready" : "failed",
    uploadStatus: uploaded ? "uploaded" : "failed",
    uploadProgress: uploaded ? 1 : 0,
    attachmentId: meta.attachmentId,
    processingStatus:
      support.capability === "model_use"
        ? "understood"
        : support.capability === "storage_only"
          ? "unsupported"
          : null,
    error: uploaded
      ? null
      : {
          code: "UPLOAD_INTERRUPTED",
          message: "Upload interrupted — re-attach",
          retryable: false,
        },
  };
}

function hydrateStagedFromPersistence(
  memoryKey: string,
  surface: string,
): StagedAttachment[] {
  const soft = softMemoryBySurface.get(memoryKey);
  if (soft && soft.length > 0) return soft;
  try {
    const meta = loadStagingAttachmentMetaForSurface(surface);
    if (meta.length === 0) return [];
    const chips = meta.map(metaToStagedAttachment);
    softMemoryBySurface.set(memoryKey, chips);
    return chips;
  } catch {
    return [];
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStagedAttachments(opts?: {
  maxCount?: number;
  maxSizeBytes?: number;
  maxMessageBytes?: number;
  adapter?: AttachmentAdapter;
  /** When false, stage only — tests that assert validation without network. */
  autoUpload?: boolean;
  /** Diagnostic metadata injected into log events — no effect on upload behaviour. */
  diagnosticContext?: { surface: string; projectId?: string; conversationId?: string };
}): UseStagedAttachmentsReturn {
  const maxCount = opts?.maxCount ?? ATTACHMENT_MAX_COUNT;
  const maxSize = opts?.maxSizeBytes ?? ATTACHMENT_MAX_BYTES;
  const maxMessage = opts?.maxMessageBytes ?? ATTACHMENT_MAX_MESSAGE_BYTES;
  const adapter = opts?.adapter ?? httpAttachmentAdapter;
  const autoUpload = opts?.autoUpload !== false;
  const diagCtxRef = useRef(opts?.diagnosticContext);
  diagCtxRef.current = opts?.diagnosticContext;
  const memoryKey = surfaceMemoryKey(opts?.diagnosticContext);
  const memoryKeyRef = useRef(memoryKey);
  memoryKeyRef.current = memoryKey;
  const surfaceName = opts?.diagnosticContext?.surface ?? "default";

  const [files, setFiles] = useState<StagedAttachment[]>(() =>
    hydrateStagedFromPersistence(memoryKey, surfaceName),
  );
  const filesRef = useRef(files);
  filesRef.current = files;
  const uploadGenRef = useRef(new Map<string, number>());
  const uploadAbortRef = useRef(new Map<string, AbortController>());
  const uploadQueueRef = useRef<string[]>([]);
  const activeUploadsRef = useRef(0);
  const pumpQueueRef = useRef<() => void>(() => {});
  const mountedRef = useRef(true);

  const abortUpload = useCallback((id: string) => {
    uploadQueueRef.current = uploadQueueRef.current.filter((qid) => qid !== id);
    const controller = uploadAbortRef.current.get(id);
    if (controller) {
      try {
        controller.abort();
      } catch {
        /* ignore */
      }
      uploadAbortRef.current.delete(id);
    }
  }, []);

  const commitFiles = useCallback(
    (next: StagedAttachment[] | ((prev: StagedAttachment[]) => StagedAttachment[])) => {
      const key = memoryKeyRef.current;
      // Soft remount keeps the map entry so in-flight PUTs can finish off-screen.
      // If the entry was cleared (tests / intentional wipe), do not resurrect it.
      if (!mountedRef.current && !softMemoryBySurface.has(key)) {
        const prev = filesRef.current;
        return typeof next === "function" ? next(prev) : next;
      }
      const prev = softMemoryBySurface.get(key) ?? filesRef.current;
      const resolved = typeof next === "function" ? next(prev) : next;
      softMemoryBySurface.set(key, resolved);
      filesRef.current = resolved;
      if (mountedRef.current) {
        setFiles(resolved);
      }
      return resolved;
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    // Re-hydrate if an upload finished while we were unmounted.
    const mem = softMemoryBySurface.get(memoryKey);
    if (mem && mem !== filesRef.current) {
      filesRef.current = mem;
      setFiles(mem);
    }
    return () => {
      mountedRef.current = false;
      // Soft remount: keep chips + in-flight uploads alive in module memory.
      // Do NOT abort PUTs or revoke preview URLs — ErrorBoundary auto-reset
      // used to wipe the composer mid-upload and look like a white-screen reload.
    };
  }, [memoryKey]);

  useEffect(() => {
    _setStagedCount(files.length);
  }, [files]);

  const patchFile = useCallback(
    (id: string, patch: Partial<StagedAttachment>) => {
      commitFiles((prev) =>
        prev.map((sf) => (sf.id === id ? { ...sf, ...patch } : sf)),
      );
    },
    [commitFiles],
  );

  const runUpload = useCallback(
    (id: string, file: File): Promise<void> => {
      if (!autoUpload) return Promise.resolve();
      const gen = (uploadGenRef.current.get(id) ?? 0) + 1;
      uploadGenRef.current.set(id, gen);

      // Cancel any in-flight PUT for this chip (retry / remount).
      const existing = uploadAbortRef.current.get(id);
      if (existing) {
        try {
          existing.abort();
        } catch {
          /* ignore */
        }
      }
      const controller = new AbortController();
      uploadAbortRef.current.set(id, controller);

      const _sf = filesRef.current.find((sf) => sf.id === id);
      _adbgLog("start_upload_begin", {
        id, gen, name: file.name, size: file.size,
        mimeType: _sf?.mimeType ?? file.type ?? "unknown",
        support: _sf?.capability ?? "unknown",
        surface: diagCtxRef.current?.surface,
        projectId: diagCtxRef.current?.projectId,
        conversationId: diagCtxRef.current?.conversationId,
        activeUploads: activeUploadsRef.current,
        queued: uploadQueueRef.current.length,
      });

      patchFile(id, {
        status: "uploading",
        uploadStatus: "uploading",
        uploadProgress: 0,
        error: null,
      });

      // INT-05: persist pending metadata immediately so a Documents/PPTX WebView
      // kill mid-upload leaves a recoverable chip (not a silently empty composer).
      try {
        upsertStagingAttachmentMeta({
          clientAttachmentId: id,
          attachmentId: null,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          uploadStatus: "pending_upload",
          conversationId: diagCtxRef.current?.conversationId ?? null,
          surface: diagCtxRef.current?.surface ?? "default",
          updatedAt: Date.now(),
        });
      } catch {
        /* staging persistence is best-effort */
      }

      let lastProgress = -1;
      let lastProgressAt = 0;

      return (async () => {
        try {
          _adbgLog("start_upload_request_upload", { id, gen });
          const result = await uploadAttachmentFile(file, {
            adapter,
            signal: controller.signal,
            onProgress: (p) => {
              if (uploadGenRef.current.get(id) !== gen) return;
              const now = Date.now();
              const jumped = p - lastProgress >= PROGRESS_MIN_DELTA;
              const due = now - lastProgressAt >= PROGRESS_MIN_INTERVAL_MS;
              if (p < 1 && !jumped && !due) return;
              lastProgress = p;
              lastProgressAt = now;
              patchFile(id, { uploadProgress: p, uploadStatus: "uploading" });
            },
          });
          if (uploadGenRef.current.get(id) !== gen) {
            _adbgLog("start_upload_gen_stale", { id, gen, current: uploadGenRef.current.get(id) });
            return;
          }
          uploadAbortRef.current.delete(id);
          _adbgLog("start_upload_success", { id, gen, attachmentId: result.attachmentId });
          patchFile(id, {
            status: "ready",
            uploadStatus: "uploaded",
            uploadProgress: 1,
            attachmentId: result.attachmentId,
            processingStatus: result.persisted.processingStatus,
            error: null,
          });
          try {
            upsertStagingAttachmentMeta({
              clientAttachmentId: id,
              attachmentId: result.attachmentId,
              filename: file.name,
              mimeType: file.type || "application/octet-stream",
              sizeBytes: file.size,
              uploadStatus: "uploaded",
              conversationId: diagCtxRef.current?.conversationId ?? null,
              surface: diagCtxRef.current?.surface ?? "default",
              updatedAt: Date.now(),
              contentUrl: result.persisted.openUrl ?? null,
            });
          } catch {
            /* staging persistence is best-effort */
          }
        } catch (err) {
          if (uploadGenRef.current.get(id) !== gen) return;
          uploadAbortRef.current.delete(id);
          const message =
            err instanceof Error ? err.message : "Upload failed";
          // User-initiated cancel — chip is already gone; don't flash failed.
          if (message.includes("aborted")) {
            _adbgLog("start_upload_aborted", { id, gen });
            return;
          }
          _adbgLog("start_upload_error", { id, gen, message });
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
          try {
            upsertStagingAttachmentMeta({
              clientAttachmentId: id,
              attachmentId: null,
              filename: file.name,
              mimeType: file.type || "application/octet-stream",
              sizeBytes: file.size,
              uploadStatus: "failed",
              conversationId: diagCtxRef.current?.conversationId ?? null,
              surface: diagCtxRef.current?.surface ?? "default",
              updatedAt: Date.now(),
            });
          } catch {
            /* best-effort */
          }
        }
      })();
    },
    [adapter, autoUpload, patchFile],
  );

  const pumpQueue = useCallback(() => {
    if (!autoUpload) return;
    while (
      activeUploadsRef.current < MAX_CONCURRENT_UPLOADS &&
      uploadQueueRef.current.length > 0
    ) {
      const id = uploadQueueRef.current.shift()!;
      const sf = filesRef.current.find((f) => f.id === id);
      if (!sf || sf.attachmentId || sf.status === "blocked") continue;
      // INT-05: never PUT empty placeholder Files from hard-reload rehydrate.
      if (sf.file.size === 0) continue;
      activeUploadsRef.current += 1;
      void runUpload(id, sf.file).finally(() => {
        activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
        pumpQueueRef.current();
      });
    }
  }, [autoUpload, runUpload]);
  pumpQueueRef.current = pumpQueue;

  const enqueueUpload = useCallback(
    (id: string) => {
      if (!autoUpload) return;
      if (!uploadQueueRef.current.includes(id)) {
        uploadQueueRef.current.push(id);
      }
      pumpQueue();
    },
    [autoUpload, pumpQueue],
  );

  const startUpload = useCallback(
    (id: string, _file: File) => {
      // Public entry (retry) — go through the concurrency queue.
      enqueueUpload(id);
    },
    [enqueueUpload],
  );

  const pendingUploadIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!autoUpload || pendingUploadIdsRef.current.size === 0) return;
    for (const sf of files) {
      if (!pendingUploadIdsRef.current.has(sf.id)) continue;
      pendingUploadIdsRef.current.delete(sf.id);
      if (sf.status === "uploading" && !sf.attachmentId) {
        enqueueUpload(sf.id);
      }
    }
  }, [autoUpload, files, enqueueUpload]);

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

      commitFiles((prev) => {
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
          if (autoUpload) pendingUploadIdsRef.current.add(id);
        }

        return result;
      });

      _adbgLog("add_files_to_upload_queue", {
        count: pendingUploadIdsRef.current.size,
        ids: [...pendingUploadIdsRef.current],
      });
    },
    [autoUpload, commitFiles, maxCount, maxMessage, maxSize],
  );

  const removeFile = useCallback((id: string) => {
    // Bump gen so a late resolve cannot resurrect the chip, then abort PUT.
    uploadGenRef.current.set(id, (uploadGenRef.current.get(id) ?? 0) + 1);
    pendingUploadIdsRef.current.delete(id);
    abortUpload(id);
    uploadGenRef.current.delete(id);
    try {
      removeStagingAttachmentMeta(id);
    } catch {
      /* best-effort */
    }
    commitFiles((prev) => {
      const target = prev.find((sf) => sf.id === id);
      if (target) revokeUrl(target);
      return prev.filter((sf) => sf.id !== id);
    });
  }, [abortUpload, commitFiles]);

  const retryFile = useCallback(
    (id: string) => {
      const target = filesRef.current.find((sf) => sf.id === id);
      if (!target) return;
      if (!target.error?.retryable && target.status !== "failed") return;
      // INT-05: rehydrated chips have empty placeholder Files — never silent re-upload.
      if (target.attachmentId) {
        patchFile(id, {
          status: "ready",
          uploadStatus: "uploaded",
          uploadProgress: 1,
          error: null,
        });
        return;
      }
      if (target.file.size === 0) {
        patchFile(id, {
          status: "failed",
          uploadStatus: "failed",
          error: {
            code: "UPLOAD_INTERRUPTED",
            message: "Upload interrupted — re-attach",
            retryable: false,
          },
        });
        return;
      }
      startUpload(id, target.file);
    },
    [patchFile, startUpload],
  );

  const retryFailed = useCallback(() => {
    for (const sf of filesRef.current) {
      if (sf.status === "failed" && sf.error?.retryable) {
        if (sf.attachmentId || sf.file.size === 0) {
          retryFile(sf.id);
        } else {
          startUpload(sf.id, sf.file);
        }
      }
    }
  }, [retryFile, startUpload]);

  const markConverting = useCallback((_ids: string[]) => {
    // Upload already happened at stage time.
  }, []);

  const markSending = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    commitFiles((prev) =>
      prev.map((sf) =>
        idSet.has(sf.id) && sf.status === "ready"
          ? { ...sf, status: "sending" as StagedFileStatus }
          : sf,
      ),
    );
  }, [commitFiles]);

  const markFailed = useCallback((id: string, error: StagedFileError) => {
    commitFiles((prev) =>
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
  }, [commitFiles]);

  const restoreToReady = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    commitFiles((prev) =>
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
  }, [commitFiles]);

  const clearSent = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    commitFiles((prev) => {
      const removed = prev.filter((sf) => idSet.has(sf.id));
      // Do not revoke blob URLs here — the optimistic chip in the chat stream
      // may still be rendering sf.previewUrl as contentUrl until the server
      // attachment_ack arrives with a persistent contentUrl. The browser
      // cleans up blob URLs on page unload.
      for (const sf of removed) {
        pendingUploadIdsRef.current.delete(sf.id);
        uploadGenRef.current.delete(sf.id);
        try {
          removeStagingAttachmentMeta(sf.id);
        } catch {
          /* best-effort */
        }
      }
      return prev.filter((sf) => !idSet.has(sf.id));
    });
  }, [commitFiles]);

  const clearFiles = useCallback(() => {
    const surface = diagCtxRef.current?.surface ?? "default";
    try {
      clearStagingAttachmentMetaForSurface(surface);
    } catch {
      /* best-effort */
    }
    commitFiles((prev) => {
      revokeAll(prev);
      pendingUploadIdsRef.current.clear();
      uploadGenRef.current.clear();
      uploadQueueRef.current = [];
      for (const id of [...uploadAbortRef.current.keys()]) {
        abortUpload(id);
      }
      return [];
    });
  }, [abortUpload, commitFiles]);

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
