/**
 * Library data seam — canonical `/api/library` client.
 *
 * The frontend imports ONLY from this module. All wire shapes are
 * validated here so UI code sees pure `LibraryItem` objects.
 *
 * There is no legacy fallback. If the API fails, callers surface the
 * error — we do not silently re-inject items as quoted context.
 */
export type {
  LibraryItem,
  LibraryItemKind,
  LibraryItemOrigin,
  LibraryItemProject,
} from "./types";

import type { LibraryItem, LibraryItemKind, LibraryItemOrigin } from "./types";

export class LibraryApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "LibraryApiError";
  }
}

async function jsonOrThrow<T>(res: Response, action: string): Promise<T> {
  if (!res.ok) {
    let msg = `${action} failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = String(body.error);
    } catch {}
    throw new LibraryApiError(msg, res.status);
  }
  return (await res.json()) as T;
}

export interface FetchLibraryOptions {
  /** number = that project only; 'null' = user-level only; undefined = all. */
  projectId?: number | "null";
  kind?: string | string[];
  limit?: number;
  cursor?: string;
}

export async function fetchLibraryItems(
  opts: FetchLibraryOptions = {},
): Promise<LibraryItem[]> {
  const qs = new URLSearchParams();
  if (opts.projectId === "null") qs.set("projectId", "null");
  else if (typeof opts.projectId === "number") qs.set("projectId", String(opts.projectId));
  if (opts.kind) {
    const kinds = Array.isArray(opts.kind) ? opts.kind : [opts.kind];
    kinds.forEach((k) => qs.append("kind", k));
  }
  if (opts.limit) qs.set("limit", String(opts.limit));
  if (opts.cursor) qs.set("cursor", opts.cursor);
  const suffix = qs.toString() ? `?${qs}` : "";

  const res = await fetch(`/api/library${suffix}`, { credentials: "include" });
  const data = await jsonOrThrow<{ items?: LibraryItem[] }>(res, "Fetch library");
  return data.items ?? [];
}

export interface CreateLibraryItemInput {
  kind?: LibraryItemKind;
  title: string;
  content?: string | null;
  projectId?: number | null;
  origin?: Partial<LibraryItemOrigin>;
}

export async function createLibraryItem(input: CreateLibraryItemInput): Promise<LibraryItem> {
  const res = await fetch("/api/library", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const data = await jsonOrThrow<{ item?: LibraryItem }>(res, "Create library item");
  if (!data.item) throw new LibraryApiError("Create library item failed", res.status);
  return data.item;
}

export async function deleteLibraryItem(item: LibraryItem): Promise<void> {
  const res = await fetch(`/api/library/${encodeURIComponent(item.id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  await jsonOrThrow<{ ok: true }>(res, "Delete library item");
}

/** Attach a library item to a conversation. Idempotent server-side. */
export async function attachLibraryItem(
  itemId: string,
  conversationId: string,
): Promise<void> {
  const res = await fetch(`/api/library/${encodeURIComponent(itemId)}/context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ conversationId }),
  });
  await jsonOrThrow<{ ok: true }>(res, "Attach library item");
}

/** Detach (soft) a library item from a conversation. */
export async function detachLibraryItem(
  itemId: string,
  conversationId: string,
): Promise<void> {
  const res = await fetch(
    `/api/library/${encodeURIComponent(itemId)}/context/${encodeURIComponent(conversationId)}`,
    { method: "DELETE", credentials: "include" },
  );
  await jsonOrThrow<{ ok: true }>(res, "Detach library item");
}

/** Fetch the library items currently attached to a conversation. */
export async function fetchConversationContext(
  conversationId: string,
): Promise<LibraryItem[]> {
  const res = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/context`,
    { credentials: "include" },
  );
  const data = await jsonOrThrow<{ items?: LibraryItem[] }>(res, "Fetch conversation context");
  return data.items ?? [];
}
