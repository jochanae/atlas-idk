import { db, projectArtifactsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { logger } from "./logger";

// Shared helper: log a generated artifact for a project.
// version is auto-computed by counting existing artifacts of the same type
// unless explicitly provided.
export async function logProjectArtifact({
  projectId,
  type,
  version,
  title,
  metadata = {},
  payload = {},
}: {
  projectId: number;
  type: string;
  version?: number;
  title: string;
  metadata?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    let resolvedVersion = version;
    if (resolvedVersion === undefined) {
      const [row] = await db
        .select({ cnt: count() })
        .from(projectArtifactsTable)
        .where(
          and(
            eq(projectArtifactsTable.projectId, projectId),
            eq(projectArtifactsTable.type, type),
          ),
        );
      resolvedVersion = (Number(row?.cnt ?? 0)) + 1;
    }
    await db.insert(projectArtifactsTable).values({
      projectId,
      type,
      version: resolvedVersion,
      title,
      metadata,
      payload,
    });
  } catch (err) {
    logger.warn({ err, projectId, type }, "logProjectArtifact: failed to insert — non-fatal");
  }
}
