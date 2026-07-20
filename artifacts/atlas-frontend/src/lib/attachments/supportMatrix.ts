/**
 * Explicit attachment support matrix.
 *
 * This is the product contract for conversational attachments. Both Ask Atlas
 * and Workspace must enforce the same rules before Send — never surface-
 * specific allowlists.
 *
 * Capability:
 *   model_use     — bytes may be injected into the model request
 *   storage_only  — upload + chip OK; do NOT claim the model understood it
 *   blocked       — reject before staging / before Send
 */

export type AttachmentCapability = "model_use" | "storage_only" | "blocked";

export type AttachmentKind =
  | "image"
  | "pdf"
  | "document"
  | "presentation"
  | "spreadsheet"
  | "text"
  | "archive"
  | "other";

export type SupportMatrixEntry = {
  /** Stable id for tests and diagnostics. */
  id: string;
  /** Human label shown in capability chips. */
  label: string;
  extensions: readonly string[];
  mimeTypes: readonly string[];
  kind: AttachmentKind;
  capability: AttachmentCapability;
  /**
   * Short copy shown on staged/sent chips when capability !== model_use.
   * Must never imply the model read the file when capability is storage_only.
   */
  statusLabel: string;
};

/**
 * Canonical support matrix. Order matters for matching — first hit wins.
 */
export const ATTACHMENT_SUPPORT_MATRIX: readonly SupportMatrixEntry[] = [
  {
    id: "png",
    label: "PNG",
    extensions: ["png"],
    mimeTypes: ["image/png"],
    kind: "image",
    capability: "model_use",
    statusLabel: "Ready for Atlas",
  },
  {
    id: "jpeg",
    label: "JPG/JPEG",
    extensions: ["jpg", "jpeg"],
    mimeTypes: ["image/jpeg"],
    kind: "image",
    capability: "model_use",
    statusLabel: "Ready for Atlas",
  },
  {
    id: "webp",
    label: "WEBP",
    extensions: ["webp"],
    mimeTypes: ["image/webp"],
    kind: "image",
    capability: "model_use",
    statusLabel: "Ready for Atlas",
  },
  {
    id: "pdf",
    label: "PDF",
    extensions: ["pdf"],
    mimeTypes: ["application/pdf"],
    kind: "pdf",
    capability: "model_use",
    statusLabel: "Ready for Atlas",
  },
  {
    id: "txt",
    label: "TXT",
    extensions: ["txt"],
    mimeTypes: ["text/plain"],
    kind: "text",
    capability: "model_use",
    statusLabel: "Ready for Atlas",
  },
  {
    id: "markdown",
    label: "Markdown",
    extensions: ["md", "markdown"],
    mimeTypes: ["text/markdown", "text/x-markdown"],
    kind: "text",
    capability: "model_use",
    statusLabel: "Ready for Atlas",
  },
  {
    id: "docx",
    label: "DOCX",
    extensions: ["docx"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    kind: "document",
    capability: "model_use",
    statusLabel: "Ready for Atlas",
  },
  {
    id: "pptx",
    label: "PPTX",
    extensions: ["pptx"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    kind: "presentation",
    capability: "model_use",
    statusLabel: "Ready for Atlas",
  },
  {
    id: "xlsx",
    label: "XLSX",
    extensions: ["xlsx"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    kind: "spreadsheet",
    capability: "model_use",
    statusLabel: "Ready for Atlas",
  },
  {
    id: "csv",
    label: "CSV",
    extensions: ["csv"],
    mimeTypes: ["text/csv", "application/csv"],
    kind: "spreadsheet",
    capability: "model_use",
    statusLabel: "Ready for Atlas",
  },
  {
    id: "zip",
    label: "ZIP",
    extensions: ["zip"],
    mimeTypes: ["application/zip", "application/x-zip-compressed"],
    kind: "archive",
    capability: "storage_only",
    statusLabel: "Stored — Atlas can't read this file type yet",
  },
] as const;

const EXT_INDEX = new Map<string, SupportMatrixEntry>();
const MIME_INDEX = new Map<string, SupportMatrixEntry>();
for (const entry of ATTACHMENT_SUPPORT_MATRIX) {
  for (const ext of entry.extensions) EXT_INDEX.set(ext.toLowerCase(), entry);
  for (const mime of entry.mimeTypes) MIME_INDEX.set(mime.toLowerCase(), entry);
}

export type ResolvedSupport = {
  entry: SupportMatrixEntry | null;
  kind: AttachmentKind;
  capability: AttachmentCapability;
  statusLabel: string;
  /** True when the file may be staged and uploaded. */
  allowed: boolean;
};

/**
 * Resolve a file against the support matrix.
 * Extension wins when mime is missing/generic; mime wins when specific.
 */
export function resolveSupport(
  mimeType: string,
  filename: string,
): ResolvedSupport {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const mime = (mimeType || "").trim().toLowerCase();

  const byMime =
    mime && mime !== "application/octet-stream" ? MIME_INDEX.get(mime) : undefined;
  const byExt = ext ? EXT_INDEX.get(ext) : undefined;
  const entry = byMime ?? byExt ?? null;

  if (!entry) {
    return {
      entry: null,
      kind: "other",
      capability: "blocked",
      statusLabel: "Unsupported file type",
      allowed: false,
    };
  }

  return {
    entry,
    kind: entry.kind,
    capability: entry.capability,
    statusLabel: entry.statusLabel,
    allowed: entry.capability !== "blocked",
  };
}

/** Map frontend presentation kind → server AttachmentKind (no presentation/archive). */
export function toServerKind(
  kind: AttachmentKind,
): "image" | "pdf" | "doc" | "spreadsheet" | "code" | "text" | "other" {
  switch (kind) {
    case "image":
      return "image";
    case "pdf":
      return "pdf";
    case "document":
    case "presentation":
      return "doc";
    case "spreadsheet":
      return "spreadsheet";
    case "text":
      return "text";
    case "archive":
    case "other":
    default:
      return "other";
  }
}

export function capabilityToProcessingStatus(
  capability: AttachmentCapability,
): "understood" | "unsupported" | "failed" {
  if (capability === "model_use") return "understood";
  if (capability === "storage_only") return "unsupported";
  return "failed";
}
