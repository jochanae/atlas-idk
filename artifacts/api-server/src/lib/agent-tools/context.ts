import type { Response } from "express";
import type { RunMode } from "@workspace/run-contract";
import type { ProposePlanPayload } from "./schemas/plan";

export interface AgentFileEdit {
  path: string;
  language: string;
  content: string;
}

export interface AgentLinePatch {
  path: string;
  find: string;
  replace: string;
}

/** Structured metadata for a file-backed deliverable created this turn (pptx/docx/xlsx). */
export interface GeneratedArtifactMeta {
  ok: true;
  artifactId: number;
  projectId: number;
  type: string;
  title: string;
  extension: string;
  downloadUrl: string;
  preview: Record<string, unknown>;
  summary?: string;
}

/** Non-code timeline step accumulated by tools for execution_run_steps persistence. */
export interface AgentTimelineStep {
  verb: string;
  target: string | null;
  detail: string | null;
  content: string | null;
  artifactUrl?: string | null;
}

export interface AgentToolSideEffects {
  fileEdits: AgentFileEdit[];
  linePatches: AgentLinePatch[];
  finishSummary: string | null;
  buildRunEmitted: boolean;
  /** Set once runClosedLoopVerification has been run for this turn (Phase 3 completion gate). */
  verificationPassed: boolean | null;
  verificationReportText: string | null;
  /** File-backed deliverables created this turn (for stream done + inline cards). */
  generatedArtifacts: GeneratedArtifactMeta[];
  /** Timeline steps (e.g. ARTIFACT_CREATED) to persist on the execution run. */
  timelineSteps: AgentTimelineStep[];
}

export interface AgentPlanState {
  activePlanId: string | null;
  latestPlanPayload: ProposePlanPayload | null;
  hasApprovedCommitPlan: boolean;
}

export interface AgentToolContext {
  projectId: number;
  userId: number;
  messageId?: number;
  workspaceDir: string;
  res: Response;
  sideEffects: AgentToolSideEffects;
  planState: AgentPlanState;
  structuredPlanEnabled: boolean;
  messages: Array<{ role: string; content: string }>;
  stepId: () => string;
  emitToolCall: (name: string, args: Record<string, unknown>) => void;
  emitToolResult: (name: string, ok: boolean, ms: number) => void;
  emitNamedEvent: (event: string, data: object) => void;
  writeStep: (s: { verb: string; target?: string; phase: string }) => void;
  /**
   * v1.4: The authoritative run ID for this turn — supplied by the server,
   * never by the model. The advance_execution_state tool reads this instead
   * of accepting a model-provided runId.
   */
  activeExecutionRunId: string | null;
  /**
   * v1.4: The epistemic posture for this turn (EXPLORE | INVESTIGATE | EXECUTE).
   * Derived from WhisperGate intent at turn start; may escalate to INVESTIGATE
   * on DECIDE turns when investigation tools fire.
   */
  runMode: RunMode;
}

export function createSideEffects(): AgentToolSideEffects {
  return {
    fileEdits: [],
    linePatches: [],
    finishSummary: null,
    buildRunEmitted: false,
    verificationPassed: null,
    verificationReportText: null,
    generatedArtifacts: [],
    timelineSteps: [],
  };
}

export function createPlanState(): AgentPlanState {
  return {
    activePlanId: null,
    latestPlanPayload: null,
    hasApprovedCommitPlan: false,
  };
}
