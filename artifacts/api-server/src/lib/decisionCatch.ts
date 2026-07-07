import { sql, eq, and } from "drizzle-orm";
import { db, entriesTable } from "@workspace/db";
import { embedText } from "./embeddings";
import { logger } from "./logger";
import { isSummaryObservation, wouldEmitCommitCard } from "./decisionSignals";

export type CatchCheckKind = "alignment" | "conflict" | "pattern";

export type CatchCheck = {
  kind: CatchCheckKind;
  entryId?: number;
  entryTitle?: string;
  note: string;
};

export type CatchPayload = {
  v: 1;
  intent: string;
  checks: CatchCheck[];
  primaryConflictEntryId?: number;
  deviationTitle?: string;
};

type CommittedEntryHit = {
  id: number;
  title: string;
  summary: string | null;
  verb: string | null;
  deviation: boolean;
  catchAgainstId: number | null;
  sessionId: number | null;
  score: number;
};

const SIMILARITY_THRESHOLD = 0.72;
const CONFLICT_VERB_RE =
  /\b(switch(?:ing|ed)?\s+(?:to|from)|instead(?:\s+of)?|replace(?:ing|d)?|drop(?:ping)?|move\s+away\s+from|move\s+to|use\s+\w+\s+now|let'?s\s+(?:move|switch|migrate)\s+to|migrat(?:e|ing)\s+to|no\s+longer|rather\s+than|abandon(?:ing)?|pivot(?:ing)?\s+to)\b/i;

const INTENT_RESTATED_RE =
  /\b(we(?:'re| are)|let'?s|i(?:'ll| will)|going to|switching to|moving to|replacing|using)\b/i;

export function hasConflictSignal(turnText: string, _entryTitle?: string): boolean {
  return CONFLICT_VERB_RE.test(turnText.toLowerCase());
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function extractIntentSummary(userText: string, assistantText: string): string {
  const sentences = assistantText
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const restated = sentences.find((s) => INTENT_RESTATED_RE.test(s));
  if (restated) return truncate(restated, 200);

  const firstUser =
    userText
      .replace(/\s+/g, " ")
      .trim()
      .split(/(?<=[.!?])\s+/)[0] ?? userText;
  return truncate(firstUser.trim(), 200);
}

async function fetchSimilarCommittedEntries(
  projectId: number,
  userId: number,
  turnText: string,
): Promise<CommittedEntryHit[]> {
  const embedding = await embedText(turnText);
  if (!embedding) return [];

  const vectorStr = `[${embedding.join(",")}]`;
  try {
    const rows = await db.execute(sql`
      SELECT e.id, e.title, e.summary, e.verb, e.deviation, e.catch_against_id, e.session_id,
             1 - (emb.embedding <=> ${vectorStr}::vector) AS score
      FROM embeddings emb
      INNER JOIN entries e ON e.id = emb.entity_id
      WHERE emb.entity_type = 'entry'
        AND emb.user_id = ${userId}
        AND e.project_id = ${projectId}
        AND e.status = 'committed'
        AND emb.embedding IS NOT NULL
      ORDER BY emb.embedding <=> ${vectorStr}::vector
      LIMIT 20
    `);

    return (rows.rows as Array<Record<string, unknown>>)
      .map((r) => ({
        id: Number(r.id),
        title: String(r.title ?? ""),
        summary: r.summary != null ? String(r.summary) : null,
        verb: r.verb != null ? String(r.verb) : null,
        deviation: Boolean(r.deviation),
        catchAgainstId: r.catch_against_id != null ? Number(r.catch_against_id) : null,
        sessionId: r.session_id != null ? Number(r.session_id) : null,
        score: Number(r.score),
      }))
      .filter((r) => r.score >= SIMILARITY_THRESHOLD);
  } catch {
    return [];
  }
}

async function fetchPriorDeviationEntries(
  projectId: number,
  againstEntryIds: number[],
): Promise<Array<{ id: number; title: string; catchAgainstId: number | null }>> {
  if (againstEntryIds.length === 0) return [];
  try {
    const rows = await db
      .select({
        id: entriesTable.id,
        title: entriesTable.title,
        catchAgainstId: entriesTable.catchAgainstId,
      })
      .from(entriesTable)
      .where(
        and(
          eq(entriesTable.projectId, projectId),
          eq(entriesTable.status, "committed"),
          sql`(${entriesTable.deviation} = true OR ${entriesTable.verb} = 'override')`,
        ),
      );
    return rows.filter(
      (r) => r.catchAgainstId != null && againstEntryIds.includes(r.catchAgainstId),
    );
  } catch {
    return [];
  }
}

export function buildCatchChecks(
  hits: CommittedEntryHit[],
  turnText: string,
  priorDeviations: Array<{ id: number; title: string; catchAgainstId: number | null }>,
): CatchCheck[] {
  const conflicts: CatchCheck[] = [];
  const patterns: CatchCheck[] = [];
  const alignments: CatchCheck[] = [];

  for (const hit of hits) {
    if (hasConflictSignal(turnText, hit.title)) {
      conflicts.push({
        kind: "conflict",
        entryId: hit.id,
        entryTitle: hit.title,
        note: `This may conflict with "${hit.title}" — the turn signals a change or replacement.`,
      });
    } else {
      alignments.push({
        kind: "alignment",
        entryId: hit.id,
        entryTitle: hit.title,
        note: `This aligns with the committed decision "${hit.title}".`,
      });
    }

    if (hit.verb === "override" || hit.deviation) {
      patterns.push({
        kind: "pattern",
        entryId: hit.id,
        entryTitle: hit.title,
        note: `You've overridden this kind of decision before ("${hit.title}").`,
      });
    }
  }

  for (const dev of priorDeviations) {
    const targetTitle = hits.find((h) => h.id === dev.catchAgainstId)?.title ?? "a prior decision";
    if (!patterns.some((p) => p.entryId === dev.id)) {
      patterns.push({
        kind: "pattern",
        entryId: dev.id,
        entryTitle: dev.title,
        note: `You've overridden "${targetTitle}" before — this turn touches the same ground.`,
      });
    }
  }

  return [...conflicts, ...patterns, ...alignments].slice(0, 3);
}

export async function detectDecisionCatch(input: {
  projectId: number;
  userId: number;
  userText: string;
  assistantText: string;
  intent: "think" | "build" | "decide";
  confidence: number;
  sessionId?: number | null;
}): Promise<CatchPayload | null> {
  const turnText = `${input.userText}\n${input.assistantText}`;
  let topEntryId: number | null = null;
  let topSimilarity = 0;
  let suppressReason: string | undefined;
  let emitted = false;

  const logAttempt = (extra: Record<string, unknown> = {}) => {
    logger.info(
      {
        projectId: input.projectId,
        intent: input.intent,
        confidence: input.confidence,
        topEntryId: extra.topEntryId ?? topEntryId,
        topSimilarity: extra.topSimilarity ?? topSimilarity,
        emitted,
        suppressReason,
      },
      "decisionCatch: attempt",
    );
  };

  if (input.intent !== "build" && input.intent !== "decide") {
    suppressReason = "intent_not_build_or_decide";
    logAttempt();
    return null;
  }

  if (input.confidence < 0.6) {
    suppressReason = "low_confidence";
    logAttempt();
    return null;
  }

  if (isSummaryObservation(input.assistantText)) {
    suppressReason = "summary_observation";
    logAttempt();
    return null;
  }

  if (wouldEmitCommitCard(input.assistantText, input.userText)) {
    suppressReason = "commit_card_present";
    logAttempt();
    return null;
  }

  const hits = await fetchSimilarCommittedEntries(input.projectId, input.userId, turnText);
  if (hits.length === 0) {
    suppressReason = "no_similar_entries";
    logAttempt();
    return null;
  }

  topSimilarity = hits[0]?.score ?? 0;
  const topId = hits[0]?.id ?? null;

  const conflictEntryIds = hits
    .filter((h) => hasConflictSignal(turnText, h.title))
    .map((h) => h.id);

  if (conflictEntryIds.length === 0) {
    suppressReason = "alignment_only";
    logAttempt({ topEntryId: topId, topSimilarity });
    return null;
  }

  const primaryConflict = hits
    .filter((h) => hasConflictSignal(turnText, h.title))
    .sort((a, b) => b.score - a.score)[0];

  if (!primaryConflict) {
    suppressReason = "no_conflict_entry";
    logAttempt({ topEntryId: topId, topSimilarity });
    return null;
  }

  if (
    input.sessionId != null &&
    primaryConflict.sessionId === input.sessionId
  ) {
    suppressReason = "same_session_entry";
    logAttempt({ topEntryId: primaryConflict.id, topSimilarity });
    return null;
  }

  const priorDeviations = await fetchPriorDeviationEntries(
    input.projectId,
    conflictEntryIds,
  );

  const checks = buildCatchChecks(hits, turnText, priorDeviations);
  if (!checks.some((c) => c.kind === "conflict")) {
    suppressReason = "no_conflict_checks";
    logAttempt({ topEntryId: primaryConflict.id, topSimilarity });
    return null;
  }

  emitted = true;
  const payload: CatchPayload = {
    v: 1,
    intent: extractIntentSummary(input.userText, input.assistantText),
    checks,
    primaryConflictEntryId: primaryConflict.id,
    deviationTitle: truncate(`Overrode: ${primaryConflict.title}`, 140),
  };

  logAttempt({ topEntryId: primaryConflict.id, topSimilarity });
  return payload;
}
