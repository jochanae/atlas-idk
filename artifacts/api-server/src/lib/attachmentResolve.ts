/**
 * Resolve persisted attachment IDs into model-ingestible payloads.
 * Used by the Nexus send path — never trusts client-supplied URLs.
 */

import { db, messageAttachmentsTable, type MessageAttachment } from "@workspace/db";
import { and, eq, inArray, ne } from "drizzle-orm";
import { ATTACHMENT_RETENTION_DAYS, downloadAttachmentBytes } from "./attachmentStorage";
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

export async function resolveAttachmentIdsForModel(params: {
  userId: number;
  attachmentIds: string[];
}): Promise<{
  resolved: ResolvedModelAttachment[];
  skipped: Array<{ attachmentId: string; reason: string }>;
}> {
  const ids = [...new Set(params.attachmentIds.filter(Boolean))];
  if (ids.length === 0) {
    return { resolved: [], skipped: [] };
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
  const skipped: Array<{ attachmentId: string; reason: string }> = [];

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      skipped.push({ attachmentId: id, reason: "not_found_or_forbidden" });
      continue;
    }
    if (row.uploadStatus !== "uploaded") {
      skipped.push({ attachmentId: id, reason: "not_uploaded" });
      continue;
    }
    if (row.availabilityStatus === "expired") {
      skipped.push({ attachmentId: id, reason: "expired" });
      continue;
    }
    if (
      row.processingStatus === "unsupported" ||
      row.processingStatus === "failed"
    ) {
      skipped.push({
        attachmentId: id,
        reason: `processing_${row.processingStatus}`,
      });
      continue;
    }

    try {
      const buffer = await downloadAttachmentBytes({
        storageBucket: row.storageBucket,
        storagePath: row.storagePath,
      });
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
      skipped.push({ attachmentId: id, reason: "download_failed" });
    }
  }

  return { resolved, skipped };
}

/** Link attachment rows to the message created on the send turn.
 *
 * Also promotes expiresAt to the full chat-retention window for any row that
 * is not already in the library (library rows keep expiresAt=null forever).
 * This converts the 24-hour pending TTL that was set at request-upload /
 * finalize into the normal 60-day retention so a successfully sent attachment
 * is never swept by the orphan-cleanup worker.
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
      // Promote to full retention; library rows (availabilityStatus='library')
      // are excluded by the ne() filter below so their null expiry is preserved.
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
}
