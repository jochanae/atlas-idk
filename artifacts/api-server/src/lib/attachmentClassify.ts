/**
 * Kind + processingStatus classification for chat attachments.
 * Mirrors frontend classifyKind rules and Section B finalize rules.
 */

export type AttachmentKind =
  | "image"
  | "pdf"
  | "doc"
  | "spreadsheet"
  | "code"
  | "text"
  | "other";

export type AttachmentProcessingStatus =
  | "pending"
  | "understood"
  | "unsupported"
  | "failed";

const KIND_BY_MIME: Array<[RegExp, AttachmentKind]> = [
  [/^image\//, "image"],
  [/^application\/pdf$/, "pdf"],
  [/wordprocessingml|msword|officedocument\.wordprocessingml/, "doc"],
  [/spreadsheetml|excel|officedocument\.spreadsheetml/, "spreadsheet"],
  [/^text\/csv$/, "spreadsheet"],
  [/^text\/(?:plain|markdown|md)$/, "text"],
  [
    /^(application\/(?:javascript|typescript|json|xml|x-yaml|yaml)|text\/(?:x-|javascript|typescript|css|html|xml))/,
    "code",
  ],
];

const KIND_BY_EXT: Array<[RegExp, AttachmentKind]> = [
  [/\.(png|jpe?g|gif|webp|heic|avif|svg)$/i, "image"],
  [/\.pdf$/i, "pdf"],
  [/\.(docx?|rtf|odt)$/i, "doc"],
  [/\.(xlsx?|ods|csv|tsv)$/i, "spreadsheet"],
  [
    /\.(ts|tsx|js|jsx|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|sh|sql|yml|yaml|json|toml)$/i,
    "code",
  ],
  [/\.(md|markdown|txt|log)$/i, "text"],
  [/\.(pptx?|ppt)$/i, "doc"],
];

/** Office Open XML + legacy Office → stored but not injected into model context. */
const UNSUPPORTED_MIME =
  /officedocument\.(?:wordprocessingml|spreadsheetml|presentationml)|msword|ms-excel|ms-powerpoint|vnd\.ms-/i;
const UNSUPPORTED_EXT = /\.(docx?|xlsx?|pptx?)$/i;

export function classifyAttachmentKind(
  mimeType: string,
  filename: string,
): AttachmentKind {
  const mime = (mimeType || "").trim().toLowerCase();
  for (const [re, k] of KIND_BY_MIME) {
    if (re.test(mime)) return k;
  }
  for (const [re, k] of KIND_BY_EXT) {
    if (re.test(filename)) return k;
  }
  return "other";
}

export function classifyProcessingStatus(
  kind: AttachmentKind,
  mimeType: string,
  filename: string,
): AttachmentProcessingStatus {
  const mime = (mimeType || "").trim().toLowerCase();
  if (UNSUPPORTED_MIME.test(mime) || UNSUPPORTED_EXT.test(filename)) {
    return "unsupported";
  }
  if (kind === "doc" || kind === "spreadsheet") {
    // Legacy Office / OOXML caught above; remaining doc/spreadsheet → unsupported
    // until converters land.
    return "unsupported";
  }
  if (kind === "other") return "unsupported";
  if (
    kind === "image" ||
    kind === "pdf" ||
    kind === "code" ||
    kind === "text"
  ) {
    return "understood";
  }
  return "unsupported";
}

export function classifyAttachment(
  mimeType: string,
  filename: string,
): { kind: AttachmentKind; processingStatus: AttachmentProcessingStatus } {
  try {
    const kind = classifyAttachmentKind(mimeType, filename);
    const processingStatus = classifyProcessingStatus(kind, mimeType, filename);
    return { kind, processingStatus };
  } catch {
    return { kind: "other", processingStatus: "failed" };
  }
}

/** Map attachment kind → library_items.kind for promotion. */
export function libraryKindForAttachment(kind: AttachmentKind): string {
  switch (kind) {
    case "image":
      return "sketch";
    case "pdf":
    case "doc":
    case "spreadsheet":
    case "code":
    case "text":
      return "document";
    default:
      return "other";
  }
}
