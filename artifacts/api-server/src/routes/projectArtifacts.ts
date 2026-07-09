import { Router, type IRouter } from "express";
import { Readable } from "stream";
import { db, pool, projectArtifactsTable, projectsTable, applicationModelsTable, nexusMessagesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger";
import { classifyProductArchetype } from "../lib/productIntelligence";
import {
  DECISION_ARTIFACT_TYPES,
  generateTradeoffMatrixPayload,
  generateDecisionTreePayload,
  generateDeviationLogPayload,
  saveDecisionArtifact,
  buildContextFromMessages,
  type DecisionArtifactType,
} from "../lib/decisionArtifacts";
import { generateArtifact, getFileBackedArtifact } from "../lib/artifactEngine";
import { deliverArtifact, getDeliveryAdapter, listDeliveryProviders } from "../lib/deliveryEngine";
import { getAccountGithubToken } from "./github";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
// Side-effect imports: each renderer registers itself with the Artifact Engine on load.
import "../lib/renderers/docxRenderer";
import "../lib/renderers/pdfRenderer";
import "../lib/renderers/pptxRenderer";
import "../lib/renderers/xlsxRenderer";
import "../lib/renderers/mermaidRenderer";
import "../lib/renderers/chartRenderer";
import "../lib/renderers/bundleRenderer";
import "../lib/renderers/draftRenderer";
// Side-effect imports: each delivery adapter registers itself with the Delivery Engine on load.
import "../lib/adapters/emailAdapter";
import "../lib/adapters/slackAdapter";
import "../lib/adapters/githubPrAdapter";

export { logProjectArtifact } from "../lib/artifactLog";

const objectStorageService = new ObjectStorageService();

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

    // Atomic upsert: version computed in-query to avoid race conditions from
    // concurrent saves hitting the (project_id, type, version) unique constraint.
    const { rows } = await pool.query<{
      id: number; project_id: number; type: string; version: number;
      title: string; metadata: Record<string, unknown>; payload: Record<string, unknown>;
      created_at: string;
    }>(
      `INSERT INTO project_artifacts (project_id, type, version, title, metadata, payload)
       VALUES (
         $1, $2,
         (SELECT COALESCE(MAX(version), 0) + 1 FROM project_artifacts WHERE project_id = $1 AND type = $2),
         $3, $4::jsonb, $5::jsonb
       )
       ON CONFLICT (project_id, type, version)
       DO UPDATE SET
         title    = EXCLUDED.title,
         metadata = EXCLUDED.metadata,
         payload  = EXCLUDED.payload
       RETURNING *`,
      [projectId, type, title, JSON.stringify(metadata), JSON.stringify(payload)],
    );

    const row = rows[0];
    if (!row) { res.status(500).json({ error: "Insert failed" }); return; }

    res.status(201).json({
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      version: row.version,
      title: row.title,
      metadata: row.metadata,
      payload: row.payload,
      createdAt: row.created_at,
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

// ── POST /api/projects/:id/docs/generate ─────────────────────────────────────
// Generates a technical architecture document from the project's AM + DNA.
// Stores it as a documentation artifact and returns it.
router.post("/projects/:id/docs/generate", async (req, res): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }

    if (!(await assertOwner(projectId, userId))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    // Fetch AM
    const [amRow] = await db
      .select()
      .from(applicationModelsTable)
      .where(eq(applicationModelsTable.projectId, projectId))
      .limit(1);

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);

    if (!amRow) {
      res.status(422).json({ error: "No Application Model found — continue the conversation to build one first." });
      return;
    }

    const identity = (amRow.identity as Record<string, unknown>) ?? {};
    const intent = (amRow.intent as Record<string, unknown>) ?? {};
    const data = (amRow.data as Record<string, unknown>) ?? {};
    const pages = (amRow.pages as Array<{ name: string; route?: string; description?: string }> ?? []).slice(0, 15);
    const entities = (data.entities as Array<{ name: string; description?: string; fields?: string[] }> ?? []).slice(0, 12);
    const relationships = (data.relationships as Array<{ from: string; to: string; type?: string }> ?? []).slice(0, 10);
    const logic = (data.logic as Array<{ name: string; description?: string }> ?? []).slice(0, 8);
    const components = (amRow.components as Array<{ name: string; description?: string }> ?? []).slice(0, 10);

    const amSummary = { identity, intent, pages, entities, relationships, logic, components };
    const projectName = (identity.name as string | undefined) ?? project?.name ?? "This Project";

    const systemPrompt = `You are a technical architect writing clear, accurate documentation for a software project. Write in professional markdown. Be specific and concrete — no filler, no placeholder text. Only describe what the Application Model actually contains.`;

    const userPrompt = `Generate technical architecture documentation for "${projectName}" using this Application Model:

${JSON.stringify(amSummary, null, 2)}

Write a markdown document with these sections (omit any section if the AM has no relevant data):

# ${projectName} — Architecture

## Overview
One paragraph: what this product does and who it's for.

## Pages & Routes
Table or list of pages with their routes and purpose.

## Data Model
Key entities, their purpose, and relationships between them.

## Core Logic
Key business logic, workflows, or computed behaviors.

## Components
Reusable UI components or system components.

## Technical Notes
Any architectural decisions, constraints, or conventions evident from the model.

Rules:
- Only include a section if the AM has data for it
- Be specific: use the real names from the model, not generic descriptions
- No marketing language
- Write for an engineer joining the project`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const markdown = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (!markdown) {
      res.status(500).json({ error: "Documentation generation produced no output — try again." });
      return;
    }

    const existing = await db
      .select({ id: projectArtifactsTable.id })
      .from(projectArtifactsTable)
      .where(and(eq(projectArtifactsTable.projectId, projectId), eq(projectArtifactsTable.type, "documentation")));

    const version = existing.length + 1;
    const title = `${projectName} — Architecture Docs v${version}`;

    const [row] = await db
      .insert(projectArtifactsTable)
      .values({
        projectId,
        type: "documentation",
        version,
        title,
        metadata: { generatedAt: new Date().toISOString(), amVersion: amRow.version },
        payload: { markdown },
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
    req.log.error({ err }, "POST /projects/:id/docs/generate failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Decision Intelligence: Tradeoff Matrix / Decision Tree / Deviation Log ────

async function fetchConversationContext(projectId: number, conversationId?: string): Promise<string> {
  const rows = conversationId
    ? await db
        .select({ role: nexusMessagesTable.role, content: nexusMessagesTable.content })
        .from(nexusMessagesTable)
        .where(and(eq(nexusMessagesTable.projectId, projectId), eq(nexusMessagesTable.conversationId, conversationId)))
        .orderBy(desc(nexusMessagesTable.createdAt))
        .limit(20)
    : await db
        .select({ role: nexusMessagesTable.role, content: nexusMessagesTable.content })
        .from(nexusMessagesTable)
        .where(eq(nexusMessagesTable.projectId, projectId))
        .orderBy(desc(nexusMessagesTable.createdAt))
        .limit(20);
  return buildContextFromMessages(rows.reverse());
}

const DECISION_ROUTE_SLUG: Record<DecisionArtifactType, string> = {
  tradeoff_matrix: "tradeoff-matrix",
  decision_tree: "decision-tree",
  deviation_log: "deviation-log",
};

for (const type of DECISION_ARTIFACT_TYPES) {
  router.post(`/projects/:id/decisions/${DECISION_ROUTE_SLUG[type]}/generate`, async (req, res): Promise<void> => {
    try {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
      const projectId = Number(req.params.id);
      if (!projectId || isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }
      if (!(await assertOwner(projectId, userId))) { res.status(403).json({ error: "Forbidden" }); return; }

      const { context, conversationId, sessionId, sourceMessageId, recommended, chosen, reason } = req.body as {
        context?: string;
        conversationId?: string;
        sessionId?: number | null;
        sourceMessageId?: number | null;
        recommended?: string;
        chosen?: string;
        reason?: string;
      };

      const resolvedContext = context && context.trim().length > 0
        ? context
        : await fetchConversationContext(projectId, conversationId);

      if (!resolvedContext || resolvedContext.trim().length === 0) {
        res.status(400).json({ error: "No conversation context available to generate from" });
        return;
      }

      let payload: Record<string, unknown> | null = null;
      if (type === "tradeoff_matrix") payload = await generateTradeoffMatrixPayload(resolvedContext);
      else if (type === "decision_tree") payload = await generateDecisionTreePayload(resolvedContext);
      else payload = await generateDeviationLogPayload(resolvedContext, { recommended, chosen, reason });

      if (!payload) {
        res.status(500).json({ error: "Generation produced no output — try again." });
        return;
      }

      const result = await saveDecisionArtifact({
        projectId,
        sessionId: sessionId ?? null,
        type,
        payload,
        sourceMessageId: sourceMessageId ?? null,
      });

      res.status(201).json(result);
    } catch (err) {
      req.log.error({ err, type }, `POST /projects/:id/decisions/${DECISION_ROUTE_SLUG[type]}/generate failed`);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}

// ── Artifact Engine: Deliverables (Phase 2A) ─────────────────────────────────
// Generic generate/download/preview surface for every file-backed renderer
// registered with the Artifact Engine (docx today; pptx/xlsx/pdf/mermaid/charts
// plug in later without new routes).

// POST /api/projects/:id/deliverables/:type/generate
// Generates a file-backed artifact via the Artifact Engine's renderer for `:type`.
router.post("/projects/:id/deliverables/:type/generate", async (req, res): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }
    if (!(await assertOwner(projectId, userId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const type = req.params.type;
    const { context, conversationId, sessionId, sourceMessageId, title, docType, ...rendererOptions } = req.body as {
      context?: string;
      conversationId?: string;
      sessionId?: number | null;
      sourceMessageId?: number | null;
      title?: string;
      docType?: string;
      [key: string]: unknown;
    };

    const resolvedContext = context && context.trim().length > 0
      ? context
      : await fetchConversationContext(projectId, conversationId);

    if (!resolvedContext || resolvedContext.trim().length === 0) {
      res.status(400).json({ error: "No conversation context available to generate from" });
      return;
    }

    // Renderer-specific options (e.g. "diagramType" for mermaid, "chartType" for
    // charts) are passed through as-is — the generic route doesn't need to know
    // about them, each renderer's input type defines what it looks for.
    const artifact = await generateArtifact({
      projectId,
      sessionId: sessionId ?? null,
      type,
      sourceMessageId: sourceMessageId ?? null,
      input: { context: resolvedContext, title, docType, ...rendererOptions },
    });

    res.status(201).json(artifact);
  } catch (err) {
    req.log.error({ err, type: req.params.type }, "POST /projects/:id/deliverables/:type/generate failed");
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.startsWith("Artifact engine: no renderer registered") ? 404 : 500;
    res.status(status).json({ error: message });
  }
});

// GET /api/projects/:id/deliverables/providers
// Lists which Delivery Engine adapters are registered and ready (config present).
router.get("/projects/:id/deliverables/providers", async (req, res): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }
    if (!(await assertOwner(projectId, userId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const providers = listDeliveryProviders().map((provider) => {
      const adapter = getDeliveryAdapter(provider);
      return { provider, label: adapter?.label ?? provider };
    });
    res.json({ providers });
  } catch (err) {
    req.log.error({ err }, "GET /projects/:id/deliverables/providers failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/projects/:id/artifacts/:artifactId/deliver
// Sends/posts/opens an already-generated artifact via the Delivery Engine.
// Distinct from generation: a failure here never invalidates the artifact
// itself, it only records a failed delivery attempt.
router.post("/projects/:id/artifacts/:artifactId/deliver", async (req, res): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const projectId = Number(req.params.id);
    const artifactId = Number(req.params.artifactId);
    if (!projectId || isNaN(projectId) || !artifactId || isNaN(artifactId)) {
      res.status(400).json({ error: "Invalid ids" }); return;
    }
    if (!(await assertOwner(projectId, userId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { provider, target } = req.body as { provider?: string; target?: Record<string, unknown> };
    if (!provider || typeof provider !== "string") {
      res.status(400).json({ error: "Missing required field: provider" }); return;
    }
    if (!getDeliveryAdapter(provider)) {
      res.status(404).json({ error: `No delivery adapter registered for provider "${provider}"` }); return;
    }

    const auth: Record<string, unknown> = {};
    if (provider === "github_pr") {
      const githubToken = await getAccountGithubToken(userId);
      if (!githubToken) {
        res.status(400).json({ error: "Connect a GitHub account before opening a pull request" }); return;
      }
      auth.githubToken = githubToken;
    }

    const result = await deliverArtifact({
      projectId,
      artifactId,
      provider,
      target: target ?? {},
      auth,
    });

    res.status(result.status === "sent" ? 200 : 502).json(result);
  } catch (err) {
    req.log.error({ err, artifactId: req.params.artifactId }, "POST /projects/:id/artifacts/:artifactId/deliver failed");
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("is required") || message.includes("no adapter registered") ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

// POST /api/projects/:id/bundles/generate
// Packages a set of existing file-backed artifacts from this project into a
// single downloadable "Ship Package" zip via the "bundle" Artifact Engine
// renderer. Unlike /deliverables/:type/generate, this does not need
// conversation context — it consumes already-generated artifacts as input.
router.post("/projects/:id/bundles/generate", async (req, res): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }
    if (!(await assertOwner(projectId, userId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { artifactIds, title, sessionId, sourceMessageId } = req.body as {
      artifactIds?: number[];
      title?: string;
      sessionId?: number | null;
      sourceMessageId?: number | null;
    };

    if (!Array.isArray(artifactIds) || artifactIds.length === 0) {
      res.status(400).json({ error: "artifactIds must be a non-empty array" });
      return;
    }

    const normalizedIds = artifactIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (normalizedIds.length === 0) {
      res.status(400).json({ error: "artifactIds must contain valid artifact ids" });
      return;
    }

    const artifact = await generateArtifact({
      projectId,
      sessionId: sessionId ?? null,
      type: "bundle",
      sourceMessageId: sourceMessageId ?? null,
      input: { projectId, artifactIds: normalizedIds, title },
    });

    res.status(201).json(artifact);
  } catch (err) {
    req.log.error({ err }, "POST /projects/:id/bundles/generate failed");
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.startsWith("Bundle renderer:") ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

// GET /api/projects/:id/artifacts/:artifactId/preview
// Lightweight preview payload for a file-backed artifact — no file download.
router.get("/projects/:id/artifacts/:artifactId/preview", async (req, res): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const projectId = Number(req.params.id);
    const artifactId = Number(req.params.artifactId);
    if (!projectId || isNaN(projectId) || !artifactId || isNaN(artifactId)) {
      res.status(400).json({ error: "Invalid ids" }); return;
    }
    if (!(await assertOwner(projectId, userId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const found = await getFileBackedArtifact(projectId, artifactId);
    if (!found) { res.status(404).json({ error: "Artifact not found" }); return; }

    const metadata = (found.row.metadata as Record<string, unknown>) ?? {};
    const payload = (found.row.payload as Record<string, unknown>) ?? {};

    res.json({
      id: found.row.id,
      projectId: found.row.projectId,
      type: found.row.type,
      version: found.row.version,
      title: found.row.title,
      category: metadata.category,
      mimeType: found.mimeType,
      extension: found.extension,
      sizeBytes: metadata.sizeBytes,
      preview: payload.preview ?? {},
      createdAt: found.row.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "GET /projects/:id/artifacts/:artifactId/preview failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/projects/:id/artifacts/:artifactId/download
// Streams the persisted file for a file-backed artifact.
router.get("/projects/:id/artifacts/:artifactId/download", async (req, res): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const projectId = Number(req.params.id);
    const artifactId = Number(req.params.artifactId);
    if (!projectId || isNaN(projectId) || !artifactId || isNaN(artifactId)) {
      res.status(400).json({ error: "Invalid ids" }); return;
    }
    if (!(await assertOwner(projectId, userId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const found = await getFileBackedArtifact(projectId, artifactId);
    if (!found) { res.status(404).json({ error: "Artifact not found" }); return; }

    const objectFile = await objectStorageService.getObjectEntityFile(found.objectPath);
    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Content-Type", found.mimeType);
    const safeTitle = found.row.title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "deliverable";
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.${found.extension}"`);

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found in storage" });
      return;
    }
    req.log.error({ err }, "GET /projects/:id/artifacts/:artifactId/download failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
