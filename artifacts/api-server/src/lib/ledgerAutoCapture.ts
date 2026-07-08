import { db, entriesTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Extract a short title from an Atlas response.
 * Priority: first bold phrase → first heading → first sentence → first line → fallback.
 */
function extractDecisionTitle(content: string): string {
  const boldMatch = content.match(/\*\*([^*\n]{8,120})\*\*/);
  if (boldMatch) return boldMatch[1].trim().slice(0, 120);

  const headingMatch = content.match(/^#{1,3}\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim().slice(0, 120);

  const sentenceMatch = content.match(/^[^.!?\n]{10,}[.!?]/m);
  if (sentenceMatch) return sentenceMatch[0].trim().slice(0, 120);

  const firstLine = content.split("\n").find((l) => l.trim().length > 5);
  if (firstLine) return firstLine.trim().slice(0, 120);

  return "Decision";
}

/**
 * Draft-capture a DECISION signal to the Ledger.
 *
 * Creates a parked (draft) entry so the user can confirm or discard it.
 * Returns { entryId, title } on success so the caller can include it in the
 * SSE done event for the frontend confirm chip.  Returns null on any failure.
 *
 * Called by nexus.ts when classifySurfaceSignal() returns type:"DECISION"
 * and a focusProjectId is available (both BUILD and DECIDE turns).
 */
export async function draftCaptureLedgerDecision({
  projectId,
  userId,
  sessionId,
  content,
  sourceMessageId,
}: {
  projectId: number;
  userId: number;
  sessionId: number | null;
  content: string;
  sourceMessageId: number | null;
}): Promise<{ entryId: number; title: string } | null> {
  try {
    const title = extractDecisionTitle(content);
    const summary = content
      .replace(/#{1,3}\s+/g, "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .trim()
      .slice(0, 300);

    const [entry] = await db.insert(entriesTable).values({
      projectId,
      sessionId,
      type: "Decision",
      status: "parked",
      severity: "neutral",
      mode: "auto-draft",
      title,
      summary,
      details: content,
      ...(sourceMessageId != null ? { sourceMessageId } : {}),
    } as typeof entriesTable.$inferInsert).returning({ id: entriesTable.id, title: entriesTable.title });

    logger.info({ projectId, userId, title, entryId: entry.id }, "ledger: draft-captured decision (awaiting user confirm)");
    return { entryId: entry.id, title: entry.title };
  } catch (err) {
    logger.warn({ err }, "ledger: draftCaptureLedgerDecision failed — non-fatal");
    return null;
  }
}

/**
 * @deprecated Use draftCaptureLedgerDecision instead. Left for call-site
 * compatibility during migration; will be removed in a follow-up.
 */
export async function autoCaptureLedgerDecision(args: {
  projectId: number;
  userId: number;
  sessionId: number | null;
  content: string;
  sourceMessageId: number | null;
}): Promise<void> {
  await draftCaptureLedgerDecision(args);
}
