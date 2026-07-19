/**
 * Chat-attachment object storage helpers.
 *
 * Logical bucket: `chat-attachments` (env CHAT_ATTACHMENTS_BUCKET).
 * Object path: `{userId}/{attachmentId}/{sanitizedFilename}`.
 *
 * When CHAT_ATTACHMENTS_BUCKET is unset, falls back to
 * `{PRIVATE_OBJECT_DIR}/chat-attachments/...` so local/dev still works.
 */

import { File } from "@google-cloud/storage";
import {
  objectStorageClient,
  parseObjectPath,
  signObjectURL,
} from "./objectStorage";

export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const ATTACHMENT_MAX_COUNT = 10;
export const ATTACHMENT_MAX_MESSAGE_BYTES = 50 * 1024 * 1024;
export const ATTACHMENT_SIGNED_GET_TTL_SEC = 10 * 60;
export const ATTACHMENT_SIGNED_PUT_TTL_SEC = 15 * 60;
export const ATTACHMENT_RETENTION_DAYS = 60;
export const ATTACHMENT_EXPIRING_SOON_DAYS = 7;
/**
 * Server-controlled TTL for pending (not-yet-linked) uploads.
 * Applied at request-upload AND finalize so abandoned files are swept by the
 * retention worker. Promoted to ATTACHMENT_RETENTION_DAYS on send.
 */
export const ATTACHMENT_PENDING_TTL_DAYS = 1;

const LOGICAL_BUCKET = "chat-attachments";

export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() || "file";
  const cleaned = base
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned || "file";
}

export function resolveChatAttachmentsLocation(): {
  bucketName: string;
  /** Prefix inside the bucket (no trailing slash). Empty when dedicated bucket. */
  prefix: string;
  /** Value stored on message_attachments.storage_bucket. */
  storageBucket: string;
} {
  const explicit = (process.env.CHAT_ATTACHMENTS_BUCKET || "").trim();
  if (explicit) {
    return {
      bucketName: explicit,
      prefix: "",
      storageBucket: explicit,
    };
  }

  const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").trim();
  if (!privateDir) {
    return {
      bucketName: LOGICAL_BUCKET,
      prefix: "",
      storageBucket: LOGICAL_BUCKET,
    };
  }

  const normalized = privateDir.startsWith("/") ? privateDir : `/${privateDir}`;
  const { bucketName, objectName } = parseObjectPath(normalized);
  const prefix = objectName
    ? `${objectName.replace(/\/$/, "")}/${LOGICAL_BUCKET}`
    : LOGICAL_BUCKET;
  return {
    bucketName,
    prefix,
    storageBucket: LOGICAL_BUCKET,
  };
}

export function buildAttachmentObjectName(
  userId: number,
  attachmentId: string,
  filename: string,
): {
  bucketName: string;
  objectName: string;
  storageBucket: string;
  storagePath: string;
} {
  const loc = resolveChatAttachmentsLocation();
  const safe = sanitizeFilename(filename);
  const relative = `${userId}/${attachmentId}/${safe}`;
  const objectName = loc.prefix ? `${loc.prefix}/${relative}` : relative;
  return {
    bucketName: loc.bucketName,
    objectName,
    storageBucket: loc.storageBucket,
    storagePath: relative,
  };
}

export async function signAttachmentUploadUrl(params: {
  userId: number;
  attachmentId: string;
  filename: string;
}): Promise<{
  uploadUrl: string;
  storageBucket: string;
  storagePath: string;
  objectName: string;
  bucketName: string;
}> {
  const loc = buildAttachmentObjectName(
    params.userId,
    params.attachmentId,
    params.filename,
  );
  const uploadUrl = await signObjectURL({
    bucketName: loc.bucketName,
    objectName: loc.objectName,
    method: "PUT",
    ttlSec: ATTACHMENT_SIGNED_PUT_TTL_SEC,
  });
  return {
    uploadUrl,
    storageBucket: loc.storageBucket,
    storagePath: loc.storagePath,
    objectName: loc.objectName,
    bucketName: loc.bucketName,
  };
}

export async function signAttachmentReadUrl(params: {
  bucketName: string;
  objectName: string;
  ttlSec?: number;
}): Promise<{ url: string; expiresAt: string }> {
  const ttlSec = params.ttlSec ?? ATTACHMENT_SIGNED_GET_TTL_SEC;
  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
  const url = await signObjectURL({
    bucketName: params.bucketName,
    objectName: params.objectName,
    method: "GET",
    ttlSec,
  });
  return { url, expiresAt };
}

/** Resolve physical GCS location from a DB row. */
export function resolveStoredObject(params: {
  storageBucket: string;
  storagePath: string;
}): { bucketName: string; objectName: string } {
  if (params.storagePath.startsWith("/objects/")) {
    const privateObjectDir = (process.env.PRIVATE_OBJECT_DIR || "").trim();
    if (!privateObjectDir) {
      return {
        bucketName: params.storageBucket,
        objectName: params.storagePath.replace(/^\/+/, ""),
      };
    }
    const entityId = params.storagePath.slice("/objects/".length);
    const dir = privateObjectDir.endsWith("/")
      ? privateObjectDir
      : `${privateObjectDir}/`;
    return parseObjectPath(`${dir}${entityId}`);
  }

  const loc = resolveChatAttachmentsLocation();
  const bucketName =
    process.env.CHAT_ATTACHMENTS_BUCKET?.trim() || loc.bucketName;
  const objectName = loc.prefix
    ? `${loc.prefix}/${params.storagePath}`
    : params.storagePath;
  return { bucketName, objectName };
}

export function getAttachmentFile(params: {
  storageBucket: string;
  storagePath: string;
}): File {
  const { bucketName, objectName } = resolveStoredObject(params);
  return objectStorageClient.bucket(bucketName).file(objectName);
}

export async function attachmentObjectExists(params: {
  storageBucket: string;
  storagePath: string;
}): Promise<boolean> {
  const file = getAttachmentFile(params);
  const [exists] = await file.exists();
  return exists;
}

export async function downloadAttachmentBytes(params: {
  storageBucket: string;
  storagePath: string;
}): Promise<Buffer> {
  const file = getAttachmentFile(params);
  const [buffer] = await file.download();
  return buffer;
}

export async function deleteAttachmentObject(params: {
  storageBucket: string;
  storagePath: string;
}): Promise<void> {
  const file = getAttachmentFile(params);
  try {
    await file.delete({ ignoreNotFound: true });
  } catch {
    // Best-effort delete; retention should continue even if the object is gone.
  }
}
