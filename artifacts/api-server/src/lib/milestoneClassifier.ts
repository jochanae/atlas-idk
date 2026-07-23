import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Conversational Timeline milestones — see docs/handoffs/2026-07-09-timeline-thinking-milestones-backend.md
 *
 * These verbs are conversation-scoped (emitted from Ask Joy / Nexus chat turns),
 * distinct from execution-scoped verbs (FILE_EDIT, LINE_PATCH, BUILD_RUN, etc.)
 * written by the codegen runner. A pure-reasoning turn that decides an architecture,
 * designs a schema, or emits a migration inline should show up on the Timeline even
 * though no file was ever written to disk.
 */
export const MILESTONE_VERBS = [
  "MILESTONE_REQUIREMENTS",
  "MILESTONE_DECISION",
  "MILESTONE_DESIGN",
  "MILESTONE_PLAN",
  "ARTIFACT_GENERATED",
] as const;
export type MilestoneVerb = (typeof MILESTONE_VERBS)[number];

type RawMilestone = {
  verb: string;
  title?: string;
  summary?: string;
  detail?: string;
  lineCount?: number;
};

type ClassifiedMilestone = {
  verb: MilestoneVerb;
  content: string;
  detail: string | null;
};

// In-flight guard: one classification per (projectId, messageId) pair, mirrors
// the tier1SlotInFlight pattern in thinkingReceiptExtract.ts.
const milestoneInFlight = new Set<string>();

function parseMilestoneJson(raw: string): RawMilestone[] {
  try {
    const cleaned = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed: unknown = JSON.parse(match ? match[0] : cleaned);
    if (!parsed || typeof parsed !== "object") return [];
    const milestones = (parsed as Record<string, unknown>).milestones;
    if (!Array.isArray(milestones)) return [];
    return milestones.filter(
      (m): m is RawMilestone => !!m && typeof m === "object" && typeof (m as RawMilestone).verb === "string",
    );
  } catch {
    return [];
  }
}

function classifyRaw(raw: RawMilestone[]): ClassifiedMilestone[] {
  const out: ClassifiedMilestone[] = [];
  for (const m of raw) {
    if (!MILESTONE_VERBS.includes(m.verb as MilestoneVerb)) continue;
    const title = (m.title ?? "").trim();
    const summary = (m.summary ?? "").trim();
    if (!title && !summary) continue;
    const content = [title, summary].filter(Boolean).join(" — ").slice(0, 2000);
    const detail =
      m.detail?.trim() ||
      (typeof m.lineCount === "number" ? `${m.lineCount} lines` : null);
    out.push({ verb: m.verb as MilestoneVerb, content, detail });
  }
  return out;
}

/**
 * Post-turn classifier (preferred detection path from the handoff doc). Runs a
 * cheap structured-output pass over the just-completed assistant turn and asks
 * whether it produced any durable conversational milestones — a confirmed
 * requirement, an architectural decision, an inline design/schema, an ordered
 * plan, or a generated artifact (migration SQL, spec doc, config) that was
 * never written to disk via the codegen runner.
 *
 * Zero milestones is a valid, expected result for small talk and clarifying
 * questions — the prompt is explicit about this so it doesn't over-fire.
 */
export async function classifyTurnMilestones(opts: {
  userText: string;
  assistantText: string;
}): Promise<ClassifiedMilestone[]> {
  const assistantText = opts.assistantText.trim();
  if (assistantText.length < 40) return [];

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: `You are scanning one turn of a project-building conversation to see whether Joy (the assistant) moved the project forward in a durable way — not just talked.

USER: ${opts.userText.slice(0, 1200)}

ASSISTANT: ${assistantText.slice(0, 6000)}

Classify this turn against these milestone types. A turn can produce zero, one, or several:

- MILESTONE_REQUIREMENTS — Joy confirmed a concrete requirement (primary user, scope, or an explicit non-goal), not just asked a clarifying question.
- MILESTONE_DECISION — Joy committed to a specific architectural or product choice (a stack pick, an ownership/permission model, a strategy), not just floated an option.
- MILESTONE_DESIGN — Joy produced a schema, data model, permission matrix, or flow description in prose (not code that was written to a file).
- MILESTONE_PLAN — Joy produced an ordered plan (numbered milestones, phases, or build order).
- ARTIFACT_GENERATED — Joy produced durable content inline in the message itself (e.g. migration SQL, a spec document, a config block) that was not written to disk as a file edit.

Rules:
- Zero milestones is common and correct — return an empty array for small talk, clarifying questions, or a turn that only restates what the user said.
- Only classify what actually happened in THIS assistant turn, not what might happen later.
- Each milestone needs a short title (a few words) and a one-line summary or rationale.
- For ARTIFACT_GENERATED, include an approximate lineCount if the content has an obvious size (e.g. a SQL block or a long spec).
- Return ONLY a JSON object, no markdown, no explanation.

Return exactly: { "milestones": [ { "verb": "...", "title": "...", "summary": "...", "detail": "...", "lineCount": 0 } ] }`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    return classifyRaw(parseMilestoneJson(raw));
  } catch (err) {
    logger.warn({ err: String(err) }, "milestoneClassifier: classification failed — non-fatal");
    return [];
  }
}

/**
 * Fire-and-forget: classify the turn and, if any milestones were found, write
 * a lightweight execution_runs row (intent set by caller — "CHAT" or "DECIDE")
 * carrying the milestone steps, so the Timeline surfaces conversational
 * progress alongside code-execution runs.
 *
 * No run is created for pure-chat turns unless at least one milestone fires —
 * this keeps small talk out of the Timeline per the handoff's acceptance
 * criteria (#4: no milestone for small talk / clarifying questions).
 */
export async function maybeEmitMilestones(opts: {
  projectId: number;
  threadId?: number | null;
  messageId?: number | null;
  /** Nexus conversation UUID — scopes this milestone run to the active thread. */
  conversationId?: string | null;
  userText: string;
  assistantText: string;
  intent: "CHAT" | "DECIDE" | "BUILD";
  /**
   * The turn's own start time (not the classifier's completion time). Using
   * this instead of `new Date()` keeps milestone runs sorted correctly next
   * to code-execution runs for the same turn — the classifier can finish
   * seconds after the turn ended, and sorting by classifier-completion time
   * caused milestone entries to drift out of chronological order relative to
   * other runs started around the same moment.
   */
  startedAt?: Date;
  /**
   * Set when this turn already produced a durable ARTIFACT_CREATED step via
   * a file write or standalone-artifact extraction, so the classifier's own
   * ARTIFACT_GENERATED verb (meant for content that was NOT written anywhere)
   * doesn't create a redundant duplicate entry for the same real-world event.
   */
  excludeArtifactGenerated?: boolean;
}): Promise<{ emitted: boolean }> {
  const key = `ms:${opts.projectId}:${opts.messageId ?? opts.userText.slice(0, 40)}`;
  if (milestoneInFlight.has(key)) return { emitted: false };
  milestoneInFlight.add(key);

  try {
    const rawMilestones = await classifyTurnMilestones({
      userText: opts.userText,
      assistantText: opts.assistantText,
    });
    const milestones = opts.excludeArtifactGenerated
      ? rawMilestones.filter((m) => m.verb !== "ARTIFACT_GENERATED")
      : rawMilestones;
    if (milestones.length === 0) return { emitted: false };

    const runId = randomUUID();
    const startedAt = opts.startedAt ?? new Date();
    const completedAt = new Date();
    const conversationIdValue = opts.conversationId ?? null;
    const summary = milestones
      .map((m) => m.content.split(" — ")[0])
      .filter(Boolean)
      .slice(0, 3)
      .join(" · ");

    await db.execute(sql`
      INSERT INTO execution_runs
        (id, project_id, thread_id, message_id, conversation_id, mode, status, summary, prompt, intent, started_at, completed_at, elapsed_ms)
      VALUES
        (${runId}, ${opts.projectId}, ${opts.threadId ?? null}, ${opts.messageId ?? null}, ${conversationIdValue},
         ${"conversation"}, ${"succeeded"}, ${summary || "Conversation milestone"}, ${opts.userText.slice(0, 2000) || null},
         ${opts.intent}, ${startedAt}, ${completedAt}, ${Math.max(0, completedAt.getTime() - startedAt.getTime())})
    `);

    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      await db.execute(sql`
        INSERT INTO execution_run_steps (run_id, verb, target, status, detail, content, order_index)
        VALUES (${runId}, ${m.verb}, ${null}, ${"ok"}, ${m.detail}, ${m.content}, ${i})
      `);
    }

    logger.info(
      { runId, projectId: opts.projectId, verbs: milestones.map((m) => m.verb) },
      "milestoneClassifier: emitted conversational milestones",
    );
    return { emitted: true };
  } catch (err) {
    logger.warn({ err: String(err) }, "milestoneClassifier: emit failed — non-fatal");
    return { emitted: false };
  } finally {
    milestoneInFlight.delete(key);
  }
}
