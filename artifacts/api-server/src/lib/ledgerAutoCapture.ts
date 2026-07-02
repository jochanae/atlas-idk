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
 * Auto-capture a DECISION signal to the Ledger.
 * Fire-and-forget — never throws, never blocks the response stream.
 *
 * Called by nexus.ts when classifySurfaceSignal() returns type:"DECISION"
 * and a focusProjectId is available.
 */
export async function autoCaptureLedgerDecision({
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
}): Promise<void> {
  try {
    const title = extractDecisionTitle(content);
    const summary = content
      .replace(/#{1,3}\s+/g, "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .trim()
      .slice(0, 300);

    await db.insert(entriesTable).values({
      projectId,
      sessionId,
      type: "Decision",
      status: "committed",
      severity: "committed",
      mode: "auto",
      title,
      summary,
      details: content,
      ...(sourceMessageId != null ? { sourceMessageId } : {}),
    } as typeof entriesTable.$inferInsert);

    logger.info({ projectId, userId, title }, "ledger: auto-captured decision");
  } catch (err) {
    logger.warn({ err }, "ledger: autoCaptureLedgerDecision failed — non-fatal");
  }
}
