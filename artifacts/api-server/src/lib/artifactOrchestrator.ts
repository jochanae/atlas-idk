/**
 * Artifact Orchestrator — v1 Skeleton
 *
 * Post-turn evaluator that checks the project artifact pipeline after every
 * chat message. v1 is read-only: it evaluates rules and writes a structured
 * log only. It does NOT create, modify, or surface any artifacts.
 *
 * Architecture:
 *   ProjectArtifactState  — snapshot of all artifact dimensions for a project
 *   OrchestratorRule      — a threshold condition + proposed action
 *   OrchestratorAction    — what the orchestrator WOULD do (logged, not executed in v1)
 *   runArtifactOrchestrator() — loads state, evaluates all rules, writes log
 */

import {
  db,
  applicationModelsTable,
  designPlansTable,
  projectsTable,
  projectArtifactsTable,
  projectGenomeTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// ── State types ───────────────────────────────────────────────────────────────

export interface GenomeState {
  /** 0–1: fraction of key genome fields that contain meaningful content */
  completeness: number;
  filledFields: string[];
  missingFields: string[];
}

export interface ApplicationModelState {
  /** 0–1: weighted score from page / entity / relationship counts */
  completeness: number;
  pageCount: number;
  entityCount: number;
  relationshipCount: number;
}

export interface ProductIntelligenceState {
  /** true once a product archetype has been classified — not built yet, always null in v1 */
  classified: boolean;
  archetypeId: string | null;
  impliedRequirements: string[];
}

export interface SketchState {
  exists: boolean;
  /** Number of visual_sketch project artifacts that have been approved/confirmed */
  approvedCount: number;
}

export interface DesignPlanState {
  exists: boolean;
  status: "draft" | "proposed" | "committed";
}

export interface FlowState {
  /** Total keys in the node_state JSONB object (each key is a node) */
  nodeCount: number;
}

export interface MemoryState {
  entryCount: number;
  /** Entry counts grouped by tier (1–5) */
  tierCounts: Partial<Record<number, number>>;
}

export interface ProjectArtifactState {
  projectId: number;
  genome: GenomeState | null;
  applicationModel: ApplicationModelState | null;
  /** null until Product Intelligence is implemented — always null in v1 */
  productIntelligence: ProductIntelligenceState | null;
  sketch: SketchState | null;
  designPlan: DesignPlanState | null;
  flow: FlowState | null;
  memory: MemoryState | null;
}

// ── Action types ──────────────────────────────────────────────────────────────

export type OrchestratorActionType =
  | "generate_artifact"  // create a new artifact (Sketch, Design Plan, …)
  | "seed_artifact"      // populate an artifact from another (Flow from Design Plan)
  | "classify"           // run a classification pass (Product Intelligence)
  | "notify_user"        // surface a suggestion or nudge
  | "noop";              // rule triggered but blocked; log only

export interface OrchestratorAction {
  type: OrchestratorActionType;
  artifact?: string;
  reason: string;
  metadata?: Record<string, unknown>;
}

// ── Confidence levels ─────────────────────────────────────────────────────────

/**
 * automatic       — fires without user involvement once threshold is met
 * threshold       — fires proactively and non-intrusively; user can dismiss
 * requires_approval — must pause and explicitly ask the user before proceeding
 */
export type OrchestratorConfidence =
  | "automatic"
  | "threshold"
  | "requires_approval";

// ── Rule definition ───────────────────────────────────────────────────────────

export interface RuleEvaluation {
  /** Whether the trigger condition is satisfied right now */
  triggered: boolean;
  /** Inputs that are missing or insufficient — if non-empty, action is blocked */
  missingInputs: string[];
  proposedAction: OrchestratorAction;
}

export interface OrchestratorRule {
  id: string;
  description: string;
  /** Which of the four Atlas pillars this rule belongs to */
  pillar: "think" | "design" | "build" | "trust";
  confidence: OrchestratorConfidence;
  evaluate: (state: ProjectArtifactState) => RuleEvaluation;
}

// ── Result types ──────────────────────────────────────────────────────────────

export interface OrchestratorRuleLog {
  ruleId: string;
  description: string;
  pillar: string;
  confidence: OrchestratorConfidence;
  triggered: boolean;
  /** Empty when triggered and no missing inputs — the action would be executable */
  missingInputs: string[];
  proposedAction: OrchestratorAction;
}

export interface OrchestratorResult {
  projectId: number;
  evaluatedAt: string;
  /** Compact snapshot of the state that was evaluated — for log readability */
  stateSnapshot: {
    genomeCompleteness: number | null;
    genomeFilledFields: string[] | null;
    amCompleteness: number | null;
    amPageCount: number | null;
    amEntityCount: number | null;
    amRelationshipCount: number | null;
    productIntelligenceClassified: boolean | null;
    sketchExists: boolean | null;
    sketchApprovedCount: number | null;
    designPlanStatus: string | null;
    flowNodeCount: number | null;
    memoryEntryCount: number | null;
  };
  rules: OrchestratorRuleLog[];
  /** Rules where triggered=true AND missingInputs is empty (fully actionable) */
  actionableRules: number;
  /** Rules where triggered=true but missingInputs is non-empty (blocked) */
  blockedRules: number;
}

// ── Rule definitions ──────────────────────────────────────────────────────────

const ORCHESTRATOR_RULES: OrchestratorRule[] = [
  {
    id: "R001_GENOME_SEEDS_AM",
    description: "Genome has enough content to seed the Application Model",
    pillar: "design",
    confidence: "automatic",
    evaluate: (state) => {
      const genomeReady = (state.genome?.completeness ?? 0) >= 0.3;
      const amMissing = state.applicationModel === null;
      const triggered = genomeReady && amMissing;
      return {
        triggered,
        missingInputs: [
          ...(!genomeReady ? [`genome_completeness < 30% (current: ${Math.round((state.genome?.completeness ?? 0) * 100)}%)`] : []),
        ],
        proposedAction: {
          type: "generate_artifact",
          artifact: "application_model",
          reason: "Genome completeness has crossed 30% — enough content to infer initial pages and entities",
        },
      };
    },
  },

  {
    id: "R002_AM_TRIGGERS_PRODUCT_INTEL",
    description: "Application Model is shaped enough to classify a product archetype",
    pillar: "think",
    confidence: "automatic",
    evaluate: (state) => {
      const am = state.applicationModel;
      const hasEnoughShape = (am?.pageCount ?? 0) >= 2 && (am?.entityCount ?? 0) >= 3;
      const piMissing = state.productIntelligence === null;
      const triggered = hasEnoughShape && piMissing;
      return {
        triggered,
        missingInputs: [
          ...(!am ? ["application_model"] : []),
          ...(am && (am.pageCount < 2) ? [`am_page_count < 2 (current: ${am.pageCount})`] : []),
          ...(am && (am.entityCount < 3) ? [`am_entity_count < 3 (current: ${am.entityCount})`] : []),
          "product_intelligence_subsystem_not_built",
        ],
        proposedAction: {
          type: "classify",
          artifact: "product_intelligence",
          reason: "AM has ≥ 2 pages and ≥ 3 entities — sufficient shape to classify a product archetype and surface implied requirements",
          metadata: { pageCount: am?.pageCount, entityCount: am?.entityCount },
        },
      };
    },
  },

  {
    id: "R003_PRODUCT_INTEL_UNLOCKS_SKETCH",
    description: "Product archetype is classified and AM is complete enough to generate a Sketch",
    pillar: "design",
    confidence: "threshold",
    evaluate: (state) => {
      const piClassified = state.productIntelligence?.classified === true;
      const amReady = (state.applicationModel?.completeness ?? 0) >= 0.5;
      const sketchMissing = state.sketch === null || !state.sketch.exists;
      const triggered = piClassified && amReady && sketchMissing;
      return {
        triggered,
        missingInputs: [
          ...(!piClassified ? ["product_intelligence_classified"] : []),
          ...(!amReady ? [`am_completeness < 50% (current: ${Math.round((state.applicationModel?.completeness ?? 0) * 100)}%)`] : []),
        ],
        proposedAction: {
          type: "generate_artifact",
          artifact: "sketch",
          reason: "Product archetype is known and AM has sufficient shape — Sketch type and content can be determined",
          metadata: {
            archetypeId: state.productIntelligence?.archetypeId,
            impliedSketchType: "to_be_determined_by_archetype",
          },
        },
      };
    },
  },

  {
    id: "R004_SKETCH_UNLOCKS_DESIGN_PLAN",
    description: "At least one Sketch has been approved — ready to generate a Design Plan",
    pillar: "design",
    confidence: "requires_approval",
    evaluate: (state) => {
      const sketchApproved = (state.sketch?.approvedCount ?? 0) >= 1;
      const designPlanMissing = state.designPlan === null || state.designPlan.status === "draft";
      const triggered = sketchApproved && designPlanMissing;
      return {
        triggered,
        missingInputs: [
          ...(!sketchApproved ? ["sketch_approved (0 approved sketches)"] : []),
        ],
        proposedAction: {
          type: "generate_artifact",
          artifact: "design_plan",
          reason: "Approved Sketch provides visual direction — Design Plan can inherit layout patterns and component decisions",
        },
      };
    },
  },

  {
    id: "R005_DESIGN_PLAN_SEEDS_FLOW",
    description: "Design Plan is committed — Flow can be seeded with page/feature nodes",
    pillar: "design",
    confidence: "automatic",
    evaluate: (state) => {
      const planCommitted = state.designPlan?.status === "committed";
      const flowEmpty = (state.flow?.nodeCount ?? 0) === 0;
      const triggered = planCommitted && flowEmpty;
      return {
        triggered,
        missingInputs: [
          ...(!planCommitted ? [`design_plan_not_committed (status: ${state.designPlan?.status ?? "none"})`] : []),
        ],
        proposedAction: {
          type: "seed_artifact",
          artifact: "flow",
          reason: "Committed Design Plan defines pages and navigation — these map directly to Flow canvas nodes",
        },
      };
    },
  },

  {
    id: "R006_FLOW_ENRICHES_BUILD_CONTEXT",
    description: "Flow has enough nodes to contribute meaningful build context",
    pillar: "build",
    confidence: "automatic",
    evaluate: (state) => {
      const flowRich = (state.flow?.nodeCount ?? 0) >= 3;
      const triggered = flowRich;
      return {
        triggered,
        missingInputs: [
          ...(flowRich ? [] : [`flow_node_count < 3 (current: ${state.flow?.nodeCount ?? 0})`]),
        ],
        proposedAction: {
          type: "notify_user",
          artifact: "workspace_build_context",
          reason: "Flow has ≥ 3 nodes — workspace build context should reflect the topology and surface Flow-aware suggestions",
          metadata: { nodeCount: state.flow?.nodeCount },
        },
      };
    },
  },

  {
    id: "R007_AM_STALLED_WITHOUT_PRODUCT_INTEL",
    description: "AM exists but pipeline is blocked because Product Intelligence is not built",
    pillar: "think",
    confidence: "automatic",
    evaluate: (state) => {
      const amExists = state.applicationModel !== null;
      const amShaped = (state.applicationModel?.pageCount ?? 0) >= 2 && (state.applicationModel?.entityCount ?? 0) >= 3;
      const piMissing = state.productIntelligence === null;
      const triggered = amExists && amShaped && piMissing;
      return {
        triggered,
        missingInputs: ["product_intelligence_subsystem_not_built"],
        proposedAction: {
          type: "noop",
          reason: "AM is shaped and ready for archetype classification, but Product Intelligence subsystem has not been built yet — pipeline is blocked at R002",
          metadata: { blockedAt: "R002_AM_TRIGGERS_PRODUCT_INTEL" },
        },
      };
    },
  },

  {
    id: "R008_LOW_GENOME_COMPLETENESS",
    description: "Genome completeness is below useful threshold — project context is thin",
    pillar: "think",
    confidence: "threshold",
    evaluate: (state) => {
      const completeness = state.genome?.completeness ?? 0;
      const isLow = state.genome === null || completeness < 0.2;
      const triggered = isLow;
      return {
        triggered,
        missingInputs: [],
        proposedAction: {
          type: "notify_user",
          reason: `Genome completeness is ${Math.round(completeness * 100)}% — Atlas has limited context about mission, audience, or constraints. Richer project context improves all downstream artifacts.`,
          metadata: {
            missingGenomeFields: state.genome?.missingFields,
            completeness,
          },
        },
      };
    },
  },
];

// ── State loader ──────────────────────────────────────────────────────────────

async function loadProjectArtifactState(projectId: number): Promise<ProjectArtifactState> {
  type GenomeRow = typeof projectGenomeTable.$inferSelect;
  type AmRow = { pages: unknown; data: unknown };
  type DpRow = { status: string };
  type SketchRow = { type: string; metadata: Record<string, unknown> };
  type ProjectRow = { nodeState: unknown; memory: string | null };

  const [genomeRow, amRow, dpRows, sketchRows, projectRow] = await Promise.all([
    db.select().from(projectGenomeTable).where(eq(projectGenomeTable.projectId, projectId)).limit(1).catch((): GenomeRow[] => []),
    db.select({ pages: applicationModelsTable.pages, data: applicationModelsTable.data }).from(applicationModelsTable).where(eq(applicationModelsTable.projectId, projectId)).limit(1).catch((): AmRow[] => []),
    db.select({ status: designPlansTable.status }).from(designPlansTable).where(eq(designPlansTable.projectId, projectId)).limit(1).catch((): DpRow[] => []),
    db.select({ type: projectArtifactsTable.type, metadata: projectArtifactsTable.metadata }).from(projectArtifactsTable).where(eq(projectArtifactsTable.projectId, projectId)).catch((): SketchRow[] => []),
    db.select({ nodeState: projectsTable.nodeState, memory: projectsTable.memory }).from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1).catch((): ProjectRow[] => []),
  ]);

  // ── Genome ──
  let genomeState: GenomeState | null = null;
  if (genomeRow.length > 0) {
    const g = genomeRow[0];
    const keyFields: Array<[string, unknown]> = [
      ["purpose", g.purpose],
      ["audience", g.audience],
      ["differentiator", g.differentiator],
      ["wedge", g.wedge],
      ["identity", g.identity],
      ["constraints", g.constraints],
    ];
    const filled = keyFields.filter(([, v]) =>
      typeof v === "string" ? v.trim().length > 5 : Array.isArray(v) && v.length > 0
    ).map(([k]) => k);
    const missing = keyFields.filter(([k]) => !filled.includes(k)).map(([k]) => k);
    genomeState = {
      completeness: filled.length / keyFields.length,
      filledFields: filled,
      missingFields: missing,
    };
  }

  // ── Application Model ──
  let amState: ApplicationModelState | null = null;
  if (amRow.length > 0) {
    const pages = Array.isArray(amRow[0].pages) ? amRow[0].pages : [];
    const data = (amRow[0].data ?? {}) as { entities?: unknown[]; relationships?: unknown[] };
    const entities = Array.isArray(data.entities) ? data.entities : [];
    const relationships = Array.isArray(data.relationships) ? data.relationships : [];
    const pageCount = pages.length;
    const entityCount = entities.length;
    const relCount = relationships.length;
    // Weighted completeness: pages contribute 40%, entities 40%, relationships 20%
    const completeness = Math.min(
      1.0,
      (pageCount / 5) * 0.40 + (entityCount / 8) * 0.40 + (relCount / 10) * 0.20
    );
    amState = { completeness, pageCount, entityCount, relationshipCount: relCount };
  }

  // ── Design Plan ──
  let dpState: DesignPlanState | null = null;
  if (dpRows.length > 0) {
    const rawStatus = dpRows[0].status ?? "draft";
    const status = (["draft", "proposed", "committed"].includes(rawStatus)
      ? rawStatus
      : "draft") as DesignPlanState["status"];
    dpState = { exists: true, status };
  }

  // ── Sketch (from project_artifacts table, type = 'visual_sketch') ──
  let sketchState: SketchState | null = null;
  const sketchArtifacts = sketchRows.filter((r) => r.type === "visual_sketch");
  if (sketchArtifacts.length > 0) {
    const approvedCount = sketchArtifacts.filter((r) => r.metadata?.approved === true).length;
    sketchState = { exists: true, approvedCount };
  }

  // ── Flow (from node_state JSONB) ──
  let flowState: FlowState | null = null;
  if (projectRow.length > 0) {
    const nodeState = projectRow[0].nodeState;
    if (nodeState && typeof nodeState === "object") {
      flowState = { nodeCount: Object.keys(nodeState).length };
    } else {
      flowState = { nodeCount: 0 };
    }
  }

  // ── Memory ──
  let memoryState: MemoryState | null = null;
  if (projectRow.length > 0 && projectRow[0].memory) {
    try {
      const parsed = JSON.parse(projectRow[0].memory);
      if (parsed?.v === 2 && Array.isArray(parsed.entries)) {
        const tierCounts: Partial<Record<number, number>> = {};
        for (const entry of parsed.entries) {
          const t = entry.tier as number;
          tierCounts[t] = (tierCounts[t] ?? 0) + 1;
        }
        memoryState = { entryCount: parsed.entries.length, tierCounts };
      }
    } catch { /* non-fatal */ }
  }

  return {
    projectId,
    genome: genomeState,
    applicationModel: amState,
    productIntelligence: null, // Not built yet — always null in v1
    sketch: sketchState,
    designPlan: dpState,
    flow: flowState,
    memory: memoryState ?? { entryCount: 0, tierCounts: {} },
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Evaluate the artifact pipeline for a project and log the result.
 * v1: read-only, no side effects. Safe to call fire-and-forget.
 */
export async function runArtifactOrchestrator(projectId: number): Promise<OrchestratorResult> {
  const state = await loadProjectArtifactState(projectId);
  const evaluatedAt = new Date().toISOString();

  const rules: OrchestratorRuleLog[] = ORCHESTRATOR_RULES.map((rule) => {
    try {
      const { triggered, missingInputs, proposedAction } = rule.evaluate(state);
      return {
        ruleId: rule.id,
        description: rule.description,
        pillar: rule.pillar,
        confidence: rule.confidence,
        triggered,
        missingInputs,
        proposedAction,
      };
    } catch (err) {
      // Rule evaluation must never throw — degrade gracefully
      return {
        ruleId: rule.id,
        description: rule.description,
        pillar: rule.pillar,
        confidence: rule.confidence,
        triggered: false,
        missingInputs: [`rule_evaluation_error: ${err instanceof Error ? err.message : String(err)}`],
        proposedAction: { type: "noop", reason: "Rule evaluation threw an error" },
      };
    }
  });

  const actionableRules = rules.filter((r) => r.triggered && r.missingInputs.length === 0).length;
  const blockedRules = rules.filter((r) => r.triggered && r.missingInputs.length > 0).length;

  const result: OrchestratorResult = {
    projectId,
    evaluatedAt,
    stateSnapshot: {
      genomeCompleteness: state.genome ? Math.round(state.genome.completeness * 100) / 100 : null,
      genomeFilledFields: state.genome?.filledFields ?? null,
      amCompleteness: state.applicationModel ? Math.round(state.applicationModel.completeness * 100) / 100 : null,
      amPageCount: state.applicationModel?.pageCount ?? null,
      amEntityCount: state.applicationModel?.entityCount ?? null,
      amRelationshipCount: state.applicationModel?.relationshipCount ?? null,
      productIntelligenceClassified: state.productIntelligence?.classified ?? null,
      sketchExists: state.sketch?.exists ?? null,
      sketchApprovedCount: state.sketch?.approvedCount ?? null,
      designPlanStatus: state.designPlan?.status ?? null,
      flowNodeCount: state.flow?.nodeCount ?? null,
      memoryEntryCount: state.memory?.entryCount ?? null,
    },
    rules,
    actionableRules,
    blockedRules,
  };

  // Structured log — written at info level when any rule triggers, debug otherwise
  if (actionableRules > 0 || blockedRules > 0) {
    logger.info(
      {
        orchestrator: {
          projectId,
          evaluatedAt,
          actionableRules,
          blockedRules,
          triggered: rules.filter((r) => r.triggered).map((r) => ({
            ruleId: r.ruleId,
            confidence: r.confidence,
            missingInputs: r.missingInputs,
            proposedAction: r.proposedAction,
          })),
        },
      },
      "ArtifactOrchestrator: pipeline evaluation complete"
    );
  } else {
    logger.debug(
      { orchestrator: { projectId, evaluatedAt, triggeredRules: 0 } },
      "ArtifactOrchestrator: no rules triggered"
    );
  }

  return result;
}
