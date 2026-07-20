import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { eq, sql, desc, and, inArray } from "drizzle-orm";
import { bustResumeCache } from "./nexus";
import { computeProjectReadiness } from "./readiness";
import { db, projectsTable, sessionsTable, entriesTable, readinessSnapshotsTable, blueprintsTable, projectFlowCanvasTable, artifactsTable, nexusMessagesTable, applicationModelsTable, projectTier1MemoryTable, TIER1_FIELD_KEYS, type Tier1FieldKey } from "@workspace/db";
import { generateTier1AtlasContext, TIER1_META } from "../lib/thinkingReceiptExtract";
import { getProjectDNA, getOrCreateProjectDNA } from "../lib/projectDNA";
import { encryptToken, decryptToken, encryptBinding } from "../lib/tokenCrypto";
import { createProjectForUser, ensureProjectSchema, ProjectLimitReachedError } from "../lib/projectCreation";
import { pushAtlasMdToRepo } from "../lib/projectMemory";
import { ensureProjectWorkspaceDir, projectWorkspaceDir, assertProjectOwner } from "../lib/projectWorkspace";
import { cloneRepoBackground } from "../lib/workspaceHydration";
import { classifyRepository, ATLAS_SERVICE_CAPABILITIES } from "@workspace/repo-classifier";
import { loadClassificationInput } from "../services/repositoryClassificationSource";
import { logger } from "../lib/logger";
import {
  CreateProjectBody,
  UpdateProjectBody,
  GetProjectParams,
  UpdateProjectParams,
  DeleteProjectParams,
  TouchProjectParams,
  ListRecentProjectsQueryParams,
  ListReadinessSnapshotsParams,
  RecordReadinessSnapshotParams,
  RecordReadinessSnapshotBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

type MapNode = {
  id: string;
  label: string;
  subType: "SPRINT" | "DECISION" | "BLOCKER" | "OPEN_QUESTION" | "OPPORTUNITY" | "RISK" | "BLUEPRINT" | "NEXT_STEP";
  status?: string;
  description?: string;
  /** 0–1 float — how strongly this node's data is established */
  confidence?: number;
  /** Short explanation bullets for why this node exists / was surfaced */
  reasons?: string[];
  /** Supporting references (entry IDs, conversation excerpts, etc.) */
  evidence?: string[];
};

type BlueprintContent = {
  opportunity?: unknown;
  risks?: unknown;
  openQuestions?: unknown;
  nextSteps?: unknown;
};

function asBlueprintContent(value: unknown): BlueprintContent {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as BlueprintContent
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// Strip GitHub token from outbound project objects — never expose it in list responses.
// The token is returned in single-project GET only (owner-scoped via tenant isolation).
function serializeProject(p: typeof projectsTable.$inferSelect, includeToken = false) {
  const { githubToken, ...rest } = p;
  const plainToken = githubToken ? decryptToken(githubToken) : null;
  return {
    ...rest,
    hasGithubToken: !!githubToken,
    ...(includeToken ? { githubToken: plainToken } : {}),
    lastOpenedAt: p.lastOpenedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function latestProjectActivityIso(projectUpdatedAt: Date, latestEntryAt?: string | null): string {
  if (!latestEntryAt) return projectUpdatedAt.toISOString();
  const entryTime = new Date(latestEntryAt).getTime();
  if (!Number.isFinite(entryTime) || entryTime <= projectUpdatedAt.getTime()) {
    return projectUpdatedAt.toISOString();
  }
  return new Date(entryTime).toISOString();
}

router.use("/projects", async (_req, _res, next) => {
  try {
    await ensureProjectSchema();
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/projects", async (req, res): Promise<void> => {
  const userId = (req as any).authUser.id as number;

  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.userId, userId))
    .orderBy(desc(projectsTable.updatedAt));

  let latestScores: Array<{ projectId: number; score: number }> = [];
  try {
    latestScores = await db
      .select({
        projectId: readinessSnapshotsTable.projectId,
        score: readinessSnapshotsTable.score,
      })
      .from(readinessSnapshotsTable)
      .where(
        sql`id IN (
          SELECT DISTINCT ON (project_id) id
          FROM readiness_snapshots
          ORDER BY project_id, recorded_at DESC, id DESC
        )`
      );
  } catch {
    // Table may not exist in test environments — gracefully skip snapshot scores
  }

  const scoreMap = new Map(latestScores.map(s => [s.projectId, s.score]));

  const projectIds = projects.map(p => p.id);
  let entryStatsMap = new Map<number, { entryCount: number; latestEntryAt: string | null }>();
  if (projectIds.length > 0) {
    const entryStats = await db
      .select({
        projectId: entriesTable.projectId,
        entryCount: sql<number>`count(*)::int`,
        latestEntryAt: sql<string | null>`max(greatest(${entriesTable.createdAt}, ${entriesTable.updatedAt}))::text`,
      })
      .from(entriesTable)
      .where(inArray(entriesTable.projectId, projectIds))
      .groupBy(entriesTable.projectId);
    entryStatsMap = new Map(entryStats.map(s => [s.projectId, { entryCount: s.entryCount, latestEntryAt: s.latestEntryAt }]));
  }

  // Compute live readiness for all projects so home cards match the header ring.
  // Promise.allSettled with per-project 5 s timeout — slow projects are skipped gracefully.
  const liveReadinessMap = new Map<number, { score: number; label: string }>();
  if (projects.length > 0) {
    const READINESS_TIMEOUT_MS = 5000;
    const results = await Promise.allSettled(
      projects.map(p =>
        Promise.race([
          computeProjectReadiness(p.id),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("readiness timeout")), READINESS_TIMEOUT_MS),
          ),
        ]),
      ),
    );
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        liveReadinessMap.set(projects[i].id, {
          score: result.value.overallScore,
          label: result.value.overallLabel,
        });
      }
    });
  }

  res.json(projects
    .map(p => {
      const entryStats = entryStatsMap.get(p.id);
      const liveReadiness = liveReadinessMap.get(p.id);
      return {
        ...serializeProject(p, false),
        updatedAt: latestProjectActivityIso(p.updatedAt, entryStats?.latestEntryAt),
        // Canonical live score — matches intelligence.readiness.overall and the header ring.
        readinessScore: liveReadiness?.score ?? null,
        readinessLabel: liveReadiness?.label ?? null,
        // Deprecated: stale snapshot kept for one release for backward compat.
        latestSnapshotScore: scoreMap.get(p.id) ?? null,
        entryCount: entryStats?.entryCount ?? 0,
        latestEntryAt: entryStats?.latestEntryAt ?? null,
      };
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = (req as any).authUser.id as number;
  const authUser = (req as any).authUser;

  try {
    const project = await createProjectForUser({
      userId,
      authUser,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      entityType: parsed.data.entity_type ?? "project",
      status: parsed.data.status,
    });
    // Auto-initialize local workspace directory so Files tab works without GitHub
    void ensureProjectWorkspaceDir(project.id).catch(() => {/* non-fatal */});
    res.status(201).json(serializeProject(project, true));
  } catch (error) {
    if (error instanceof ProjectLimitReachedError) {
      res.status(error.status).json({
        error: error.message,
        code: error.code,
      });
      return;
    }
    throw error;
  }
});

router.get("/projects/recent", async (req, res): Promise<void> => {
  const parsed = ListRecentProjectsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = (req as any).authUser.id as number;
  const withinHours = parsed.data.withinHours ?? 48;
  const projects = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      status: projectsTable.status,
      lastOpenedAt: (projectsTable as any).lastOpenedAt,
    })
    .from(projectsTable)
    .where(and(
      eq(projectsTable.userId, userId),
      sql`${(projectsTable as any).lastOpenedAt} >= now() - (${withinHours}::int * interval '1 hour')`,
    ))
    .orderBy(desc((projectsTable as any).lastOpenedAt))
    .limit(20);

  res.json({
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      last_opened_at: project.lastOpenedAt.toISOString(),
    })),
  });
});

router.post("/projects/:projectId/touch", async (req, res): Promise<void> => {
  const params = TouchProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = (req as any).authUser.id as number;
  const [project] = await db
    .update(projectsTable)
    .set({ lastOpenedAt: sql`now()` })
    .where(and(eq(projectsTable.id, params.data.projectId), eq(projectsTable.userId, userId)))
    .returning({ id: projectsTable.id });

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/projects/:id/map-nodes", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = (req as any).authUser.id as number;
  const projectId = params.data.id;
  const [project] = await db
    .select({ id: projectsTable.id, entityType: (projectsTable as any).entityType })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const entityType = (project as any).entityType === "idea" ? "idea" : "project";
  const nodes: MapNode[] = [];

  if (entityType === "project") {
    const [sprints, decisions, blockers, openQuestions] = await Promise.all([
      db
        .select({ id: entriesTable.id, title: entriesTable.title, status: entriesTable.status })
        .from(entriesTable)
        .where(and(
          eq(entriesTable.projectId, projectId),
          sql`(upper(${entriesTable.mode}) = 'BUILD' OR lower(${entriesTable.title}) LIKE '%sprint%')`,
        )),
      db
        .select({ id: entriesTable.id, title: entriesTable.title })
        .from(entriesTable)
        .where(and(eq(entriesTable.projectId, projectId), eq(entriesTable.status, "committed"))),
      db
        .select({ id: entriesTable.id, title: entriesTable.title, status: entriesTable.status })
        .from(entriesTable)
        .where(and(
          eq(entriesTable.projectId, projectId),
          eq(entriesTable.status, "committed"),
          sql`(lower(${entriesTable.title}) LIKE '%block%' OR lower(${entriesTable.severity}) = 'blocker')`,
        )),
      db
        .select({ id: entriesTable.id, title: entriesTable.title })
        .from(entriesTable)
        .where(and(eq(entriesTable.projectId, projectId), eq(entriesTable.status, "parked")))
        .orderBy(desc(entriesTable.createdAt))
        .limit(5),
    ]);

    nodes.push(
      ...sprints.map((entry): MapNode => ({
        id: `sprint-${entry.id}`,
        label: entry.title,
        subType: "SPRINT",
        status: entry.status,
        confidence: entry.status === "completed" ? 1.0 : entry.status === "active" ? 0.85 : 0.6,
        reasons: ["Build-mode sprint tracked in ledger"],
        evidence: [`entry:${entry.id}`],
      })),
      ...decisions.map((entry): MapNode => ({
        id: `decision-${entry.id}`,
        label: entry.title,
        subType: "DECISION",
        status: "completed",
        confidence: 0.85,
        reasons: ["Committed decision recorded in ledger"],
        evidence: [`entry:${entry.id}`],
      })),
      ...blockers.map((entry): MapNode => ({
        id: `blocker-${entry.id}`,
        label: entry.title,
        subType: "BLOCKER",
        status: entry.status,
        confidence: 0.9,
        reasons: ["Active blocker requires resolution before progress"],
        evidence: [`entry:${entry.id}`],
      })),
      ...openQuestions.map((entry): MapNode => ({
        id: `open-question-${entry.id}`,
        label: entry.title,
        subType: "OPEN_QUESTION",
        status: "backlog",
        confidence: 0.3,
        reasons: ["Parked — outcome not yet determined"],
        evidence: [`entry:${entry.id}`],
      })),
    );
  } else {
    const [blueprint] = await db
      .select({ id: blueprintsTable.id, title: blueprintsTable.title, content: blueprintsTable.content })
      .from(blueprintsTable)
      .where(and(eq(blueprintsTable.projectId, projectId), eq(blueprintsTable.userId, userId)))
      .orderBy(desc(blueprintsTable.createdAt))
      .limit(1);

    if (blueprint) {
      const content = asBlueprintContent(blueprint.content);
      if (typeof content.opportunity === "string" && content.opportunity.trim().length > 0) {
        nodes.push({
          id: `opp-${projectId}`,
          label: "The Opportunity",
          subType: "OPPORTUNITY",
          description: content.opportunity,
          confidence: 0.7,
          reasons: ["Core opportunity identified in blueprint"],
          evidence: [`blueprint:${blueprint.id}`],
        });
      }

      nodes.push(
        ...stringArray(content.risks).map((risk, index): MapNode => ({
          id: `risk-${index}`,
          label: risk,
          subType: "RISK",
          status: "active",
          confidence: 0.65,
          reasons: ["Risk surfaced during blueprint analysis"],
          evidence: [`blueprint:${blueprint.id}`],
        })),
        ...stringArray(content.openQuestions).map((question, index): MapNode => ({
          id: `oq-${index}`,
          label: question,
          subType: "OPEN_QUESTION",
          status: "backlog",
          confidence: 0.3,
          reasons: ["Open question from blueprint — outcome unresolved"],
          evidence: [`blueprint:${blueprint.id}`],
        })),
        {
          id: `bp-${blueprint.id}`,
          label: blueprint.title,
          subType: "BLUEPRINT",
          status: "completed",
          confidence: 0.9,
          reasons: ["Blueprint generated and stored"],
          evidence: [`blueprint:${blueprint.id}`],
        },
        ...stringArray(content.nextSteps).map((step, index): MapNode => ({
          id: `ns-${index}`,
          label: step,
          subType: "NEXT_STEP",
          status: "backlog",
          confidence: 0.6,
          reasons: ["Planned action step from blueprint"],
          evidence: [`blueprint:${blueprint.id}`],
        })),
      );
    }
  }

  res.json({ projectId, entityType, nodes });
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = (req as any).authUser.id as number;
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, userId)));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  // Single-project GET includes the token for the authenticated owner
  res.json(serializeProject(project, true));
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as any).authUser.id as number;
  const { lastHandoverAt, githubToken: rawToken, ...rest } = parsed.data;
  const updateValues = {
    ...rest,
    ...(lastHandoverAt !== undefined
      ? { lastHandoverAt: lastHandoverAt === null ? null : new Date(lastHandoverAt) }
      : {}),
    ...(rawToken !== undefined
      ? { githubToken: rawToken === null ? null : encryptToken(rawToken) }
      : {}),
  };
  const [project] = await db
    .update(projectsTable)
    .set(updateValues)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, userId)))
    .returning();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(serializeProject(project, true));
});

router.post("/projects/:id/activate", async (req, res): Promise<void> => {
  const projectId = parseInt(req.params.id, 10);
  if (Number.isNaN(projectId) || projectId <= 0) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const userId = (req as any).authUser.id as number;

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  if (project.status === "committed") {
    const [[amRow], [session]] = await Promise.all([
      db.select({ id: applicationModelsTable.id })
        .from(applicationModelsTable)
        .where(eq(applicationModelsTable.projectId, projectId))
        .limit(1),
      db.select({ id: sessionsTable.id })
        .from(sessionsTable)
        .where(eq(sessionsTable.projectId, projectId))
        .limit(1),
    ]);
    if (amRow && session) {
      res.json(serializeProject(project, true));
      return;
    }
    // Fall through — committed but hollow; create missing records below
  }

  try {
    const [existingAm] = await db
      .select({ id: applicationModelsTable.id })
      .from(applicationModelsTable)
      .where(eq(applicationModelsTable.projectId, projectId))
      .limit(1);

    if (!existingAm) {
      await getOrCreateProjectDNA(projectId);
    }

    // Sessions and entries are no longer pre-seeded on activation.
    // The workspace creates a session on demand when the user sends their first message,
    // and that first message becomes the session title. Legacy "Session 1" / "Project
    // activated." rows are hidden client-side as a temporary safeguard.

    const [updated] = await db
      .update(projectsTable)
      .set({ status: "committed" })
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Event 1 — fire Atlas Memory refresh on activation (fire-and-forget, non-blocking)
    pushAtlasMdToRepo(projectId, userId, req.log).catch(() => {});

    // Hydrate workspace: clone linked repo if workspace dir is empty (fire-and-forget)
    if (project.linkedRepo) {
      cloneRepoBackground(projectId, userId, req.log).catch(() => {});
    }

    res.json(serializeProject(updated, true));
  } catch (err) {
    req.log?.error({ err }, "activate error");
    res.status(500).json({ error: "Activation failed" });
  }
});

// POST /api/projects/create-and-activate — create a committed workspace in one shot
// Used by Atlas when the user makes an explicit "Build X" request from Ask Atlas.
// Returns a fully committed project (genome + session seeded) so NAVIGATE_TO can fire
// immediately without any secondary activation step.
router.post("/projects/create-and-activate", async (req, res): Promise<void> => {
  const userId = (req as any).authUser.id as number;
  const { name, description, buildIntent } = req.body as { name?: unknown; description?: unknown; buildIntent?: unknown };

  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  try {
    // 1. Create project row with committed status from the start
    const [project] = await db
      .insert(projectsTable)
      .values({
        userId,
        name: name.trim(),
        description: typeof description === "string" ? description.trim() || null : null,
        status: "committed",
      })
      .returning();

    if (!project) {
      res.status(500).json({ error: "Failed to create project" });
      return;
    }

    const projectId = project.id;

    // 2. Seed Application Model (canonical DNA store)
    await getOrCreateProjectDNA(projectId);

    // 3. Seed session — blank title; first user message will auto-title it
    const buildIntentStr = typeof buildIntent === "string" && buildIntent.trim() ? buildIntent.trim() : null;
    await db
      .insert(sessionsTable)
      .values({ projectId, title: "", status: "active", buildIntent: buildIntentStr })
      .returning({ id: sessionsTable.id });

    // Fire-and-forget memory refresh (non-blocking)
    pushAtlasMdToRepo(projectId, userId, req.log).catch(() => {});

    res.status(201).json(serializeProject(project, true));
  } catch (err) {
    req.log?.error({ err }, "create-and-activate error");
    res.status(500).json({ error: "Failed to create and activate project" });
  }
});

// POST /api/projects/:id/refresh-atlas-memory — Event 3: manual "Refresh Atlas Memory"
router.post("/projects/:id/refresh-atlas-memory", async (req, res): Promise<void> => {
  const projectId = parseInt(req.params.id, 10);
  if (Number.isNaN(projectId) || projectId <= 0) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const userId = (req as any).authUser.id as number;

  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  try {
    await pushAtlasMdToRepo(projectId, userId, req.log);
    res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "refresh-atlas-memory error");
    res.status(500).json({ error: "Failed to refresh Atlas Memory" });
  }
});

router.post("/projects/:id/memories", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id <= 0) { res.status(400).json({ error: "Invalid project id" }); return; }
  const userId = (req as any).authUser.id as number;
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId)));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const body = req.body as {
    messages?: Array<{ role: string; content: string }>;
    tier?: "episodic" | "foundational" | "contextual";
    summary?: string;
  };
  const transcript = (body.messages ?? [])
    .slice(-20)
    .map((m) => `${m.role === "user" ? "User" : "Atlas"}: ${m.content}`)
    .join("\n\n");
  const summary = (body.summary?.trim() || transcript.slice(0, 1200) || "Home conversation imported.").trim();
  const tier = body.tier === "foundational" ? 1 : body.tier === "contextual" ? 4 : 3;

  let existing: { v: 2; entries: Array<Record<string, unknown>> } = { v: 2, entries: [] };
  try {
    const parsed = project.memory ? JSON.parse(project.memory) : null;
    if (parsed?.v === 2 && Array.isArray(parsed.entries)) existing = parsed;
  } catch {
    existing = { v: 2, entries: [] };
  }

  const next = {
    v: 2,
    entries: [
      ...existing.entries,
      {
        tier,
        text: `Home conversation handoff: ${summary}`,
        createdAt: new Date().toISOString(),
        retrievalCount: 0,
        lastRetrievedAt: null,
      },
    ],
  };

  const [updated] = await db
    .update(projectsTable)
    .set({ memory: JSON.stringify(next) })
    .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId)))
    .returning();

  res.json(serializeProject(updated, true));
});

router.post("/projects/:id/clone", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project id" }); return; }
  const userId = (req as any).authUser.id as number;
  const [source] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId)));
  if (!source) { res.status(404).json({ error: "Project not found" }); return; }
  const [clone] = await db.insert(projectsTable).values({
    name: `${source.name} (Copy)`,
    description: source.description ?? undefined,
    userId, // clone belongs to the same user; token is intentionally NOT copied
  }).returning();
  const entries = await db.select().from(entriesTable).where(eq(entriesTable.projectId, id));
  if (entries.length > 0) {
    await db.insert(entriesTable).values(entries.map(e => ({
      projectId: clone.id,
      title: e.title,
      summary: e.summary,
      details: e.details,
      status: e.status,
      severity: e.severity,
      verb: e.verb,
      mode: e.mode,
    })));
  }
  res.status(201).json(serializeProject(clone, false));
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = (req as any).authUser.id as number;
  await db
    .delete(projectsTable)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, userId)));
  res.sendStatus(204);
});

router.get("/projects/:id/readiness-snapshots", async (req, res): Promise<void> => {
  const params = ListReadinessSnapshotsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = (req as any).authUser.id as number;
  const [proj] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, userId)));
  if (!proj) { res.status(404).json({ error: "Project not found" }); return; }

  const snapshots = await db
    .select()
    .from(readinessSnapshotsTable)
    .where(eq(readinessSnapshotsTable.projectId, params.data.id))
    .orderBy(desc(readinessSnapshotsTable.recordedAt))
    .limit(90);
  res.json(snapshots.map(s => ({
    ...s,
    recordedAt: s.recordedAt.toISOString(),
  })));
});

router.post("/projects/:id/readiness-snapshots", async (req, res): Promise<void> => {
  const params = RecordReadinessSnapshotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RecordReadinessSnapshotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as any).authUser.id as number;
  const [proj] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, userId)));
  if (!proj) { res.status(404).json({ error: "Project not found" }); return; }

  const [snapshot] = await db
    .insert(readinessSnapshotsTable)
    .values({ projectId: params.data.id, score: parsed.data.score })
    .returning();
  res.status(201).json({ ...snapshot, recordedAt: snapshot.recordedAt.toISOString() });
});

router.get("/projects/:id/greeting", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project id" }); return; }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [[project], genome] = await Promise.all([
    db
      .select({
        name: projectsTable.name,
        linkedRepo: projectsTable.linkedRepo,
        memory: projectsTable.memory,
        createdAt: projectsTable.createdAt,
      })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId))),
    getProjectDNA(id),
  ]);

  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  // Parse linked repo name
  let repoName: string | null = null;
  if (project.linkedRepo) {
    try {
      const parsed = JSON.parse(project.linkedRepo as string);
      repoName = typeof parsed === "string" ? parsed : (parsed.fullName ?? null);
    } catch {
      repoName = project.linkedRepo as string;
    }
  }

  // Count sessions + fetch active session's buildIntent
  const [[{ sessionCount }], activeSessionRows] = await Promise.all([
    db
      .select({ sessionCount: sql<number>`count(*)::int` })
      .from(sessionsTable)
      .where(eq(sessionsTable.projectId, id)),
    db
      .select({ buildIntent: sessionsTable.buildIntent, messageCount: sessionsTable.messageCount })
      .from(sessionsTable)
      .where(and(eq(sessionsTable.projectId, id), eq(sessionsTable.status, "active")))
      .orderBy(desc(sessionsTable.createdAt))
      .limit(1),
  ]);

  // Opening prompt present (buildIntent on the active session): skip the static assistant
  // opener. When no messages yet, hand buildIntent back so the workspace auto-sends it
  // through /api/chat and BUILD_HANDOFF fires immediately.
  const activeBuildIntent = activeSessionRows[0]?.buildIntent?.trim() || null;
  const activeMessageCount = activeSessionRows[0]?.messageCount ?? 0;
  if (activeBuildIntent) {
    if (activeMessageCount === 0) {
      res.json({ buildIntent: activeBuildIntent });
    } else {
      res.json({});
    }
    return;
  }

  const ageMs = Date.now() - new Date(project.createdAt).getTime();
  const isFreshBootstrap = !!repoName && ageMs < 60 * 60 * 1000 && sessionCount <= 1;

  // Build shaping layer lines from genome
  const shapingLines: string[] = [];
  if (genome?.wedge) shapingLines.push(genome.wedge);
  else if (genome?.purpose) shapingLines.push(genome.purpose);
  if (genome?.audience) shapingLines.push(`For: ${genome.audience}`);
  if (genome?.differentiator) shapingLines.push(`Edge: ${genome.differentiator}`);
  const firstOpenQ = Array.isArray(genome?.openQuestions) ? (genome.openQuestions as string[])[0] : undefined;
  if (firstOpenQ) shapingLines.push(`Open: ${firstOpenQ}`);

  const hasShaping = shapingLines.length > 0;

  let message: string;

  if (isFreshBootstrap) {
    message = `Scaffold's live. I pushed a React + Vite + Tailwind base to \`${repoName}\` — \`src/App.tsx\`, \`vite.config.ts\`, \`tailwind.config.js\`, and 7 more files. Open the StackBlitz tab to see it.\n\nWhat are we building?`;
  } else if (repoName && hasShaping) {
    message = `What are we working on today?`;
  } else if (repoName) {
    message = `What are we working on today?`;
  } else if (hasShaping) {
    message = `${project.name}.\n\n${shapingLines.join("\n")}\n\nWhat are we building today?`;
  } else if (!repoName && ageMs < 2 * 60 * 60 * 1000 && sessionCount <= 1) {
    message = `${project.name} is ready. What are we building?`;
  } else {
    message = `${project.name} — what are we working on?`;
  }

  res.json({ message });
});

router.get("/projects/:id/flow", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project id" }); return; }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [proj] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId)));
  if (!proj) { res.status(404).json({ error: "Project not found" }); return; }
  const [canvas] = await db
    .select()
    .from(projectFlowCanvasTable)
    .where(eq(projectFlowCanvasTable.projectId, id));
  if (!canvas) {
    res.json({ nodes: [], edges: [] });
    return;
  }
  res.json({ nodes: canvas.nodes, edges: canvas.edges });
});

router.put("/projects/:id/flow", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project id" }); return; }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [proj] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId)));
  if (!proj) { res.status(404).json({ error: "Project not found" }); return; }
  const { nodes, edges } = req.body as { nodes?: unknown[]; edges?: unknown[] };
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    res.status(400).json({ error: "nodes and edges must be arrays" });
    return;
  }
  await db
    .insert(projectFlowCanvasTable)
    .values({ projectId: id, nodes, edges })
    .onConflictDoUpdate({
      target: projectFlowCanvasTable.projectId,
      set: { nodes, edges, updatedAt: new Date() },
    });
  res.json({ ok: true });
});

// ── Drill cache: persisted sub-node expansions keyed by nodeId:lens ──────────

router.get("/projects/:id/flow/drill-cache", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project id" }); return; }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [proj] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId)));
  if (!proj) { res.status(404).json({ error: "Project not found" }); return; }
  const [canvas] = await db
    .select({ drillCache: projectFlowCanvasTable.drillCache })
    .from(projectFlowCanvasTable)
    .where(eq(projectFlowCanvasTable.projectId, id));
  res.json(canvas?.drillCache ?? {});
});

// ── Flow hydration (AI-powered from conversation history) ─────────────────────

router.post("/projects/:id/flow/hydrate", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project id" }); return; }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: "AI not configured on this server" });
    return;
  }

  const [[proj], genome, messages] = await Promise.all([
    db.select({ id: projectsTable.id, name: projectsTable.name })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId))),
    getProjectDNA(id),
    db.select({ role: nexusMessagesTable.role, content: nexusMessagesTable.content })
      .from(nexusMessagesTable)
      .where(and(
        eq(nexusMessagesTable.projectId, id),
        sql`${nexusMessagesTable.messageType} IS DISTINCT FROM 'briefing'`,
        sql`${nexusMessagesTable.messageType} IS DISTINCT FROM 'reflection'`,
      ))
      .orderBy(desc(nexusMessagesTable.createdAt))
      .limit(60),
  ]);

  if (!proj) { res.status(404).json({ error: "Project not found" }); return; }

  const realMessages = messages.filter(m => m.content && m.content.trim().length > 10);

  // Build genome context regardless of message count — used for both full and genome-only hydration
  const contextParts: string[] = [];
  if (genome?.purpose) contextParts.push(`Purpose: ${genome.purpose}`);
  if (genome?.stage) contextParts.push(`Stage: ${genome.stage}`);
  if (genome?.audience) contextParts.push(`Audience: ${genome.audience}`);
  if (genome?.identity) contextParts.push(`Identity: ${genome.identity}`);
  const constraints = (genome?.constraints as string[] | null) ?? [];
  const openQuestions = (genome?.openQuestions as string[] | null) ?? [];
  if (constraints.length > 0) contextParts.push(`Constraints: ${constraints.join("; ")}`);
  if (openQuestions.length > 0) contextParts.push(`Open questions: ${openQuestions.join("; ")}`);

  const hasGenomeData = contextParts.length > 0;

  if (realMessages.length < 3 && !hasGenomeData) {
    res.status(422).json({
      error: "Not enough context to hydrate. Have a few conversations with Atlas about this project first.",
    });
    return;
  }

  const projectContext = hasGenomeData ? `\nProject context:\n${contextParts.join("\n")}` : "";

  // Most-recent last, capped for context window
  const recent = [...realMessages].reverse().slice(-40);
  const formattedConversation = recent
    .map(m => `${m.role === "user" ? "You" : "Atlas"}: ${m.content.trim()}`)
    .join("\n\n");

  const conversationSection = realMessages.length >= 3
    ? `\nHere is the conversation history between the user and Atlas (their strategic thinking partner):\n\n${formattedConversation}\n\nBased on this conversation, generate a strategic flow map as a JSON object. Extract SPECIFIC goals, requirements, blockers, decisions, and priorities that were actually discussed — not generic placeholders.`
    : `\nNo conversation history is available yet. Generate a strategic flow map based on the project context above. Create SPECIFIC, plausible goals, requirements, and next steps tailored to the project's identity and purpose — not generic placeholders.`;

  const prompt = `You are building a strategic flow map for a project named "${proj.name}".${projectContext}${conversationSection}

Return ONLY a valid JSON object (no explanation, no markdown fences) with this structure:
{
  "nodes": [
    {
      "id": "goal",
      "label": "Short label (3-6 words, project-specific)",
      "type": "goal",
      "resolved": false,
      "x": 0,
      "y": 0,
      "details": "One sentence framing what winning looks like",
      "strategicAnswer": "Include only if clearly stated in the conversation"
    }
  ],
  "edges": [
    { "id": "e-goal-node1", "from": "goal", "to": "node1" }
  ]
}

Node types: goal, requirement, blocker, priority, decision, sprint, wont
Rules:
- Include EXACTLY ONE node with type "goal" and id "goal"
- Include 4-8 satellite nodes grounded in what was actually discussed
- If a decision or answer was clearly stated in the conversation, set resolved: true and include strategicAnswer
- Connect every satellite node to "goal" via an edge; add edges between related nodes too
- x and y are ignored — layout is auto-computed
- Labels must be specific to this project (e.g. "Stripe integration" not "Open decision")`;

  const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let aiText: string;
  try {
    const response = await anthropicClient.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    aiText = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  } catch (err) {
    req.log.error({ err }, "Flow hydrate: Anthropic call failed");
    res.status(502).json({ error: "AI service unavailable — try again in a moment" });
    return;
  }

  const jsonMatch = aiText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    req.log.error({ aiText }, "Flow hydrate: no JSON in AI response");
    res.status(502).json({ error: "AI returned an unexpected response — try again" });
    return;
  }

  let parsed: { nodes?: unknown[]; edges?: unknown[] };
  try {
    parsed = JSON.parse(jsonMatch[0]) as { nodes?: unknown[]; edges?: unknown[] };
  } catch {
    req.log.error({ aiText }, "Flow hydrate: JSON parse failed");
    res.status(502).json({ error: "AI returned malformed JSON — try again" });
    return;
  }

  if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
    res.status(502).json({ error: "AI did not return valid nodes — try again" });
    return;
  }

  const hasGoal = (parsed.nodes as Array<{ type?: unknown }>).some(n => n.type === "goal");
  if (!hasGoal) {
    res.status(502).json({ error: "AI flow map is missing a goal node — try again" });
    return;
  }

  res.json({
    nodes: parsed.nodes,
    edges: Array.isArray(parsed.edges) ? parsed.edges : [],
    source: "conversations",
    messageCount: realMessages.length,
  });
});

// ── Resume artifact ───────────────────────────────────────────────────────────

router.get("/projects/:id/resume", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project id" }); return; }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [[proj], [existing]] = await Promise.all([
    db
      .select({ id: projectsTable.id, name: projectsTable.name })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId))),
    db
      .select()
      .from(artifactsTable)
      .where(and(eq(artifactsTable.projectId, id), eq(artifactsTable.type, "resume")))
      .orderBy(desc(artifactsTable.updatedAt))
      .limit(1),
  ]);
  if (!proj) { res.status(404).json({ error: "Project not found" }); return; }

  // Return existing artifact if present
  if (existing) { res.json({ artifact: existing }); return; }

  // No resume artifact yet — auto-generate one from DNA so the workspace
  // empty state (resumeBrief) is never null for a project with shaping data.
  const genome = await getProjectDNA(id);

  const hasShaping = genome && (genome.purpose || genome.wedge || genome.audience);
  if (!hasShaping) { res.json({ artifact: null }); return; }

  const clarityScore: number = genome.confidenceScore ?? 0;
  const openQuestions = genome.openQuestions ?? [];

  function suggestedBuildFromGenome(score: number, intent: boolean, audience: boolean): string {
    if (!intent) return "Start by defining your core intent";
    if (score < 30) return "Landing Page — begin with presence";
    if (!audience) return "Landing Page — clarify who this is for";
    if (score < 50) return "Database Schema — structure your data model";
    if (score < 65) return "Web App — your foundation is ready";
    return "Full Web App — you have everything needed";
  }

  const threadSummary = genome.wedge
    ? `${genome.wedge}${genome.differentiator ? ` — ${genome.differentiator}` : ""}${genome.audience ? ` Built for ${genome.audience}.` : ""}`
    : genome.purpose
      ? `${proj.name} is ${genome.purpose}${genome.audience ? `, built for ${genome.audience}` : ""}.`
      : `${proj.name} — still being shaped.`;

  const brief = {
    generatedAt: new Date().toISOString(),
    projectName: proj.name,
    clarityScore,
    intent: genome.purpose ?? null,
    audience: genome.audience ?? null,
    tone: genome.coreEmotion ?? null,
    openQuestions,
    suggestedFirstBuild: suggestedBuildFromGenome(clarityScore, !!genome.purpose, !!genome.audience),
    threadSummary,
    fromConversation: false,
  };

  const content = JSON.stringify(brief);
  const title = `Resume — ${proj.name}`;
  const [inserted] = await db
    .insert(artifactsTable)
    .values({ projectId: id, userId, type: "resume", title, content, status: "active", pinned: true })
    .returning();

  res.json({ artifact: inserted ?? null });
});

router.post("/projects/:id/append-thread", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project id" }); return; }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [proj] = await db
    .select({ id: projectsTable.id, name: projectsTable.name })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId)));
  if (!proj) { res.status(404).json({ error: "Project not found" }); return; }

  // Accept a Nexus conversation snapshot from the client.
  const bodyMessages = Array.isArray((req.body as Record<string, unknown>)?.messages)
    ? ((req.body as Record<string, unknown>).messages as Array<{ role: string; content: string }>)
    : [];

  // Persist the conversation transcript to nexusMessagesTable so it survives
  // page refresh and gives the workspace AI full context on subsequent turns.
  // Only write if there are no existing nexus messages for this project yet
  // (idempotent — prevents duplicates if append-thread is called twice).
  let adoptedConversationId: string | null = null;
  if (bodyMessages.length > 0) {
    const [existingMsg] = await db
      .select({ id: nexusMessagesTable.id, conversationId: nexusMessagesTable.conversationId })
      .from(nexusMessagesTable)
      .where(and(eq(nexusMessagesTable.projectId, id), eq(nexusMessagesTable.userId, userId)))
      .limit(1);

    if (!existingMsg) {
      const convId = randomUUID();
      adoptedConversationId = convId;
      const validMessages = bodyMessages.filter(
        (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0,
      );
      if (validMessages.length > 0) {
        await db.insert(nexusMessagesTable).values(
          validMessages.map((m) => ({
            userId,
            projectId: id,
            conversationId: convId,
            role: m.role,
            content: m.content.trim(),
          })),
        );
        await db.execute(sql`
          UPDATE projects SET conversation_id = ${convId}
          WHERE id = ${id} AND user_id = ${userId} AND conversation_id IS NULL
        `);
      }
    } else {
      adoptedConversationId = existingMsg.conversationId ?? null;
    }
  }

  const genomeRow = await getProjectDNA(id);

  const clarityScore: number = genomeRow?.confidenceScore ?? 0;
  const hasIntent = Boolean(genomeRow?.purpose);
  const hasAudience = Boolean(genomeRow?.audience);

  function suggestedBuildFromText(text: string): string | null {
    const t = text.toLowerCase();
    if (t.includes("landing page")) return "Landing Page — begin with presence";
    if (t.includes("mobile app") || t.includes("ios") || t.includes("android")) return "Mobile App — bring it to the device";
    if (t.includes("investor") || t.includes("pitch deck")) return "Investor Deck — make the case";
    if (t.includes("beta") || t.includes("waitlist") || t.includes("early access")) return "Beta Program — validate with real users";
    if (t.includes("web app") || t.includes("dashboard") || t.includes("platform")) return "Web App — your foundation is ready";
    if (t.includes("database") || t.includes("schema") || t.includes("data model")) return "Database Schema — structure your data model";
    return null;
  }

  function suggestedBuildFromGenome(score: number, intent: boolean, audience: boolean): string {
    if (!intent) return "Start by defining your core intent";
    if (score < 30) return "Landing Page — begin with presence";
    if (!audience) return "Landing Page — clarify who this is for";
    if (score < 50) return "Database Schema — structure your data model";
    if (score < 65) return "Web App — your foundation is ready";
    return "Full Web App — you have everything needed";
  }

  const openQuestions = Array.isArray(genomeRow?.openQuestions) ? genomeRow.openQuestions as string[] : [];

  // Derive thread summary: prefer the last substantive assistant message from the
  // conversation snapshot, then fall back to genome-derived narrative.
  const lastAssistantMsg = bodyMessages
    .slice()
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string" && m.content.trim().length > 40);

  const conversationText = bodyMessages.map((m) => m.content).join(" ");

  const threadSummary = lastAssistantMsg
    ? lastAssistantMsg.content.trim().slice(0, 600)
    : hasIntent
      ? `${proj.name} is ${genomeRow?.purpose ?? "a project in development"}${genomeRow?.audience ? `, built for ${String(genomeRow.audience)}` : ""}${genomeRow?.coreEmotion ? `, with a ${String(genomeRow.coreEmotion)} tone` : ""}.`
      : `${proj.name} is still being defined. Continue the conversation to build clarity.`;

  const suggestedFirstBuild =
    (conversationText ? suggestedBuildFromText(conversationText) : null) ??
    suggestedBuildFromGenome(clarityScore, hasIntent, hasAudience);

  const brief = {
    generatedAt: new Date().toISOString(),
    projectName: proj.name,
    clarityScore,
    intent: genomeRow?.purpose ?? null,
    audience: genomeRow?.audience ?? null,
    tone: genomeRow?.coreEmotion ?? null,
    openQuestions,
    suggestedFirstBuild,
    threadSummary,
    fromConversation: bodyMessages.length > 0,
  };

  const content = JSON.stringify(brief);
  const title = `Resume — ${proj.name}`;

  const [existing] = await db
    .select({ id: artifactsTable.id })
    .from(artifactsTable)
    .where(and(eq(artifactsTable.projectId, id), eq(artifactsTable.type, "resume")))
    .orderBy(desc(artifactsTable.updatedAt))
    .limit(1);

  let artifact;
  if (existing) {
    const [updated] = await db
      .update(artifactsTable)
      .set({ content, title, updatedAt: new Date() })
      .where(eq(artifactsTable.id, existing.id))
      .returning();
    artifact = updated;
  } else {
    const [inserted] = await db
      .insert(artifactsTable)
      .values({ projectId: id, userId, type: "resume", title, content, status: "active", pinned: true })
      .returning();
    artifact = inserted;
  }

  // Invalidate the resume cache so the workspace opens with fresh context,
  // not the pre-append snapshot. Fixes: "still being defined" showing after append.
  bustResumeCache(userId);

  res.json({ ok: true, artifact, brief, conversationId: adoptedConversationId });
});

// ── POST /api/projects/:id/editorial — Atlas editorial analysis ───────────────
router.post("/:id/editorial", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project id" }); return; }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { text } = req.body as { text?: string };
  if (!text || text.trim().length < 10) {
    res.status(400).json({ error: "Text must be at least 10 characters" });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: "AI not configured on this server" });
    return;
  }

  const [[proj], genome] = await Promise.all([
    db.select({ id: projectsTable.id, name: projectsTable.name })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId))),
    getProjectDNA(id),
  ]);

  if (!proj) { res.status(404).json({ error: "Project not found" }); return; }

  const contextParts: string[] = [];
  if (genome?.purpose)        contextParts.push(`Purpose: ${genome.purpose}`);
  if (genome?.audience)       contextParts.push(`Audience: ${genome.audience}`);
  if (genome?.stage)          contextParts.push(`Stage: ${genome.stage}`);
  if (genome?.identity)       contextParts.push(`Identity: ${genome.identity}`);
  if (genome?.wedge)          contextParts.push(`Wedge: ${genome.wedge}`);
  if (genome?.differentiator) contextParts.push(`Edge: ${genome.differentiator}`);

  const projectContext = contextParts.length > 0
    ? `\nProject context — "${proj.name}":\n${contextParts.join("\n")}`
    : `\nProject: "${proj.name}"`;

  const systemPrompt = `You are Atlas — a world-class developmental editor and writing partner. Your job is to give the writer honest, specific, actionable editorial feedback that protects their voice while ruthlessly optimizing for clarity, structure, and impact.

Analyze the submitted text and return a structured report with exactly these four sections. Use these headers verbatim:

## ✦ VOICE FINGERPRINT

## ✦ ARCHITECTURE REVIEW

## ✦ THE TRIMMER

## ✦ COGNITIVE LOAD

Section instructions:

VOICE FINGERPRINT: Characterize this writer's specific style — sentence length patterns, vocabulary register (formal/casual/technical), pacing, any distinctive phrases or tics. Then flag passages where the voice becomes inconsistent or slips into a different register. Format flagged items as:
"quoted passage"
→ what's happening and why it disrupts the voice

ARCHITECTURE REVIEW: Map the structural skeleton of the piece. Identify the core argument or narrative purpose, how the sections are organized, and the quality of transitions. Flag: abandoned threads, conclusions that introduce new arguments, unsupported claims, or structural dead-ends. Format:
"quoted passage"
→ the structural problem and what to do

THE TRIMMER: List the specific phrases, sentences, or clauses to cut or compress. Target ruthlessly: passive voice constructions, filler words (actually, basically, just, very, really, quite, sort of), nominalization bloat (e.g. "make a decision" → "decide"), ideas that repeat without adding, and hedging that weakens the point. Format:
"quoted passage"
→ cut/compress instruction with one-line rationale

COGNITIVE LOAD: Identify where a reader will disengage, skim, or get lost. This includes: dense paragraphs with too many ideas, unexplained jargon, abrupt context shifts, and sentences that require re-reading. Format:
"quoted passage"
→ specific fix (break into bullets / add analogy / define term / shorten / restructure)

Rules:
- Every observation MUST quote the exact passage it refers to, verbatim, in quotation marks
- Never give generic advice — all feedback must be specific to this document
- Adapt your register to the writer's voice — suggest edits in their style, not yours
- If a section genuinely has no significant issues, write "No issues found." and move on — don't invent problems
- Focus on the 2–4 most important observations per section, not an exhaustive list
- Be direct and honest. The writer hired a great editor, not a cheerleader
${projectContext}`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const writeSSE = (event: object) => {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch {}
  };

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = await anthropic.messages.stream({
      model: "claude-opus-4-5",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: `Please analyze this text:\n\n${text.trim()}` }],
    });

    let accumulated = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        accumulated += event.delta.text;
        writeSSE({ type: "token", token: event.delta.text });
      }
    }

    writeSSE({ type: "done", content: accumulated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Analysis failed";
    writeSSE({ type: "error", error: msg });
  } finally {
    res.end();
  }
});

// ── Atlas Review Engine ────────────────────────────────────────────────────────
// Unified context-hydrated judgment endpoint.
// Each profile declares what it needs and how to build its system prompt.
// The /editorial route above is kept as a backward-compat alias.

type ReviewContextKey = "genome" | "decisions";

interface ReviewContext {
  projectName: string;
  genome?: {
    purpose?: string | null;
    audience?: string | null;
    stage?: string | null;
    identity?: string | null;
    wedge?: string | null;
    differentiator?: string | null;
  } | null;
  decisions?: Array<{
    title: string;
    summary?: string | null;
    contextWhat?: string | null;
    contextWhy?: string | null;
    createdAt: Date;
  }>;
}

interface ReviewProfileConfig {
  requiredContext: ReviewContextKey[];
  maxTokens: number;
  buildSystemPrompt: (ctx: ReviewContext) => string;
}

function buildGenomeBlock(ctx: ReviewContext): string {
  const g = ctx.genome;
  if (!g) return "";
  const lines: string[] = [];
  if (g.purpose)        lines.push(`Purpose: ${g.purpose}`);
  if (g.audience)       lines.push(`Audience: ${g.audience}`);
  if (g.stage)          lines.push(`Stage: ${g.stage}`);
  if (g.identity)       lines.push(`Identity: ${g.identity}`);
  if (g.wedge)          lines.push(`Wedge: ${g.wedge}`);
  if (g.differentiator) lines.push(`Edge: ${g.differentiator}`);
  return lines.length ? `\nProject Genome — "${ctx.projectName}":\n${lines.join("\n")}` : `\nProject: "${ctx.projectName}"`;
}

const REVIEW_PROFILES: Record<string, ReviewProfileConfig> = {
  editorial: {
    requiredContext: ["genome"],
    maxTokens: 2000,
    buildSystemPrompt: (ctx) => {
      return `You are Atlas — a world-class developmental editor and writing partner. Your job is to give the writer honest, specific, actionable editorial feedback that protects their voice while ruthlessly optimizing for clarity, structure, and impact.

Analyze the submitted text and return a structured report with exactly these four sections. Use these headers verbatim:

## ✦ VOICE FINGERPRINT

## ✦ ARCHITECTURE REVIEW

## ✦ THE TRIMMER

## ✦ COGNITIVE LOAD

Section instructions:

VOICE FINGERPRINT: Characterize this writer's specific style — sentence length patterns, vocabulary register (formal/casual/technical), pacing, any distinctive phrases or tics. Then flag passages where the voice becomes inconsistent or slips into a different register. Format flagged items as:
"quoted passage"
→ what's happening and why it disrupts the voice

ARCHITECTURE REVIEW: Map the structural skeleton of the piece. Identify the core argument or narrative purpose, how the sections are organized, and the quality of transitions. Flag: abandoned threads, conclusions that introduce new arguments, unsupported claims, or structural dead-ends. Format:
"quoted passage"
→ the structural problem and what to do

THE TRIMMER: List the specific phrases, sentences, or clauses to cut or compress. Target ruthlessly: passive voice constructions, filler words (actually, basically, just, very, really, quite, sort of), nominalization bloat (e.g. "make a decision" → "decide"), ideas that repeat without adding, and hedging that weakens the point. Format:
"quoted passage"
→ cut/compress instruction with one-line rationale

COGNITIVE LOAD: Identify where a reader will disengage, skim, or get lost. This includes: dense paragraphs with too many ideas, unexplained jargon, abrupt context shifts, and sentences that require re-reading. Format:
"quoted passage"
→ specific fix (break into bullets / add analogy / define term / shorten / restructure)

Rules:
- Every observation MUST quote the exact passage it refers to, verbatim, in quotation marks
- Never give generic advice — all feedback must be specific to this document
- Adapt your register to the writer's voice — suggest edits in their style, not yours
- If a section genuinely has no significant issues, write "No issues found." and move on — don't invent problems
- Focus on the 2–4 most important observations per section, not an exhaustive list
- Be direct and honest. The writer hired a great editor, not a cheerleader
${buildGenomeBlock(ctx)}`;
    },
  },

  strategy: {
    requiredContext: ["genome", "decisions"],
    maxTokens: 2500,
    buildSystemPrompt: (ctx) => {
      const genomeBlock = buildGenomeBlock(ctx);

      const decisionBlock = ctx.decisions && ctx.decisions.length > 0
        ? `\nDecision Ledger (${ctx.decisions.length} most recent decisions):\n${ctx.decisions.map((d, i) => {
            const date = new Date(d.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            const parts = [`${i + 1}. [${date}] ${d.title}`];
            if (d.contextWhat) parts.push(`   What: ${d.contextWhat}`);
            if (d.contextWhy)  parts.push(`   Why: ${d.contextWhy}`);
            if (d.summary)     parts.push(`   Note: ${d.summary}`);
            return parts.join("\n");
          }).join("\n\n")}`
        : "\nDecision Ledger: No recorded decisions yet.";

      return `You are Atlas — acting as a strategic partner with full memory of this project's history. Your job is to evaluate whether this document is coherent with the project's established identity, past decisions, and strategic direction. You are not editing prose — you are auditing strategic integrity.

Analyze the submitted text and return a report with exactly these four sections. Use these headers verbatim:

## ✦ STRATEGIC COHERENCE

## ✦ TEMPORAL CONTRADICTIONS

## ✦ MISSING ASSUMPTIONS

## ✦ RISKS & OPPORTUNITIES

Section instructions:

STRATEGIC COHERENCE: Evaluate whether the text aligns with the project's genome — its stated purpose, audience, identity, and differentiator. Flag passages that drift from or contradict the established positioning. Format:
"quoted passage"
→ how this conflicts with [specific genome field] and what to do

TEMPORAL CONTRADICTIONS: Cross-reference the text against the Decision Ledger. If any passage conflicts with, undermines, or ignores a recorded decision, call it out explicitly — name the decision and its date. Format:
"quoted passage"
→ conflicts with the [Date] decision to [decision title]. Reconcile or update the ledger.

MISSING ASSUMPTIONS: Identify claims, assertions, or directions in the text that rest on unstated assumptions or that lack grounding in the project's established context. These are strategic fragility points. Format:
"quoted passage"
→ unstated assumption: [what this requires to be true that hasn't been established]

RISKS & OPPORTUNITIES: Flag strategic risks introduced by the text's direction, and identify any positioning opportunities the text hints at but doesn't fully develop. Format each as either:
⚠ Risk: [quoted passage] → [what could go wrong]
✦ Opportunity: [quoted passage] → [what could be developed]

Rules:
- Every finding MUST quote the exact passage it refers to
- When citing a decision, always include its date from the ledger
- If a section has no significant issues, write "No issues found." — never invent problems
- Focus on the 2–4 most important findings per section
- Your role is strategic, not linguistic. Do not comment on grammar, style, or prose unless it directly affects strategic clarity
${genomeBlock}${decisionBlock}`;
    },
  },
};

router.post("/:id/review", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project id" }); return; }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { text, profile = "editorial" } = req.body as { text?: string; profile?: string };
  if (!text || text.trim().length < 10) {
    res.status(400).json({ error: "Text must be at least 10 characters" });
    return;
  }

  const profileConfig = REVIEW_PROFILES[profile];
  if (!profileConfig) {
    res.status(400).json({ error: `Unknown review profile: "${profile}". Valid profiles: ${Object.keys(REVIEW_PROFILES).join(", ")}` });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: "AI not configured on this server" });
    return;
  }

  const [[proj]] = await Promise.all([
    db.select({ id: projectsTable.id, name: projectsTable.name })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId))),
  ]);

  if (!proj) { res.status(404).json({ error: "Project not found" }); return; }

  // ── Context hydration ────────────────────────────────────────────────────────
  const ctx: ReviewContext = { projectName: proj.name };

  await Promise.all(profileConfig.requiredContext.map(async (key) => {
    if (key === "genome") {
      ctx.genome = await getProjectDNA(id);
    }

    if (key === "decisions") {
      ctx.decisions = await db.select({
        title: entriesTable.title,
        summary: entriesTable.summary,
        contextWhat: entriesTable.contextWhat,
        contextWhy: entriesTable.contextWhy,
        createdAt: entriesTable.createdAt,
      })
        .from(entriesTable)
        .where(and(eq(entriesTable.projectId, id), eq(entriesTable.type, "Decision")))
        .orderBy(desc(entriesTable.createdAt))
        .limit(30);
    }
  }));

  const systemPrompt = profileConfig.buildSystemPrompt(ctx);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const writeSSE = (event: object) => {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch {}
  };

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = await anthropic.messages.stream({
      model: "claude-opus-4-5",
      max_tokens: profileConfig.maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: `Please analyze this text:\n\n${text.trim()}` }],
    });

    let accumulated = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        accumulated += event.delta.text;
        writeSSE({ type: "token", token: event.delta.text });
      }
    }

    writeSSE({ type: "done", content: accumulated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Review failed";
    writeSSE({ type: "error", error: msg });
  } finally {
    res.end();
  }
});

// DELETE /api/projects/:id/memory/:index — remove a single memory entry by array index
router.delete("/projects/:id/memory/:index", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const entryIndex = parseInt(req.params.index, 10);
  if (Number.isNaN(id) || id <= 0 || Number.isNaN(entryIndex) || entryIndex < 0) {
    res.status(400).json({ error: "Invalid parameters" });
    return;
  }
  const userId = (req as any).authUser.id as number;
  const [project] = await db
    .select({ id: projectsTable.id, memory: projectsTable.memory })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId)))
    .limit(1);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  let store: { v: 2; entries: unknown[] } = { v: 2, entries: [] };
  try {
    const parsed = project.memory ? JSON.parse(project.memory) : null;
    if (parsed?.v === 2 && Array.isArray(parsed.entries)) store = parsed as { v: 2; entries: unknown[] };
  } catch {}
  if (entryIndex >= store.entries.length) {
    res.status(400).json({ error: "Entry index out of range" });
    return;
  }
  store.entries.splice(entryIndex, 1);
  await db.update(projectsTable).set({ memory: JSON.stringify(store) }).where(eq(projectsTable.id, id));
  res.json({ ok: true, remaining: store.entries.length });
});

// GET /api/projects/:projectId/tier1-gaps
// Returns the missing Tier 1 slots, the single most valuable gap to surface
// next, and a grounded one-sentence atlasContext for the gap question.
// 404 when the project has no chat activity yet (gaps would be meaningless).
// nextGap is null when all slots are filled OR skippedAt is set.
router.get("/projects/:projectId/tier1-gaps", async (req, res): Promise<void> => {
  const projectId = parseInt(req.params.projectId, 10);
  if (isNaN(projectId) || projectId <= 0) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  // 404 when no chat activity — gap surfacing needs something to ground on
  const [{ total }] = await db
    .select({ total: sql<number>`COALESCE(SUM(message_count), 0)::int` })
    .from(sessionsTable)
    .where(eq(sessionsTable.projectId, projectId));
  if (!total || total === 0) {
    res.status(404).json({ error: "No chat activity yet" });
    return;
  }

  const [tier1] = await db
    .select()
    .from(projectTier1MemoryTable)
    .where(eq(projectTier1MemoryTable.projectId, projectId))
    .limit(1);

  const skipped = !!tier1?.tier1SkippedAt;

  const currentAnswers: Record<string, string> = {
    building:      tier1?.building ?? "",
    audience:      tier1?.audience ?? "",
    problem:       tier1?.problem ?? "",
    outOfScope:    tier1?.outOfScope ?? "",
    successSignal: tier1?.successSignal ?? "",
    constraints:   tier1?.constraints ?? "",
  };

  const missing = TIER1_FIELD_KEYS.filter(k => !currentAnswers[k]?.trim());
  const completeness = parseFloat(((6 - missing.length) / 6).toFixed(2));

  if (missing.length === 0 || skipped) {
    res.json({ missing, nextGap: null, completeness });
    return;
  }

  // Fixed priority: building → audience → problem → successSignal → outOfScope → constraints
  const priorityOrder: Tier1FieldKey[] = ["building", "audience", "problem", "successSignal", "outOfScope", "constraints"];
  const nextGapKey = priorityOrder.find(k => missing.includes(k as Tier1FieldKey)) ?? (missing[0] as Tier1FieldKey);
  const meta = TIER1_META.find(m => m.key === nextGapKey)!;

  // Fetch recent conversation turns for atlasContext (best-effort)
  const recentRows = await db.execute(sql`
    SELECT cm.role, cm.content
    FROM chat_messages cm
    JOIN sessions s ON s.id = cm.session_id
    WHERE s.project_id = ${projectId}
      AND cm.role IN ('user', 'assistant')
      AND cm.content IS NOT NULL
      AND LENGTH(cm.content) > 10
    ORDER BY cm.created_at DESC
    LIMIT 12
  `).then(r => (r.rows ?? r) as Array<{ role: string; content: string }>)
    .catch(() => [] as Array<{ role: string; content: string }>);

  const recentTurns = recentRows.reverse();

  const atlasContext = recentTurns.length > 0
    ? await generateTier1AtlasContext({ nextGapKey, nextGapQuestion: meta.question, recentTurns }).catch(() => null)
    : null;

  res.json({
    missing,
    nextGap: {
      key: nextGapKey,
      question: meta.question,
      hint: meta.hint,
      atlasContext,
    },
    completeness,
  });
});

// Returns the most recent conversationId used in this project's nexus thread.
// Used by the frontend to recover a lost conversation pointer (e.g. after
// localStorage is cleared, incognito, or a new device) instead of silently
// creating a ghost thread with no history.
router.get("/projects/:projectId/latest-conversation", async (req, res): Promise<void> => {
  const projectId = parseInt(req.params.projectId, 10);
  if (isNaN(projectId) || projectId <= 0) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [project] = await db
    .select({ id: projectsTable.id, conversationId: projectsTable.conversationId })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const [row] = await db
    .select({ conversationId: nexusMessagesTable.conversationId })
    .from(nexusMessagesTable)
    .where(and(
      eq(nexusMessagesTable.projectId, projectId),
      eq(nexusMessagesTable.userId, userId),
    ))
    .orderBy(desc(nexusMessagesTable.createdAt))
    .limit(1);

  // Fall back to projects.conversation_id — covers the race window right after
  // Ask Atlas → project adoption and legacy projects whose messages were not
  // reparented. Logged as a legacy gap so we can track migrations owed.
  const resolved = row?.conversationId ?? project.conversationId ?? null;
  if (!row?.conversationId && project.conversationId) {
    logger.info(
      { projectId, conversationId: project.conversationId, userId },
      "latest-conversation: resolved via projects.conversation_id fallback (legacy or race)",
    );
  }
  res.json({ conversationId: resolved });
});

// POST /api/projects/:id/classify — static repository runability analysis
router.post("/projects/:id/classify", async (req, res): Promise<void> => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId) || projectId <= 0) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const isOwner = await assertProjectOwner(projectId, userId);
  if (!isOwner) { res.status(404).json({ error: "Project not found" }); return; }

  const [project] = await db
    .select({
      linkedRepo: projectsTable.linkedRepo,
      githubToken: projectsTable.githubToken,
    })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);

  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const workspaceDir = projectWorkspaceDir(projectId);

  // Resolve linked repo name
  let linkedRepo: string | null = null;
  if (project.linkedRepo) {
    try {
      const parsed = JSON.parse(project.linkedRepo as string);
      linkedRepo = typeof parsed === "string" ? parsed : (parsed.fullName ?? null);
    } catch {
      linkedRepo = project.linkedRepo as string;
    }
  }

  // Decrypt stored GitHub token
  const githubToken = project.githubToken ? decryptToken(project.githubToken as string) : null;

  const input = await loadClassificationInput({
    workspaceDir,
    linkedRepo,
    githubToken,
  });

  if (!input) {
    res.status(422).json({
      error: "No file source available",
      detail: "Project has no cloned workspace and no linked GitHub repository with a valid token.",
    });
    return;
  }

  const report = classifyRepository(input);

  // Phase 4 — merge Atlas capability registry into each external service requirement.
  // Lookup is by canonical serviceId (case-insensitive) to prevent display-name drift.
  // provisionMode, knownEnvVars, and providerLabel are API-layer concerns only —
  // the static classifier knows nothing of product capabilities.
  report.requirements.externalServices = report.requirements.externalServices.map((svc) => {
    const resolvedId = (svc.serviceId ?? normalizeServiceId(svc.service)) as keyof typeof ATLAS_SERVICE_CAPABILITIES | null;
    if (!resolvedId) return svc;
    const cap = ATLAS_SERVICE_CAPABILITIES[resolvedId];
    if (!cap) return svc;
    return {
      ...svc,
      serviceId: resolvedId,
      provisionMode: cap.provisionMode,
      knownEnvVars: cap.knownEnvVars,
      ...(cap.providerLabel ? { providerLabel: cap.providerLabel } : {}),
    };
  });

  res.json({ report });
});

// POST /api/projects/:id/provision-service — Phase 4 service provisioning
//
// Security contract:
//   The server creates a service_bindings row and returns ONLY a `bindingId`.
//   Secret values (connection strings, credentials) are NEVER returned to the
//   browser. The /run route resolves bindings server-side before spawning.
//
//   For existing-connection (e.g. PostgreSQL): caller sends the secret once.
//   The server encrypts it with AES-256-GCM and stores it. The browser must
//   discard its copy of the secret immediately after this request completes.
//   The secret is NEVER returned in a response body, NEVER logged server-side.
//
//   For local (SQLite): the server generates a safe relative path. The path is
//   not a credential and may be shown in the UI. Still goes through the binding
//   table for consistency so /run can inject it the same way.
//
//   atlas-managed: not yet implemented (would require per-project DB provisioning).
//   unsupported: 422 — Atlas has no provisioning support.
router.post("/projects/:id/provision-service", async (req, res): Promise<void> => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId) || projectId <= 0) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const isOwner = await assertProjectOwner(projectId, userId);
  if (!isOwner) { res.status(404).json({ error: "Project not found" }); return; }

  const { service, secret } = req.body as { service?: string; secret?: string };
  if (!service || typeof service !== "string") {
    res.status(400).json({ error: "service is required" });
    return;
  }

  // Normalize to canonical serviceId — rejects unknown/typo-ed names
  const serviceId = normalizeServiceId(service);
  if (!serviceId) {
    res.status(400).json({ error: `Unrecognised service: ${service}` });
    return;
  }

  const cap = ATLAS_SERVICE_CAPABILITIES[serviceId];

  if (cap.provisionMode === "unsupported") {
    res.status(422).json({
      error: `Atlas cannot provision ${cap.displayName}.`,
      detail: "This service requires an external account. Set it up and add your connection string manually.",
    });
    return;
  }

  if (cap.provisionMode === "atlas-managed") {
    res.status(501).json({
      error: `atlas-managed provisioning for ${cap.displayName} is not yet available.`,
      detail: "Per-project database provisioning requires isolated infrastructure that is not yet set up.",
    });
    return;
  }

  if (cap.provisionMode === "existing-connection") {
    // Caller must supply the secret. We encrypt immediately and never reference
    // the plaintext value again after the INSERT.
    if (!secret || typeof secret !== "string" || !secret.trim()) {
      res.status(400).json({
        error: `A connection string is required to connect ${cap.displayName}.`,
        detail: "Enter your connection string (e.g. postgres://user:pass@host:5432/dbname).",
      });
      return;
    }

    // Map the primary env var → the user-supplied secret, encrypt as JSON blob
    const envVarNames = cap.knownEnvVars.slice(0, 1);
    const secretMap: Record<string, string> = {};
    if (envVarNames[0]) secretMap[envVarNames[0]] = secret;
    const encryptedSecrets = encryptBinding(JSON.stringify(secretMap));

    const bindingId = randomUUID();
    try {
      await db.execute(sql`
        INSERT INTO service_bindings
          (id, project_id, user_id, service_id, provision_mode, encrypted_secrets, env_var_names, provider_label)
        VALUES
          (${bindingId}, ${projectId}, ${userId}, ${serviceId}, ${"existing-connection"},
           ${encryptedSecrets}, ${JSON.stringify(envVarNames)}::jsonb,
           ${cap.providerLabel ?? null})
      `);
    } catch (err) {
      logger.error({ err, projectId, serviceId }, "provision-service: DB insert failed");
      res.status(500).json({ error: "Failed to store service binding." });
      return;
    }

    // Return only the binding reference — NEVER the secret or decrypted values
    res.json({
      bindingId,
      environmentVariables: envVarNames,
      provisionMode: cap.provisionMode,
      providerLabel: cap.providerLabel ?? cap.displayName,
    });
    return;
  }

  if (cap.provisionMode === "local") {
    // SQLite: generate a safe project-relative database path.
    // The path is not a credential — it may be shown in the UI.
    const generatedPath = "file:./data/app.db";
    const envVarNames = cap.knownEnvVars.includes("DATABASE_URL") ? ["DATABASE_URL"] : [];
    const generatedMap: Record<string, string> = {};
    if (envVarNames.includes("DATABASE_URL")) generatedMap["DATABASE_URL"] = generatedPath;

    // Encrypt for consistency (goes through the same binding inject path at /run)
    const encryptedSecrets = Object.keys(generatedMap).length > 0
      ? encryptBinding(JSON.stringify(generatedMap))
      : null;

    const bindingId = randomUUID();
    try {
      await db.execute(sql`
        INSERT INTO service_bindings
          (id, project_id, user_id, service_id, provision_mode, encrypted_secrets, env_var_names, provider_label)
        VALUES
          (${bindingId}, ${projectId}, ${userId}, ${serviceId}, ${"local"},
           ${encryptedSecrets}, ${JSON.stringify(envVarNames)}::jsonb,
           ${cap.providerLabel ?? null})
      `);
    } catch (err) {
      logger.error({ err, projectId, serviceId }, "provision-service: DB insert failed (local)");
      res.status(500).json({ error: "Failed to store local service binding." });
      return;
    }

    res.json({
      bindingId,
      environmentVariables: envVarNames,
      // generatedPath is a relative path, not a credential — safe to return
      generatedPath,
      provisionMode: cap.provisionMode,
      providerLabel: cap.providerLabel ?? cap.displayName,
    });
    return;
  }

  res.status(500).json({ error: "Unexpected provision mode." });
});

// DELETE /api/projects/:id/service-bindings/:bindingId — revoke a binding
// Bindings are automatically purged on project deletion (ON DELETE CASCADE).
// This route allows explicit revocation (e.g. rotating credentials).
router.delete("/projects/:id/service-bindings/:bindingId", async (req, res): Promise<void> => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId) || projectId <= 0) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const isOwner = await assertProjectOwner(projectId, userId);
  if (!isOwner) { res.status(404).json({ error: "Project not found" }); return; }

  const { bindingId } = req.params as { bindingId?: string };
  if (!bindingId) { res.status(400).json({ error: "bindingId required" }); return; }

  try {
    const result = await db.execute(sql`
      UPDATE service_bindings
      SET revoked_at = now()
      WHERE id = ${bindingId}
        AND project_id = ${projectId}
        AND user_id = ${userId}
        AND revoked_at IS NULL
    `);
    if ((result as any).rowCount === 0) {
      res.status(404).json({ error: "Binding not found or already revoked." });
      return;
    }
    res.json({ ok: true, bindingId });
  } catch (err) {
    logger.error({ err, bindingId, projectId }, "revoke-binding: DB update failed");
    res.status(500).json({ error: "Failed to revoke binding." });
  }
});

export default router;
