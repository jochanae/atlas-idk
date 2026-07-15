/**
 * Library data seam — canonical endpoint.
 *
 * Reads from GET /api/library. The backend LibraryItemApi shape is
 * identical to the frontend LibraryItem type, so no adapter is needed.
 *
 * The legacy homeArtifacts adapter is intentionally NOT imported here.
 * If /api/library fails, return [] and surface the error through the
 * calling component — do not silently fall back to /api/home-artifacts.
 */
export type { LibraryItem, LibraryItemKind, LibraryItemOrigin, LibraryItemProject } from "./types";

import type { LibraryItem } from "./types";

export async function fetchLibraryItems(opts?: { projectId?: number | null }): Promise<LibraryItem[]> {
  const url = new URL("/api/library", window.location.origin);
  if (opts?.projectId != null) {
    url.searchParams.set("projectId", String(opts.projectId));
  }
  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: LibraryItem[] };
  return data.items ?? [];
}

export async function deleteLibraryItem(item: LibraryItem): Promise<boolean> {
  const res = await fetch(`/api/library/${item.id}`, {
    method: "DELETE",
    credentials: "include",
  });
  return res.ok;
}

/**
 * Attach a library item to a conversation as context.
 * Returns the updated context list on success, null on failure.
 */
export async function attachLibraryItemToConversation(
  itemId: string,
  conversationId: string,
): Promise<boolean> {
  const res = await fetch(`/api/library/${itemId}/context`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId }),
  });
  return res.ok;
}

/**
 * Remove a library item from a conversation's context.
 */
export async function detachLibraryItemFromConversation(
  itemId: string,
  conversationId: string,
): Promise<boolean> {
  const res = await fetch(`/api/library/${itemId}/context/${conversationId}`, {
    method: "DELETE",
    credentials: "include",
  });
  return res.ok;
}
