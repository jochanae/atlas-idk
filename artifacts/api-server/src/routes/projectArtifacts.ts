import { Router, type IRouter } from "express";
import { db, projectArtifactsTable, projectsTable, applicationModelsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger";
import { classifyProductArchetype } from "../lib/productIntelligence";

export { logProjectArtifact } from "../lib/artifactLog";

const router: IRouter = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Auth helpers ──────────────────────────────────────────────────────────────

function getUserId(req: any): number | null {
  return (req.authUser?.id ?? req.userId) as number | null;
}

async function assertOwner(projectId: number, userId: number): Promise<boolean> {
  const [proj] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);
  return !!proj;
}

// ── Sketch generation prompt ──────────────────────────────────────────────────

const SKETCH_PROMPT = `You are a product architect generating a structured screen layout sketch.

Given the application model below, produce a JSON object describing the product's key screens, navigation, and design intent. Be specific and practical.

Application Model:
{APPLICATION_MODEL}

Output ONLY valid JSON with this shape (no markdown, no explanation):
{
  "archetypeId": "<snake_case product category>",
  "archetypeLabel": "<human-readable product category>",
  "navigationModel": "<how screens connect, e.g. 'Bottom tab bar with 4 primary destinations'>",
  "screens": [
    {
      "name": "<screen name>",
      "purpose": "<one sentence: what this screen exists to do>",
      "layout": "<2-3 sentence description of the visual layout and structure>",
      "primaryActions": ["<action 1>", "<action 2>"],
      "dataNeeds": ["<data this screen reads>"]
    }
  ],
  "impliedRequirements": ["<non-obvious requirement inferred from the AM>"],
  "notes": "<any important observations about the product structure>"
}

Rules:
- Include 3–6 screens (the important ones, not every sub-page)
- Be opinionated about layout — say where things actually live on screen
- impliedRequirements should surface things the builder might forget (auth, empty states, pagination, etc.)
- Keep all string values concise and actionable`;

async function generateSketchPayload(projectId: number): Promise<Record<string, unknown>> {
  const [amRow] = await db
    .select()
    .from(applicationModelsTable)
    .where(eq(applicationModelsTable.projectId, projectId))
    .limit(1);

  if (!amRow) return {};

  const pages = (amRow.pages as Array<{ name: string; route?: string }> ?? [])
    .slice(0, 12)
    .map((p) => ({ name: p.name, route: p.route }));

  const data = amRow.data as Record<string, unknown> ?? {};
  const entities = (data.entities as Array<{ name: string; description?: string }> ?? [])
    .slice(0, 10)
    .map((e) => ({ name: e.name, description: e.description }));

  const relationships = (data.relationships as Array<{ from: string; to: string; type?: string }> ?? [])
    .slice(0, 8);

  const logic = (data.logic as Array<{ name: string }> ?? []).slice(0, 6).map((l) => l.name);

  const identity = amRow.identity as Record<string, unknown> ?? {};
  const intent = amRow.intent as Record<string, unknown> ?? {};

  // Classify archetype from AM signals
  const archetype = classifyProductArchetype(
    (identity.summary as string | null) ?? (identity.name as string | null),
    (intent.audience as string | null),
    pages.map((p) => p.name),
    entities.map((e) => e.name),
    [(identity.name as string | undefined) ?? ""],
  );

  const modelSummary = {
    identity,
    intent,
    archetype: archetype
      ? { id: archetype.archetypeId, label: archetype.archetypeLabel, confidence: archetype.score }
      : { id: "general", label: "General Product", confidence: 0 },
    pages,
    entities,
    relationships,
    logic,
  };

  const prompt = SKETCH_PROMPT.replace("{APPLICATION_MODEL}", JSON.stringify(modelSummary, null, 2));

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
  if (!raw) return {};

  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    // Attach generation provenance
    parsed.generatedFrom = {
      pageCount: pages.length,
      entityCount: entities.length,
      pages: pages.map((p) => p.name),
      entities: entities.map((e) => e.name),
    };
    return parsed;
  } catch {
    logger.warn({ raw, projectId }, "sketch generate: JSON parse failed");
    return {};
  }
}

// ── GET /api/projects/:id/artifacts ──────────────────────────────────────────
// Returns all artifacts for this project in reverse chronological order.
// Optional ?type= filter to scope to a specific artifact type.
router.get("/projects/:id/artifacts", async (req, res): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }

    if (!(await assertOwner(projectId, userId))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const typeFilter = typeof req.query.type === "string" ? req.query.type : undefined;

    const rows = await db
      .select()
      .from(projectArtifactsTable)
      .where(
        typeFilter
          ? and(eq(projectArtifactsTable.projectId, projectId), eq(projectArtifactsTable.type, typeFilter))
          : eq(projectArtifactsTable.projectId, projectId),
      )
      .orderBy(desc(projectArtifactsTable.createdAt));

    res.json({
      artifacts: rows.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        type: r.type,
        version: r.version,
        title: r.title,
        metadata: r.metadata,
        payload: r.payload,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "GET /projects/:id/artifacts failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/projects/:id/sketches/generate ─────────────────────────────────
// Generates a structured pipeline sketch from the project's Application Model.
// Stores it as a pipeline_sketch artifact with status 'suggested'.
router.post("/projects/:id/sketches/generate", async (req, res): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }

    if (!(await assertOwner(projectId, userId))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    // Verify AM exists
    const [amRow] = await db
      .select({ id: applicationModelsTable.id })
      .from(applicationModelsTable)
      .where(eq(applicationModelsTable.projectId, projectId))
      .limit(1);

    if (!amRow) {
      res.status(422).json({ error: "No Application Model found — continue the conversation to build one." });
      return;
    }

    const payload = await generateSketchPayload(projectId);

    if (!payload || Object.keys(payload).length === 0) {
      res.status(500).json({ error: "Sketch generation produced no output — try again." });
      return;
    }

    const archetypeLabel = (payload.archetypeLabel as string | undefined) ?? "Product Sketch";
    const title = `${archetypeLabel} — Pipeline Sketch`;

    const [row] = await db
      .insert(projectArtifactsTable)
      .values({
        projectId,
        type: "pipeline_sketch",
        version: 1,
        title,
        metadata: { source: "pipeline", status: "suggested", approved: false },
        payload,
      })
      .returning();

    if (!row) { res.status(500).json({ error: "Insert failed" }); return; }

    res.status(201).json({
      id: row.id,
      projectId: row.projectId,
      type: row.type,
      version: row.version,
      title: row.title,
      metadata: row.metadata,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "POST /projects/:id/sketches/generate failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/projects/:id/artifacts ─────────────────────────────────────────
// Generic artifact save. Accepts { type, title, metadata?, payload? }.
// Version is computed automatically (count of existing same-type artifacts + 1).
router.post("/projects/:id/artifacts", async (req, res): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }

    if (!(await assertOwner(projectId, userId))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const { type, title, metadata = {}, payload = {} } = req.body as {
      type?: string;
      title?: string;
      metadata?: Record<string, unknown>;
      payload?: Record<string, unknown>;
    };

    if (!type || !title) {
      res.status(400).json({ error: "type and title are required" }); return;
    }

    const existing = await db
      .select({ id: projectArtifactsTable.id })
      .from(projectArtifactsTable)
      .where(and(eq(projectArtifactsTable.projectId, projectId), eq(projectArtifactsTable.type, type)));

    const version = existing.length + 1;

    const [row] = await db
      .insert(projectArtifactsTable)
      .values({ projectId, type, version, title, metadata, payload })
      .returning();

    if (!row) { res.status(500).json({ error: "Insert failed" }); return; }

    res.status(201).json({
      id: row.id,
      projectId: row.projectId,
      type: row.type,
      version: row.version,
      title: row.title,
      metadata: row.metadata,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "POST /projects/:id/artifacts failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/projects/:id/artifacts/:artifactId/approve ─────────────────────
// Approves an artifact (marks metadata.approved = true, status = 'approved').
router.post("/projects/:id/artifacts/:artifactId/approve", async (req, res): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const projectId = Number(req.params.id);
    const artifactId = Number(req.params.artifactId);
    if (!projectId || isNaN(projectId) || !artifactId || isNaN(artifactId)) {
      res.status(400).json({ error: "Invalid ids" }); return;
    }

    if (!(await assertOwner(projectId, userId))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const [existing] = await db
      .select()
      .from(projectArtifactsTable)
      .where(and(eq(projectArtifactsTable.id, artifactId), eq(projectArtifactsTable.projectId, projectId)))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Artifact not found" }); return; }

    const updatedMetadata = {
      ...(existing.metadata as Record<string, unknown> ?? {}),
      approved: true,
      status: "approved",
      approvedAt: new Date().toISOString(),
    };

    const [updated] = await db
      .update(projectArtifactsTable)
      .set({ metadata: updatedMetadata })
      .where(eq(projectArtifactsTable.id, artifactId))
      .returning();

    if (!updated) { res.status(500).json({ error: "Update failed" }); return; }

    res.json({
      id: updated.id,
      projectId: updated.projectId,
      type: updated.type,
      version: updated.version,
      title: updated.title,
      metadata: updated.metadata,
      payload: updated.payload,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "POST /projects/:id/artifacts/:artifactId/approve failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/projects/:id/artifacts/:artifactId ───────────────────────────
// Deletes an artifact (used to dismiss a sketch).
router.delete("/projects/:id/artifacts/:artifactId", async (req, res): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const projectId = Number(req.params.id);
    const artifactId = Number(req.params.artifactId);
    if (!projectId || isNaN(projectId) || !artifactId || isNaN(artifactId)) {
      res.status(400).json({ error: "Invalid ids" }); return;
    }

    if (!(await assertOwner(projectId, userId))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const deleted = await db
      .delete(projectArtifactsTable)
      .where(and(eq(projectArtifactsTable.id, artifactId), eq(projectArtifactsTable.projectId, projectId)));

    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "DELETE /projects/:id/artifacts/:artifactId failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
