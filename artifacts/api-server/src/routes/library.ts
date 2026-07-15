/**
 * Canonical Library API
 *
 * Routes:
 *   GET    /api/library
 *   POST   /api/library
 *   GET    /api/library/:id
 *   PATCH  /api/library/:id
 *   DELETE /api/library/:id
 *   POST   /api/library/:id/context
 *   DELETE /api/library/:id/context/:conversationId
 *   GET    /api/conversations/:id/context
 */
import { Router, type IRouter } from "express";
import { db, projectsTable, LIBRARY_ITEM_KINDS } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  rowToLibraryItem,
  truncatePreview,
  normalizeKind,
  normalizeOriginSource,
  encodeLibraryCursor,
  decodeLibraryCursor,
  projectNameMap,
  isUuid,
  type LibraryItemApi,
} from "../lib/library";

const router: IRouter = Router();

async function projectBelongsToUser(projectId: number, userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

function parseKinds(raw: unknown): string[] | null {
  if (raw == null || raw === "") return null;
  const list = Array.isArray(raw) ? raw : [raw];
  const kinds = list
    .flatMap((v) => String(v).split(","))
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (!kinds.length) return null;
  const invalid = kinds.filter((k) => !(LIBRARY_ITEM_KINDS as readonly string[]).includes(k));
  if (invalid.length) return null;
  return kinds;
}

type DbLibraryRow = {
  id: string;
  kind: string;
  title: string;
  content: string | null;
  preview: string;
  project_id: number | null;
  origin_source: string;
  origin_conversation_id: string | null;
  origin_message_id: string | null;
  legacy_source: string | null;
  legacy_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

async function hydrateItems(
  userId: number,
  rows: DbLibraryRow[],
  opts?: { includeContent?: boolean },
): Promise<LibraryItemApi[]> {
  const names = await projectNameMap(
    userId,
    rows.map((r) => r.project_id).filter((id): id is number => id != null),
  );
  return rows.map((r) =>
    rowToLibraryItem(
      {
        ...r,
        projectName: r.project_id != null ? names.get(r.project_id) : undefined,
      },
      opts,
    ),
  );
}

// GET /api/library
router.get("/library", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }

  const projectIdRaw = req.query.projectId;
  const kinds = parseKinds(req.query.kind);
  if (req.query.kind != null && req.query.kind !== "" && kinds == null) {
    res.status(400).json({ error: `kind must be one of: ${LIBRARY_ITEM_KINDS.join(", ")}` });
    return;
  }

  let limit = Number(req.query.limit ?? 50);
  if (!Number.isFinite(limit) || limit < 1) limit = 50;
  limit = Math.min(Math.floor(limit), 100);

  const cursorRaw = typeof req.query.cursor === "string" ? req.query.cursor : null;
  const cursor = cursorRaw ? decodeLibraryCursor(cursorRaw) : null;
  if (cursorRaw && !cursor) {
    res.status(400).json({ error: "Invalid cursor" });
    return;
  }

  const conditions: ReturnType<typeof sql>[] = [sql`li.user_id = ${userId}`];

  if (projectIdRaw === "null") {
    conditions.push(sql`li.project_id IS NULL`);
  } else if (projectIdRaw != null && projectIdRaw !== "") {
    const projectId = Number(projectIdRaw);
    if (!Number.isFinite(projectId)) {
      res.status(400).json({ error: "projectId must be a number or 'null'" });
      return;
    }
    conditions.push(sql`li.project_id = ${projectId}`);
  }

  if (kinds?.length) {
    conditions.push(sql`li.kind IN (${sql.join(kinds.map((k) => sql`${k}`), sql`, `)})`);
  }

  if (cursor) {
    conditions.push(sql`(
      li.created_at < ${cursor.createdAt}::timestamptz
      OR (li.created_at = ${cursor.createdAt}::timestamptz AND li.id < ${cursor.id}::uuid)
    )`);
  }

  const whereSql = sql.join(conditions, sql` AND `);

  try {
    const result = await db.execute(sql`
      SELECT
        li.id, li.kind, li.title, li.content, li.preview,
        li.project_id, li.origin_source, li.origin_conversation_id,
        li.origin_message_id, li.legacy_source, li.legacy_id,
        li.created_at, li.updated_at
      FROM library_items li
      WHERE ${whereSql}
      ORDER BY li.created_at DESC, li.id DESC
      LIMIT ${limit + 1}
    `);

    const rows = result.rows as DbLibraryRow[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items = await hydrateItems(userId, page);
    const last = page[page.length - 1];
    const nextCursor = hasMore && last
      ? encodeLibraryCursor(last.created_at, String(last.id))
      : null;

    res.json({ items, nextCursor });
  } catch (err) {
    logger.error({ err }, "GET /library failed");
    res.status(500).json({ error: "Failed to list library items" });
  }
});

// POST /api/library — create (workspace + Ask Atlas save going forward)
router.post("/library", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }

  const body = req.body as {
    kind?: string;
    title?: string;
    content?: string | null;
    projectId?: number | null;
    origin?: {
      source?: string;
      conversationId?: string | null;
      messageId?: string | null;
    };
  };

  if (!body.title?.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const kind = normalizeKind(body.kind ?? "document");
  if (
    body.kind
    && !(LIBRARY_ITEM_KINDS as readonly string[]).includes(body.kind.toLowerCase().trim())
  ) {
    res.status(400).json({ error: `kind must be one of: ${LIBRARY_ITEM_KINDS.join(", ")}` });
    return;
  }

  const projectId = body.projectId === undefined || body.projectId === null
    ? null
    : Number(body.projectId);
  if (projectId != null) {
    if (!Number.isFinite(projectId)) {
      res.status(400).json({ error: "Invalid projectId" });
      return;
    }
    if (!(await projectBelongsToUser(projectId, userId))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
  }

  const content = body.content?.trim() ? body.content.trim() : null;
  const preview = truncatePreview(content || body.title);
  const originSource = normalizeOriginSource(body.origin?.source ?? (projectId != null ? "workspace" : "ask-atlas"));
  const conversationId = body.origin?.conversationId ?? null;
  const messageId = body.origin?.messageId != null ? String(body.origin.messageId) : null;

  try {
    const result = await db.execute(sql`
      INSERT INTO library_items (
        user_id, project_id, kind, title, content, preview,
        origin_source, origin_conversation_id, origin_message_id
      )
      VALUES (
        ${userId},
        ${projectId},
        ${kind},
        ${body.title.trim()},
        ${content},
        ${preview},
        ${originSource},
        ${conversationId},
        ${messageId}
      )
      RETURNING
        id, kind, title, content, preview, project_id,
        origin_source, origin_conversation_id, origin_message_id,
        legacy_source, legacy_id, created_at, updated_at
    `);
    const row = result.rows[0] as DbLibraryRow;
    const [item] = await hydrateItems(userId, [row]);
    res.status(201).json({ item });
  } catch (err) {
    logger.error({ err }, "POST /library failed");
    res.status(500).json({ error: "Failed to create library item" });
  }
});

// GET /api/library/:id
router.get("/library/:id", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }

  const id = req.params.id;
  if (!isUuid(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const result = await db.execute(sql`
      SELECT
        id, kind, title, content, preview, project_id,
        origin_source, origin_conversation_id, origin_message_id,
        legacy_source, legacy_id, created_at, updated_at
      FROM library_items
      WHERE id = ${id}::uuid AND user_id = ${userId}
      LIMIT 1
    `);
    if (!result.rows.length) { res.status(404).json({ error: "Not found" }); return; }
    const [item] = await hydrateItems(userId, result.rows as DbLibraryRow[]);
    res.json({ item });
  } catch (err) {
    logger.error({ err }, "GET /library/:id failed");
    res.status(500).json({ error: "Failed to fetch library item" });
  }
});

// PATCH /api/library/:id — title, kind
router.patch("/library/:id", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }

  const id = req.params.id;
  if (!isUuid(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = req.body as { title?: string; kind?: string };
  if (body.title === undefined && body.kind === undefined) {
    res.status(400).json({ error: "title or kind is required" });
    return;
  }

  const sets: ReturnType<typeof sql>[] = [sql`updated_at = now()`];
  if (body.title !== undefined) {
    if (!body.title.trim()) {
      res.status(400).json({ error: "title cannot be empty" });
      return;
    }
    sets.push(sql`title = ${body.title.trim()}`);
  }
  if (body.kind !== undefined) {
    const kind = normalizeKind(body.kind);
    if (!(LIBRARY_ITEM_KINDS as readonly string[]).includes(body.kind.toLowerCase().trim())) {
      res.status(400).json({ error: `kind must be one of: ${LIBRARY_ITEM_KINDS.join(", ")}` });
      return;
    }
    sets.push(sql`kind = ${kind}`);
  }

  try {
    const result = await db.execute(sql`
      UPDATE library_items
      SET ${sql.join(sets, sql`, `)}
      WHERE id = ${id}::uuid AND user_id = ${userId}
      RETURNING
        id, kind, title, content, preview, project_id,
        origin_source, origin_conversation_id, origin_message_id,
        legacy_source, legacy_id, created_at, updated_at
    `);
    if (!result.rows.length) { res.status(404).json({ error: "Not found" }); return; }
    const [item] = await hydrateItems(userId, result.rows as DbLibraryRow[]);
    res.json({ item });
  } catch (err) {
    logger.error({ err }, "PATCH /library/:id failed");
    res.status(500).json({ error: "Failed to update library item" });
  }
});

// DELETE /api/library/:id
router.delete("/library/:id", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }

  const id = req.params.id;
  if (!isUuid(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const result = await db.execute(sql`
      DELETE FROM library_items
      WHERE id = ${id}::uuid AND user_id = ${userId}
      RETURNING id, legacy_source, legacy_id
    `);
    if (!result.rows.length) { res.status(404).json({ error: "Not found" }); return; }

    const deleted = result.rows[0] as {
      id: string;
      legacy_source: string | null;
      legacy_id: string | null;
    };

    // Keep legacy tables in sync while dual-write is active
    if (deleted.legacy_source === "home_artifacts" && deleted.legacy_id) {
      const legacyId = Number(deleted.legacy_id);
      if (Number.isFinite(legacyId)) {
        await db.execute(sql`
          DELETE FROM home_artifacts WHERE id = ${legacyId} AND user_id = ${userId}
        `).catch(() => undefined);
      }
    } else if (deleted.legacy_source === "project_bookmarks" && deleted.legacy_id) {
      const legacyId = Number(deleted.legacy_id);
      if (Number.isFinite(legacyId)) {
        await db.execute(sql`
          DELETE FROM project_bookmarks WHERE id = ${legacyId} AND user_id = ${userId}
        `).catch(() => undefined);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /library/:id failed");
    res.status(500).json({ error: "Failed to delete library item" });
  }
});

// POST /api/library/:id/context — attach to conversation (no duplication)
router.post("/library/:id/context", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }

  const id = req.params.id;
  if (!isUuid(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const conversationId = (req.body as { conversationId?: string })?.conversationId?.trim();
  if (!conversationId) {
    res.status(400).json({ error: "conversationId is required" });
    return;
  }

  try {
    const owned = await db.execute(sql`
      SELECT id FROM library_items WHERE id = ${id}::uuid AND user_id = ${userId} LIMIT 1
    `);
    if (!owned.rows.length) { res.status(404).json({ error: "Not found" }); return; }

    // Re-attach if previously soft-detached; otherwise insert active row.
    const existing = await db.execute(sql`
      SELECT id, detached_at FROM conversation_context_items
      WHERE conversation_id = ${conversationId} AND library_item_id = ${id}::uuid
      ORDER BY attached_at DESC
      LIMIT 1
    `);

    if (existing.rows.length > 0) {
      const row = existing.rows[0] as { id: string; detached_at: string | null };
      if (row.detached_at == null) {
        res.status(200).json({ ok: true, alreadyAttached: true });
        return;
      }
      await db.execute(sql`
        UPDATE conversation_context_items
        SET detached_at = NULL, attached_at = now(), attached_by_user_id = ${userId}
        WHERE id = ${row.id}::uuid
      `);
      res.status(200).json({ ok: true, reattached: true });
      return;
    }

    await db.execute(sql`
      INSERT INTO conversation_context_items (
        conversation_id, library_item_id, attached_by_user_id
      )
      VALUES (${conversationId}, ${id}::uuid, ${userId})
    `);
    res.status(201).json({ ok: true });
  } catch (err) {
    logger.error({ err }, "POST /library/:id/context failed");
    res.status(500).json({ error: "Failed to attach library item" });
  }
});

// DELETE /api/library/:id/context/:conversationId — soft detach
router.delete("/library/:id/context/:conversationId", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }

  const id = req.params.id;
  const conversationId = req.params.conversationId;
  if (!isUuid(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!conversationId?.trim()) {
    res.status(400).json({ error: "conversationId is required" });
    return;
  }

  try {
    const owned = await db.execute(sql`
      SELECT id FROM library_items WHERE id = ${id}::uuid AND user_id = ${userId} LIMIT 1
    `);
    if (!owned.rows.length) { res.status(404).json({ error: "Not found" }); return; }

    const result = await db.execute(sql`
      UPDATE conversation_context_items
      SET detached_at = now()
      WHERE conversation_id = ${conversationId}
        AND library_item_id = ${id}::uuid
        AND detached_at IS NULL
      RETURNING id
    `);
    if (!result.rows.length) { res.status(404).json({ error: "Not attached" }); return; }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /library/:id/context/:conversationId failed");
    res.status(500).json({ error: "Failed to detach library item" });
  }
});

// GET /api/conversations/:id/context — currently attached items
router.get("/conversations/:id/context", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }

  const conversationId = req.params.id;
  if (!conversationId?.trim()) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  try {
    const result = await db.execute(sql`
      SELECT
        li.id, li.kind, li.title, li.content, li.preview, li.project_id,
        li.origin_source, li.origin_conversation_id, li.origin_message_id,
        li.legacy_source, li.legacy_id, li.created_at, li.updated_at
      FROM conversation_context_items cci
      JOIN library_items li ON li.id = cci.library_item_id
      WHERE cci.conversation_id = ${conversationId}
        AND cci.detached_at IS NULL
        AND li.user_id = ${userId}
      ORDER BY cci.attached_at ASC
    `);
    const items = await hydrateItems(userId, result.rows as DbLibraryRow[]);
    res.json({ items });
  } catch (err) {
    logger.error({ err }, "GET /conversations/:id/context failed");
    res.status(500).json({ error: "Failed to list conversation context" });
  }
});

export default router;
