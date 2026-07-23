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
        SELECT id, conversation_id, turn_index, headline, body, category, confidence, is_stable, created_at
        FROM thinking_receipts
        WHERE user_id = ${userId}
          AND conversation_id = ${conversationId}
          AND dismissed = false
        ORDER BY created_at DESC
        LIMIT ${lim}
      `)
    : await db.execute(sql`
        SELECT id, conversation_id, turn_index, headline, body, category, confidence, is_stable, created_at
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

// GET /projects/:id/thinking-receipts
// Returns receipts from (a) the Ask Joy conversation that created this project
// and (b) all workspace session turns for this project — unified into one stream.
router.get("/projects/:id/thinking-receipts", async (req, res): Promise<void> => {
  const userId = (req as any).authUser.id as number;
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }

  // Resolve the project's source Ask Joy conversation ID (may be null)
  const projectRow = await db.execute(sql`
    SELECT conversation_id
    FROM projects
    WHERE id = ${projectId} AND user_id = ${userId}
    LIMIT 1
  `);
  const row = (projectRow.rows ?? projectRow)[0] as { conversation_id?: string | null } | undefined;
  const sourceConversationId = row?.conversation_id ?? null;

  // Query both Ask Joy receipts (via projects.conversation_id) and workspace
  // session receipts (stored as 'ws-<sessionId>' conversation IDs) in one pass.
  const result = await db.execute(sql`
    SELECT id, conversation_id, turn_index, headline, body, category, confidence, is_stable, created_at
    FROM thinking_receipts
    WHERE user_id = ${userId}
      AND dismissed = false
      AND (
        ${sourceConversationId ? sql`conversation_id = ${sourceConversationId} OR` : sql``}
        conversation_id IN (
          SELECT 'ws-' || id::text FROM sessions WHERE project_id = ${projectId}
        )
      )
    ORDER BY created_at ASC
    LIMIT 30
  `);

  res.json(result.rows ?? result);
});

export default router;
