/**
 * Auto-resolve parked items when the underlying question is answered elsewhere.
 *
 * Precision-first: prefer missing a resolve over a false positive.
 * Contract six-month rule > clever exits.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { entriesTable } from "@workspace/db/schema";
import { logger } from "./logger";

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "for", "to", "of", "in", "on", "at",
  "is", "are", "was", "be", "this", "that", "it", "we", "our", "as", "with",
  "from", "by", "about", "into", "should", "will", "can", "do", "does",
]);

/** Minimum score to auto-resolve. Biased high to avoid false positives. */
export const RESOLVE_SCORE_MIN = 0.82;

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function significantTokens(title: string): string[] {
  return normalizeTitle(title)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Score how confidently parkedTitle is the same unresolved item as committedTitle.
 * Returns 0..1. Exact match = 1. Substring-only soft matches stay below threshold.
 */
export function scoreParkResolveMatch(parkedTitle: string, committedTitle: string): number {
  const a = normalizeTitle(parkedTitle);
  const b = normalizeTitle(committedTitle);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const ta = significantTokens(parkedTitle);
  const tb = significantTokens(committedTitle);
  if (ta.length === 0 || tb.length === 0) return 0;

  // Require enough substance on both sides — short titles need exactness.
  if (Math.min(ta.length, tb.length) < 2 && a !== b) return 0;

  const setA = new Set(ta);
  const setB = new Set(tb);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  const union = setA.size + setB.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;

  // Containment only helps when nearly all of the shorter token set is covered
  // and both sides are reasonably long — blocks "Pricing" ⊂ "Pricing tension…".
  const shorter = setA.size <= setB.size ? setA : setB;
  const longer = setA.size <= setB.size ? setB : setA;
  let contained = 0;
  for (const t of shorter) if (longer.has(t)) contained += 1;
  const containment = shorter.size === 0 ? 0 : contained / shorter.size;
  const containmentBonus =
    shorter.size >= 3 && containment >= 0.9 && jaccard >= 0.55 ? 0.12 : 0;

  // Bare substring without strong token overlap → reject (legacy false-positive path).
  if ((a.includes(b) || b.includes(a)) && jaccard < 0.55) {
    return Math.min(0.5, jaccard);
  }

  return Math.min(1, jaccard + containmentBonus);
}

export function shouldAutoResolveParked(parkedTitle: string, committedTitle: string): boolean {
  return scoreParkResolveMatch(parkedTitle, committedTitle) >= RESOLVE_SCORE_MIN;
}

/**
 * Mark at most one best-matching parked/draft item as resolved.
 * Skips the committing entry itself. Non-fatal on failure.
 */
export async function resolveMatchingParkedEntries(opts: {
  projectId: number;
  committedEntryId: number;
  title: string;
  reason: string;
  /** Optional: only resolve same type family when provided. */
  type?: string | null;
}): Promise<number> {
  try {
    const open = await db
      .select({
        id: entriesTable.id,
        title: entriesTable.title,
        type: entriesTable.type,
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

    type Scored = { id: number; title: string; enrichmentJson: string | null; score: number };
    const scored: Scored[] = [];
    for (const row of open) {
      // Type family gate when we know the committed type — Decision resolves Decision/Question/Idea.
      if (opts.type) {
        const committed = opts.type;
        const parked = row.type;
        const compatible =
          parked === committed ||
          (committed === "Decision" && (parked === "Idea" || parked === "Question" || parked === "Insight")) ||
          (committed === "Question" && (parked === "Idea" || parked === "Decision"));
        if (!compatible) continue;
      }
      const score = scoreParkResolveMatch(row.title, opts.title);
      if (score >= RESOLVE_SCORE_MIN) {
        scored.push({
          id: row.id,
          title: row.title,
          enrichmentJson: row.enrichmentJson,
          score,
        });
      }
    }

    if (scored.length === 0) return 0;

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0]!;
    // If two candidates are close, refuse — ambiguity is worse than leaving open.
    if (scored.length > 1 && scored[1]!.score >= best.score - 0.05) {
      logger.info(
        {
          projectId: opts.projectId,
          committedEntryId: opts.committedEntryId,
          best: best.score,
          second: scored[1]!.score,
        },
        "parking lot: auto-resolve skipped — ambiguous matches",
      );
      return 0;
    }

    let enrichment: Record<string, unknown> = {};
    if (best.enrichmentJson) {
      try {
        enrichment = JSON.parse(best.enrichmentJson) as Record<string, unknown>;
      } catch {
        enrichment = {};
      }
    }
    enrichment.resolvedAt = new Date().toISOString();
    enrichment.resolvedBy = opts.committedEntryId;
    enrichment.resolvedReason = opts.reason;
    enrichment.resolveScore = best.score;

    await db
      .update(entriesTable)
      .set({
        status: "resolved",
        severity: "resolved",
        enrichmentJson: JSON.stringify(enrichment),
      })
      .where(eq(entriesTable.id, best.id));

    logger.info(
      {
        projectId: opts.projectId,
        committedEntryId: opts.committedEntryId,
        resolvedId: best.id,
        score: best.score,
        reason: opts.reason,
      },
      "parking lot: auto-resolved matching deferred item",
    );
    return 1;
  } catch (err) {
    logger.warn({ err }, "parking lot: auto-resolve failed — non-fatal");
    return 0;
  }
}
