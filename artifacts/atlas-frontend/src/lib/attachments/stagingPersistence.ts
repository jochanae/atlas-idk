/**
 * Staging metadata persistence for Android Documents hard-reload recovery (T4).
 * Persists attachment IDs + status — never File blobs (WebView OOM).
 */

const STORAGE_KEY = "atlas-attachment-staging-v1";

export type StagingAttachmentMeta = {
  clientAttachmentId: string;
  attachmentId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadStatus: "pending_upload" | "uploaded" | "failed";
  conversationId: string | null;
  surface: string;
  updatedAt: number;
};

function safeParse(raw: string | null): StagingAttachmentMeta[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is StagingAttachmentMeta =>
        !!x &&
        typeof x === "object" &&
        typeof (x as StagingAttachmentMeta).clientAttachmentId === "string",
    );
  } catch {
    return [];
  }
}

export function loadStagingAttachmentMeta(): StagingAttachmentMeta[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    return safeParse(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveStagingAttachmentMeta(entries: StagingAttachmentMeta[]): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 20)));
  } catch {
    /* ignore quota */
  }
}

export function upsertStagingAttachmentMeta(entry: StagingAttachmentMeta): void {
  const prev = loadStagingAttachmentMeta();
  const next = [
    entry,
    ...prev.filter((e) => e.clientAttachmentId !== entry.clientAttachmentId),
  ];
  saveStagingAttachmentMeta(next);
}

export function clearStagingAttachmentMeta(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
