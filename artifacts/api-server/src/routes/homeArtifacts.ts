import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { dualWriteHomeArtifact, deleteLibraryByLegacy } from "../lib/library";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /api/home-artifacts — list all saved artifacts for the user
router.get("/home-artifacts", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }

  try {
    const rows = await db.execute(sql`
      SELECT id, type, title, content, conversation_id, created_at, updated_at
      FROM home_artifacts
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 100
    `);
    res.json({ artifacts: rows.rows });
  } catch {
    res.json({ artifacts: [] });
  }
});

// POST /api/home-artifacts — save a new artifact (dual-writes to library_items)
router.post("/home-artifacts", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }

  const { type, title, content, conversationId } = req.body as {
    type?: string;
    title?: string;
    content?: string;
    conversationId?: string | null;
  };

  if (!title?.trim() || !content?.trim()) {
    res.status(400).json({ error: "title and content are required" });
    return;
  }

  try {
    const result = await db.execute(sql`
      INSERT INTO home_artifacts (user_id, type, title, content, conversation_id)
      VALUES (
        ${userId},
        ${(type ?? "document").trim()},
        ${title.trim()},
        ${content.trim()},
        ${conversationId ?? null}
      )
      RETURNING id, type, title, content, conversation_id, created_at, updated_at
    `);
    const artifact = result.rows[0] as {
      id: number;
      type: string;
      title: string;
      content: string;
      conversation_id: string | null;
    };

    // Dual-write to canonical library_items (best-effort; legacy row is source of truth until cutover)
    dualWriteHomeArtifact({
      userId,
      legacyId: artifact.id,
      kind: artifact.type,
      title: artifact.title,
      content: artifact.content,
      conversationId: artifact.conversation_id,
    }).catch((err) => {
      logger.warn({ err, legacyId: artifact.id }, "home-artifacts dual-write to library_items failed");
    });

    res.status(201).json({ artifact: result.rows[0] });
  } catch (err) {
    req.log?.error({ err }, "Failed to save home artifact");
    res.status(500).json({ error: "Failed to save artifact" });
  }
});

// DELETE /api/home-artifacts/:id
router.delete("/home-artifacts/:id", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const result = await db.execute(sql`
      DELETE FROM home_artifacts
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id
    `);
    if (!result.rows.length) { res.status(404).json({ error: "Not found" }); return; }

    deleteLibraryByLegacy("home_artifacts", id, userId).catch((err) => {
      logger.warn({ err, legacyId: id }, "home-artifacts dual-delete from library_items failed");
    });

    res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "Failed to delete home artifact");
    res.status(500).json({ error: "Failed to delete artifact" });
  }
});

export default router;
