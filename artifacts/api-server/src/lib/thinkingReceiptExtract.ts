import Anthropic from "@anthropic-ai/sdk";
import { db, entriesTable, projectTier1MemoryTable, getTier1MissingFields, TIER1_FIELD_KEYS, type Tier1FieldKey, type Tier1Answers } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { logger } from "./logger";
import { shouldAutoPark } from "./parkingConfidence";

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
  /** True when Joy emitted THINKING_STABLE — use more aggressive extraction. */
  stable?: boolean;
  /** When provided, high-confidence Decision receipts (≥90) are auto-promoted to the Ledger. */
  projectId?: number;
  /** Chat message ID to attribute auto-promoted ledger entries to. */
  messageId?: number | null;
}): Promise<void> {
  const key = `${opts.conversationId}:${opts.turnIndex}`;
  if (extractionInFlight.has(key)) return;
  extractionInFlight.add(key);

  void (async () => {
    try {
      const exchange = `USER: ${opts.userMessage.slice(0, 1500)}\n\nATLAS: ${opts.atlasResponse.slice(0, 3000)}`;
      const isStable = opts.stable === true;

      const stabilityNote = isStable
        ? `\n\nNOTE: Joy flagged this exchange as a crystallization moment (THINKING_STABLE) — the thinking advanced meaningfully. Extract up to 5 receipts. Lower the confidence threshold to 55.`
        : "";

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: `You are analyzing a conversational exchange between a person and Joy (a strategic thinking partner). Extract "thinking receipts" — moments of genuine insight, named tensions, surfaced assumptions, forming commitments, or open questions that emerged.

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

      // M2.2 K2/K6: do NOT silently auto-commit Decision receipts to Ledger.
      // High-confidence Decision receipts stay as receipts until the user
      // explicitly promotes via WorkspaceReceiptsBar / promote endpoint.
      if (opts.projectId) {
        // Contract: only silent-park at ≥95 confidence (parkingConfidence.ts)
        const parkedCandidates = receipts.filter(
          (r) => r.category === "Decision" && shouldAutoPark(r.confidence),
        );
        for (const r of parkedCandidates) {
          try {
            await db.insert(entriesTable).values({
              projectId: opts.projectId,
              type: "Decision",
              title: r.headline,
              summary: r.body,
              details: r.body,
              status: "parked",
              severity: "parked",
              mode: "decide",
              amField: "intent",
              ...(opts.messageId != null ? { sourceMessageId: opts.messageId } : {}),
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            logger.info(
              { userId: opts.userId, projectId: opts.projectId, headline: r.headline },
              "thinking receipt parked as Decision draft (explicit commit required)",
            );
          } catch (err) {
            logger.warn({ err }, "park Decision receipt failed — non-fatal");
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

// ── Global Narrative Memory ───────────────────────────────────────────────────
// After each substantive Ask Joy turn, synthesize a living 2–3 sentence
// narrative of what's been discussed across all threads. Stored on the user
// record and injected into every conversation start — both Ask Joy and
// workspace. This gives Joy cross-thread continuity: it knows what you've
// been working through, not just what it extracted from individual turns.

const globalNarrativeInFlight = new Set<number>(); // userId gate — one at a time per user
const NARRATIVE_MIN_LEN = 250; // skip trivial exchanges
const NARRATIVE_COOLDOWN_MS = 4 * 60 * 1000; // max one update per 4 min per user

export async function synthesizeGlobalNarrative(opts: {
  userId: number;
  userMessage: string;
  atlasResponse: string;
}): Promise<void> {
  const exchangeLen = opts.userMessage.length + opts.atlasResponse.length;
  if (exchangeLen < NARRATIVE_MIN_LEN) return;
  if (globalNarrativeInFlight.has(opts.userId)) return;
  globalNarrativeInFlight.add(opts.userId);

  void (async () => {
    try {
      // Cooldown check — avoid thrashing on rapid turns
      const existing = await db.execute(sql`
        SELECT global_narrative_at FROM users WHERE id = ${opts.userId}
      `).then(r => (r.rows ?? r)[0] as { global_narrative_at: string | null } | undefined)
        .catch(() => undefined);

      if (existing?.global_narrative_at) {
        const age = Date.now() - new Date(existing.global_narrative_at).getTime();
        if (age < NARRATIVE_COOLDOWN_MS) return;
      }

      // Fetch recent nexus messages for richer synthesis (not just the current turn)
      const recentRows = await db.execute(sql`
        SELECT role, content
        FROM nexus_messages
        WHERE user_id = ${opts.userId}
          AND message_type IS DISTINCT FROM 'briefing'
        ORDER BY created_at DESC
        LIMIT 16
      `).then(r => (r.rows ?? r) as Array<{ role: string; content: string }>)
        .catch(() => [] as Array<{ role: string; content: string }>);

      const recentExchange = recentRows.reverse()
        .map(m => `${m.role === "user" ? "You" : "Joy"}: ${String(m.content).slice(0, 400)}`)
        .join("\n");

      const resp = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `You are writing a private living memory note for an AI assistant called Joy. It will be read at the start of future conversations to give Joy genuine cross-thread continuity — the user should feel like Joy picks up where things left off, not like they're starting over.

Write 2–3 sentences. No bullets, no headers. Capture:
- What the person has been working through or thinking about recently
- Any named tensions, commitments, or open questions that came up
- The direction or posture that feels most alive right now

Tone: natural, colleague-level. Be specific — not "discussing a project" but "deciding whether to expand Axiom beyond developers before launch." If nothing notable is here, write one honest short sentence.

Recent conversation (newest at bottom):
${recentExchange}

Living memory (2–3 sentences, no preamble):`,
        }],
      });

      const narrative = resp.content[0]?.type === "text" ? resp.content[0].text.trim() : null;
      if (!narrative || narrative.length < 20) return;

      await db.execute(sql`
        UPDATE users
        SET    global_narrative    = ${narrative},
               global_narrative_at = now()
        WHERE  id = ${opts.userId}
      `);

      logger.info({ userId: opts.userId, len: narrative.length }, "global narrative updated");
    } catch (err) {
      logger.warn({ err }, "synthesizeGlobalNarrative failed — non-fatal");
    } finally {
      globalNarrativeInFlight.delete(opts.userId);
    }
  })();
}

// ── User identity synthesis ────────────────────────────────────────────────
// Builds a durable personality + work-style profile from conversation history.
// Lives in users.user_identity (separate from global_narrative which is
// working-context). Updated at most once every 30 minutes per user.
// The output is injected at the TOP of every Joy system prompt so the model
// knows the person before anything else.

const USER_IDENTITY_COOLDOWN_MS = 30 * 60 * 1000; // 30 min
const userIdentityInFlight = new Set<number>();

export async function synthesizeUserIdentity(opts: {
  userId: number;
  userName: string | null;
}): Promise<void> {
  if (userIdentityInFlight.has(opts.userId)) return;
  userIdentityInFlight.add(opts.userId);

  void (async () => {
    try {
      // Cooldown — identity doesn't change as fast as working context
      const existing = await db.execute(sql`
        SELECT user_identity FROM users WHERE id = ${opts.userId}
      `).then(r => (r.rows ?? r)[0] as { user_identity: string | null } | undefined)
        .catch(() => undefined);

      // If identity already synthesized recently (check updated_at as proxy), skip
      // We use a separate column check — just look at whether identity is fresh
      // For simplicity: only synthesize if user_identity is null OR every 30 min
      // We can't check cooldown without a separate timestamp, so we skip if non-null
      // and the content looks recent. For now: always update if it's null; skip if present.
      // (TODO: add user_identity_at column if finer cooldown control is needed)
      if (existing?.user_identity && existing.user_identity.length > 50) {
        // Already have a profile — skip until explicitly cleared or scheduled
        return;
      }

      // Pull enough conversation history to infer identity signals
      const recentRows = await db.execute(sql`
        SELECT role, content
        FROM nexus_messages
        WHERE user_id = ${opts.userId}
          AND message_type IS DISTINCT FROM 'briefing'
        ORDER BY created_at DESC
        LIMIT 30
      `).then(r => (r.rows ?? r) as Array<{ role: string; content: string }>)
        .catch(() => [] as Array<{ role: string; content: string }>);

      if (recentRows.length < 4) return; // not enough signal yet

      const recentExchange = recentRows.reverse()
        .map(m => `${m.role === "user" ? "User" : "Joy"}: ${String(m.content).slice(0, 500)}`)
        .join("\n");

      const nameHint = opts.userName ? `The user's registered name is "${opts.userName}".` : "";

      const resp = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `You are building a private identity profile for an AI assistant. This profile will be read at the start of every conversation so the assistant can address the user correctly and match their communication style.

${nameHint}

Based on the conversation history below, write a short identity profile (3–5 sentences). Include:
1. Their name and any nickname they use or prefer (if evident)
2. Their communication style and tone — are they direct, casual, colorful, formal? Do they think aloud?
3. Any strong work style signals — do they care about things being real vs. just wired? Are they persistent? Do they hate incomplete implementations?
4. How they like to be addressed — first name, nickname?
5. Any emotional patterns — when do they get frustrated? What matters most to them?

Be specific and concrete — not "they seem analytical" but "she will call something out bluntly if it only looks complete." If something isn't evident from the conversation, skip it rather than guessing.

Conversation history (newest at bottom):
${recentExchange}

Identity profile (3–5 sentences, no preamble, no bullets):`,
        }],
      });

      const profile = resp.content[0]?.type === "text" ? resp.content[0].text.trim() : null;
      if (!profile || profile.length < 30) return;

      await db.execute(sql`
        UPDATE users
        SET user_identity = ${profile}
        WHERE id = ${opts.userId}
      `);

      logger.info({ userId: opts.userId, len: profile.length }, "user identity profile synthesized");
    } catch (err) {
      logger.warn({ err }, "synthesizeUserIdentity failed — non-fatal");
    } finally {
      userIdentityInFlight.delete(opts.userId);
    }
  })();
}

// ── Tier 1 conversational slot extraction ─────────────────────────────────
// Fire-and-forget pass piggybacking on the thinking-receipts infrastructure.
// After each workspace or project-focused nexus turn, runs a Haiku call against
// the rolling conversation window to infer Tier 1 slot values with high
// confidence (≥ 0.75). Never overwrites non-empty slots.

const tier1SlotInFlight = new Set<string>(); // key: `t1:${projectId}:${turnIndex}`

/** Priority-ordered Tier 1 field metadata. Shared with the gaps endpoint. */
export const TIER1_META = [
  { key: "building"      as Tier1FieldKey, question: "What are you building?",                   hint: "One sentence. The thing itself, not the pitch." },
  { key: "audience"      as Tier1FieldKey, question: "Who is it for?",                            hint: "Be specific. A named archetype beats a demographic." },
  { key: "problem"       as Tier1FieldKey, question: "What problem does it solve?",               hint: "What breaks today without it?" },
  { key: "successSignal" as Tier1FieldKey, question: "How will you know it's working?",           hint: "One observable signal — not a KPI dashboard." },
  { key: "outOfScope"    as Tier1FieldKey, question: "What's explicitly out of scope?",           hint: "The lines you won't cross — say them now." },
  { key: "constraints"   as Tier1FieldKey, question: "What constraints are you working within?",  hint: "Time, money, tech, self — whatever binds you." },
];

function parseTier1Json(raw: string, missingKeys: readonly string[]): Partial<Tier1Answers> {
  try {
    const cleaned = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed: unknown = JSON.parse(match ? match[0] : cleaned);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Partial<Tier1Answers> = {};
    for (const key of missingKeys) {
      const val = (parsed as Record<string, unknown>)[key];
      if (typeof val === "string" && val.trim().length >= 2) {
        result[key as Tier1FieldKey] = val.trim();
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Fire-and-forget Tier 1 slot extraction from a project conversation turn.
 * Piggybacked alongside thinking-receipt extraction — call after each
 * workspace turn or project-focused nexus turn where projectId is known.
 */
export async function maybeExtractTier1Slots(opts: {
  projectId: number;
  userId: number;
  turnIndex: number;
  /** Rolling conversation window (oldest first). Should include the current turn at the end. */
  recentTurns: Array<{ role: string; content: string }>;
}): Promise<void> {
  const key = `t1:${opts.projectId}:${opts.turnIndex}`;
  if (tier1SlotInFlight.has(key)) return;
  tier1SlotInFlight.add(key);

  void (async () => {
    try {
      const [existing] = await db
        .select()
        .from(projectTier1MemoryTable)
        .where(eq(projectTier1MemoryTable.projectId, opts.projectId))
        .limit(1);

      const currentAnswers: Record<string, string> = {
        building:      existing?.building ?? "",
        audience:      existing?.audience ?? "",
        problem:       existing?.problem ?? "",
        outOfScope:    existing?.outOfScope ?? "",
        successSignal: existing?.successSignal ?? "",
        constraints:   existing?.constraints ?? "",
      };

      const missingKeys = TIER1_FIELD_KEYS.filter(k => !currentAnswers[k]?.trim());
      if (missingKeys.length === 0) return; // all slots already filled

      // Rolling window: last 8 turns, content truncated to stay within ~4k tokens
      const turns = opts.recentTurns.slice(-8);
      const transcript = turns
        .map(t => `${t.role === "user" ? "USER" : "ATLAS"}: ${String(t.content).slice(0, 500)}`)
        .join("\n\n");

      if (transcript.trim().length < 30) return;

      const knownBlock = Object.entries(currentAnswers)
        .filter(([, v]) => v.trim())
        .map(([k, v]) => `  ${k}: ${String(v).slice(0, 200)}`)
        .join("\n") || "  (none yet)";

      const missingBlock = missingKeys
        .map(k => `  ${k}: ${TIER1_META.find(m => m.key === k)?.question ?? k}`)
        .join("\n");

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `You are extracting structured project memory from a conversation transcript.

ALREADY KNOWN (do not change unless the user directly contradicted it):
${knownBlock}

MISSING SLOTS — fill only if user clearly stated the answer in this transcript:
${missingBlock}

CONVERSATION:
${transcript}

Rules:
- Only fill a slot when the user clearly and directly stated the answer.
- Confidence gate: if you are less than 75% confident, return null for that slot.
- Do NOT invent, extrapolate, or paraphrase beyond what was literally said.
- Return ONLY a JSON object. No markdown. No explanation.

Return exactly: { ${missingKeys.map(k => `"${k}": null`).join(", ")} }`,
        }],
      });

      const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
      const extracted = parseTier1Json(raw, missingKeys);
      if (Object.keys(extracted).length === 0) return;

      // Only write slots that are still empty and received a non-empty extracted value
      const toWrite: Partial<Tier1Answers> = {};
      for (const [k, v] of Object.entries(extracted)) {
        if (!v?.trim()) continue;
        if (currentAnswers[k]?.trim()) continue; // already filled — never overwrite
        toWrite[k as Tier1FieldKey] = v.trim();
      }
      if (Object.keys(toWrite).length === 0) return;

      if (existing) {
        const cols: Partial<typeof projectTier1MemoryTable.$inferInsert> = {};
        if (toWrite.building      !== undefined) cols.building      = toWrite.building;
        if (toWrite.audience      !== undefined) cols.audience      = toWrite.audience;
        if (toWrite.problem       !== undefined) cols.problem       = toWrite.problem;
        if (toWrite.outOfScope    !== undefined) cols.outOfScope    = toWrite.outOfScope;
        if (toWrite.successSignal !== undefined) cols.successSignal = toWrite.successSignal;
        if (toWrite.constraints   !== undefined) cols.constraints   = toWrite.constraints;
        await db
          .update(projectTier1MemoryTable)
          .set(cols)
          .where(eq(projectTier1MemoryTable.projectId, opts.projectId));
      } else {
        await db
          .insert(projectTier1MemoryTable)
          .values({ projectId: opts.projectId, ...toWrite })
          .onConflictDoNothing();
      }

      logger.info(
        { projectId: opts.projectId, slots: Object.keys(toWrite) },
        "tier1 slots extracted from conversation",
      );
    } catch (err) {
      logger.warn({ err, projectId: opts.projectId }, "tier1 slot extraction failed — non-fatal");
    } finally {
      tier1SlotInFlight.delete(key);
    }
  })();
}

/**
 * Generates a single grounded sentence Joy can use when surfacing a Tier 1
 * gap — references actual transcript detail so the question feels contextual,
 * not generic. Used by GET /api/projects/:id/tier1-gaps.
 * Returns null when the transcript contains no anchor for the requested slot.
 */
export async function generateTier1AtlasContext(opts: {
  nextGapKey: Tier1FieldKey;
  nextGapQuestion: string;
  recentTurns: Array<{ role: string; content: string }>;
}): Promise<string | null> {
  if (opts.recentTurns.length === 0) return null;

  const transcript = opts.recentTurns
    .slice(-6)
    .map(t => `${t.role === "user" ? "USER" : "ATLAS"}: ${String(t.content).slice(0, 400)}`)
    .join("\n\n");

  if (transcript.trim().length < 30) return null;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 120,
      messages: [{
        role: "user",
        content: `Based on this conversation, write ONE sentence Joy could use when asking: "${opts.nextGapQuestion}"

The sentence MUST reference a specific concrete detail already mentioned in the transcript (a product name, feature, user type, goal, constraint, etc.). Frame it as Joy showing it was paying attention — e.g. "You've described building X for Y — who specifically would use it first?"

If the transcript contains no useful anchor detail for this specific question, reply with exactly: null

CONVERSATION:
${transcript}

One sentence (or null):`,
      }],
    });

    const text = (response.content[0]?.type === "text" ? response.content[0].text : "").trim();
    if (!text || text.toLowerCase() === "null" || text.length < 10 || text.length > 400) return null;
    return text;
  } catch {
    return null;
  }
}
