import Anthropic from "@anthropic-ai/sdk";
import { db } from "@workspace/db";
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
