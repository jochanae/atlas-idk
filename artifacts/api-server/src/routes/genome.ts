import { Router, type IRouter } from "express";
import { pushAtlasMdToRepo } from "../lib/projectMemory";
import { db, projectGenomeTable, projectsTable, entriesTable, nexusMessagesTable, chatMessagesTable, sessionsTable, applicationModelsTable } from "@workspace/db";
import { eq, and, desc, sql, count, ne, inArray, isNull } from "drizzle-orm";
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

type MomentumLevel = "Low" | "Medium" | "High";
type ConfidenceLevel = "Low" | "Medium" | "High";
export type AtlasState = "Discovering" | "Pressure Testing" | "Structuring" | "Building" | "Operating";

function momentumFromCount(n: number): MomentumLevel {
  if (n >= 16) return "High";
  if (n >= 6) return "Medium";
  return "Low";
}

function confidenceLevelFromScore(score: number): ConfidenceLevel {
  if (score >= 70) return "High";
  if (score >= 35) return "Medium";
  return "Low";
}

function computeAtlasState(
  stage: string,
  confidenceScore: number,
  openQuestionCount: number,
  constraintCount: number,
  blockerCount: number,
  recentMsgCount: number,
  objectCount: number,
): AtlasState {
  if (stage === "Operate" || stage === "Evolve") return "Operating";
  if (stage === "Build") return "Building";
  if (stage === "Workspace" || stage === "Strategize") return "Building";
  if (stage === "Decide") return "Structuring";
  if (stage === "Shape") {
    if (blockerCount > 0 || constraintCount > 1 || openQuestionCount > 2) return "Pressure Testing";
    return "Structuring";
  }
  // Think stage — differentiate Discovering vs Pressure Testing
  if (blockerCount > 0 || constraintCount > 0 || openQuestionCount > 2 || recentMsgCount > 8 || objectCount > 3) {
    return "Pressure Testing";
  }
  return "Discovering";
}

function nextActionForStage(stage: string, openQuestions: string[], constraints: string[]): string {
  const q = openQuestions[0] ?? null;
  const c = constraints[0] ?? null;
  switch (stage) {
    case "Think":      return q ?? "Start shaping your core idea — what problem are you solving?";
    case "Shape":      return q ? `Answer: ${q}` : "Define who needs this most and why it matters to them";
    case "Decide":     return c ? `Pressure-test: ${c}` : "Commit to your biggest assumption and test it";
    case "Workspace":  return q ?? "Set up your execution environment and define what 'done' means";
    case "Strategize": return q ?? "Define the phased approach — what comes first?";
    case "Build":      return "Pick one feature and ship it — learn from real usage";
    case "Operate":    return "Monitor and learn — what is the data telling you?";
    case "Evolve":     return "Identify the next evolution — what would 10x this?";
    default:           return q ?? "Keep the conversation going — Atlas is listening";
  }
}

/** Compute an additive clarity boost from Application Model richness (0–20 points). */
async function computeModelRichnessBoost(projectId: number): Promise<{ boost: number; source: string }> {
  try {
    const rows = await db
      .select({ identity: applicationModelsTable.identity, intent: applicationModelsTable.intent, pages: applicationModelsTable.pages })
      .from(applicationModelsTable)
      .where(eq(applicationModelsTable.projectId, projectId))
      .limit(1);
    if (rows.length === 0) return { boost: 0, source: "no model" };
    const { identity, intent, pages } = rows[0];
    let boost = 0;
    const parts: string[] = [];
    const id = (identity as Record<string, unknown>) ?? {};
    const it = (intent as Record<string, unknown>) ?? {};
    const pg = (pages as unknown[]) ?? [];
    if (id.name) { boost += 3; parts.push("named"); }
    if (id.purpose) { boost += 5; parts.push("purpose"); }
    if (id.audience) { boost += 4; parts.push("audience"); }
    if (it.summary) { boost += 4; parts.push("intent"); }
    if (Array.isArray(it.coreProblems) && (it.coreProblems as unknown[]).length > 0) { boost += 2; parts.push("problems"); }
    if (Array.isArray(it.keyOutcomes) && (it.keyOutcomes as unknown[]).length > 0) { boost += 2; parts.push("outcomes"); }
    if (pg.length > 0) { boost += Math.min(2, pg.length); parts.push(`${pg.length} pages`); }
    return { boost: Math.min(20, boost), source: parts.length > 0 ? parts.join(", ") : "sparse model" };
  } catch {
    return { boost: 0, source: "model unavailable" };
  }
}

async function computeProjectHealth(projectId: number, genome: typeof projectGenomeTable.$inferSelect) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [msgRow, blockerCountRow, objectCountRow, sessionCountRow, committedRow, parkedRow] = await Promise.all([
    db.select({ n: count() }).from(nexusMessagesTable).where(and(
      eq(nexusMessagesTable.projectId, projectId),
      sql`${nexusMessagesTable.messageType} IS DISTINCT FROM 'briefing'`,
      sql`${nexusMessagesTable.messageType} IS DISTINCT FROM 'reflection'`,
      sql`${nexusMessagesTable.createdAt} >= ${sevenDaysAgo.toISOString()}`,
    )).then(r => r[0]),
    db.select({ n: count() }).from(entriesTable).where(and(
      eq(entriesTable.projectId, projectId),
      eq(entriesTable.type, "Blocker"),
      ne(entriesTable.status, "archived"),
    )).then(r => r[0]),
    db.select({ n: count() }).from(entriesTable).where(and(
      eq(entriesTable.projectId, projectId),
      ne(entriesTable.status, "archived"),
    )).then(r => r[0]),
    db.select({ n: count() }).from(sessionsTable).where(
      eq(sessionsTable.projectId, projectId)
    ).then(r => r[0]),
    db.select({ n: count() }).from(entriesTable).where(and(
      eq(entriesTable.projectId, projectId),
      eq(entriesTable.status, "committed"),
    )).then(r => r[0]),
    db.select({ n: count() }).from(entriesTable).where(and(
      eq(entriesTable.projectId, projectId),
      eq(entriesTable.status, "parked"),
    )).then(r => r[0]),
  ]);

  // top blocker title for risk display
  const [topBlocker] = await db
    .select({ title: entriesTable.title })
    .from(entriesTable)
    .where(and(
      eq(entriesTable.projectId, projectId),
      eq(entriesTable.type, "Blocker"),
      ne(entriesTable.status, "archived"),
    ))
    .orderBy(desc(entriesTable.createdAt))
    .limit(1);

  const recentMsgCount = Number(msgRow?.n ?? 0);
  const blockerCount = Number(blockerCountRow?.n ?? 0);
  const objectCount = Number(objectCountRow?.n ?? 0);
  const totalSessions = Number(sessionCountRow?.n ?? 0);
  const committedDecisions = Number(committedRow?.n ?? 0);
  const parkedItems = Number(parkedRow?.n ?? 0);
  const constraints = genome.constraints ?? [];
  const openQuestions = genome.openQuestions ?? [];
  const risk = topBlocker?.title ?? constraints[0] ?? null;

  const atlasState = computeAtlasState(
    genome.stage,
    genome.confidenceScore,
    openQuestions.length,
    constraints.length,
    blockerCount,
    recentMsgCount,
    objectCount,
  );

  const { boost: modelBoost, source: modelSource } = await computeModelRichnessBoost(projectId);
  const clarityScore = Math.min(100, genome.confidenceScore + modelBoost);

  return {
    clarity: clarityScore,
    momentum: momentumFromCount(recentMsgCount),
    confidence: confidenceLevelFromScore(clarityScore),
    risk,
    nextAction: nextActionForStage(genome.stage, openQuestions, constraints),
    atlasState,
    // Explainability: raw signals that drove each conclusion above.
    // Never stored — generated fresh on every GET /genome call.
    evidence: {
      scope: "project" as const,
      signals: {
        conversationsLast7Days: recentMsgCount,
        totalSessions,
        committedDecisions,
        parkedItems,
        openBlockers: blockerCount,
        openConstraints: constraints.length,
        openQuestions: openQuestions.length,
        confidenceScore: genome.confidenceScore,
        modelRichnessBoost: modelBoost,
      },
      derivations: {
        momentum: recentMsgCount >= 16
          ? `${recentMsgCount} conversations this week → High`
          : recentMsgCount >= 6
            ? `${recentMsgCount} conversations this week → Medium`
            : `${recentMsgCount} conversations this week → Low`,
        clarity: modelBoost > 0
          ? `${genome.confidenceScore}% confidence + ${modelBoost} model richness (${modelSource}) = ${clarityScore}%`
          : `${genome.confidenceScore}% confidence score`,
        state: `${genome.stage} stage${blockerCount > 0 ? ` · ${blockerCount} blocker${blockerCount !== 1 ? "s" : ""}` : ""} → ${atlasState}`,
      },
    },
  };
}

async function serializeGenome(projectId: number, row: typeof projectGenomeTable.$inferSelect) {
  const health = await computeProjectHealth(projectId, row);
  return {
    id: row.id,
    projectId: row.projectId,
    purpose: row.purpose,
    coreEmotion: row.coreEmotion,
    audience: row.audience,
    identity: row.identity,
    format: row.format,
    wedge: row.wedge,
    differentiator: row.differentiator,
    constraints: row.constraints ?? [],
    openQuestions: row.openQuestions ?? [],
    stage: row.stage,
    confidenceScore: row.confidenceScore,
    lastEvolvedAt: row.lastEvolvedAt?.toISOString() ?? null,
    lastExtractedAt: row.lastExtractedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    health,
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
    res.json(await serializeGenome(projectId, genome));
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
    if ("format" in body) update.format = typeof body.format === "string" ? body.format : null;
    if ("wedge" in body) update.wedge = typeof body.wedge === "string" ? body.wedge : null;
    if ("differentiator" in body) update.differentiator = typeof body.differentiator === "string" ? body.differentiator : null;
    if ("constraints" in body && Array.isArray(body.constraints)) update.constraints = body.constraints.filter((x: unknown) => typeof x === "string").slice(0, 5);
    if ("openQuestions" in body && Array.isArray(body.openQuestions)) update.openQuestions = body.openQuestions.filter((x: unknown) => typeof x === "string").slice(0, 5);
    if ("stack" in body && Array.isArray(body.stack)) update.stack = body.stack.filter((x: unknown) => typeof x === "string");
    if ("protectedAreas" in body && Array.isArray(body.protectedAreas)) update.protectedAreas = body.protectedAreas.filter((x: unknown) => typeof x === "string");
    if ("stage" in body) update.stage = validStage(body.stage);
    // confidenceScore is extraction-computed — not user-editable

    if (Object.keys(update).length === 0) {
      const genome = await getOrCreateGenome(projectId);
      res.json(await serializeGenome(projectId, genome));
      return;
    }

    const [existing] = await db
      .select({
        id: projectGenomeTable.id,
        purpose: projectGenomeTable.purpose,
        audience: projectGenomeTable.audience,
        wedge: projectGenomeTable.wedge,
        stack: projectGenomeTable.stack,
        protectedAreas: projectGenomeTable.protectedAreas,
        constraints: projectGenomeTable.constraints,
      })
      .from(projectGenomeTable)
      .where(eq(projectGenomeTable.projectId, projectId))
      .limit(1);

    if (existing) {
      await db.update(projectGenomeTable).set(update).where(eq(projectGenomeTable.projectId, projectId));
    } else {
      await db.insert(projectGenomeTable).values({ projectId, ...update });
    }

    // Event 2 — Refresh Atlas Memory when major fields change (fire-and-forget)
    const majorFields = ["purpose", "audience", "wedge", "stack", "protectedAreas", "constraints"] as const;
    const hasMajorChange = existing && majorFields.some(
      f => f in update && JSON.stringify((update as Record<string, unknown>)[f]) !== JSON.stringify((existing as Record<string, unknown>)[f]),
    );
    if (hasMajorChange) {
      pushAtlasMdToRepo(projectId, userId, req.log).catch(() => {});
    }

    const genome = await getOrCreateGenome(projectId);
    res.json(await serializeGenome(projectId, genome));
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
      res.json({ genome: await serializeGenome(projectId, genome), skipped: true, reason: "cooldown" });
      return;
    }

    await runGenomeExtraction(projectId);

    const genome = await getOrCreateGenome(projectId);
    res.json({ genome: await serializeGenome(projectId, genome), skipped: false });
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
          ? and(eq(entriesTable.projectId, projectId), eq(entriesTable.type, typeFilter as (typeof OBJECT_TYPES)[number]))
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

// POST /api/projects/genome/backfill — run extraction for all user projects with empty genomes
router.post("/projects/genome/backfill", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;

    const userProjects = await db
      .select({ id: projectsTable.id, name: projectsTable.name })
      .from(projectsTable)
      .where(eq(projectsTable.userId, userId));

    if (userProjects.length === 0) { res.json({ queued: 0, projects: [] }); return; }

    const projectIds = userProjects.map(p => p.id);

    const existingGenomes = await db
      .select({ projectId: projectGenomeTable.projectId, lastExtractedAt: projectGenomeTable.lastExtractedAt })
      .from(projectGenomeTable)
      .where(inArray(projectGenomeTable.projectId, projectIds));

    const extractedSet = new Set(
      existingGenomes.filter(g => g.lastExtractedAt !== null).map(g => g.projectId),
    );

    const toBackfill = userProjects.filter(p => !extractedSet.has(p.id));

    if (toBackfill.length === 0) {
      res.json({ queued: 0, message: "All projects already have genome data.", projects: [] });
      return;
    }

    // Run extractions serially to avoid hammering the AI API
    void (async () => {
      for (const p of toBackfill) {
        try {
          await runGenomeExtraction(p.id);
          req.log?.info({ projectId: p.id, projectName: p.name }, "genome backfill: extracted");
        } catch (err) {
          req.log?.warn({ err, projectId: p.id }, "genome backfill: extraction failed for project");
        }
      }
    })();

    res.json({
      queued: toBackfill.length,
      message: `Extraction queued for ${toBackfill.length} project${toBackfill.length !== 1 ? "s" : ""}. This runs in the background.`,
      projects: toBackfill.map(p => ({ id: p.id, name: p.name })),
    });
  } catch (err) {
    req.log?.error({ err }, "genome backfill error");
    res.status(500).json({ error: "Backfill failed" });
  }
});

// GET /api/portfolio/health — all projects with health snapshots in one batch
router.get("/portfolio/health", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;

    const projects = await db
      .select({ id: projectsTable.id, name: projectsTable.name, updatedAt: projectsTable.updatedAt })
      .from(projectsTable)
      .where(eq(projectsTable.userId, userId))
      .orderBy(desc(projectsTable.updatedAt));

    if (projects.length === 0) { res.json([]); return; }

    const genomes = await db
      .select()
      .from(projectGenomeTable)
      .where(inArray(projectGenomeTable.projectId, projects.map(p => p.id)));

    const genomeMap = new Map(genomes.map(g => [g.projectId, g]));

    const results = await Promise.all(projects.map(async (p) => {
      const genome = genomeMap.get(p.id);
      const updatedAt = p.updatedAt?.toISOString() ?? new Date().toISOString();
      if (!genome) {
        return {
          projectId: p.id,
          projectName: p.name,
          updatedAt,
          stage: "Think",
          atlasState: "Discovering" as AtlasState,
          momentum: "Low" as const,
          clarity: 0,
          confidence: "Low" as const,
          risk: null,
          nextAction: "Start shaping your core idea — what problem are you solving?",
        };
      }
      const health = await computeProjectHealth(p.id, genome);
      return {
        projectId: p.id,
        projectName: p.name,
        updatedAt,
        stage: genome.stage,
        atlasState: health.atlasState,
        momentum: health.momentum,
        clarity: health.clarity,
        confidence: health.confidence,
        risk: health.risk,
        nextAction: health.nextAction,
      };
    }));

    res.json(results);
  } catch (err) {
    req.log?.error({ err }, "portfolio/health error");
    res.status(500).json({ error: "Failed to fetch portfolio health" });
  }
});

export default router;
