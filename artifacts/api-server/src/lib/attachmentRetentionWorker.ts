/**
 * Attachment retention worker.
 *
 * Hourly:
 *   1. Flip active -> expiring when expires_at < now() + 7d
 *   2. Flip active/expiring -> expired when expires_at < now()
 *   3. Delete storage objects for rows that just became expired (keep DB row)
 *
 * Library rows (availability_status='library', expires_at IS NULL) are exempt.
 */

import { db, messageAttachmentsTable } from "@workspace/db";
import { and, eq, gte, isNotNull, lt, or } from "drizzle-orm";
import { logger } from "./logger";
import {
  ATTACHMENT_EXPIRING_SOON_DAYS,
  deleteAttachmentObject,
} from "./attachmentStorage";

const POLL_INTERVAL_MS = 60 * 60 * 1000;
const STARTUP_DELAY_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export async function runAttachmentRetentionPass(): Promise<{
  markedExpiring: number;
  markedExpired: number;
  objectsDeleted: number;
}> {
  const now = new Date();
  const expiringThreshold = new Date(
    now.getTime() + ATTACHMENT_EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000,
  );

  const expiringRows = await db
    .update(messageAttachmentsTable)
    .set({
      availabilityStatus: "expiring",
      updatedAt: now,
    })
    .where(
      and(
        eq(messageAttachmentsTable.availabilityStatus, "active"),
        isNotNull(messageAttachmentsTable.expiresAt),
        lt(messageAttachmentsTable.expiresAt, expiringThreshold),
        gte(messageAttachmentsTable.expiresAt, now),
      ),
    )
    .returning({ id: messageAttachmentsTable.id });

  const expiredRows = await db
    .update(messageAttachmentsTable)
    .set({
      availabilityStatus: "expired",
      updatedAt: now,
    })
    .where(
      and(
        or(
          eq(messageAttachmentsTable.availabilityStatus, "active"),
          eq(messageAttachmentsTable.availabilityStatus, "expiring"),
        ),
        isNotNull(messageAttachmentsTable.expiresAt),
        lt(messageAttachmentsTable.expiresAt, now),
      ),
    )
    .returning({
      id: messageAttachmentsTable.id,
      storageBucket: messageAttachmentsTable.storageBucket,
      storagePath: messageAttachmentsTable.storagePath,
    });

  let objectsDeleted = 0;
  for (const row of expiredRows) {
    try {
      await deleteAttachmentObject({
        storageBucket: row.storageBucket,
        storagePath: row.storagePath,
      });
      objectsDeleted += 1;
    } catch (err) {
      logger.warn(
        { err, attachmentId: row.id },
        "attachmentRetention: object delete failed",
      );
    }
  }

  return {
    markedExpiring: expiringRows.length,
    markedExpired: expiredRows.length,
    objectsDeleted,
  };
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await runAttachmentRetentionPass();
    if (
      result.markedExpiring > 0 ||
      result.markedExpired > 0 ||
      result.objectsDeleted > 0
    ) {
      logger.info(result, "attachmentRetention: pass complete");
    }
  } catch (err) {
    logger.warn({ err }, "attachmentRetention: pass failed");
  } finally {
    running = false;
  }
}

export function startAttachmentRetentionWorker(): void {
  if (timer) return;
  logger.info("attachmentRetention: worker starting (hourly)");
  setTimeout(() => {
    void tick();
    timer = setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}
