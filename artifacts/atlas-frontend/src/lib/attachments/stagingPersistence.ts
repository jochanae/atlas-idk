/**
 * Staging metadata persistence for Android Documents hard-reload recovery (INT-05 / T4).
 * Persists attachment IDs + status — never File blobs (WebView OOM).
 *
 * Soft remounts still use useStagedAttachments module memory.
 * Hard reloads rehydrate chips from this sessionStorage mirror.
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
  /** Optional finalize open URL — usually null; chips rarely need it. */
  contentUrl?: string | null;
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

export function loadStagingAttachmentMetaForSurface(surface: string): StagingAttachmentMeta[] {
  const key = surface || "default";
  return loadStagingAttachmentMeta().filter((e) => (e.surface || "default") === key);
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

export function removeStagingAttachmentMeta(clientAttachmentId: string): void {
  const next = loadStagingAttachmentMeta().filter(
    (e) => e.clientAttachmentId !== clientAttachmentId,
  );
  saveStagingAttachmentMeta(next);
}

export function clearStagingAttachmentMetaForSurface(surface: string): void {
  const key = surface || "default";
  const next = loadStagingAttachmentMeta().filter(
    (e) => (e.surface || "default") !== key,
  );
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
