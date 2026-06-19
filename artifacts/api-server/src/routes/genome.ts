import { Router, type IRouter } from "express";
import { db, projectGenomeTable, projectsTable, entriesTable, nexusMessagesTable, chatMessagesTable, sessionsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { runGenomeExtraction, isOnCooldown } from "../lib/genomeExtract";
import { GENOME_STAGES, OBJECT_TYPES } from "@workspace/db";
import type { GenomeStage } from "@workspace/db";

const router: IRouter = Router();

function parseProjectId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function assertProjectOwner(projectId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);
  return !!row;
}

function validStage(s: unknown): GenomeStage {
  if (typeof s === "string" && GENOME_STAGES.includes(s as GenomeStage)) return s as GenomeStage;
  return "Think";
}

function clampConfidence(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function serializeGenome(row: typeof projectGenomeTable.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    purpose: row.purpose,
    coreEmotion: row.coreEmotion,
    audience: row.audience,
    identity: row.identity,
    constraints: row.constraints ?? [],
    openQuestions: row.openQuestions ?? [],
    stage: row.stage,
    confidenceScore: row.confidenceScore,
    lastEvolvedAt: row.lastEvolvedAt?.toISOString() ?? null,
    lastExtractedAt: row.lastExtractedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getOrCreateGenome(projectId: number) {
  const [existing] = await db
    .select()
    .from(projectGenomeTable)
    .where(eq(projectGenomeTable.projectId, projectId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(projectGenomeTable)
    .values({ projectId })
    .returning();

  return created;
}

// GET /api/projects/:id/genome
router.get("/projects/:id/genome", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const projectId = parseProjectId(req.params.id);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }

    const owns = await assertProjectOwner(projectId, userId);
    if (!owns) { res.status(404).json({ error: "Project not found" }); return; }

    const genome = await getOrCreateGenome(projectId);
    res.json(serializeGenome(genome));
  } catch (err) {
    req.log?.error({ err }, "genome GET error");
    res.status(500).json({ error: "Failed to fetch genome" });
  }
});

// PATCH /api/projects/:id/genome
router.patch("/projects/:id/genome", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const projectId = parseProjectId(req.params.id);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }

    const owns = await assertProjectOwner(projectId, userId);
    if (!owns) { res.status(404).json({ error: "Project not found" }); return; }

    const body = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    if ("purpose" in body) update.purpose = typeof body.purpose === "string" ? body.purpose : null;
    if ("coreEmotion" in body) update.coreEmotion = typeof body.coreEmotion === "string" ? body.coreEmotion : null;
    if ("audience" in body) update.audience = typeof body.audience === "string" ? body.audience : null;
    if ("identity" in body) update.identity = typeof body.identity === "string" ? body.identity : null;
    if ("constraints" in body && Array.isArray(body.constraints)) update.constraints = body.constraints.filter((x: unknown) => typeof x === "string").slice(0, 5);
    if ("openQuestions" in body && Array.isArray(body.openQuestions)) update.openQuestions = body.openQuestions.filter((x: unknown) => typeof x === "string").slice(0, 5);
    if ("stage" in body) update.stage = validStage(body.stage);
    if ("confidenceScore" in body) update.confidenceScore = clampConfidence(body.confidenceScore);

    if (Object.keys(update).length === 0) {
      const genome = await getOrCreateGenome(projectId);
      res.json(serializeGenome(genome));
      return;
    }

    const [existing] = await db
      .select({ id: projectGenomeTable.id })
      .from(projectGenomeTable)
      .where(eq(projectGenomeTable.projectId, projectId))
      .limit(1);

    if (existing) {
      await db.update(projectGenomeTable).set(update).where(eq(projectGenomeTable.projectId, projectId));
    } else {
      await db.insert(projectGenomeTable).values({ projectId, ...update });
    }

    const genome = await getOrCreateGenome(projectId);
    res.json(serializeGenome(genome));
  } catch (err) {
    req.log?.error({ err }, "genome PATCH error");
    res.status(500).json({ error: "Failed to update genome" });
  }
});

// POST /api/projects/:id/genome/extract
router.post("/projects/:id/genome/extract", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const projectId = parseProjectId(req.params.id);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }

    const owns = await assertProjectOwner(projectId, userId);
    if (!owns) { res.status(404).json({ error: "Project not found" }); return; }

    const force = (req.body as Record<string, unknown>)?.force === true;
    if (!force && isOnCooldown(projectId)) {
      const genome = await getOrCreateGenome(projectId);
      res.json({ genome: serializeGenome(genome), skipped: true, reason: "cooldown" });
      return;
    }

    await runGenomeExtraction(projectId);

    const genome = await getOrCreateGenome(projectId);
    res.json({ genome: serializeGenome(genome), skipped: false });
  } catch (err) {
    req.log?.error({ err }, "genome extract error");
    res.status(500).json({ error: "Extraction failed" });
  }
});

// GET /api/projects/:id/objects — typed entries (Universal Object System)
router.get("/projects/:id/objects", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const projectId = parseProjectId(req.params.id);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }

    const owns = await assertProjectOwner(projectId, userId);
    if (!owns) { res.status(404).json({ error: "Project not found" }); return; }

    const typeFilter = req.query.type as string | undefined;

    const rows = await db
      .select({
        id: entriesTable.id,
        type: entriesTable.type,
        title: entriesTable.title,
        summary: entriesTable.summary,
        status: entriesTable.status,
        createdAt: entriesTable.createdAt,
      })
      .from(entriesTable)
      .where(
        typeFilter && OBJECT_TYPES.includes(typeFilter as (typeof OBJECT_TYPES)[number])
          ? and(eq(entriesTable.projectId, projectId), eq(entriesTable.type, typeFilter))
          : eq(entriesTable.projectId, projectId),
      )
      .orderBy(desc(entriesTable.createdAt))
      .limit(100);

    res.json(rows.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log?.error({ err }, "objects GET error");
    res.status(500).json({ error: "Failed to fetch objects" });
  }
});

export default router;
