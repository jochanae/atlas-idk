/**
 * Library data seam.
 *
 * Today this reads from the legacy `/api/home-artifacts` endpoint through
 * an adapter. When `GET /api/library` lands, replace the body of
 * `fetchLibraryItems` / `deleteLibraryItem` with direct canonical calls —
 * no UI import should need to change.
 */
export type { LibraryItem, LibraryItemKind, LibraryItemOrigin, LibraryItemProject } from "./types";

import type { LibraryItem } from "./types";
import {
  fetchLibraryFromHomeArtifacts,
  deleteLegacyHomeArtifact,
} from "./adapters/homeArtifacts";

export async function fetchLibraryItems(): Promise<LibraryItem[]> {
  return fetchLibraryFromHomeArtifacts();
}

export async function deleteLibraryItem(item: LibraryItem): Promise<boolean> {
  return deleteLegacyHomeArtifact(item);
}
