/**
 * AttachmentAdapter — frontend boundary to the attachment lifecycle API.
 *
 * Implementations:
 *   - mockAttachmentAdapter — in-memory for unit/acceptance tests + reference lab
 *   - httpAttachmentAdapter — POST /api/attachments/*
 */

import {
  capabilityToProcessingStatus,
  resolveSupport,
} from "./supportMatrix";
import type {
  AvailabilityStatus,
  PersistedAttachment,
  ProcessingStatus,
} from "./types";

export interface RequestUploadResult {
  attachmentId: string;
  uploadUrl: string;
  headers?: Record<string, string>;
}

export interface OpenUrlResult {
  url: string;
  expiresAt: string;
}

export interface AttachmentAdapter {
  requestUpload(file: File): Promise<RequestUploadResult>;
  finalizeUpload(attachmentId: string): Promise<PersistedAttachment>;
  listForMessage(messageId: string): Promise<PersistedAttachment[]>;
  getOpenUrl(attachmentId: string): Promise<OpenUrlResult>;
  useAgain(attachmentId: string): Promise<{ attachmentId: string }>;
  saveToLibrary(attachmentId: string): Promise<PersistedAttachment>;
  download(attachmentId: string): Promise<Blob>;
}

interface MockOptions {
  processing?: (mimeType: string, filename: string) => ProcessingStatus;
  defaultRetentionMs?: number;
  failUpload?: (file: File) => boolean;
  /** Artificial upload delay (ms) for progress UI tests. */
  uploadDelayMs?: number;
}

export function createMockAdapter(opts: MockOptions = {}): AttachmentAdapter & {
  __state: {
    byId: Map<string, PersistedAttachment>;
    byMessage: Map<string, string[]>;
    bytes: Map<string, Blob>;
    attach(messageId: string, attachmentId: string): void;
    setAvailability(attachmentId: string, next: AvailabilityStatus): void;
    setProcessing(attachmentId: string, next: ProcessingStatus): void;
  };
} {
  const retention = opts.defaultRetentionMs ?? 60 * 24 * 60 * 60 * 1000;
  const byId = new Map<string, PersistedAttachment>();
  const byMessage = new Map<string, string[]>();
  const bytes = new Map<string, Blob>();

  const defaultProcessing = (mime: string, name: string): ProcessingStatus => {
    if (opts.processing) return opts.processing(mime, name);
    const support = resolveSupport(mime, name);
    return capabilityToProcessingStatus(support.capability);
  };

  let uploadSeq = 0;
  const nextId = () =>
    `att_${Date.now().toString(36)}_${(uploadSeq++).toString(36)}`;

  const adapter: AttachmentAdapter = {
    async requestUpload(file) {
      if (opts.failUpload?.(file)) throw new Error("Mock upload rejected");
      if (opts.uploadDelayMs) {
        await new Promise((r) => setTimeout(r, opts.uploadDelayMs));
      }
      const attachmentId = nextId();
      const support = resolveSupport(file.type || "", file.name);
      byId.set(attachmentId, {
        attachmentId,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        kind: support.kind,
        availabilityStatus: "active",
        processingStatus: "pending",
        expiresAt: new Date(Date.now() + retention).toISOString(),
        libraryItemId: null,
      });
      bytes.set(attachmentId, file.slice(0, file.size, file.type));
      return { attachmentId, uploadUrl: `mock://upload/${attachmentId}` };
    },
    async finalizeUpload(attachmentId) {
      const existing = byId.get(attachmentId);
      if (!existing) throw new Error(`Unknown attachment ${attachmentId}`);
      const next: PersistedAttachment = {
        ...existing,
        processingStatus: defaultProcessing(
          existing.mimeType,
          existing.filename,
        ),
      };
      byId.set(attachmentId, next);
      return next;
    },
    async listForMessage(messageId) {
      const ids = byMessage.get(messageId) ?? [];
      return ids
        .map((id) => byId.get(id))
        .filter((x): x is PersistedAttachment => !!x);
    },
    async getOpenUrl(attachmentId) {
      const rec = byId.get(attachmentId);
      if (!rec) throw new Error(`Unknown attachment ${attachmentId}`);
      if (rec.availabilityStatus === "expired") {
        throw new Error("File expired");
      }
      return {
        url: `mock://open/${attachmentId}`,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };
    },
    async useAgain(attachmentId) {
      const rec = byId.get(attachmentId);
      if (!rec) throw new Error(`Unknown attachment ${attachmentId}`);
      if (rec.availabilityStatus === "expired") {
        throw new Error("File expired");
      }
      return { attachmentId };
    },
    async saveToLibrary(attachmentId) {
      const rec = byId.get(attachmentId);
      if (!rec) throw new Error(`Unknown attachment ${attachmentId}`);
      const promoted: PersistedAttachment = {
        ...rec,
        availabilityStatus: "library",
        expiresAt: null,
        libraryItemId: `lib_${attachmentId}`,
      };
      byId.set(attachmentId, promoted);
      return promoted;
    },
    async download(attachmentId) {
      return (
        bytes.get(attachmentId) ??
        new Blob([], { type: "application/octet-stream" })
      );
    },
  };

  return Object.assign(adapter, {
    __state: {
      byId,
      byMessage,
      bytes,
      attach(messageId: string, attachmentId: string) {
        const arr = byMessage.get(messageId) ?? [];
        if (!arr.includes(attachmentId)) arr.push(attachmentId);
        byMessage.set(messageId, arr);
      },
      setAvailability(attachmentId: string, next: AvailabilityStatus) {
        const rec = byId.get(attachmentId);
        if (!rec) return;
        byId.set(attachmentId, { ...rec, availabilityStatus: next });
      },
      setProcessing(attachmentId: string, next: ProcessingStatus) {
        const rec = byId.get(attachmentId);
        if (!rec) return;
        byId.set(attachmentId, { ...rec, processingStatus: next });
      },
    },
  });
}

export const mockAttachmentAdapter = createMockAdapter();

export function createHttpAdapter(
  baseUrl: string = "/api/attachments",
  fetchImpl: typeof fetch = fetch,
): AttachmentAdapter {
  const json = async <T>(res: Response): Promise<T> => {
    if (!res.ok) {
      let detail = "";
      try {
        const body = (await res.json()) as { error?: string };
        detail = body.error ? `: ${body.error}` : "";
      } catch {
        /* ignore */
      }
      throw new Error(`Attachment API ${res.status}${detail}`);
    }
    return (await res.json()) as T;
  };

  return {
    async requestUpload(file) {
      return json(
        await fetchImpl(`${baseUrl}/request-upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
          }),
        }),
      );
    },
    async finalizeUpload(attachmentId) {
      return json(
        await fetchImpl(
          `${baseUrl}/${encodeURIComponent(attachmentId)}/finalize`,
          { method: "POST", credentials: "include" },
        ),
      );
    },
    async listForMessage(messageId) {
      return json(
        await fetchImpl(
          `${baseUrl}/message/${encodeURIComponent(messageId)}`,
          { credentials: "include" },
        ),
      );
    },
    async getOpenUrl(attachmentId) {
      return json(
        await fetchImpl(
          `${baseUrl}/${encodeURIComponent(attachmentId)}/open-url`,
          { credentials: "include" },
        ),
      );
    },
    async useAgain(attachmentId) {
      return json(
        await fetchImpl(
          `${baseUrl}/${encodeURIComponent(attachmentId)}/use-again`,
          { method: "POST", credentials: "include" },
        ),
      );
    },
    async saveToLibrary(attachmentId) {
      return json(
        await fetchImpl(
          `${baseUrl}/${encodeURIComponent(attachmentId)}/save-to-library`,
          { method: "POST", credentials: "include" },
        ),
      );
    },
    async download(attachmentId) {
      const res = await fetchImpl(
        `${baseUrl}/${encodeURIComponent(attachmentId)}/download`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`Download failed ${res.status}`);
      return await res.blob();
    },
  };
}

export const httpAttachmentAdapter = createHttpAdapter();
