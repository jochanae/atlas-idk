/**
 * Load prior attachment provenance for a conversation (backend IDs kept for maps).
 */
import { db, messageAttachmentsTable } from "@workspace/db";
import { and, asc, eq, inArray, or, type SQL } from "drizzle-orm";
import {
  assignPublicRefs,
  type PriorAttachmentRecord,
} from "./attachmentGrounding";

export async function loadPriorAttachmentsForMessages(params: {
  userId: number;
  nexusMessageIds?: number[];
  chatMessageIds?: number[];
  /** Prefer this — survives message-id remaps / append-thread copies when the
   *  attachment row still carries the original conversation_id. */
  conversationId?: string | null;
  /** Workspace turns: also discover attachments linked to this project. */
  projectId?: number | null;
}): Promise<PriorAttachmentRecord[]> {
  const nexusIds = [...new Set((params.nexusMessageIds ?? []).filter((n) => n > 0))];
  const chatIds = [...new Set((params.chatMessageIds ?? []).filter((n) => n > 0))];
  const conversationId =
    typeof params.conversationId === "string" && params.conversationId.trim().length > 0
      ? params.conversationId.trim()
      : null;
  const projectId =
    typeof params.projectId === "number" && params.projectId > 0 ? params.projectId : null;

  const clauses: SQL[] = [];
  if (nexusIds.length > 0) {
    clauses.push(inArray(messageAttachmentsTable.nexusMessageId, nexusIds));
  }
  if (chatIds.length > 0) {
    clauses.push(inArray(messageAttachmentsTable.chatMessageId, chatIds));
  }
  if (conversationId) {
    clauses.push(eq(messageAttachmentsTable.conversationId, conversationId));
  }
  if (projectId != null) {
    clauses.push(eq(messageAttachmentsTable.projectId, projectId));
  }
  if (clauses.length === 0) return [];

  const idClause = clauses.length === 1 ? clauses[0]! : or(...clauses);

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

  // Most recent first for relevance. Dedupe by attachment id.
  const seen = new Set<string>();
  const unique = [];
  for (const r of [...rows].reverse()) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    unique.push(r);
  }

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
