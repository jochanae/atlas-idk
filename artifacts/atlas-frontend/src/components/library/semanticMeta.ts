/**
 * Frontend semantic presentation for Library items.
 *
 * Prefer sourceRef.artifactType, then fall back to LibraryItem.kind.
 * Does not mutate backend values.
 */
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
  AppWindow,
  Presentation,
  Table2,
  FileImage,
  GitBranch,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import type { LibraryItem, LibraryItemKind, LibrarySourceRef } from "@/lib/library";
import { metaFor, type LibraryGroup } from "./kindMeta";

export type SemanticPrimaryAction =
  | "open-conversation"
  | "open-draft-preview"
  | "open-download"
  | "none";

export interface SemanticMeta {
  label: string;
  icon: LucideIcon;
  /** Filter/group bucket — still driven by API kind for stable chips. */
  group: LibraryGroup;
  primaryAction: SemanticPrimaryAction;
  primaryActionLabel: string | null;
}

const KIND_FALLBACK: Record<LibraryItemKind, Pick<SemanticMeta, "label" | "icon" | "primaryAction" | "primaryActionLabel">> = {
  bookmark: {
    label: "Conversation Bookmark",
    icon: Bookmark,
    primaryAction: "open-conversation",
    primaryActionLabel: "Open conversation",
  },
  document: {
    label: "Document",
    icon: FileText,
    primaryAction: "open-conversation",
    primaryActionLabel: "Open source conversation",
  },
  prd: {
    label: "Product Requirements Document",
    icon: FileBadge,
    primaryAction: "open-conversation",
    primaryActionLabel: "Open source conversation",
  },
  plan: {
    label: "Plan",
    icon: ClipboardList,
    primaryAction: "open-conversation",
    primaryActionLabel: "Open source conversation",
  },
  strategy: {
    label: "Strategy",
    icon: Target,
    primaryAction: "open-conversation",
    primaryActionLabel: "Open source conversation",
  },
  spec: {
    label: "Specification",
    icon: FileCode2,
    primaryAction: "open-conversation",
    primaryActionLabel: "Open source conversation",
  },
  outline: {
    label: "Outline",
    icon: ListOrdered,
    primaryAction: "open-conversation",
    primaryActionLabel: "Open source conversation",
  },
  brief: {
    label: "Brief",
    icon: Newspaper,
    primaryAction: "open-conversation",
    primaryActionLabel: "Open source conversation",
  },
  sketch: {
    label: "Sketch",
    icon: Pencil,
    primaryAction: "none",
    primaryActionLabel: null,
  },
  other: {
    label: "Reference",
    icon: File,
    primaryAction: "none",
    primaryActionLabel: null,
  },
};

function normalizeArtifactType(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

function fromArtifactType(artifactType: string | null | undefined): Pick<SemanticMeta, "label" | "icon" | "primaryAction" | "primaryActionLabel"> | null {
  const t = normalizeArtifactType(artifactType);
  if (!t) return null;

  if (t === "html-app" || t === "html" || t === "html_preview") {
    return {
      label: "Interactive Prototype",
      icon: AppWindow,
      primaryAction: "open-draft-preview",
      primaryActionLabel: "Open in Draft Preview",
    };
  }
  if (t === "mermaid") {
    return { label: "Diagram", icon: GitBranch, primaryAction: "open-download", primaryActionLabel: "Download" };
  }
  if (t === "chart") {
    return { label: "Chart", icon: BarChart3, primaryAction: "open-download", primaryActionLabel: "Download" };
  }
  if (t === "pptx") {
    return { label: "Presentation", icon: Presentation, primaryAction: "open-download", primaryActionLabel: "Download" };
  }
  if (t === "docx") {
    return { label: "Document", icon: FileText, primaryAction: "open-download", primaryActionLabel: "Download" };
  }
  if (t === "xlsx") {
    return { label: "Spreadsheet", icon: Table2, primaryAction: "open-download", primaryActionLabel: "Download" };
  }
  if (t === "pdf") {
    return { label: "PDF", icon: FileText, primaryAction: "open-download", primaryActionLabel: "Download" };
  }
  if (
    t === "image" || t === "png" || t === "jpg" || t === "jpeg"
    || t === "gif" || t === "webp" || t === "svg" || t.startsWith("image/")
  ) {
    return { label: "Image", icon: FileImage, primaryAction: "open-download", primaryActionLabel: "Download" };
  }
  return null;
}

export function artifactTypeOf(item: LibraryItem): string | null {
  const ref = item.sourceRef;
  if (ref && (ref.sourceKind === "project-artifact" || ref.sourceKind === "home-artifact")) {
    return ref.artifactType ?? null;
  }
  return null;
}

export function semanticMetaFor(item: LibraryItem): SemanticMeta {
  const group = metaFor(item.kind).group;
  const fromType = fromArtifactType(artifactTypeOf(item));
  if (fromType) return { ...fromType, group };

  if (item.kind === "bookmark" || item.sourceRef?.sourceKind === "conversation-bookmark") {
    return { ...KIND_FALLBACK.bookmark, group: "Bookmarks" };
  }

  const fallback = KIND_FALLBACK[item.kind] ?? KIND_FALLBACK.other;
  return { ...fallback, group };
}

export function resolveConversationId(item: LibraryItem): string | null {
  const fromRef = item.sourceRef?.conversationId;
  if (fromRef) return fromRef;
  return item.origin.conversationId ?? null;
}

export function resolveProjectId(item: LibraryItem): number | null {
  const ref = item.sourceRef;
  if (ref && (ref.sourceKind === "project-artifact" || ref.sourceKind === "conversation-bookmark")) {
    if (ref.projectId != null) return ref.projectId;
  }
  return item.project?.id ?? null;
}

export function resolveDownloadTarget(item: LibraryItem): { projectId: number; artifactId: string } | null {
  const ref = item.sourceRef;
  if (!ref || ref.sourceKind !== "project-artifact") return null;
  if (ref.projectId == null || !ref.sourceId) return null;
  return { projectId: ref.projectId, artifactId: ref.sourceId };
}

export function isProjectArtifact(item: LibraryItem): boolean {
  return item.sourceRef?.sourceKind === "project-artifact";
}

export function isHtmlPrototype(item: LibraryItem): boolean {
  const t = normalizeArtifactType(artifactTypeOf(item));
  return t === "html-app" || t === "html" || t === "html_preview";
}

export function sourceRefKind(ref: LibrarySourceRef | null | undefined): string | null {
  return ref?.sourceKind ?? null;
}
