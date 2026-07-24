/**
 * GET /api/projects/:id/intelligence
 * GET /api/portfolio/intelligence
 *
 * The single source of truth for project state.
 * Master Map, Axiom Flow header, HUD, Workspace ring, Portfolio cards
 * all consume this endpoint — never computing independently.
 *
 * Composes:
 *   - project_genome  → DNA fields + health signals (momentum, clarity, atlasState)
 *   - computeProjectReadiness() → overall %, dimension scores
 *   - entries table  → decisions, blockers, goals, open questions as typed lists
 *   - questionLedger → open / partial / resolved with provenance (CityHub audit)
 */

import { Router, type IRouter } from "express";
import { eq, and, desc, ne, sql, count } from "drizzle-orm";
import {
  db,
  projectsTable,
  entriesTable,
  nexusMessagesTable,
  projectFlowCanvasTable,
  projectStackTable,
  applicationModelsTable,
} from "@workspace/db";
import { computeProjectReadiness } from "./readiness";
import type { AtlasState } from "./genome";
import { getProjectDNA } from "../lib/projectDNA";
import { workLanguageNextAction } from "../lib/workLanguageNextAction";
import { looksLikeCrossProjectContamination } from "../lib/intelligenceExtractionNormalize";

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

type MomentumLevel = "Low" | "Medium" | "High";
type ConfidenceLevel = "Low" | "Medium" | "High";

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
  if (blockerCount > 0 || constraintCount > 0 || openQuestionCount > 2 || recentMsgCount > 8 || objectCount > 3) {
    return "Pressure Testing";
  }
  return "Discovering";
}

function nextActionForStage(
  _stage: string,
  openQuestions: string[],
  constraints: string[],
): string {
  return workLanguageNextAction(openQuestions, constraints);
}

function parseEntryProvenance(enrichmentJson: string | null): {
  sourceRole?: string;
  sourceExcerpt?: string | null;
  projectScoped?: boolean;
  sourceMessageId?: number | null;
  resolution?: string;
} | null {
  if (!enrichmentJson) return null;
  try {
    const parsed = JSON.parse(enrichmentJson) as {
      provenance?: {
        sourceRole?: string;
        sourceExcerpt?: string | null;
        projectScoped?: boolean;
        sourceMessageId?: number | null;
      };
      resolution?: string;
    };
    if (!parsed.provenance && !parsed.resolution) return null;
    return {
      ...(parsed.provenance ?? {}),
      ...(parsed.resolution ? { resolution: parsed.resolution } : {}),
    };
  } catch {
    return null;
  }
}

export async function computeProjectIntelligence(projectId: number) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    genome,
    [project],
    readiness,
    recentEntries,
    [msgCountRow],
    [objectCountRow],
    [flowCanvas],
    [stackRow],
    [amRow],
  ] = await Promise.all([
    getProjectDNA(projectId),

    db.select({
      id: projectsTable.id,
      name: projectsTable.name,
      description: projectsTable.description,
      status: projectsTable.status,
      linkedRepo: projectsTable.linkedRepo,
      previewUrl: projectsTable.previewUrl,
    })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1),

    computeProjectReadiness(projectId),

    db.select({
      id: entriesTable.id,
      type: entriesTable.type,
      title: entriesTable.title,
      summary: entriesTable.summary,
      status: entriesTable.status,
      severity: entriesTable.severity,
      mode: entriesTable.mode,
      sourceMessageId: entriesTable.sourceMessageId,
      enrichmentJson: entriesTable.enrichmentJson,
      createdAt: entriesTable.createdAt,
    })
      .from(entriesTable)
      .where(and(
        eq(entriesTable.projectId, projectId),
        ne(entriesTable.status, "archived"),
      ))
      .orderBy(desc(entriesTable.createdAt))
      .limit(80),

    db.select({ n: count() })
      .from(nexusMessagesTable)
      .where(and(
        eq(nexusMessagesTable.projectId, projectId),
        sql`${nexusMessagesTable.messageType} IS DISTINCT FROM 'briefing'`,
        sql`${nexusMessagesTable.messageType} IS DISTINCT FROM 'reflection'`,
        sql`${nexusMessagesTable.createdAt} >= ${sevenDaysAgo.toISOString()}`,
      )),

    db.select({ n: count() })
      .from(entriesTable)
      .where(and(
        eq(entriesTable.projectId, projectId),
        ne(entriesTable.status, "archived"),
      )),

    db.select()
      .from(projectFlowCanvasTable)
      .where(eq(projectFlowCanvasTable.projectId, projectId))
      .limit(1),

    db.select()
      .from(projectStackTable)
      .where(eq(projectStackTable.projectId, projectId))
      .limit(1),

    db.select({ intent: applicationModelsTable.intent })
      .from(applicationModelsTable)
      .where(eq(applicationModelsTable.projectId, projectId))
      .limit(1),
  ]);

  const recentMsgCount = Number(msgCountRow?.n ?? 0);
  const objectCount = Number(objectCountRow?.n ?? 0);
  const hasFlow = !!(flowCanvas?.nodes && Array.isArray(flowCanvas.nodes) && (flowCanvas.nodes as unknown[]).length > 0);
  const constraints = genome?.constraints ?? [];
  const openQuestions = genome?.openQuestions ?? [];
  const stage = genome?.stage ?? "Think";
  const confidenceScore = genome?.confidenceScore ?? 0;

  const intent = (amRow?.intent as Record<string, unknown> | null) ?? {};
  const questionLedger = Array.isArray(intent.questionLedger)
    ? (intent.questionLedger as Array<{
        text: string;
        resolution: string;
        residual?: string | null;
        provenance?: {
          sourceRole?: string;
          sourceExcerpt?: string | null;
          projectScoped?: boolean;
          sourceMessageId?: number | null;
        };
      }>)
    : [];

  const blockers = recentEntries.filter(e => e.type === "Blocker");
  const blockerCount = blockers.length;

  const atlasState = computeAtlasState(
    stage,
    confidenceScore,
    openQuestions.length,
    constraints.length,
    blockerCount,
    recentMsgCount,
    objectCount,
  );

  const topBlockerTitle = blockers[0]?.title ?? null;
  const risk = topBlockerTitle ?? constraints[0] ?? null;

  const mapEntry = (e: typeof recentEntries[number]) => {
    const provenance = parseEntryProvenance(e.enrichmentJson);
    return {
      id: e.id,
      title: e.title,
      summary: e.summary,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
      sourceMessageId: e.sourceMessageId ?? provenance?.sourceMessageId ?? null,
      provenance: provenance
        ? {
            sourceRole: provenance.sourceRole ?? "unknown",
            sourceExcerpt: provenance.sourceExcerpt ?? null,
            projectScoped: provenance.projectScoped ?? true,
            resolution: provenance.resolution ?? null,
          }
        : null,
    };
  };

  /** Drop auto-extracted decisions that look like cross-project contamination. */
  const isContaminatedDecision = (e: typeof recentEntries[number]) => {
    if (e.type !== "Decision") return false;
    const claim = `${e.title} ${e.summary ?? ""}`;
    if (!looksLikeCrossProjectContamination(claim)) return false;
    const provenance = parseEntryProvenance(e.enrichmentJson);
    if (provenance?.sourceRole === "person") return false;
    if (e.mode === "auto" || provenance?.sourceRole === "atlas" || !provenance) return true;
    return false;
  };

  const entryGroups = {
    decisions: recentEntries
      .filter(e => e.type === "Decision" && e.status === "committed" && !isContaminatedDecision(e))
      .map(e => ({ ...mapEntry(e), status: e.status })),
    blockers: recentEntries
      .filter(e => e.type === "Blocker")
      .map(e => ({ ...mapEntry(e), severity: e.severity })),
    goals: recentEntries
      .filter(e => e.type === "Goal")
      .map(mapEntry),
    ideas: recentEntries
      .filter(e => e.type === "Idea")
      .map(mapEntry),
    features: recentEntries
      .filter(e => e.type === "Feature")
      .map(mapEntry),
    risks: recentEntries
      .filter(e => e.type === "Risk")
      .map(mapEntry),
    insights: recentEntries
      .filter(e => e.type === "Insight")
      .map(mapEntry),
    // K4: Questions are first-class — not every parked draft
    openQuestionEntries: recentEntries
      .filter(e => e.type === "Question")
      .map(e => {
        const mapped = mapEntry(e);
        return {
          ...mapped,
          type: e.type,
          resolution: mapped.provenance?.resolution ?? "open",
        };
      })
      .filter(e => e.resolution !== "resolved"),
  };

  return {
    projectId,
    projectName: project?.name ?? null,
    projectDescription: project?.description ?? null,
    projectStatus: project?.status ?? null,

    // DNA — genome fields
    dna: {
      purpose: genome?.purpose ?? null,
      coreEmotion: genome?.coreEmotion ?? null,
      audience: genome?.audience ?? null,
      identity: genome?.identity ?? null,
      wedge: genome?.wedge ?? null,
      differentiator: genome?.differentiator ?? null,
      stage,
      constraints,
      openQuestions,
      confidenceScore,
      lastExtractedAt: genome?.lastExtractedAt?.toISOString() ?? null,
    },

    // Structured question ledger with resolution + provenance (CityHub audit)
    questionLedger: questionLedger
      .filter((q) => q.resolution !== "resolved")
      .map((q) => ({
        text: q.text,
        resolution: q.resolution,
        residual: q.residual ?? null,
        provenance: q.provenance
          ? {
              sourceRole: q.provenance.sourceRole ?? "unknown",
              sourceExcerpt: q.provenance.sourceExcerpt ?? null,
              projectScoped: q.provenance.projectScoped ?? true,
              sourceMessageId: q.provenance.sourceMessageId ?? null,
            }
          : null,
      })),

    // Health — computed signals (never stored, always fresh)
    health: {
      clarity: confidenceScore,
      confidence: confidenceLevelFromScore(confidenceScore),
      momentum: momentumFromCount(recentMsgCount),
      atlasState,
      risk,
      nextAction: nextActionForStage(stage, openQuestions, constraints),
      evidence: {
        conversationsLast7Days: recentMsgCount,
        openBlockers: blockerCount,
        openConstraints: constraints.length,
        openQuestions: openQuestions.length,
        confidenceScore,
      },
    },

    // Readiness — the canonical % ring and dimension breakdown
    readiness: {
      overall: readiness.overallScore,
      label: readiness.overallLabel,
      projectKind: readiness.projectKind,
      dimensions: readiness.dimensions,
      warnings: readiness.warnings,
      layerMix: readiness.layerMix,
      phases: readiness.phases,
      sourceBreakdown: readiness.sourceBreakdown,
    },

    // Flow canvas — whether a mapped flow exists for this project
    hasFlow,

    // Stack — tech stack captured for this project
    stack: stackRow
      ? {
          frontend: stackRow.frontend ?? null,
          backend: stackRow.backend ?? null,
          database: stackRow.database ?? null,
          hosting: stackRow.hosting ?? null,
          auth: stackRow.auth ?? null,
          integrations: (stackRow.integrations as string[] | null) ?? [],
          repo: stackRow.repo ?? null,
          language: stackRow.language ?? null,
          packageManager: stackRow.packageManager ?? null,
          lastUpdatedAt: stackRow.updatedAt?.toISOString() ?? null,
        }
      : null,

    // Entries — typed lists for Master Map, Ledger, and HUD
    entries: entryGroups,

    // Analysis metadata — derived from genome extraction timestamps
    analysis: {
      hasAnalysis: genome?.lastExtractedAt != null,
      lastAnalyzedAt: genome?.lastExtractedAt?.toISOString() ?? null,
      analyzedAt: genome?.lastExtractedAt?.toISOString() ?? null,
      analysisVersion: genome?.lastExtractedAt ? "1" : null,
    },

    computedAt: new Date().toISOString(),
  };
}

// GET /api/projects/:id/intelligence
router.get("/projects/:id/intelligence", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const projectId = parseProjectId(req.params.id);
    if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }

    const owns = await assertProjectOwner(projectId, userId);
    if (!owns) { res.status(404).json({ error: "Project not found" }); return; }

    const intelligence = await computeProjectIntelligence(projectId);
    res.json(intelligence);
  } catch (err) {
    req.log?.error({ err }, "intelligence GET error");
    res.status(500).json({ error: "Failed to compute project intelligence" });
  }
});

// GET /api/portfolio/intelligence — batch intelligence for all user projects
router.get("/portfolio/intelligence", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;

    const projects = await db
      .select({ id: projectsTable.id, name: projectsTable.name })
      .from(projectsTable)
      .where(eq(projectsTable.userId, userId))
      .orderBy(desc(projectsTable.updatedAt));

    if (projects.length === 0) { res.json([]); return; }

    const results = await Promise.all(
      projects.map(async (p) => {
        try {
          return await computeProjectIntelligence(p.id);
        } catch {
          return {
            projectId: p.id,
            projectName: p.name,
            projectDescription: null,
            projectStatus: null,
            dna: { purpose: null, coreEmotion: null, audience: null, identity: null, wedge: null, differentiator: null, stage: "Think", constraints: [], openQuestions: [], confidenceScore: 0, lastExtractedAt: null },
            questionLedger: [],
            health: { clarity: 0, confidence: "Low" as const, momentum: "Low" as const, atlasState: "Discovering" as AtlasState, risk: null, nextAction: "", evidence: { conversationsLast7Days: 0, openBlockers: 0, openConstraints: 0, openQuestions: 0, confidenceScore: 0 } },
            readiness: { overall: 0, label: "Getting started", projectKind: "general" as const, dimensions: {}, warnings: [], sourceBreakdown: null },
            entries: { decisions: [], blockers: [], goals: [], ideas: [], features: [], risks: [], openQuestionEntries: [] },
            analysis: { hasAnalysis: false, lastAnalyzedAt: null, analyzedAt: null, analysisVersion: null },
            computedAt: new Date().toISOString(),
          };
        }
      }),
    );

    res.json(results);
  } catch (err) {
    req.log?.error({ err }, "portfolio/intelligence error");
    res.status(500).json({ error: "Failed to compute portfolio intelligence" });
  }
});

export default router;
