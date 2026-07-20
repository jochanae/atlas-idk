/**
 * Resolve persisted attachment IDs into model-ingestible payloads.
 * Used by send paths that accept attachmentIds; never trusts client URLs.
 */

import {
  db,
  messageAttachmentsTable,
  type MessageAttachment,
} from "@workspace/db";
import { and, eq, inArray, ne } from "drizzle-orm";
import {
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_MAX_MESSAGE_BYTES,
  ATTACHMENT_RETENTION_DAYS,
  downloadAttachmentBytes,
} from "./attachmentStorage";
import { logger } from "./logger";

export type ResolvedModelAttachment = {
  attachmentId: string;
  base64: string;
  mediaType: string;
  name: string;
  kind: string;
  /** When true, inject as a text block rather than image/document. */
  asText: boolean;
  textContent?: string;
};

export type SkippedAttachment = {
  attachmentId: string;
  reason: string;
  filename?: string;
  mimeType?: string;
};

export async function resolveAttachmentIdsForModel(params: {
  userId: number;
  attachmentIds: string[];
}): Promise<{
  resolved: ResolvedModelAttachment[];
  skipped: SkippedAttachment[];
}> {
  const ids = [...new Set(params.attachmentIds.filter(Boolean))];
  if (ids.length === 0) {
    return { resolved: [], skipped: [] };
  }
  if (ids.length > ATTACHMENT_MAX_COUNT) {
    return {
      resolved: [],
      skipped: ids.map((attachmentId) => ({
        attachmentId,
        reason: "too_many_attachments",
      })),
    };
  }

  const rows: MessageAttachment[] = await db
    .select()
    .from(messageAttachmentsTable)
    .where(
      and(
        eq(messageAttachmentsTable.userId, params.userId),
        inArray(messageAttachmentsTable.id, ids),
      ),
    );

  const byId = new Map<string, MessageAttachment>(rows.map((r) => [r.id, r]));
  const resolved: ResolvedModelAttachment[] = [];
  const skipped: SkippedAttachment[] = [];
  let totalBytes = 0;

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      skipped.push({ attachmentId: id, reason: "not_found_or_forbidden" });
      continue;
    }
    if (row.uploadStatus !== "uploaded") {
      skipped.push({
        attachmentId: id,
        reason: "not_uploaded",
        filename: row.filename,
        mimeType: row.mimeType,
      });
      continue;
    }
    if (row.availabilityStatus === "expired") {
      skipped.push({
        attachmentId: id,
        reason: "expired",
        filename: row.filename,
        mimeType: row.mimeType,
      });
      continue;
    }
    if (
      row.processingStatus === "unsupported" ||
      row.processingStatus === "failed"
    ) {
      skipped.push({
        attachmentId: id,
        reason: `processing_${row.processingStatus}`,
        filename: row.filename,
        mimeType: row.mimeType,
      });
      continue;
    }
    if (row.processingStatus !== "understood") {
      skipped.push({
        attachmentId: id,
        reason: "processing_not_ready",
        filename: row.filename,
        mimeType: row.mimeType,
      });
      continue;
    }
    if (totalBytes + Number(row.sizeBytes) > ATTACHMENT_MAX_MESSAGE_BYTES) {
      skipped.push({
        attachmentId: id,
        reason: "message_attachment_bytes_exceeded",
        filename: row.filename,
        mimeType: row.mimeType,
      });
      continue;
    }

    try {
      const buffer = await downloadAttachmentBytes({
        storageBucket: row.storageBucket,
        storagePath: row.storagePath,
      });
      totalBytes += buffer.byteLength;
      const kind = row.kind;
      if (kind === "text" || kind === "code") {
        resolved.push({
          attachmentId: id,
          base64: buffer.toString("base64"),
          mediaType: row.mimeType,
          name: row.filename,
          kind,
          asText: true,
          textContent: buffer.toString("utf8"),
        });
      } else {
        resolved.push({
          attachmentId: id,
          base64: buffer.toString("base64"),
          mediaType: row.mimeType,
          name: row.filename,
          kind,
          asText: false,
        });
      }
    } catch (err) {
      logger.warn(
        { err, attachmentId: id, userId: params.userId },
        "attachmentResolve: download failed",
      );
      skipped.push({
        attachmentId: id,
        reason: "download_failed",
        filename: row.filename,
        mimeType: row.mimeType,
      });
    }
  }

  return { resolved, skipped };
}

/**
 * Link attachment rows to the message created on the send turn.
 *
 * Also promotes expiresAt to the full chat-retention window for rows that are
 * not already in the library. Library rows keep expiresAt=null forever.
 */
export async function linkAttachmentsToMessage(params: {
  userId: number;
  attachmentIds: string[];
  conversationId: string | null;
  surface: "ask_atlas" | "nexus";
  projectId?: number | null;
  chatMessageId?: number | null;
  nexusMessageId?: number | null;
}): Promise<void> {
  const ids = [...new Set(params.attachmentIds.filter(Boolean))];
  if (ids.length === 0) return;

  const fullRetentionExpiry = new Date(
    Date.now() + ATTACHMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  await db
    .update(messageAttachmentsTable)
    .set({
      conversationId: params.conversationId,
      surface: params.surface,
      projectId: params.projectId ?? null,
      chatMessageId: params.chatMessageId ?? null,
      nexusMessageId: params.nexusMessageId ?? null,
      expiresAt: fullRetentionExpiry,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(messageAttachmentsTable.userId, params.userId),
        inArray(messageAttachmentsTable.id, ids),
        ne(messageAttachmentsTable.availabilityStatus, "library"),
      ),
    );

  await db
    .update(messageAttachmentsTable)
    .set({
      conversationId: params.conversationId,
      surface: params.surface,
      projectId: params.projectId ?? null,
      chatMessageId: params.chatMessageId ?? null,
      nexusMessageId: params.nexusMessageId ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(messageAttachmentsTable.userId, params.userId),
        inArray(messageAttachmentsTable.id, ids),
        eq(messageAttachmentsTable.availabilityStatus, "library"),
      ),
    );
}
