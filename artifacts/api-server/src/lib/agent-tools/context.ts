import type { Response } from "express";

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
}

export interface AgentToolContext {
  projectId: number;
  userId: number;
  workspaceDir: string;
  res: Response;
  sideEffects: AgentToolSideEffects;
  stepId: () => string;
  emitToolCall: (name: string, args: Record<string, unknown>) => void;
  emitToolResult: (name: string, ok: boolean, ms: number) => void;
  writeStep: (s: { verb: string; target?: string; phase: string }) => void;
}

export function createSideEffects(): AgentToolSideEffects {
  return {
    fileEdits: [],
    linePatches: [],
    finishSummary: null,
    buildRunEmitted: false,
  };
}
