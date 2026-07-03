import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// GET /thinking-receipts?conversationId=<id>&limit=20
// Returns active (non-dismissed) receipts for the authenticated user.
router.get("/thinking-receipts", async (req, res): Promise<void> => {
  const userId = (req as any).authUser.id as number;
  const { conversationId, limit = "20" } = req.query as Record<string, string>;
  const lim = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

  const result = conversationId
    ? await db.execute(sql`
        SELECT id, conversation_id, turn_index, headline, body, category, confidence, created_at
        FROM thinking_receipts
        WHERE user_id = ${userId}
          AND conversation_id = ${conversationId}
          AND dismissed = false
        ORDER BY created_at DESC
        LIMIT ${lim}
      `)
    : await db.execute(sql`
        SELECT id, conversation_id, turn_index, headline, body, category, confidence, created_at
        FROM thinking_receipts
        WHERE user_id = ${userId}
          AND dismissed = false
        ORDER BY created_at DESC
        LIMIT ${lim}
      `);

  res.json(result.rows ?? result);
});

// PATCH /thinking-receipts/:id/dismiss — soft-delete a receipt
router.patch("/thinking-receipts/:id/dismiss", async (req, res): Promise<void> => {
  const userId = (req as any).authUser.id as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.execute(sql`
    UPDATE thinking_receipts
    SET dismissed = true
    WHERE id = ${id} AND user_id = ${userId}
  `);
  res.status(204).end();
});

// DELETE /thinking-receipts/:id — hard-delete a receipt
router.delete("/thinking-receipts/:id", async (req, res): Promise<void> => {
  const userId = (req as any).authUser.id as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.execute(sql`
    DELETE FROM thinking_receipts
    WHERE id = ${id} AND user_id = ${userId}
  `);
  res.status(204).end();
});

export default router;
