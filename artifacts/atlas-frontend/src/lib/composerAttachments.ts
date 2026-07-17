import { fileToBase64Safe } from "@/lib/image-resize";

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
