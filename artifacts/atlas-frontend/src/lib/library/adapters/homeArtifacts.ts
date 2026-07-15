/**
 * Legacy adapter — home_artifacts → LibraryItem.
 *
 * TEMPORARY. This is the only place the legacy `home_artifacts` response
 * shape is allowed to exist in the frontend. When `GET /api/library`
 * lands, delete this file and point callers at the canonical endpoint;
 * no UI code should need to change.
 */
import type { LibraryItem, LibraryItemKind } from "../types";

interface LegacyHomeArtifact {
  id: number;
  type: string;
  title: string;
  content: string;
  conversation_id: string | null;
  created_at: string;
  updated_at?: string;
}

const KNOWN_KINDS: LibraryItemKind[] = [
  "document", "prd", "plan", "strategy", "spec", "outline", "brief",
];

function toKind(raw: string): LibraryItemKind {
  const v = (raw ?? "").toLowerCase();
  return (KNOWN_KINDS as string[]).includes(v) ? (v as LibraryItemKind) : "other";
}

export function homeArtifactToLibraryItem(a: LegacyHomeArtifact): LibraryItem {
  const content = a.content ?? "";
  return {
    id: `home-artifact:${a.id}`,
    kind: toKind(a.type),
    title: a.title,
    content,
    preview: content.slice(0, 120),
    project: null,
    origin: {
      source: "ask-atlas",
      conversationId: a.conversation_id,
    },
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

/** Raw legacy id extractor — only for legacy write endpoints (DELETE). */
export function legacyHomeArtifactId(item: LibraryItem): number | null {
  const m = /^home-artifact:(\d+)$/.exec(item.id);
  return m ? Number(m[1]) : null;
}

export async function fetchLibraryFromHomeArtifacts(): Promise<LibraryItem[]> {
  const res = await fetch("/api/home-artifacts", { credentials: "include" });
  if (!res.ok) return [];
  const data = (await res.json()) as { artifacts?: LegacyHomeArtifact[] };
  return (data.artifacts ?? []).map(homeArtifactToLibraryItem);
}

export async function deleteLegacyHomeArtifact(item: LibraryItem): Promise<boolean> {
  const id = legacyHomeArtifactId(item);
  if (id == null) return false;
  const res = await fetch(`/api/home-artifacts/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  return res.ok;
}
