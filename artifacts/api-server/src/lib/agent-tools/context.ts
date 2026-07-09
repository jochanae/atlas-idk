import type { Response } from "express";
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

export interface AgentToolSideEffects {
  fileEdits: AgentFileEdit[];
  linePatches: AgentLinePatch[];
  finishSummary: string | null;
  buildRunEmitted: boolean;
  /** Set once runClosedLoopVerification has been run for this turn (Phase 3 completion gate). */
  verificationPassed: boolean | null;
  verificationReportText: string | null;
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
}

export function createSideEffects(): AgentToolSideEffects {
  return {
    fileEdits: [],
    linePatches: [],
    finishSummary: null,
    buildRunEmitted: false,
    verificationPassed: null,
    verificationReportText: null,
  };
}

export function createPlanState(): AgentPlanState {
  return {
    activePlanId: null,
    latestPlanPayload: null,
    hasApprovedCommitPlan: false,
  };
}
