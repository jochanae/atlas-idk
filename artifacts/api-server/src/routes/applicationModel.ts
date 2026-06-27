import { Router } from "express";
import { db, applicationModelsTable, applicationModelHistoryTable, projectsTable, projectFlowCanvasTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { ApplicationModelPatchSchema, ApplicationModelSchema, ApplicationModelHistorySchema } from "@workspace/db";

const router = Router();

function parseProjectId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

async function assertProjectOwner(projectId: number, userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

function serializeModel(row: typeof applicationModelsTable.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    identity: row.identity ?? {},
    intent: row.intent ?? {},
    pages: row.pages ?? [],
    components: row.components ?? [],
    data: row.data ?? { entities: [], relationships: [] },
    logic: row.logic ?? [],
    buildState: row.buildState ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getOrCreateApplicationModel(projectId: number) {
  const existing = await db
    .select()
    .from(applicationModelsTable)
    .where(eq(applicationModelsTable.projectId, projectId))
    .limit(1);
  if (existing.length > 0) return existing[0];
  const [created] = await db
    .insert(applicationModelsTable)
    .values({ projectId })
    .returning();
  return created;
}

export async function seedMissingApplicationModels() {
  const projects = await db.select({ id: projectsTable.id }).from(projectsTable);
  for (const project of projects) {
    const existing = await db
      .select({ id: applicationModelsTable.id })
      .from(applicationModelsTable)
      .where(eq(applicationModelsTable.projectId, project.id))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(applicationModelsTable).values({ projectId: project.id }).onConflictDoNothing();
    }
  }
}

// GET /api/projects/:id/model
router.get("/projects/:id/model", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).userId as number;
    const projectId = parseProjectId(req.params.id);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }
    const owns = await assertProjectOwner(projectId, userId);
    if (!owns) { res.status(403).json({ error: "Forbidden" }); return; }
    const model = await getOrCreateApplicationModel(projectId);
    res.json(serializeModel(model));
  } catch (err) {
    req.log.error({ err }, "GET /projects/:id/model failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/projects/:id/model
router.patch("/projects/:id/model", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).userId as number;
    const projectId = parseProjectId(req.params.id);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }
    const owns = await assertProjectOwner(projectId, userId);
    if (!owns) { res.status(403).json({ error: "Forbidden" }); return; }

    const parsed = ApplicationModelPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
      return;
    }

    const { reason, ...fields } = parsed.data;
    const patchableFields = Object.keys(fields) as Array<keyof typeof fields>;
    if (patchableFields.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const current = await getOrCreateApplicationModel(projectId);
    const newVersion = current.version + 1;

    const update: Record<string, unknown> = { version: newVersion };
    for (const field of patchableFields) {
      update[field] = fields[field];
    }

    await db
      .update(applicationModelsTable)
      .set(update as any)
      .where(eq(applicationModelsTable.projectId, projectId));

    const historyRows = patchableFields.map((field) => ({
      projectId,
      modelVersion: newVersion,
      fieldChanged: field,
      previousValue: (current as any)[field] ?? null,
      newValue: (fields as any)[field],
      reason: reason ?? null,
    }));
    await db.insert(applicationModelHistoryTable).values(historyRows);

    const updated = await getOrCreateApplicationModel(projectId);
    res.json(serializeModel(updated));
  } catch (err) {
    req.log.error({ err }, "PATCH /projects/:id/model failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/projects/:id/model/history
router.get("/projects/:id/model/history", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).userId as number;
    const projectId = parseProjectId(req.params.id);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }
    const owns = await assertProjectOwner(projectId, userId);
    if (!owns) { res.status(403).json({ error: "Forbidden" }); return; }

    const history = await db
      .select()
      .from(applicationModelHistoryTable)
      .where(eq(applicationModelHistoryTable.projectId, projectId))
      .orderBy(desc(applicationModelHistoryTable.changedAt))
      .limit(200);

    res.json(history.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      modelVersion: row.modelVersion,
      fieldChanged: row.fieldChanged,
      previousValue: row.previousValue ?? null,
      newValue: row.newValue ?? null,
      reason: row.reason ?? null,
      changedAt: row.changedAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "GET /projects/:id/model/history failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/projects/:id/model/sync-flow
// Seeds Flow Map nodes from Application Model pages + entities.
// Only runs if the project has no existing flow nodes (preserves user layouts).
router.post("/projects/:id/model/sync-flow", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).userId as number;
    const projectId = parseProjectId(req.params.id);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }
    const owns = await assertProjectOwner(projectId, userId);
    if (!owns) { res.status(403).json({ error: "Forbidden" }); return; }

    // Check existing flow canvas — don't overwrite user layouts
    const [existingCanvas] = await db
      .select({ nodes: projectFlowCanvasTable.nodes })
      .from(projectFlowCanvasTable)
      .where(eq(projectFlowCanvasTable.projectId, projectId))
      .limit(1);

    const existingNodes = (existingCanvas?.nodes as unknown[]) ?? [];
    if (existingNodes.length > 0) {
      res.json({ synced: false, reason: "Flow canvas already has nodes — layout preserved", nodeCount: existingNodes.length });
      return;
    }

    const model = await getOrCreateApplicationModel(projectId);
    const pages = (model.pages as Array<{ id: string; name: string; route?: string; description?: string }>) ?? [];
    const dataSection = (model.data as { entities?: Array<{ id: string; name: string; description?: string }>; relationships?: Array<{ id: string; from: string; to: string; type: string; label?: string }> }) ?? {};
    const entities = dataSection.entities ?? [];
    const relationships = dataSection.relationships ?? [];

    if (pages.length === 0 && entities.length === 0) {
      res.json({ synced: false, reason: "Application Model has no pages or entities yet", nodeCount: 0 });
      return;
    }

    // Build flow nodes: pages as blue UI nodes, entities as green data nodes
    const COL_SPACING = 280;
    const ROW_SPACING = 180;
    const nodes: Array<Record<string, unknown>> = [];

    pages.forEach((page, i) => {
      nodes.push({
        id: `am-page-${page.id}`,
        type: "default",
        position: { x: 100, y: 100 + i * ROW_SPACING },
        data: {
          label: page.name,
          route: page.route ?? null,
          description: page.description ?? null,
          nodeKind: "page",
          source: "application-model",
        },
        style: { background: "#EFF6FF", border: "1.5px solid #3B82F6", borderRadius: 8 },
      });
    });

    entities.forEach((entity, i) => {
      nodes.push({
        id: `am-entity-${entity.id}`,
        type: "default",
        position: { x: 100 + COL_SPACING, y: 100 + i * ROW_SPACING },
        data: {
          label: entity.name,
          description: entity.description ?? null,
          nodeKind: "entity",
          source: "application-model",
        },
        style: { background: "#F0FDF4", border: "1.5px solid #22C55E", borderRadius: 8 },
      });
    });

    // Build flow edges from relationships
    const edges = relationships.map((rel) => ({
      id: `am-rel-${rel.id}`,
      source: `am-page-${rel.from}`,
      target: `am-entity-${rel.to}`,
      label: rel.label ?? rel.type,
      type: "smoothstep",
      data: { source: "application-model" },
    }));

    // Upsert the flow canvas
    await db
      .insert(projectFlowCanvasTable)
      .values({ projectId, nodes, edges })
      .onConflictDoUpdate({
        target: projectFlowCanvasTable.projectId,
        set: { nodes, edges, updatedAt: new Date() },
      });

    res.json({ synced: true, nodeCount: nodes.length, edgeCount: edges.length });
  } catch (err) {
    req.log.error({ err }, "POST /projects/:id/model/sync-flow failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
