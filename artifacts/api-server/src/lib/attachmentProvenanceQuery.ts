/**
 * Load prior attachment provenance for a conversation (backend IDs kept for maps).
 */
import { db, messageAttachmentsTable } from "@workspace/db";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import {
  assignPublicRefs,
  type PriorAttachmentRecord,
} from "./attachmentGrounding";

export async function loadPriorAttachmentsForMessages(params: {
  userId: number;
  nexusMessageIds?: number[];
  chatMessageIds?: number[];
}): Promise<PriorAttachmentRecord[]> {
  const nexusIds = [...new Set((params.nexusMessageIds ?? []).filter((n) => n > 0))];
  const chatIds = [...new Set((params.chatMessageIds ?? []).filter((n) => n > 0))];
  if (nexusIds.length === 0 && chatIds.length === 0) return [];

  const idClause =
    nexusIds.length > 0 && chatIds.length > 0
      ? or(
          inArray(messageAttachmentsTable.nexusMessageId, nexusIds),
          inArray(messageAttachmentsTable.chatMessageId, chatIds),
        )
      : nexusIds.length > 0
        ? inArray(messageAttachmentsTable.nexusMessageId, nexusIds)
        : inArray(messageAttachmentsTable.chatMessageId, chatIds);

  const rows = await db
    .select({
      id: messageAttachmentsTable.id,
      filename: messageAttachmentsTable.filename,
      mimeType: messageAttachmentsTable.mimeType,
      kind: messageAttachmentsTable.kind,
      nexusMessageId: messageAttachmentsTable.nexusMessageId,
      chatMessageId: messageAttachmentsTable.chatMessageId,
      uploadStatus: messageAttachmentsTable.uploadStatus,
      processingStatus: messageAttachmentsTable.processingStatus,
      availabilityStatus: messageAttachmentsTable.availabilityStatus,
      expiresAt: messageAttachmentsTable.expiresAt,
      modelInjectedAt: messageAttachmentsTable.modelInjectedAt,
    })
    .from(messageAttachmentsTable)
    .where(and(eq(messageAttachmentsTable.userId, params.userId), idClause!))
    .orderBy(asc(messageAttachmentsTable.createdAt));

  // Most recent first for relevance.
  const unique = [...rows].reverse();

  const now = Date.now();
  const mapped = unique.map((r) => {
    const expired =
      r.availabilityStatus === "expired" ||
      (r.expiresAt != null && r.expiresAt.getTime() < now);
    const bytesRetrievable =
      r.uploadStatus === "uploaded" &&
      !expired &&
      (r.availabilityStatus === "active" ||
        r.availabilityStatus === "expiring" ||
        r.availabilityStatus === "library");
    const originatingMessageId = r.nexusMessageId ?? r.chatMessageId ?? 0;
    return {
      attachmentId: r.id,
      filename: r.filename,
      mimeType: r.mimeType,
      kind: r.kind ?? "other",
      originatingMessageId,
      uploadStatus: r.uploadStatus,
      processingStatus: r.processingStatus,
      existed: true,
      priorAttachmentWasModelReceived: r.modelInjectedAt != null,
      extractedContentExists: false,
      bytesRetrievable,
    };
  });

  return assignPublicRefs(mapped);
}
