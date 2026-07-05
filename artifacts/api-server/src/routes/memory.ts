import { Router } from "express";
import {
  db,
  projectTier1MemoryTable,
  PostTier1MemoryBodySchema,
  PutTier1MemoryBodySchema,
  serializeTier1Memory,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { assertProjectOwner } from "../lib/projectWorkspace";
import {
  answersToColumns,
  appendTier1LedgerEntry,
  loadTier1ForProject,
  upsertTier1,
} from "../services/tier1";

const router = Router();

function parseProjectId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

// POST /api/memory/tier1 — body: { projectId, answers: Tier1Answers }
router.post("/memory/tier1", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser?.id as number | undefined;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const parsed = PostTier1MemoryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
      return;
    }

    const { projectId, answers } = parsed.data;
    if (!(await assertProjectOwner(projectId, userId))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Upsert: if Atlas already wrote partial fields via tier1_upsert_field between
    // the time the intake sheet opened and the user hit Commit, the POST would have
    // returned 409. Use upsertTier1 so the commit always succeeds — existing fields
    // are overwritten with the user's explicit answers.
    const row = await upsertTier1(projectId, answers);

    await appendTier1LedgerEntry(projectId);
    logger.info({ projectId }, "Tier 1 memory committed (upsert)");
    res.status(201).json(serializeTier1Memory(row));
  } catch (err) {
    req.log.error({ err }, "POST /memory/tier1 failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/memory/tier1/:projectId → { answers, updatedAt, skippedAt, missing } | 404
router.get("/memory/tier1/:projectId", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser?.id as number | undefined;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const projectId = parseProjectId(req.params.projectId);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }
    if (!(await assertProjectOwner(projectId, userId))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const row = await loadTier1ForProject(projectId);
    if (!row) {
      res.status(404).json({ error: "Tier 1 memory not found" });
      return;
    }

    res.json(serializeTier1Memory(row));
  } catch (err) {
    req.log.error({ err }, "GET /memory/tier1/:projectId failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/memory/tier1/:projectId — body: { answers: Partial<Tier1Answers> }
router.put("/memory/tier1/:projectId", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser?.id as number | undefined;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const projectId = parseProjectId(req.params.projectId);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }
    if (!(await assertProjectOwner(projectId, userId))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const parsed = PutTier1MemoryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
      return;
    }

    const updates = answersToColumns(parsed.data.answers);
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No answer fields provided" });
      return;
    }

    const [row] = await db
      .update(projectTier1MemoryTable)
      .set(updates)
      .where(eq(projectTier1MemoryTable.projectId, projectId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Tier 1 memory not found" });
      return;
    }

    await appendTier1LedgerEntry(projectId);
    logger.info({ projectId, fields: Object.keys(updates) }, "Tier 1 memory updated");
    res.json(serializeTier1Memory(row));
  } catch (err) {
    req.log.error({ err }, "PUT /memory/tier1/:projectId failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
