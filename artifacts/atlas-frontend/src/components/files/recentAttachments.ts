/**
 * recentAttachments — lightweight local log of files the user has attached
 * to a message. Used by FilesBrowser's "Recent" section so it reflects
 * *actually attached* files rather than "anything updated in the last week."
 *
 * Storage: localStorage under `atlas.files.recentAttachments`.
 * Capped at MAX entries, most-recent-first, deduped by id.
 * Reactive via a tiny EventTarget so multiple mounts stay in sync.
 */

const KEY = "atlas.files.recentAttachments";
const MAX = 50;

export interface RecentAttachmentEntry {
  /** Stable UnifiedFile id when available, otherwise `native:<name>:<size>` */
  id: string;
  name: string;
  category?: string;
  section?: string;
  projectLabel?: string | null;
  thumbUrl?: string | null;
  /** ISO timestamp of when the user attached it */
  attachedAt: string;
}

const bus = new EventTarget();
const CHANGED = "changed";

function read(): RecentAttachmentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentAttachmentEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: RecentAttachmentEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
    bus.dispatchEvent(new Event(CHANGED));
  } catch {
    /* quota or private mode — silent */
  }
}

export function getRecentAttachments(): RecentAttachmentEntry[] {
  return read();
}

export function recordAttachments(entries: Array<Omit<RecentAttachmentEntry, "attachedAt">>): void {
  if (entries.length === 0) return;
  const now = new Date().toISOString();
  const stamped: RecentAttachmentEntry[] = entries.map((e) => ({ ...e, attachedAt: now }));
  const existing = read();
  const seen = new Set(stamped.map((e) => e.id));
  const merged = [...stamped, ...existing.filter((e) => !seen.has(e.id))];
  write(merged);
}

export function clearRecentAttachments(): void {
  write([]);
}

export function subscribeRecentAttachments(cb: () => void): () => void {
  const handler = () => cb();
  bus.addEventListener(CHANGED, handler);
  // Cross-tab sync via storage event.
  const storageHandler = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  if (typeof window !== "undefined") window.addEventListener("storage", storageHandler);
  return () => {
    bus.removeEventListener(CHANGED, handler);
    if (typeof window !== "undefined") window.removeEventListener("storage", storageHandler);
  };
}
