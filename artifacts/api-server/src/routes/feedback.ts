import { Router } from "express";
import { pool, db } from "@workspace/db";
import { messageFeedbackTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";

const router = Router();

async function ensureFeedbackTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_feedback (
      id          SERIAL PRIMARY KEY,
      message_id  INTEGER NOT NULL REFERENCES nexus_messages(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating      TEXT    NOT NULL,
      reason      TEXT,
      comment     TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

let tableReady = false;
async function getTableReady(): Promise<void> {
  if (tableReady) return;
  await ensureFeedbackTable();
  tableReady = true;
}

const feedbackBodySchema = z.object({
  rating: z.enum(["up", "down"]),
  reason: z.string().optional(),
  comment: z.string().optional(),
});

router.post("/messages/:messageId/feedback", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const messageId = parseInt(req.params.messageId, 10);
  if (isNaN(messageId)) { res.status(400).json({ error: "Invalid messageId" }); return; }

  const parsed = feedbackBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", issues: parsed.error.issues }); return; }

  const { rating, reason, comment } = parsed.data;

  await getTableReady();

  await db
    .delete(messageFeedbackTable)
    .where(
      and(
        eq(messageFeedbackTable.messageId, messageId),
        eq(messageFeedbackTable.userId, userId),
      ),
    );

  const [row] = await db
    .insert(messageFeedbackTable)
    .values({ messageId, userId, rating, reason: reason ?? null, comment: comment ?? null })
    .returning();

  req.log.info({ messageId, userId, rating, reason }, "message feedback saved");
  res.json({ ok: true, id: row.id });
});

router.get("/messages/:messageId/feedback", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const messageId = parseInt(req.params.messageId, 10);
  if (isNaN(messageId)) { res.status(400).json({ error: "Invalid messageId" }); return; }

  await getTableReady();

  const rows = await db
    .select()
    .from(messageFeedbackTable)
    .where(
      and(
        eq(messageFeedbackTable.messageId, messageId),
        eq(messageFeedbackTable.userId, userId),
      ),
    )
    .limit(1);

  res.json({ feedback: rows[0] ?? null });
});

export default router;
