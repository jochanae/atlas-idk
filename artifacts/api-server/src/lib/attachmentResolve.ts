/**
 * Resolve persisted attachment IDs into model-ingestible payloads.
 * Used by send paths that accept attachmentIds; never trusts client URLs.
 *
 * For extractable formats (PPTX/DOCX/XLSX/CSV), downloads bytes, runs
 * services/attachmentExtract, and injects extracted text (+ optional images).
 * Extraction failure downgrades the row to processingStatus=failed and skips
 * with a clear reason — never silently drops.
 */

import {
  db,
  messageAttachmentsTable,
  type MessageAttachment,
} from "@workspace/db";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import {
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_MAX_MESSAGE_BYTES,
  ATTACHMENT_RETENTION_DAYS,
  downloadAttachmentBytes,
} from "./attachmentStorage";
import { normalizeModelMediaType } from "./attachmentClassify";
import { logger } from "./logger";
import {
  applyExtractedTextByteCap,
  extractAttachment,
  isExtractableAttachment,
  EXTRACT_IMAGE_BLOCK_CAP,
} from "../services/attachmentExtract";
import { recordAttachmentActivity } from "./attachmentActivity";
import {
  EXTRACT_VERSION,
  labelExtractForModel,
} from "./attachmentExtractStore";
import { isAttachmentContinuityV2Enabled } from "./attachmentGrounding";

async function markModelInjected(attachmentId: string): Promise<void> {
  try {
    await db
      .update(messageAttachmentsTable)
      .set({ modelInjectedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(messageAttachmentsTable.id, attachmentId),
          isNull(messageAttachmentsTable.modelInjectedAt),
        ),
      );
  } catch (err) {
    logger.warn(
      { err, attachmentId },
      "attachmentResolve: failed to mark model_injected_at",
    );
  }
}

export type ResolvedModelAttachment = {
  attachmentId: string;
  base64: string;
  mediaType: string;
  name: string;
  kind: string;
  /** When true, inject as a text block rather than image/document. */
  asText: boolean;
  textContent?: string;
  /** Optional extracted/rasterized images to inject alongside text. */
  images?: Array<{ base64: string; mediaType: string; name?: string }>;
  /** Non-fatal notices (caps, truncations). */
  warnings?: string[];
};

export type SkippedAttachment = {
  attachmentId: string;
  reason: string;
  filename?: string;
  mimeType?: string;
};

async function markAttachmentFailed(attachmentId: string): Promise<void> {
  try {
    await db
      .update(messageAttachmentsTable)
      .set({ processingStatus: "failed", updatedAt: new Date() })
      .where(eq(messageAttachmentsTable.id, attachmentId));
  } catch (err) {
    logger.warn(
      { err, attachmentId },
      "attachmentResolve: failed to mark processingStatus=failed",
    );
  }
}

function emitUnsupported(params: {
  userId: number;
  projectId: number | null | undefined;
  filename: string;
  reason: string;
  attachmentId: string;
}): void {
  const projectId = params.projectId && params.projectId > 0 ? params.projectId : 0;
  if (projectId <= 0) return;
  recordAttachmentActivity({
    id: `attachment_unsupported-${params.attachmentId}`,
    type: "attachment_unsupported",
    userId: params.userId,
    projectId,
    title: `Skipped ${params.filename}`,
    subtitle: params.reason,
    attachmentName: params.filename,
    reason: params.reason,
  });
}

function emitDocumentAnalyzed(params: {
  userId: number;
  projectId: number | null | undefined;
  filename: string;
  subtitle: string;
  attachmentId: string;
}): void {
  const projectId = params.projectId && params.projectId > 0 ? params.projectId : 0;
  if (projectId <= 0) return;
  recordAttachmentActivity({
    id: `document_analyzed-${params.attachmentId}`,
    type: "document_analyzed",
    userId: params.userId,
    projectId,
    title: `Read ${params.filename}`,
    subtitle: params.subtitle,
    attachmentName: params.filename,
  });
}

export async function resolveAttachmentIdsForModel(params: {
  userId: number;
  attachmentIds: string[];
  /** Fallback project for activity verbs when the attachment row has none yet. */
  projectId?: number | null;
}): Promise<{
  resolved: ResolvedModelAttachment[];
  skipped: SkippedAttachment[];
}> {
  const activityProjectId = (rowProjectId: number | null | undefined) =>
    (rowProjectId && rowProjectId > 0
      ? rowProjectId
      : params.projectId && params.projectId > 0
        ? params.projectId
        : null);
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
  let imagesInjected = 0;

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
      if (row.processingStatus === "unsupported") {
        emitUnsupported({
          userId: params.userId,
          projectId: activityProjectId(row.projectId),
          filename: row.filename,
          reason: "stored but not readable by Joy yet",
          attachmentId: id,
        });
      }
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
      if (!buffer.byteLength) {
        skipped.push({
          attachmentId: id,
          reason: "download_failed",
          filename: row.filename,
          mimeType: row.mimeType,
        });
        logger.warn(
          { attachmentId: id, userId: params.userId, storagePath: row.storagePath },
          "attachmentResolve: downloaded empty object",
        );
        continue;
      }
      totalBytes += buffer.byteLength;
      const kind = row.kind;
      const mediaType = normalizeModelMediaType(row.mimeType, row.filename);

      // Extractable formats: never inject raw OOXML — extract text (+ images).
      if (isExtractableAttachment(row.mimeType, row.filename)) {
        try {
          const extracted = await extractAttachment(
            buffer,
            row.mimeType,
            row.filename,
          );
          const warnings = [...(extracted.warnings ?? [])];
          const remainingImages = Math.max(
            0,
            EXTRACT_IMAGE_BLOCK_CAP - imagesInjected,
          );
          const imageBufs = (extracted.images ?? []).slice(0, remainingImages);
          if ((extracted.images?.length ?? 0) > remainingImages) {
            logger.info(
              {
                attachmentId: id,
                dropped: (extracted.images?.length ?? 0) - remainingImages,
              },
              "attachmentResolve: dropped slide images over per-turn cap",
            );
          }
          imagesInjected += imageBufs.length;

          const images = imageBufs.map((png, i) => ({
            base64: png.toString("base64"),
            mediaType: "image/png",
            name: `${row.filename} · slide ${i + 1}`,
          }));

          resolved.push({
            attachmentId: id,
            base64: buffer.toString("base64"),
            mediaType,
            name: row.filename,
            kind,
            asText: true,
            textContent: isAttachmentContinuityV2Enabled()
              ? labelExtractForModel({
                  text: extracted.text,
                  extractVersion: EXTRACT_VERSION,
                  truncated: false,
                  format: "extractable",
                })
              : extracted.text,
            ...(images.length > 0 ? { images } : {}),
            ...(warnings.length > 0 ? { warnings } : {}),
          });

          await markModelInjected(id);

          const stats = extracted.stats;
          const subtitleParts: string[] = [];
          if (stats?.slidesAnalyzed != null) {
            subtitleParts.push(
              `${stats.slidesAnalyzed} slide${stats.slidesAnalyzed === 1 ? "" : "s"}`,
            );
          } else if (stats?.paragraphs != null) {
            subtitleParts.push(
              `${stats.paragraphs} paragraph${stats.paragraphs === 1 ? "" : "s"}`,
            );
          } else if (stats?.rows != null) {
            subtitleParts.push(
              `${stats.rows} row${stats.rows === 1 ? "" : "s"}`,
            );
          }
          emitDocumentAnalyzed({
            userId: params.userId,
            projectId: activityProjectId(row.projectId),
            filename: row.filename,
            subtitle: subtitleParts.join(" · ") || "extracted for model",
            attachmentId: id,
          });

          // Caps (e.g. oversized deck) still deliver content but must emit
          // attachment_unsupported with the honest reason — never silent.
          for (const warning of warnings) {
            emitUnsupported({
              userId: params.userId,
              projectId: activityProjectId(row.projectId),
              filename: row.filename,
              reason: warning,
              attachmentId: `${id}-cap-${warning.slice(0, 24)}`,
            });
          }

          logger.info(
            {
              attachmentId: id,
              userId: params.userId,
              kind,
              mediaType,
              bytes: buffer.byteLength,
              asText: true,
              textBytes: Buffer.byteLength(extracted.text, "utf8"),
              imageCount: images.length,
              warnings,
            },
            "attachmentResolve: extracted for model injection",
          );
          continue;
        } catch (extractErr) {
          const reason =
            extractErr instanceof Error
              ? extractErr.message
              : "extraction_failed";
          logger.warn(
            { err: extractErr, attachmentId: id, userId: params.userId },
            "attachmentResolve: extraction failed — marking failed",
          );
          await markAttachmentFailed(id);
          skipped.push({
            attachmentId: id,
            reason: `extraction_failed: ${reason}`,
            filename: row.filename,
            mimeType: row.mimeType,
          });
          emitUnsupported({
            userId: params.userId,
            projectId: activityProjectId(row.projectId),
            filename: row.filename,
            reason,
            attachmentId: id,
          });
          continue;
        }
      }

      if (kind === "text" || kind === "code") {
        resolved.push({
          attachmentId: id,
          base64: buffer.toString("base64"),
          mediaType,
          name: row.filename,
          kind,
          asText: true,
          textContent: buffer.toString("utf8"),
        });
      } else {
        resolved.push({
          attachmentId: id,
          base64: buffer.toString("base64"),
          mediaType,
          name: row.filename,
          kind,
          asText: false,
        });
      }
      await markModelInjected(id);
      logger.info(
        {
          attachmentId: id,
          userId: params.userId,
          kind,
          mediaType,
          bytes: buffer.byteLength,
          asText: kind === "text" || kind === "code",
        },
        "attachmentResolve: resolved for model injection",
      );
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

  // Enforce per-turn extracted-text budget across all asText attachments.
  const textItems = resolved
    .map((r, index) => ({
      index,
      name: r.name,
      text: r.textContent ?? "",
      asText: r.asText && r.textContent != null,
    }))
    .filter((t) => t.asText);

  if (textItems.length > 0) {
    const { texts, truncatedNames } = applyExtractedTextByteCap(
      textItems.map((t) => ({ name: t.name, text: t.text })),
    );
    const truncatedSet = new Set(truncatedNames);
    for (let i = 0; i < textItems.length; i++) {
      const item = textItems[i]!;
      let nextText = texts[i] ?? "";
      if (isAttachmentContinuityV2Enabled() && truncatedSet.has(item.name)) {
        // Strip any prior label then re-label as truncated.
        const stripped = nextText.replace(
          /^\[attachment extract v\d+[^\]]*\]\n?/,
          "",
        );
        nextText = labelExtractForModel({
          text: stripped,
          extractVersion: EXTRACT_VERSION,
          truncated: true,
          format: "extractable",
          truncationReason: "per_turn_budget",
        });
      }
      resolved[item.index] = {
        ...resolved[item.index]!,
        textContent: nextText,
      };
    }
    if (truncatedNames.length > 0) {
      logger.info(
        { truncatedNames, userId: params.userId },
        "attachmentResolve: applied per-turn extracted text byte cap",
      );
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
