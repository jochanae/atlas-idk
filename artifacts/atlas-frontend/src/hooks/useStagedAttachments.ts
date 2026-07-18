/**
 * useStagedAttachments — Shared staged-attachment controller (B2).
 *
 * Owns file selection staging, MIME/extension detection, size validation,
 * duplicate handling, local preview-URL generation, removal, and error state.
 * Does NOT touch base64 conversion or Nexus payload shape — that lives in
 * useAtlasConversation.submit() as temporary B2 inline transport.
 *
 * Both Ask Atlas and Workspace consume this hook directly.
 * No surface-specific file conversion or send logic may live outside this
 * controller or useAtlasConversation.
 */
import { useCallback, useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StagedFileStatus = "ready" | "error";

export interface StagedFile {
  /** Stable client-side ID — safe for React keys and targeted removal. */
  id: string;
  file: File;
  name: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  /**
   * Object URL created via URL.createObjectURL for image preview.
   * Null for non-image files (PDF, doc, etc.).
   * Revoked automatically on removal and unmount.
   */
  previewUrl: string | null;
  status: StagedFileStatus;
  /** Human-readable error. Non-null iff status === "error". */
  error: string | null;
}

export interface UseStagedAttachmentsReturn {
  /** All staged files, including those with status === "error". */
  files: StagedFile[];
  /** Only files with status === "ready". Safe to convert and submit. */
  readyFiles: StagedFile[];
  /** Add one or more files. Deduplicates by name+size. Marks oversized files as errors. */
  addFiles: (files: FileList | File[] | null | undefined) => void;
  /** Remove a single staged file and revoke its preview URL. */
  removeFile: (id: string) => void;
  /** Revoke all preview URLs and empty the list. Call after a successful submit. */
  clearFiles: () => void;
  /** True when readyFiles.length > 0. */
  canSubmitFiles: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * B2 temporary limit.
 * Inline base64 transport cannot handle very large files gracefully.
 * This will be lifted in B3/C when storage-backed URLs replace inline transport.
 */
const B2_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const B2_MAX_FILE_COUNT = 10;

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

function makePreviewUrl(file: File, mimeType: string): string | null {
  // SVGs are excluded: browsers can render them as <img> src but object URLs
  // for SVGs raise security flags in some policies. Extension-detected SVGs
  // also lack the `type` field reliability of rasterised formats.
  if (mimeType.startsWith("image/") && !mimeType.includes("svg")) {
    try {
      return URL.createObjectURL(file);
    } catch {
      return null;
    }
  }
  return null;
}

function revokeAll(files: StagedFile[]): void {
  for (const sf of files) {
    if (sf.previewUrl) {
      try {
        URL.revokeObjectURL(sf.previewUrl);
      } catch {}
    }
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStagedAttachments(opts?: {
  maxCount?: number;
  maxSizeBytes?: number;
}): UseStagedAttachmentsReturn {
  const maxCount = opts?.maxCount ?? B2_MAX_FILE_COUNT;
  const maxSize = opts?.maxSizeBytes ?? B2_MAX_FILE_SIZE_BYTES;

  const [files, setFiles] = useState<StagedFile[]>([]);

  // Revoke all object URLs when the component unmounts.
  useEffect(() => {
    return () => {
      // Read current files from a functional updater to avoid stale closure.
      setFiles(prev => {
        revokeAll(prev);
        return prev;
      });
    };
  }, []); // mount/unmount only — intentional

  const addFiles = useCallback(
    (incoming: FileList | File[] | null | undefined) => {
      if (!incoming) return;
      const arr = Array.from(incoming);
      if (arr.length === 0) return;

      setFiles(prev => {
        const result: StagedFile[] = [...prev];

        for (const file of arr) {
          // Hard cap: show an error entry for the first file that would exceed it.
          if (result.length >= maxCount) {
            result.push({
              id: crypto.randomUUID(),
              file,
              name: file.name,
              mimeType: detectMimeType(file),
              extension: detectExtension(file),
              sizeBytes: file.size,
              previewUrl: null,
              status: "error",
              error: `Max ${maxCount} files`,
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

          let status: StagedFileStatus = "ready";
          let error: string | null = null;
          let previewUrl: string | null = null;

          if (file.size > maxSize) {
            status = "error";
            error = `Too large (max ${Math.round(maxSize / 1024 / 1024)} MB)`;
            // No preview URL for oversized files.
          } else {
            previewUrl = makePreviewUrl(file, mimeType);
          }

          result.push({
            id: crypto.randomUUID(),
            file,
            name: file.name,
            mimeType,
            extension,
            sizeBytes: file.size,
            previewUrl,
            status,
            error,
          });
        }

        return result;
      });
    },
    [maxCount, maxSize],
  );

  const removeFile = useCallback((id: string) => {
    setFiles(prev => {
      const target = prev.find(sf => sf.id === id);
      if (target?.previewUrl) {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {}
      }
      return prev.filter(sf => sf.id !== id);
    });
  }, []);

  const clearFiles = useCallback(() => {
    setFiles(prev => {
      revokeAll(prev);
      return [];
    });
  }, []);

  const readyFiles = files.filter(sf => sf.status === "ready");

  return {
    files,
    readyFiles,
    addFiles,
    removeFile,
    clearFiles,
    canSubmitFiles: readyFiles.length > 0,
  };
}
