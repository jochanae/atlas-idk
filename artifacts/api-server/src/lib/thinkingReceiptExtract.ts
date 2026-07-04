import Anthropic from "@anthropic-ai/sdk";
import { db, entriesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-flight guard: one extraction per (conversationId, turnIndex) pair
const extractionInFlight = new Set<string>();

const VALID_CATEGORIES = ["Tension", "Assumption", "Desire", "Commitment", "Question", "Insight", "Blocker", "Decision"] as const;
type ReceiptCategory = typeof VALID_CATEGORIES[number];

type ThinkingReceipt = {
  headline: string;
  body: string;
  category: ReceiptCategory;
  confidence: number;
};

/**
 * Detects when a user message is asking about past reasoning, decisions, or prior context.
 * Used by both nexus.ts and chat.ts to trigger cross-surface memory retrieval.
 */
export const MEMORY_QUERY_RE =
  /\b(where|when|what|why|how|did|didn't|do you|don't you|can you|have we|haven't we).{0,30}(remember|recall|decide|decided|agree|agreed|discuss|discussed|commit|committed|tension|assumption|insight|question|figure out|figured out|said|mention|mentioned|land on|landed on)\b|\b(remind me|do you remember|earlier|before|last time|previously|past).{0,40}\?/i;

/**
 * Full-text + ILIKE search across thinking receipts for a user.
 * Used for cross-surface retrieval when the user asks about prior reasoning.
 * Optionally scoped to a specific project (workspace turns).
 */
export async function searchThinkingReceipts(opts: {
  userId: number;
  query: string;
  projectId?: number;
  limit?: number;
}): Promise<Array<{ headline: string; body: string; category: string; confidence: number }>> {
  try {
    // Strip stop words so plainto_tsquery gets meaningful tokens
    const cleaned = opts.query
      .replace(/\b(where|when|what|why|how|do|did|can|have|you|we|i|me|the|a|an|is|was|were|are|been|it|that|this|there|about|around|on|in|at|to|for|of|with|by)\b/gi, " ")
      .replace(/[?!.,]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);

    if (cleaned.length < 3) return [];

    const rows = opts.projectId
      ? await db.execute(sql`
          SELECT headline, body, category, confidence
          FROM thinking_receipts
          WHERE user_id = ${opts.userId}
            AND dismissed = false
            AND (
              conversation_id IN (SELECT 'ws-' || id::text FROM sessions WHERE project_id = ${opts.projectId})
              OR conversation_id = (SELECT conversation_id FROM projects WHERE id = ${opts.projectId} LIMIT 1)
            )
            AND (
              to_tsvector('english', headline || ' ' || body) @@ plainto_tsquery('english', ${cleaned})
              OR headline ILIKE ${`%${cleaned}%`}
              OR body ILIKE ${`%${cleaned}%`}
            )
          ORDER BY confidence DESC, created_at DESC
          LIMIT ${opts.limit ?? 5}
        `)
      : await db.execute(sql`
          SELECT headline, body, category, confidence
          FROM thinking_receipts
          WHERE user_id = ${opts.userId}
            AND dismissed = false
            AND (
              to_tsvector('english', headline || ' ' || body) @@ plainto_tsquery('english', ${cleaned})
              OR headline ILIKE ${`%${cleaned}%`}
              OR body ILIKE ${`%${cleaned}%`}
            )
          ORDER BY confidence DESC, created_at DESC
          LIMIT ${opts.limit ?? 5}
        `);

    return (rows.rows ?? rows) as Array<{ headline: string; body: string; category: string; confidence: number }>;
  } catch (err) {
    logger.warn({ err }, "searchThinkingReceipts failed — non-fatal");
    return [];
  }
}

function parseReceiptsJson(raw: string): ThinkingReceipt[] {
  try {
    const cleaned = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    const parsed: unknown = JSON.parse(match ? match[0] : cleaned);
    if (!Array.isArray(parsed)) return [];

    return (parsed as unknown[])
      .filter((r): r is Record<string, unknown> =>
        typeof r === "object" && r !== null &&
        typeof (r as Record<string, unknown>).headline === "string" &&
        typeof (r as Record<string, unknown>).body === "string"
      )
      .map(r => ({
        headline: String(r.headline).slice(0, 120),
        body: String(r.body).slice(0, 600),
        category: (VALID_CATEGORIES as readonly string[]).includes(String(r.category))
          ? String(r.category) as ReceiptCategory
          : "Insight",
        confidence: Math.max(0, Math.min(100, Math.round(Number(r.confidence) || 70))),
      }))
      .filter(r => r.confidence >= 60)
      .slice(0, 3);
  } catch {
    return [];
  }
}

export async function maybeExtractThinkingReceipts(opts: {
  userId: number;
  conversationId: string;
  turnIndex: number;
  userMessage: string;
  atlasResponse: string;
  /** True when Atlas emitted THINKING_STABLE — use more aggressive extraction. */
  stable?: boolean;
  /** When provided, high-confidence Decision receipts (≥90) are auto-promoted to the Ledger. */
  projectId?: number;
}): Promise<void> {
  const key = `${opts.conversationId}:${opts.turnIndex}`;
  if (extractionInFlight.has(key)) return;
  extractionInFlight.add(key);

  void (async () => {
    try {
      const exchange = `USER: ${opts.userMessage.slice(0, 1500)}\n\nATLAS: ${opts.atlasResponse.slice(0, 3000)}`;
      const isStable = opts.stable === true;

      const stabilityNote = isStable
        ? `\n\nNOTE: Atlas flagged this exchange as a crystallization moment (THINKING_STABLE) — the thinking advanced meaningfully. Extract up to 5 receipts. Lower the confidence threshold to 55.`
        : "";

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: `You are analyzing a conversational exchange between a person and Atlas (a strategic thinking partner). Extract "thinking receipts" — moments of genuine insight, named tensions, surfaced assumptions, forming commitments, or open questions that emerged.

EXCHANGE:
${exchange}
${stabilityNote}

Extract 0–${isStable ? "5" : "3"} thinking receipts. Only extract receipts with real substance — skip generic or obvious statements. If nothing notable emerged, return an empty array [].

Return ONLY valid JSON, no markdown, no explanation:

[
  {
    "headline": "2–5 word crystallized label (not a sentence)",
    "body": "one complete sentence capturing exactly what was surfaced",
    "category": "Tension | Assumption | Desire | Commitment | Question | Insight | Blocker | Decision",
    "confidence": 0-100
  }
]

Rules:
- headline examples: "Pricing tension", "Audience assumption", "Core commitment"
- body is a single sentence — concrete, not vague
- confidence: how useful and non-obvious this receipt is (${isStable ? "55" : "60"}+ = include; below ${isStable ? "55" : "60"} = omit)
- max ${isStable ? "5" : "3"} receipts, ranked by confidence descending
- if nothing substantial emerged, return []`,
        }],
      });

      const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
      const receipts = parseReceiptsJson(raw);
      if (receipts.length === 0) return;

      for (const r of receipts) {
        await db.execute(sql`
          INSERT INTO thinking_receipts (user_id, conversation_id, turn_index, headline, body, category, confidence, is_stable)
          VALUES (${opts.userId}, ${opts.conversationId}, ${opts.turnIndex}, ${r.headline}, ${r.body}, ${r.category}, ${r.confidence}, ${isStable})
        `);
      }

      // Auto-promote high-confidence Decision receipts → Ledger (workspace turns only, where projectId is known)
      if (opts.projectId) {
        const toPromote = receipts.filter(r => r.category === "Decision" && r.confidence >= 90);
        for (const r of toPromote) {
          try {
            await db.insert(entriesTable).values({
              projectId: opts.projectId,
              title: r.headline,
              summary: r.body,
              details: r.body,
              status: "committed",
              severity: "committed",
              mode: "decide",
              amField: "intent",
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            logger.info(
              { userId: opts.userId, projectId: opts.projectId, headline: r.headline },
              "thinking receipt auto-promoted to Ledger",
            );
          } catch (err) {
            logger.warn({ err }, "auto-promote to Ledger failed — non-fatal");
          }
        }
      }

      logger.info(
        { userId: opts.userId, conversationId: opts.conversationId, turnIndex: opts.turnIndex, count: receipts.length },
        "thinking receipts extracted",
      );
    } catch (err) {
      logger.warn({ err, conversationId: opts.conversationId }, "thinking receipt extraction failed — non-fatal");
    } finally {
      extractionInFlight.delete(key);
    }
  })();
}
