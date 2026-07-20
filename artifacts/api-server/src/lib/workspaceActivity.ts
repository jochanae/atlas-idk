/**
 * Workspace activity emission — attachment + turn lifecycle verbs for
 * GET /api/nexus/activity. Frontend already renders these types.
 *
 * Idempotent: each event has a stable idempotencyKey; ON CONFLICT DO NOTHING
 * so retries / rapid double-sends do not duplicate rows.
 */

import {
  db,
  projectsTable,
  workspaceActivityTable,
  type WorkspaceActivityType,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { logger } from "./logger";

export type { WorkspaceActivityType };

export {
  attachmentExtLabel,
  documentAnalyzedSubtitle,
  formatAttachmentSize,
  responseGeneratedSubtitle,
  unsupportedAttachmentReason,
} from "./workspaceActivityFormat";

export type EmitWorkspaceActivityParams = {
  userId: number;
  projectId: number | null | undefined;
  type: WorkspaceActivityType;
  title: string;
  subtitle?: string | null;
  attachmentName?: string | null;
  reason?: string | null;
  /** Stable unique key — collisions are ignored (idempotent emit). */
  idempotencyKey: string;
};

/** Resolve project for activity: preferred id, else user's most recently opened. */
export async function resolveActivityProjectId(
  userId: number,
  preferred: number | null | undefined,
): Promise<number | null> {
  if (preferred != null && Number.isFinite(preferred) && preferred > 0) {
    return preferred;
  }
  try {
    const [row] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.userId, userId))
      .orderBy(desc(projectsTable.lastOpenedAt))
      .limit(1);
    return row?.id ?? null;
  } catch (err) {
    logger.warn({ err, userId }, "workspaceActivity: default project lookup failed");
    return null;
  }
}

/**
 * Insert a workspace activity event. Never throws to callers — emission is
 * best-effort and must not break chat/finalize.
 */
export async function emitWorkspaceActivity(
  params: EmitWorkspaceActivityParams,
): Promise<{ id: number } | null> {
  try {
    const projectId = await resolveActivityProjectId(
      params.userId,
      params.projectId,
    );
    if (projectId == null) {
      logger.info(
        { userId: params.userId, type: params.type },
        "workspaceActivity: skip emit — no project for user",
      );
      return null;
    }

    const key = params.idempotencyKey.slice(0, 512);
    const [row] = await db
      .insert(workspaceActivityTable)
      .values({
        userId: params.userId,
        projectId,
        type: params.type,
        title: params.title.slice(0, 500),
        subtitle: params.subtitle?.slice(0, 500) ?? null,
        attachmentName: params.attachmentName?.slice(0, 512) ?? null,
        reason: params.reason?.slice(0, 500) ?? null,
        idempotencyKey: key,
      })
      .onConflictDoNothing()
      .returning({ id: workspaceActivityTable.id });

    return row ?? null;
  } catch (err) {
    logger.warn(
      {
        err,
        userId: params.userId,
        type: params.type,
        idempotencyKey: params.idempotencyKey,
      },
      "workspaceActivity: emit failed — non-fatal",
    );
    return null;
  }
}

/** Fire-and-forget wrapper for hot paths that should not await. */
export function emitWorkspaceActivityAsync(
  params: EmitWorkspaceActivityParams,
): void {
  void emitWorkspaceActivity(params);
}
