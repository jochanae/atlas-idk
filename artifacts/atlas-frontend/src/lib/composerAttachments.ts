import { fileToBase64Safe } from "@/lib/image-resize";
import { httpAttachmentAdapter, type AttachmentAdapter } from "@/lib/attachments/adapter";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_COUNT, type PersistedAttachment } from "@/lib/attachments/types";

export type ComposerAttachmentPayload = {
  base64: string;
  mediaType: string;
  name: string;
};

/**
 * Shared Ask Atlas / Workspace attachment contract for Nexus chat sends.
 * Converts staged File objects into the JSON base64 payload expected by
 * POST /api/nexus/chat (attachments[] + optional first-image legacy fields).
 */
export async function filesToNexusAttachments(
  files: File[],
  opts?: { maxFiles?: number },
): Promise<ComposerAttachmentPayload[]> {
  const max = opts?.maxFiles ?? 10;
  const slice = files.slice(0, max);
  const out: ComposerAttachmentPayload[] = [];
  for (const f of slice) {
    try {
      const safe = await fileToBase64Safe(f);
      out.push({ base64: safe.base64, mediaType: safe.mediaType, name: f.name });
    } catch {
      // Skip unreadable files; caller may still send text.
    }
  }
  return out;
}

export type PersistentAttachmentUploadResult = {
  attachmentIds: string[];
  attachments: PersistedAttachment[];
  rejected: Array<{ fileName: string; reason: string }>;
};

/**
 * Upload staged browser Files to the backend-owned attachment lifecycle and
 * return IDs for chat sends. The browser never forwards the signed upload URL
 * to Atlas/Nexus; it is used only for the object-storage PUT.
 */
export async function uploadPersistentAttachments(
  files: File[],
  opts?: {
    adapter?: AttachmentAdapter;
    maxFiles?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<PersistentAttachmentUploadResult> {
  const adapter = opts?.adapter ?? httpAttachmentAdapter;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const maxFiles = opts?.maxFiles ?? ATTACHMENT_MAX_COUNT;
  const selected = files.slice(0, maxFiles);
  const rejected: PersistentAttachmentUploadResult["rejected"] = [];
  if (files.length > selected.length) {
    for (const f of files.slice(selected.length)) {
      rejected.push({ fileName: f.name, reason: `Only ${maxFiles} files can be attached.` });
    }
  }

  const attachments: PersistedAttachment[] = [];
  for (const file of selected) {
    if (file.size > ATTACHMENT_MAX_BYTES) {
      rejected.push({ fileName: file.name, reason: "File exceeds 20MB limit." });
      continue;
    }

    try {
      const upload = await adapter.requestUpload(file);
      if (!upload.uploadUrl.startsWith("mock://")) {
        const putRes = await fetchImpl(upload.uploadUrl, {
          method: "PUT",
          headers: upload.headers ?? { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) throw new Error(`Upload failed ${putRes.status}`);
      }
      const finalized = await adapter.finalizeUpload(upload.attachmentId);
      attachments.push(finalized);
    } catch (err) {
      rejected.push({
        fileName: file.name,
        reason: err instanceof Error ? err.message : "Upload failed.",
      });
    }
  }

  return {
    attachmentIds: attachments.map((a) => a.attachmentId),
    attachments,
    rejected,
  };
}

/** Pure decision helper — used by Workspace Nexus composer override + tests. */
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
