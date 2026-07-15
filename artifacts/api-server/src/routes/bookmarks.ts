/**
 * Project Bookmarks
 *
 * User-pinned conversation snapshots — the server-persisted layer on top of
 * the client-side atlas-history localStorage store. Bookmarks survive
 * browser clears, new devices, and incognito sessions.
 *
 * Dual-writes to library_items (kind=bookmark) until frontend cutover.
 *
 * Routes:
 *   GET    /api/projects/:id/bookmarks         — list user's bookmarks
 *   POST   /api/projects/:id/bookmarks         — create bookmark
 *   DELETE /api/projects/:id/bookmarks/:localId — remove by local_id
 */
import { Router, type IRouter } from "express";
import { db, projectsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { dualWriteBookmark, deleteLibraryByLegacy } from "../lib/library";

const router: IRouter = Router();

async function projectBelongsToUser(
  projectId: number,
  userId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

router.get("/projects/:id/bookmarks", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }

  if (!(await projectBelongsToUser(projectId, userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  try {
    const rows = await db.execute(sql`
      SELECT id, project_id, user_id, message_id, local_id, title, lens, payload_json, created_at
      FROM project_bookmarks
      WHERE project_id = ${projectId} AND user_id = ${userId}
      ORDER BY created_at DESC
    `);
    res.json(rows.rows);
  } catch (err) {
    logger.error({ err }, "GET /projects/:id/bookmarks failed");
    res.status(500).json({ error: "Failed to fetch bookmarks" });
  }
});

router.post("/projects/:id/bookmarks", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }

  if (!(await projectBelongsToUser(projectId, userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const { messageId, localId, title, lens, payload } = req.body as {
    messageId?: number;
    localId?: string;
    title?: string;
    lens?: string;
    payload?: Record<string, unknown>;
  };

  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title is required" });
    return;
  }

  try {
    const payloadJson = payload ? JSON.stringify(payload) : null;

    const rows = await db.execute(sql`
      INSERT INTO project_bookmarks (project_id, user_id, message_id, local_id, title, lens, payload_json)
      VALUES (${projectId}, ${userId}, ${messageId ?? null}, ${localId ?? null}, ${title}, ${lens ?? null}, ${payloadJson})
      ON CONFLICT (project_id, user_id, local_id) DO UPDATE
        SET title = EXCLUDED.title,
            lens  = EXCLUDED.lens,
            payload_json = EXCLUDED.payload_json
      RETURNING id, project_id, user_id, message_id, local_id, title, lens, payload_json, created_at
    `);
    const bookmark = rows.rows[0] as {
      id: number;
      title: string;
      payload_json: string | null;
      message_id: number | null;
    };

    dualWriteBookmark({
      userId,
      projectId,
      legacyId: bookmark.id,
      title: bookmark.title,
      content: bookmark.payload_json,
      messageId: bookmark.message_id,
    }).catch((err) => {
      logger.warn({ err, legacyId: bookmark.id }, "bookmarks dual-write to library_items failed");
    });

    res.status(201).json(rows.rows[0]);
  } catch (err) {
    logger.error({ err }, "POST /projects/:id/bookmarks failed");
    res.status(500).json({ error: "Failed to create bookmark" });
  }
});

router.delete("/projects/:id/bookmarks/:localId", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }

  const localId = req.params.localId;

  try {
    const deleted = await db.execute(sql`
      DELETE FROM project_bookmarks
      WHERE project_id = ${projectId} AND user_id = ${userId} AND local_id = ${localId}
      RETURNING id
    `);
    const row = deleted.rows[0] as { id?: number } | undefined;
    if (row?.id != null) {
      deleteLibraryByLegacy("project_bookmarks", row.id, userId).catch((err) => {
        logger.warn({ err, legacyId: row.id }, "bookmarks dual-delete from library_items failed");
      });
    }
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "DELETE /projects/:id/bookmarks/:localId failed");
    res.status(500).json({ error: "Failed to delete bookmark" });
  }
});

export default router;
