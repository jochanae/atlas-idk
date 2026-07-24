/**
 * Auto-resolve parked items when the underlying question is answered elsewhere.
 * Contract: resolve when a matching Decision/commitment is committed or promoted.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { entriesTable } from "@workspace/db/schema";
import { logger } from "./logger";

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
}

function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 12 && (nb.includes(na) || na.includes(nb))) return true;
  return false;
}

/**
 * Mark matching parked/draft items in the same project as resolved.
 * Skips the committing entry itself. Non-fatal on failure.
 */
export async function resolveMatchingParkedEntries(opts: {
  projectId: number;
  committedEntryId: number;
  title: string;
  reason: string;
}): Promise<number> {
  try {
    const open = await db
      .select({
        id: entriesTable.id,
        title: entriesTable.title,
        enrichmentJson: entriesTable.enrichmentJson,
      })
      .from(entriesTable)
      .where(
        and(
          eq(entriesTable.projectId, opts.projectId),
          sql`${entriesTable.status} in ('parked', 'draft')`,
          ne(entriesTable.id, opts.committedEntryId),
        ),
      );

    const matches = open.filter((row) => titlesMatch(row.title, opts.title));
    if (matches.length === 0) return 0;

    let resolved = 0;
    for (const row of matches) {
      let enrichment: Record<string, unknown> = {};
      if (row.enrichmentJson) {
        try {
          enrichment = JSON.parse(row.enrichmentJson) as Record<string, unknown>;
        } catch {
          enrichment = {};
        }
      }
      enrichment.resolvedAt = new Date().toISOString();
      enrichment.resolvedBy = opts.committedEntryId;
      enrichment.resolvedReason = opts.reason;

      await db
        .update(entriesTable)
        .set({
          status: "resolved",
          severity: "resolved",
          enrichmentJson: JSON.stringify(enrichment),
        })
        .where(eq(entriesTable.id, row.id));
      resolved += 1;
    }

    if (resolved > 0) {
      logger.info(
        {
          projectId: opts.projectId,
          committedEntryId: opts.committedEntryId,
          resolved,
          reason: opts.reason,
        },
        "parking lot: auto-resolved matching deferred items",
      );
    }
    return resolved;
  } catch (err) {
    logger.warn({ err }, "parking lot: auto-resolve failed — non-fatal");
    return 0;
  }
}
