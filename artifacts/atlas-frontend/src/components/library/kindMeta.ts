import {
  Bookmark,
  FileText,
  Target,
  ClipboardList,
  FileCode2,
  ListOrdered,
  Newspaper,
  FileBadge,
  Pencil,
  File,
  type LucideIcon,
} from "lucide-react";
import type { LibraryItemKind, LibraryItemOrigin } from "@/lib/library";

export type LibraryGroup = "Bookmarks" | "Documents" | "Sketches" | "Other";

export interface KindMeta {
  icon: LucideIcon;
  /** Specific type label. Kept specific even when grouped under something broader. */
  typeLabel: string;
  group: LibraryGroup;
}

export const KIND_META: Record<LibraryItemKind, KindMeta> = {
  bookmark: { icon: Bookmark, typeLabel: "Conversation Bookmark", group: "Bookmarks" },
  document: { icon: FileText, typeLabel: "Document", group: "Documents" },
  prd: { icon: FileBadge, typeLabel: "Product Requirements Document", group: "Documents" },
  plan: { icon: ClipboardList, typeLabel: "Plan", group: "Documents" },
  strategy: { icon: Target, typeLabel: "Strategy", group: "Documents" },
  spec: { icon: FileCode2, typeLabel: "Specification", group: "Documents" },
  outline: { icon: ListOrdered, typeLabel: "Outline", group: "Documents" },
  brief: { icon: Newspaper, typeLabel: "Brief", group: "Documents" },
  sketch: { icon: Pencil, typeLabel: "Sketch", group: "Sketches" },
  other: { icon: File, typeLabel: "Reference", group: "Other" },
};

export const GROUP_ORDER: LibraryGroup[] = ["Bookmarks", "Documents", "Sketches", "Other"];

export function metaFor(kind: LibraryItemKind): KindMeta {
  return KIND_META[kind] ?? KIND_META.other;
}

const ORIGIN_LABEL: Record<LibraryItemOrigin["source"], string> = {
  "ask-atlas": "Ask Joy",
  workspace: "Workspace",
  upload: "Upload",
  unknown: "",
};

/** Human origin phrase: "Saved from Ask Joy · Family Reunion Planning". */
export function originPhrase(origin: LibraryItemOrigin, projectName?: string | null): string {
  const src = ORIGIN_LABEL[origin.source] ?? "";
  const bits: string[] = [];
  if (src) bits.push(`Saved from ${src}`);
  if (projectName) bits.push(projectName);
  return bits.join(" · ");
}

/**
 * Detail content sanitizer.
 * - empty / '{}' / '[]' → null (render nothing)
 * - JSON-parseable → { kind: "unavailable" } (never expose raw JSON)
 * - anything else → prose string
 */
export function sanitizeContent(
  content: string | null | undefined,
): { kind: "prose"; text: string } | { kind: "unavailable" } | null {
  if (!content) return null;
  const trimmed = content.trim();
  if (!trimmed || trimmed === "{}" || trimmed === "[]") return null;
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed) ? parsed.length === 0 : Object.keys(parsed).length === 0) {
          return null;
        }
        return { kind: "unavailable" };
      }
    } catch {
      // not JSON, fall through as prose
    }
  }
  return { kind: "prose", text: trimmed };
}

/** Title truncation rule: keep short; fall back to first-sentence of preview. */
export function displayTitle(item: { title: string; preview: string }): string {
  const t = (item.title ?? "").trim();
  if (t && t.length <= 80) return t;
  const source = t || (item.preview ?? "").trim();
  if (!source) return "Untitled";
  const firstSentence = source.split(/(?<=[.!?])\s/)[0] ?? source;
  const clipped = firstSentence.length > 80 ? firstSentence.slice(0, 77).trimEnd() + "…" : firstSentence;
  return clipped;
}
