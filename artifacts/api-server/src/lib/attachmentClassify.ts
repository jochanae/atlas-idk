/**
 * Kind + processingStatus classification for persisted chat attachments.
 *
 * "understood" means the backend may inject the bytes into the model request.
 * "unsupported" means the file can be stored/displayed, but must stay out of
 * model context until a converter or native model support exists.
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

const IMAGE_MIME_TO_UNDERSTAND = /^(image\/(?:png|jpe?g|webp))$/i;
const IMAGE_EXT_TO_UNDERSTAND = /\.(png|jpe?g|webp)$/i;

const TEXT_MIME_TO_UNDERSTAND = /^text\/(?:plain|markdown)$/i;
const TEXT_EXT_TO_UNDERSTAND = /\.(txt|md|markdown)$/i;

const PDF_MIME = /^application\/pdf$/i;
const PDF_EXT = /\.pdf$/i;

const DOCX_MIME =
  /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/i;
const PPTX_MIME =
  /^application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation$/i;
const XLSX_MIME =
  /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet$/i;
const CSV_MIME = /^(text\/csv|application\/csv)$/i;
const ZIP_MIME = /^(application\/zip|application\/x-zip-compressed)$/i;

export function classifyAttachmentKind(
  mimeType: string,
  filename: string,
): AttachmentKind {
  const mime = (mimeType || "").trim().toLowerCase();
  const name = filename || "";

  if (IMAGE_MIME_TO_UNDERSTAND.test(mime) || IMAGE_EXT_TO_UNDERSTAND.test(name)) {
    return "image";
  }
  if (PDF_MIME.test(mime) || PDF_EXT.test(name)) {
    return "pdf";
  }

  if (DOCX_MIME.test(mime) || /\.docx$/i.test(name)) {
    return "doc";
  }
  if (PPTX_MIME.test(mime) || /\.pptx$/i.test(name)) {
    // Current schema has no "presentation" kind, so presentation files are docs.
    return "doc";
  }
  if (
    XLSX_MIME.test(mime) ||
    CSV_MIME.test(mime) ||
    /\.(xlsx|csv)$/i.test(name)
  ) {
    return "spreadsheet";
  }
  if (ZIP_MIME.test(mime) || /\.zip$/i.test(name)) {
    return "other";
  }

  if (TEXT_MIME_TO_UNDERSTAND.test(mime) || TEXT_EXT_TO_UNDERSTAND.test(name)) {
    return "text";
  }

  return "other";
}

export function classifyProcessingStatus(
  kind: AttachmentKind,
  mimeType: string,
  filename: string,
): AttachmentProcessingStatus {
  const mime = (mimeType || "").trim().toLowerCase();
  const name = filename || "";

  if (
    DOCX_MIME.test(mime) ||
    PPTX_MIME.test(mime) ||
    XLSX_MIME.test(mime) ||
    CSV_MIME.test(mime) ||
    ZIP_MIME.test(mime) ||
    /\.(docx|pptx|xlsx|csv|zip)$/i.test(name)
  ) {
    return "unsupported";
  }

  if (
    kind === "image" &&
    (IMAGE_MIME_TO_UNDERSTAND.test(mime) || IMAGE_EXT_TO_UNDERSTAND.test(name))
  ) {
    return "understood";
  }
  if (kind === "pdf" && (PDF_MIME.test(mime) || PDF_EXT.test(name))) {
    return "understood";
  }
  if (
    kind === "text" &&
    (TEXT_MIME_TO_UNDERSTAND.test(mime) || TEXT_EXT_TO_UNDERSTAND.test(name))
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

/** Map attachment kind to library_items.kind for promotion. */
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
