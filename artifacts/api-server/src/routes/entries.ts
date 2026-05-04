import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, entriesTable } from "@workspace/db";
import {
  CreateEntryBody,
  CreateEntryParams,
  UpdateEntryBody,
  UpdateEntryParams,
  DeleteEntryParams,
  ListEntriesParams,
  ListEntriesQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/projects/:projectId/entries", async (req, res): Promise<void> => {
  const params = ListEntriesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const query = ListEntriesQueryParams.safeParse(req.query);

  const conditions = [eq(entriesTable.projectId, params.data.projectId)];
  if (query.success && query.data.status) {
    conditions.push(eq(entriesTable.status, query.data.status));
  }

  const entries = await db
    .select()
    .from(entriesTable)
    .where(and(...conditions))
    .orderBy(entriesTable.createdAt);

  res.json(entries.map(e => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  })));
});

router.post("/projects/:projectId/entries", async (req, res): Promise<void> => {
  const params = CreateEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [entry] = await db.insert(entriesTable).values({
    projectId: params.data.projectId,
    ...parsed.data,
  }).returning();
  res.status(201).json({
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  });
});

router.patch("/entries/:id", async (req, res): Promise<void> => {
  const params = UpdateEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [entry] = await db.update(entriesTable).set(parsed.data).where(eq(entriesTable.id, params.data.id)).returning();
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.json({
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  });
});

router.delete("/entries/:id", async (req, res): Promise<void> => {
  const params = DeleteEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(entriesTable).where(eq(entriesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
