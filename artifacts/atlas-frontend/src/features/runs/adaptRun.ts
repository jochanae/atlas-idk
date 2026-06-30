// Adapt an in-memory ActiveRun (from components/home/ActiveRuns) into the
// Run inspection shape. Pure mapping — no IO, no fetches.

import type { ActiveRun } from "@/components/home/ActiveRuns";
import type { Run, RunFile, RunStatus } from "./types";

function mapStatus(r: ActiveRun): RunStatus {
  if (r.status === "queued" || r.status === "running") return "running";
  if (r.status === "failed") return "failed";
  // completed
  const hasBlocked = (r.applyErrors?.length ?? 0) > 0 || !!r.applyError;
  const hasApplied = (r.appliedFiles?.length ?? 0) > 0;
  if (hasBlocked && hasApplied) return "partial";
  if (hasBlocked) return "failed";
  return "applied";
}

export function adaptRun(r: ActiveRun): Run {
  const applied = r.appliedFiles ?? [];
  const blocked = r.applyErrors ?? [];

  const files: RunFile[] = [
    ...applied.map<RunFile>((path) => ({ path, state: "applied" })),
    ...blocked.map<RunFile>((b) => ({
      path: b.path,
      state: "blocked",
      reason: b.reason === "typecheck"
        ? "Typecheck failed · not written"
        : "Partial apply · not written",
      errors: b.errors?.map((e) => ({ line: e.line, col: e.col, message: e.message })) ?? [],
    })),
  ];

  return {
    id: r.id,
    intent: r.summaryLine || r.prompt || "(no intent)",
    createdAt: new Date(r.createdAt).toISOString(),
    status: mapStatus(r),
    counts: { applied: applied.length, blocked: blocked.length },
    files,
    applyError: r.applyError ? { code: 0, message: r.applyError } : undefined,
    sourceMessageId: r.sessionId ? String(r.sessionId) : undefined,
    projectId: r.projectId,
    projectName: r.projectName,
    prUrl: r.prUrl,
    summaryLine: r.summaryLine,
    streamedContent: r.streamedContent,
    shellLines: r.shellLines,
  };
}
