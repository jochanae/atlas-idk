/**
 * Attachment lifecycle API.
 *
 * Sequencing:
 *   1. POST /request-upload creates message_attachments row (pending_upload)
 *   2. Client PUTs bytes to signed uploadUrl
 *   3. POST /:id/finalize verifies object, classifies, sets uploaded/active
 *   4. Send with attachmentIds links rows to the created message
 *   5. GET /message/:messageId returns rows after send completes
 */

import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  messageAttachmentsTable,
  libraryItemsTable,
  nexusMessagesTable,
  chatMessagesTable,
  sessionsTable,
  projectsTable,
} from "@workspace/db";
import { and, eq, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  classifyAttachment,
  libraryKindForAttachment,
} from "../lib/attachmentClassify";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_PENDING_TTL_DAYS,
  attachmentObjectExists,
  downloadAttachmentBytes,
  resolveStoredObject,
  signAttachmentReadUrl,
  signAttachmentUploadUrl,
} from "../lib/attachmentStorage";

const router: IRouter = Router();

export type PersistedAttachment = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
  availabilityStatus: string;
  processingStatus: string;
  expiresAt: string | null;
  libraryItemId: string | null;
  openUrl?: string;
};

function toPersisted(
  row: typeof messageAttachmentsTable.$inferSelect,
  openUrl?: string,
): PersistedAttachment {
  const out: PersistedAttachment = {
    attachmentId: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: Number(row.sizeBytes),
    kind: row.kind,
    availabilityStatus: row.availabilityStatus,
    processingStatus: row.processingStatus,
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    libraryItemId: row.libraryItemId,
  };
  if (openUrl) out.openUrl = openUrl;
  return out;
}

function auditLog(params: {
  attachmentId: string | null;
  userId: number;
  route: string;
  outcome: string;
  extra?: Record<string, unknown>;
}): void {
  logger.info(
    {
      attachmentId: params.attachmentId,
      userId: params.userId,
      route: params.route,
      outcome: params.outcome,
      ...params.extra,
    },
    "attachment.audit",
  );
}

async function loadOwnedAttachment(id: string, userId: number) {
  const [row] = await db
    .select()
    .from(messageAttachmentsTable)
    .where(
      and(
        eq(messageAttachmentsTable.id, id),
        eq(messageAttachmentsTable.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

const RequestUploadBody = z.object({
  filename: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().nonnegative(),
  conversationId: z.string().min(1).max(128).optional(),
  projectId: z.number().int().positive().nullable().optional(),
  surface: z.enum(["ask_atlas", "nexus"]).optional(),
});

router.post("/attachments/request-upload", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const parsed = RequestUploadBody.safeParse(req.body);
  if (!parsed.success) {
    auditLog({
      attachmentId: null,
      userId,
      route: "request-upload",
      outcome: "bad_request",
    });
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { filename, mimeType, sizeBytes, conversationId, projectId, surface } =
    parsed.data;
  if (sizeBytes > ATTACHMENT_MAX_BYTES) {
    auditLog({
      attachmentId: null,
      userId,
      route: "request-upload",
      outcome: "too_large",
      extra: { sizeBytes },
    });
    res.status(413).json({
      error: "File exceeds 20MB limit",
      maxBytes: ATTACHMENT_MAX_BYTES,
    });
    return;
  }

  const attachmentId = randomUUID();
  try {
    const signed = await signAttachmentUploadUrl({
      userId,
      attachmentId,
      filename,
    });
    const pendingExpiresAt = new Date(
      Date.now() + ATTACHMENT_PENDING_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await db.insert(messageAttachmentsTable).values({
      id: attachmentId,
      userId,
      projectId: projectId ?? null,
      conversationId: conversationId ?? null,
      surface: surface ?? null,
      filename,
      mimeType: mimeType || "application/octet-stream",
      sizeBytes,
      kind: "other",
      storageBucket: signed.storageBucket,
      storagePath: signed.storagePath,
      uploadStatus: "pending_upload",
      availabilityStatus: "active",
      processingStatus: "pending",
      expiresAt: pendingExpiresAt,
    });

    auditLog({ attachmentId, userId, route: "request-upload", outcome: "ok" });
    res.json({
      attachmentId,
      uploadUrl: signed.uploadUrl,
      headers: { "Content-Type": mimeType || "application/octet-stream" },
      expiresAtHint: pendingExpiresAt.toISOString(),
    });
  } catch (err) {
    auditLog({ attachmentId, userId, route: "request-upload", outcome: "error" });
    logger.error({ err, userId }, "attachments/request-upload failed");
    res.status(500).json({ error: "Failed to create upload URL" });
  }
});

router.post("/attachments/:id/finalize", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const id = String(req.params.id || "");
  const row = await loadOwnedAttachment(id, userId);
  if (!row) {
    auditLog({ attachmentId: id, userId, route: "finalize", outcome: "not_found" });
    res.status(404).json({ error: "Not found" });
    return;
  }

  try {
    const exists = await attachmentObjectExists({
      storageBucket: row.storageBucket,
      storagePath: row.storagePath,
    });
    if (!exists) {
      auditLog({
        attachmentId: id,
        userId,
        route: "finalize",
        outcome: "object_missing",
      });
      res.status(409).json({ error: "Upload not found in storage" });
      return;
    }

    const { kind, processingStatus } = classifyAttachment(
      row.mimeType,
      row.filename,
    );
    const expiresAt = new Date(
      Date.now() + ATTACHMENT_PENDING_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const [updated] = await db
      .update(messageAttachmentsTable)
      .set({
        kind,
        processingStatus,
        uploadStatus: "uploaded",
        availabilityStatus: "active",
        expiresAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(messageAttachmentsTable.id, id),
          eq(messageAttachmentsTable.userId, userId),
        ),
      )
      .returning();

    auditLog({
      attachmentId: id,
      userId,
      route: "finalize",
      outcome: "ok",
      extra: { kind, processingStatus },
    });
    res.json(toPersisted(updated!));
  } catch (err) {
    try {
      const [failed] = await db
        .update(messageAttachmentsTable)
        .set({
          processingStatus: "failed",
          uploadStatus: "uploaded",
          availabilityStatus: "active",
          expiresAt: new Date(
            Date.now() + ATTACHMENT_PENDING_TTL_DAYS * 24 * 60 * 60 * 1000,
          ),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(messageAttachmentsTable.id, id),
            eq(messageAttachmentsTable.userId, userId),
          ),
        )
        .returning();
      if (failed) {
        auditLog({
          attachmentId: id,
          userId,
          route: "finalize",
          outcome: "processing_failed",
        });
        res.json(toPersisted(failed));
        return;
      }
    } catch {
      /* fall through */
    }
    auditLog({ attachmentId: id, userId, route: "finalize", outcome: "error" });
    logger.error({ err, id, userId }, "attachments/finalize failed");
    res.status(500).json({ error: "Failed to finalize attachment" });
  }
});

router.get(
  "/attachments/message/:messageId",
  async (req, res): Promise<void> => {
    const userId = (req as any).authUser?.id as number | undefined;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const messageIdRaw = String(req.params.messageId || "");
    const messageIdNum = Number(messageIdRaw);
    if (!Number.isFinite(messageIdNum) || messageIdNum <= 0) {
      res.status(400).json({ error: "Invalid messageId" });
      return;
    }

    try {
      const [nexusMsg] = await db
        .select({
          id: nexusMessagesTable.id,
          userId: nexusMessagesTable.userId,
        })
        .from(nexusMessagesTable)
        .where(eq(nexusMessagesTable.id, messageIdNum))
        .limit(1);

      let allowed = nexusMsg?.userId === userId;
      if (!allowed) {
        const [chatMsg] = await db
          .select({
            id: chatMessagesTable.id,
            sessionId: chatMessagesTable.sessionId,
          })
          .from(chatMessagesTable)
          .where(eq(chatMessagesTable.id, messageIdNum))
          .limit(1);
        if (chatMsg) {
          const [session] = await db
            .select({
              id: sessionsTable.id,
              projectId: sessionsTable.projectId,
              userId: sessionsTable.userId,
            })
            .from(sessionsTable)
            .where(eq(sessionsTable.id, chatMsg.sessionId))
            .limit(1);
          if (session) {
            if (session.projectId == null) {
              allowed = session.userId === userId;
            } else {
              const [proj] = await db
                .select({ userId: projectsTable.userId })
                .from(projectsTable)
                .where(eq(projectsTable.id, session.projectId))
                .limit(1);
              allowed = proj?.userId === userId;
            }
          }
        }
      }

      const rows = await db
        .select()
        .from(messageAttachmentsTable)
        .where(
          and(
            eq(messageAttachmentsTable.userId, userId),
            or(
              eq(messageAttachmentsTable.nexusMessageId, messageIdNum),
              eq(messageAttachmentsTable.chatMessageId, messageIdNum),
            ),
          ),
        );

      if (!allowed && rows.length === 0) {
        auditLog({
          attachmentId: null,
          userId,
          route: "list-for-message",
          outcome: "not_found",
          extra: { messageId: messageIdNum },
        });
        res.status(404).json({ error: "Not found" });
        return;
      }

      auditLog({
        attachmentId: null,
        userId,
        route: "list-for-message",
        outcome: "ok",
        extra: { messageId: messageIdNum, count: rows.length },
      });
      res.json(rows.map((r) => toPersisted(r)));
    } catch (err) {
      logger.error(
        { err, messageId: messageIdRaw, userId },
        "attachments/message list failed",
      );
      res.status(500).json({ error: "Failed to list attachments" });
    }
  },
);

router.get("/attachments/:id/open-url", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const id = String(req.params.id || "");
  const row = await loadOwnedAttachment(id, userId);
  if (!row) {
    auditLog({ attachmentId: id, userId, route: "open-url", outcome: "not_found" });
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (row.availabilityStatus === "expired" || row.uploadStatus !== "uploaded") {
    auditLog({
      attachmentId: id,
      userId,
      route: "open-url",
      outcome: "unavailable",
    });
    res.status(410).json({ error: "File expired or not available" });
    return;
  }

  try {
    const { bucketName, objectName } = resolveStoredObject({
      storageBucket: row.storageBucket,
      storagePath: row.storagePath,
    });
    const signed = await signAttachmentReadUrl({ bucketName, objectName });
    auditLog({ attachmentId: id, userId, route: "open-url", outcome: "ok" });
    res.json(signed);
  } catch (err) {
    auditLog({ attachmentId: id, userId, route: "open-url", outcome: "error" });
    logger.error({ err, id, userId }, "attachments/open-url failed");
    res.status(500).json({ error: "Failed to mint open URL" });
  }
});

router.post("/attachments/:id/use-again", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const id = String(req.params.id || "");
  const row = await loadOwnedAttachment(id, userId);
  if (!row) {
    auditLog({ attachmentId: id, userId, route: "use-again", outcome: "not_found" });
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (row.availabilityStatus === "expired") {
    auditLog({ attachmentId: id, userId, route: "use-again", outcome: "expired" });
    res.status(410).json({ error: "File expired" });
    return;
  }
  if (
    row.processingStatus === "unsupported" ||
    row.processingStatus === "failed"
  ) {
    auditLog({
      attachmentId: id,
      userId,
      route: "use-again",
      outcome: "not_usable",
    });
    res.status(400).json({ error: "Attachment cannot be used with the model" });
    return;
  }

  auditLog({ attachmentId: id, userId, route: "use-again", outcome: "ok" });
  res.json({ attachmentId: id });
});

router.post(
  "/attachments/:id/save-to-library",
  async (req, res): Promise<void> => {
    const userId = (req as any).authUser?.id as number | undefined;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const id = String(req.params.id || "");
    const row = await loadOwnedAttachment(id, userId);
    if (!row) {
      auditLog({
        attachmentId: id,
        userId,
        route: "save-to-library",
        outcome: "not_found",
      });
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (row.availabilityStatus === "expired") {
      auditLog({
        attachmentId: id,
        userId,
        route: "save-to-library",
        outcome: "expired",
      });
      res.status(410).json({ error: "File expired" });
      return;
    }

    try {
      if (row.availabilityStatus === "library" && row.libraryItemId) {
        auditLog({
          attachmentId: id,
          userId,
          route: "save-to-library",
          outcome: "already_library",
        });
        res.json(toPersisted(row));
        return;
      }

      const [libItem] = await db
        .insert(libraryItemsTable)
        .values({
          userId,
          projectId: row.projectId,
          kind: libraryKindForAttachment(row.kind),
          title: row.filename,
          content: null,
          preview: `${row.filename} (${row.mimeType})`,
          originSource: row.surface === "nexus" ? "workspace" : "ask-atlas",
          originConversationId: row.conversationId,
          originMessageId:
            row.nexusMessageId != null
              ? String(row.nexusMessageId)
              : row.chatMessageId != null
                ? String(row.chatMessageId)
                : null,
          artifactType: row.kind,
        })
        .returning();

      const [updated] = await db
        .update(messageAttachmentsTable)
        .set({
          availabilityStatus: "library",
          expiresAt: null,
          libraryItemId: libItem!.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(messageAttachmentsTable.id, id),
            eq(messageAttachmentsTable.userId, userId),
          ),
        )
        .returning();

      auditLog({
        attachmentId: id,
        userId,
        route: "save-to-library",
        outcome: "ok",
        extra: { libraryItemId: libItem!.id },
      });
      res.json(toPersisted(updated!));
    } catch (err) {
      auditLog({
        attachmentId: id,
        userId,
        route: "save-to-library",
        outcome: "error",
      });
      logger.error({ err, id, userId }, "attachments/save-to-library failed");
      res.status(500).json({ error: "Failed to save to library" });
    }
  },
);

router.get("/attachments/:id/download", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const id = String(req.params.id || "");
  const row = await loadOwnedAttachment(id, userId);
  if (!row) {
    auditLog({ attachmentId: id, userId, route: "download", outcome: "not_found" });
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (row.availabilityStatus === "expired" || row.uploadStatus !== "uploaded") {
    auditLog({
      attachmentId: id,
      userId,
      route: "download",
      outcome: "unavailable",
    });
    res.status(410).json({ error: "File expired or not available" });
    return;
  }

  try {
    const { bucketName, objectName } = resolveStoredObject({
      storageBucket: row.storageBucket,
      storagePath: row.storagePath,
    });
    try {
      const signed = await signAttachmentReadUrl({ bucketName, objectName });
      auditLog({ attachmentId: id, userId, route: "download", outcome: "redirect" });
      res.redirect(302, signed.url);
      return;
    } catch (signErr) {
      logger.warn(
        { err: signErr, id },
        "attachments/download: signed URL failed; streaming",
      );
    }

    const buffer = await downloadAttachmentBytes({
      storageBucket: row.storageBucket,
      storagePath: row.storagePath,
    });
    auditLog({ attachmentId: id, userId, route: "download", outcome: "stream" });
    res.setHeader("Content-Type", row.mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${row.filename.replace(/"/g, "")}"`,
    );
    res.setHeader("Content-Length", String(buffer.length));
    res.status(200).send(buffer);
  } catch (err) {
    auditLog({ attachmentId: id, userId, route: "download", outcome: "error" });
    logger.error({ err, id, userId }, "attachments/download failed");
    res.status(500).json({ error: "Failed to download attachment" });
  }
});

export default router;
