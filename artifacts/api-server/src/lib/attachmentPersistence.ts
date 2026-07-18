/**
 * attachmentPersistence — B3.2 durable write path for nexus attachments.
 *
 * Lifecycle per attachment:
 *   1. Allocate a storage UUID + derive storagePath (no presign needed server-side).
 *   2. Insert message_attachments row with upload_status = 'pending_upload'.
 *   3. Fire onPendingAck callback so the SSE stream can emit an early signal.
 *   4. Upload buffer directly to GCS via the server-side Storage client.
 *   5a. Success → UPDATE upload_status = 'uploaded'.
 *   5b. Failure → UPDATE upload_status = 'failed' + error fields.
 *   6. Return final AttachmentAckPayload (uploaded | failed).
 *
 * Idempotency: if a row already exists for
 * (nexus_message_id, client_attachment_id), the existing row is returned
 * without a duplicate insert or upload.
 *
 * Caller contract (nexus.ts):
 *   const promise = persistAttachmentsForMessage(attachments, ctx, onPendingAck);
 *   // …model stream runs concurrently…
 *   const finalAcks = await Promise.race([promise, timeoutFallback]);
 *   // emit attachment_ack events, then emit done
 */
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { db, messageAttachmentsTable } from "@workspace/db";
import type { AttachmentUploadStatus, AttachmentKind } from "@workspace/db";
import { objectStorageClient, parseObjectPath } from "./objectStorage";
import { logger as rootLogger } from "./logger";

const logger = rootLogger.child({ module: "attachmentPersistence" });

// ─── Public types ─────────────────────────────────────────────────────────────

export type AttachmentAckPayload = {
  id: string;
  clientAttachmentId: string | null;
  status: AttachmentUploadStatus;
  errorCode?: string;
};

export type IncomingAttachment = {
  base64: string;
  mediaType: string;
  name?: string;
  clientAttachmentId?: string;
  sizeBytes?: number;
};

export type AttachmentPersistenceContext = {
  nexusMessageId: number;
  userId: number;
  projectId: number | null;
  conversationId: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferKind(mimeType: string): AttachmentKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType === "application/msword" ||
    mimeType.includes("wordprocessingml")
  ) return "doc";
  if (
    mimeType.includes("spreadsheetml") ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "text/csv"
  ) return "spreadsheet";
  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    return "text";
  }
  return "other";
}

function classifyUploadError(err: unknown): string {
  if (!(err instanceof Error)) return "UNKNOWN";
  const msg = err.message.toLowerCase();
  if (msg.includes("timeout") || msg.includes("timed out")) return "UPLOAD_TIMEOUT";
  if (
    msg.includes("network") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("socket")
  ) return "NETWORK_ERROR";
  if (
    msg.includes("unauthorized") ||
    msg.includes("403") ||
    msg.includes("401")
  ) return "AUTH_FAILED";
  if (msg.includes("quota") || msg.includes("429")) return "QUOTA_EXCEEDED";
  if (msg.includes("too large") || msg.includes("413")) return "TOO_LARGE";
  return "GCS_ERROR";
}

// ─── Core per-attachment lifecycle ────────────────────────────────────────────

async function persistOne(
  att: IncomingAttachment,
  ctx: AttachmentPersistenceContext,
  onPendingAck: (ack: AttachmentAckPayload) => void,
): Promise<AttachmentAckPayload> {
  const { nexusMessageId, userId, projectId, conversationId } = ctx;
  const clientAttachmentId = att.clientAttachmentId ?? null;

  // ── Idempotency check ──────────────────────────────────────────────────────
  if (clientAttachmentId !== null) {
    try {
      const existing = await db
        .select({
          id: messageAttachmentsTable.id,
          uploadStatus: messageAttachmentsTable.uploadStatus,
        })
        .from(messageAttachmentsTable)
        .where(
          and(
            eq(messageAttachmentsTable.nexusMessageId, nexusMessageId),
            eq(messageAttachmentsTable.clientAttachmentId, clientAttachmentId),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        const row = existing[0];
        logger.info(
          { rowId: row.id, clientAttachmentId, status: row.uploadStatus },
          "attachmentPersistence: idempotent hit — returning existing row",
        );
        return {
          id: row.id,
          clientAttachmentId,
          status: row.uploadStatus as AttachmentUploadStatus,
        };
      }
    } catch (checkErr) {
      logger.warn({ checkErr, clientAttachmentId }, "attachmentPersistence: idempotency check failed — proceeding with insert");
    }
  }

  // ── Allocate storage path ──────────────────────────────────────────────────
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    logger.error("attachmentPersistence: PRIVATE_OBJECT_DIR not set");
    return {
      id: randomUUID(),
      clientAttachmentId,
      status: "failed",
      errorCode: "NO_STORAGE_CONFIG",
    };
  }

  const uploadUuid = randomUUID();
  const fullObjectPath = `${privateObjectDir}/uploads/${uploadUuid}`;
  let bucketName: string;
  let objectName: string;
  try {
    ({ bucketName, objectName } = parseObjectPath(fullObjectPath));
  } catch (parseErr) {
    logger.error({ parseErr, fullObjectPath }, "attachmentPersistence: could not parse storage path");
    return {
      id: randomUUID(),
      clientAttachmentId,
      status: "failed",
      errorCode: "STORAGE_PATH_ERROR",
    };
  }

  const storagePath = `/objects/uploads/${uploadUuid}`;
  const filename = att.name ?? `attachment-${uploadUuid}`;
  const sizeBytes = att.sizeBytes ?? Buffer.byteLength(att.base64, "base64");
  const kind = inferKind(att.mediaType);

  // ── Insert pending row ─────────────────────────────────────────────────────
  let rowId: string;
  try {
    const [row] = await db
      .insert(messageAttachmentsTable)
      .values({
        userId,
        projectId: projectId ?? undefined,
        conversationId: conversationId ?? undefined,
        surface: "nexus",
        nexusMessageId,
        clientAttachmentId: clientAttachmentId ?? undefined,
        filename,
        mimeType: att.mediaType,
        sizeBytes,
        kind,
        storageBucket: bucketName,
        storagePath,
        uploadStatus: "pending_upload",
        uploadAttemptCount: 1,
        lastUploadAttemptAt: new Date(),
      })
      .returning({ id: messageAttachmentsTable.id });
    rowId = row.id;
  } catch (insertErr) {
    logger.error(
      { insertErr, userId, nexusMessageId, clientAttachmentId },
      "attachmentPersistence: pending row insert failed",
    );
    return {
      id: randomUUID(),
      clientAttachmentId,
      status: "failed",
      errorCode: "INSERT_FAILED",
    };
  }

  // Notify caller that the pending row is in place
  onPendingAck({ id: rowId, clientAttachmentId, status: "pending_upload" });

  // ── Upload to GCS ──────────────────────────────────────────────────────────
  try {
    const buffer = Buffer.from(att.base64, "base64");
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    await file.save(buffer, {
      contentType: att.mediaType,
      resumable: false,
    });

    await db
      .update(messageAttachmentsTable)
      .set({ uploadStatus: "uploaded" })
      .where(eq(messageAttachmentsTable.id, rowId));

    logger.info(
      { rowId, clientAttachmentId, storagePath, userId },
      "attachmentPersistence: upload complete",
    );
    return { id: rowId, clientAttachmentId, status: "uploaded" };
  } catch (uploadErr: unknown) {
    const errorCode = classifyUploadError(uploadErr);
    const errorMessage = uploadErr instanceof Error
      ? uploadErr.message.slice(0, 500)
      : String(uploadErr).slice(0, 500);

    logger.error(
      { uploadErr, rowId, userId, nexusMessageId, errorCode },
      "attachmentPersistence: GCS upload failed",
    );

    try {
      await db
        .update(messageAttachmentsTable)
        .set({
          uploadStatus: "failed",
          uploadErrorCode: errorCode,
          uploadErrorMessage: errorMessage,
        })
        .where(eq(messageAttachmentsTable.id, rowId));
    } catch (updateErr) {
      logger.error({ updateErr, rowId }, "attachmentPersistence: failure status update failed");
    }

    return { id: rowId, clientAttachmentId, status: "failed", errorCode };
  }
}

// ─── Public entry point ────────────────────────────────────────────────────────

/**
 * Persist all attachments for a single nexus message.
 *
 * Runs each attachment concurrently. Each attachment:
 *   1. Inserts a pending row and fires onPendingAck.
 *   2. Uploads to GCS and updates the row status.
 *   3. Returns the final AttachmentAckPayload.
 *
 * Never throws — individual failures are returned as status="failed" payloads.
 */
export async function persistAttachmentsForMessage(
  attachments: IncomingAttachment[],
  ctx: AttachmentPersistenceContext,
  onPendingAck: (ack: AttachmentAckPayload) => void,
): Promise<AttachmentAckPayload[]> {
  if (attachments.length === 0) return [];
  return Promise.all(
    attachments.map((att) => persistOne(att, ctx, onPendingAck)),
  );
}
