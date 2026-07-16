import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export type MutationActor = "atlas" | "user" | "system";

export interface MutationContext {
  actor: MutationActor;
  verb: string;
  runId?: string | null;
  userId?: number | null;
}

export const GUARDED_ATLAS_VERBS = new Set([
  "FILE_EDIT",
  "LINE_PATCH",
  "FILE_CREATE",
  "FILE_DELETE",
  "FILE_MOVE",
  "ARTIFACT_CREATE",
  "ARTIFACT_REPLACE",
  "ARTIFACT_DELETE",
  "GITHUB_PUSH",
  "DEPLOY",
  "SCHEMA_MUTATION",
  "SHELL_WRITE",
  "DEPENDENCY_INSTALL",
]);

export type MutationGuardCode =
  | "NO_ACTIVE_RUN"
  | "RUN_NOT_EXECUTING"
  | "WRONG_MODE"
  | "SCOPE_EXPANSION"
  | "PLAN_MODE_BLOCKED";

export interface MutationGuardResult {
  allowed: boolean;
  reason?: string;
  code?: MutationGuardCode;
}

/**
 * Check whether an Atlas-initiated mutation is authorized.
 * User and system actors always pass — they are governed by their own
 * route-level auth, not the run lifecycle contract.
 *
 * Call this before executing any guarded verb for an Atlas agent turn.
 * If the result is { allowed: false }, reject with 403 and include the reason.
 */
export async function checkAtlasMutation(
  ctx: MutationContext,
): Promise<MutationGuardResult> {
  if (ctx.actor !== "atlas") return { allowed: true };

  const verb = ctx.verb.toUpperCase();
  if (!GUARDED_ATLAS_VERBS.has(verb)) return { allowed: true };

  if (!ctx.runId) {
    return {
      allowed: false,
      reason:
        "Atlas cannot execute a mutation without an active run. The run must be in executing status.",
      code: "NO_ACTIVE_RUN",
    };
  }

  try {
    const rows = await db.execute(sql`
      SELECT status, run_mode FROM execution_runs WHERE id = ${ctx.runId}
    `);

    if (!rows.rows.length) {
      return {
        allowed: false,
        reason: `Run ${ctx.runId} not found.`,
        code: "NO_ACTIVE_RUN",
      };
    }

    const row = rows.rows[0] as { status: string; run_mode: string | null };

    if (
      row.status === "awaiting_confirmation" ||
      row.status === "planning"
    ) {
      return {
        allowed: false,
        reason: `Atlas cannot write files while run is in "${row.status}" status. The build plan must be authorized first.`,
        code: "PLAN_MODE_BLOCKED",
      };
    }

    const executingStatuses = new Set(["running", "executing"]);
    if (!executingStatuses.has(row.status)) {
      return {
        allowed: false,
        reason: `Atlas cannot write files. Run status is "${row.status}" — must be "executing".`,
        code: "RUN_NOT_EXECUTING",
      };
    }

    const mode = row.run_mode ?? "EXPLORE";
    if (mode === "EXPLORE") {
      return {
        allowed: false,
        reason:
          "This run is in EXPLORE mode. File writes require EXECUTE mode. This is a conversational or investigative turn.",
        code: "WRONG_MODE",
      };
    }

    return { allowed: true };
  } catch (err) {
    logger.warn(
      { err, runId: ctx.runId, verb: ctx.verb },
      "mutationGuard: DB check failed — allowing for resilience",
    );
    return { allowed: true };
  }
}

/**
 * Synchronous pre-check using a cached run status — avoids DB round-trips
 * during the hot streaming path. Use when you already know the run's current
 * status and mode from in-memory state.
 */
export function checkAtlasMutationSync(opts: {
  actor: MutationActor;
  verb: string;
  runStatus: string | null;
  runMode: string | null;
  runId: string | null;
}): MutationGuardResult {
  if (opts.actor !== "atlas") return { allowed: true };

  const verb = (opts.verb ?? "").toUpperCase();
  if (!GUARDED_ATLAS_VERBS.has(verb)) return { allowed: true };

  if (!opts.runId) {
    return {
      allowed: false,
      reason: "No active run ID — Atlas cannot mutate without a run in scope.",
      code: "NO_ACTIVE_RUN",
    };
  }

  const status = opts.runStatus ?? "";
  if (status === "awaiting_confirmation" || status === "planning") {
    return {
      allowed: false,
      reason: `Atlas cannot write files in "${status}" status. Authorization required.`,
      code: "PLAN_MODE_BLOCKED",
    };
  }

  const mode = opts.runMode ?? "EXPLORE";
  if (mode === "EXPLORE") {
    return {
      allowed: false,
      reason: "EXPLORE mode — mutations not permitted.",
      code: "WRONG_MODE",
    };
  }

  return { allowed: true };
}
