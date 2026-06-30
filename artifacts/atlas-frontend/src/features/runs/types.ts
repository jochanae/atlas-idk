// Run inspection surface — pass 1
// See .lovable/plan.md. Frontend-only; sourced from ActiveRuns until backend persistence lands.

export type RunStatus = "running" | "applied" | "partial" | "failed";

export interface RunFileError {
  line: number;
  col: number;
  message: string;
}

export interface RunFile {
  path: string;
  state: "applied" | "blocked";
  reason?: string;
  errors?: RunFileError[];
}

export interface RunApplyError {
  code: number;
  message: string;
}

export interface Run {
  id: string;
  intent: string;
  createdAt: string;
  status: RunStatus;
  counts: { applied: number; blocked: number };
  files: RunFile[];
  applyError?: RunApplyError;
  diffRef?: string;
  sourceMessageId?: string;
  // Convenience pass-throughs for the inspection view.
  projectId?: number;
  projectName?: string;
  prUrl?: string;
  summaryLine?: string;
  streamedContent?: string;
  shellLines?: Array<{ kind: "cmd" | "out" | "err"; text: string }>;
}
