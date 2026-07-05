import { Router } from "express";
import {
  db,
  projectsTable,
  projectTier1MemoryTable,
  entriesTable,
  PostTier1MemoryBodySchema,
  PutTier1MemoryBodySchema,
  serializeTier1Memory,
  type Tier1Answers,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

function parseProjectId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

async function assertProjectOwner(projectId: number, userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

async function appendTier1LedgerEntry(projectId: number): Promise<void> {
  await db.insert(entriesTable).values({
    projectId,
    type: "Decision",
    status: "committed",
    title: "Tier 1 memory set",
  });
}

function answersToColumns(answers: Partial<Tier1Answers>): Partial<typeof projectTier1MemoryTable.$inferInsert> {
  const cols: Partial<typeof projectTier1MemoryTable.$inferInsert> = {};
  if (answers.building !== undefined) cols.building = answers.building;
  if (answers.audience !== undefined) cols.audience = answers.audience;
  if (answers.problem !== undefined) cols.problem = answers.problem;
  if (answers.outOfScope !== undefined) cols.outOfScope = answers.outOfScope;
  if (answers.successSignal !== undefined) cols.successSignal = answers.successSignal;
  if (answers.constraints !== undefined) cols.constraints = answers.constraints;
  return cols;
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

    const existing = await db
      .select({ id: projectTier1MemoryTable.id })
      .from(projectTier1MemoryTable)
      .where(eq(projectTier1MemoryTable.projectId, projectId))
      .limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Tier 1 memory already exists for this project" });
      return;
    }

    const [row] = await db
      .insert(projectTier1MemoryTable)
      .values({ projectId, ...answersToColumns(answers) })
      .returning();

    await appendTier1LedgerEntry(projectId);
    logger.info({ projectId }, "Tier 1 memory created");
    res.status(201).json(serializeTier1Memory(row));
  } catch (err) {
    req.log.error({ err }, "POST /memory/tier1 failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/memory/tier1/:projectId → { answers, updatedAt } | 404
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

    const [row] = await db
      .select()
      .from(projectTier1MemoryTable)
      .where(eq(projectTier1MemoryTable.projectId, projectId))
      .limit(1);
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
