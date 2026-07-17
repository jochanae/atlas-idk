/**
 * AttachmentAdapter — the frontend's boundary against the backend attachment
 * lifecycle. Two implementations:
 *
 *   - `mockAttachmentAdapter`: in-memory, drives every UI state for dev + tests.
 *   - `httpAttachmentAdapter`: thin wrapper over the endpoints defined in
 *      .lovable/plan.md Section B. Wired but gated by
 *     `attachments.persistence` (see flags.ts).
 *
 * The frontend NEVER computes `expiresAt`, NEVER mints signed URLs, and NEVER
 * sends a browser-supplied URL to Nexus as trusted input. It sends
 * `attachmentIds[]` only.
 */

import {
  classifyKind,
  type PersistedAttachment,
  type AvailabilityStatus,
  type ProcessingStatus,
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
  /**
   * Called after the object bytes have been PUT to `uploadUrl`. Server
   * verifies presence, classifies the file, and returns the authoritative
   * PersistedAttachment (including server-owned `expiresAt`).
   */
  finalizeUpload(attachmentId: string): Promise<PersistedAttachment>;
  listForMessage(messageId: string): Promise<PersistedAttachment[]>;
  getOpenUrl(attachmentId: string): Promise<OpenUrlResult>;
  /** Returns the same id — frontend re-includes it in the next send. */
  useAgain(attachmentId: string): Promise<{ attachmentId: string }>;
  saveToLibrary(attachmentId: string): Promise<PersistedAttachment>;
  download(attachmentId: string): Promise<Blob>;
}

// ─── Mock adapter ─────────────────────────────────────────────────────────────

interface MockOptions {
  /** Simulate a `processingStatus` for freshly-finalized files by mime prefix. */
  processing?: (mimeType: string, filename: string) => PersistedAttachment["processingStatus"];
  /** Simulate the server's default retention window, in ms. */
  defaultRetentionMs?: number;
  /** Force upload to fail (test hook). */
  failUpload?: (file: File) => boolean;
}

export function createMockAdapter(opts: MockOptions = {}): AttachmentAdapter & {
  __state: {
    byId: Map<string, PersistedAttachment>;
    byMessage: Map<string, string[]>;
    bytes: Map<string, Blob>;
    attach(messageId: string, attachmentId: string): void;
    /** Test hook — force `availabilityStatus` (e.g. simulate expiry). */
    setAvailability(attachmentId: string, next: PersistedAttachment["availabilityStatus"]): void;
    /** Test hook — force `processingStatus`. */
    setProcessing(attachmentId: string, next: PersistedAttachment["processingStatus"]): void;
  };
} {
  const retention =
    opts.defaultRetentionMs ?? 60 * 24 * 60 * 60 * 1000; // 60d — server default
  const byId = new Map<string, PersistedAttachment>();
  const byMessage = new Map<string, string[]>();
  const bytes = new Map<string, Blob>();

  const defaultProcessing = (mime: string, name: string): PersistedAttachment["processingStatus"] => {
    if (opts.processing) return opts.processing(mime, name);
    const k = classifyKind(mime, name);
    // DOCX/XLSX are "unsupported" until the backend adds a converter.
    if (k === "doc" || k === "spreadsheet") return "unsupported";
    return "understood";
  };

  let uploadSeq = 0;
  const nextId = () => `att_${Date.now().toString(36)}_${(uploadSeq++).toString(36)}`;

  const adapter: AttachmentAdapter = {
    async requestUpload(file) {
      if (opts.failUpload?.(file)) throw new Error("Mock upload rejected");
      const attachmentId = nextId();
      // Reserve a record; finalize replaces it.
      byId.set(attachmentId, {
        attachmentId,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        kind: classifyKind(file.type || "", file.name),
        availabilityStatus: "active",
        processingStatus: "pending",
        expiresAt: new Date(Date.now() + retention).toISOString(),
        libraryItemId: null,
      });
      // In the real adapter this is a signed URL from object storage.
      // In-memory: capture bytes on finalize instead.
      return { attachmentId, uploadUrl: `mock://upload/${attachmentId}` };
    },
    async finalizeUpload(attachmentId) {
      const existing = byId.get(attachmentId);
      if (!existing) throw new Error(`Unknown attachment ${attachmentId}`);
      const next: PersistedAttachment = {
        ...existing,
        processingStatus: defaultProcessing(existing.mimeType, existing.filename),
      };
      byId.set(attachmentId, next);
      return next;
    },
    async listForMessage(messageId) {
      const ids = byMessage.get(messageId) ?? [];
      return ids.map((id) => byId.get(id)).filter((x): x is PersistedAttachment => !!x);
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
      const b = bytes.get(attachmentId);
      if (!b) return new Blob([], { type: "application/octet-stream" });
      return b;
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
        byId.set(attachmentId, {
          ...rec,
          availabilityStatus: next,
          ...(next === "expired" ? { expiresAt: rec.expiresAt } : {}),
        });
      },
      setProcessing(attachmentId: string, next: ProcessingStatus) {
        const rec = byId.get(attachmentId);
        if (!rec) return;
        byId.set(attachmentId, { ...rec, processingStatus: next });
      },
    },
  });
}

/** Shared singleton mock — convenient for dev without prop-drilling. */
export const mockAttachmentAdapter = createMockAdapter();

// ─── HTTP adapter (contract only) ─────────────────────────────────────────────

/**
 * NOTE: Endpoints below match .lovable/plan.md Section B1 verbatim. Backend
 * ships these before `attachments.persistence` is flipped on. Until then, this
 * adapter is inert (the flag defaults off and callers use the mock).
 */
export function createHttpAdapter(
  baseUrl: string = "/api/attachments",
  fetchImpl: typeof fetch = fetch,
): AttachmentAdapter {
  const json = async <T>(res: Response): Promise<T> => {
    if (!res.ok) throw new Error(`Attachment API ${res.status}`);
    return (await res.json()) as T;
  };

  return {
    async requestUpload(file) {
      try {
        void import("@/lib/attachAuditLog").then(({ attachAuditLog }) => {
          attachAuditLog(
            "request_upload",
            { name: file.name, type: file.type, size: file.size },
            "shared",
          );
        });
      } catch {
        /* ignore */
      }
      return json(
        await fetchImpl(`${baseUrl}/request-upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        await fetchImpl(`${baseUrl}/${encodeURIComponent(attachmentId)}/finalize`, {
          method: "POST",
        }),
      );
    },
    async listForMessage(messageId) {
      return json(
        await fetchImpl(`${baseUrl}/message/${encodeURIComponent(messageId)}`),
      );
    },
    async getOpenUrl(attachmentId) {
      return json(
        await fetchImpl(`${baseUrl}/${encodeURIComponent(attachmentId)}/open-url`),
      );
    },
    async useAgain(attachmentId) {
      return json(
        await fetchImpl(`${baseUrl}/${encodeURIComponent(attachmentId)}/use-again`, {
          method: "POST",
        }),
      );
    },
    async saveToLibrary(attachmentId) {
      return json(
        await fetchImpl(`${baseUrl}/${encodeURIComponent(attachmentId)}/save-to-library`, {
          method: "POST",
        }),
      );
    },
    async download(attachmentId) {
      const res = await fetchImpl(
        `${baseUrl}/${encodeURIComponent(attachmentId)}/download`,
      );
      if (!res.ok) throw new Error(`Download failed ${res.status}`);
      return await res.blob();
    },
  };
}

export const httpAttachmentAdapter = createHttpAdapter();

/**
 * Upload an array of inline (base64-encoded) attachments through the HTTP
 * adapter and return their server-assigned attachment IDs.
 *
 * Used by send hooks when `attachments.persistence` is on and the caller
 * passed raw base64 files instead of pre-uploaded IDs.  Throws on the first
 * upload failure so the hook can surface the error rather than silently
 * dropping the file.
 */
export async function uploadInlineAttachments(
  attachments: Array<{ base64: string; mediaType: string; name?: string }>,
  adapter: AttachmentAdapter = httpAttachmentAdapter,
): Promise<string[]> {
  const ids: string[] = [];
  for (const att of attachments) {
    const binary = atob(att.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: att.mediaType });
    const ext = att.mediaType.split("/")[1]?.split(";")[0] ?? "bin";
    const file = new File(
      [blob],
      att.name ?? `attachment.${ext}`,
      { type: att.mediaType },
    );

    const { attachmentId, uploadUrl, headers } = await adapter.requestUpload(file);
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": att.mediaType, ...(headers ?? {}) },
      body: blob,
    });
    if (!putRes.ok) throw new Error(`Storage upload failed: ${putRes.status}`);
    await adapter.finalizeUpload(attachmentId);
    ids.push(attachmentId);
  }
  return ids;
}
