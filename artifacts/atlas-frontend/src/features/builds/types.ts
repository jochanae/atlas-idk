export type BuildCommand = "typecheck" | "build";
export type BuildStatus = "idle" | "running" | "success" | "failed" | "timeout" | "error";

export interface BuildLine {
  kind: "out" | "err";
  text: string;
}

export interface BuildResult {
  buildId: string;
  command: BuildCommand;
  status: BuildStatus;
  exitCode: number;
  duration: number;
  errorSummary: string | null;
  lines: BuildLine[];
}
