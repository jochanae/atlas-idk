// Decision Intelligence — Phase 1
// Generates the three first-class decision artifacts (Tradeoff Matrix, Decision Tree,
// Deviation Log) from conversation context, persists them as project_artifacts, and
// links each into the Ledger (entries table) so they show up as first-class objects.
import Anthropic from "@anthropic-ai/sdk";
import { db, pool, entriesTable, projectArtifactsTable } from "@workspace/db";
import { logger } from "./logger";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const DECISION_ARTIFACT_TYPES = [
  "tradeoff_matrix",
  "decision_tree",
  "deviation_log",
] as const;
export type DecisionArtifactType = (typeof DECISION_ARTIFACT_TYPES)[number];

export interface DecisionArtifactResult {
  id: number;
  projectId: number;
  type: DecisionArtifactType;
  version: number;
  title: string;
  payload: Record<string, unknown>;
  ledgerEntryId: number | null;
  createdAt: string;
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const TRADEOFF_MATRIX_PROMPT = `You are a decision analyst. Given the conversation context below, identify the competing
options under discussion and produce a structured tradeoff matrix.

Conversation context:
{CONTEXT}

Output ONLY valid JSON (no markdown, no explanation) with this shape:
{
  "question": "<the decision being made, one sentence>",
  "criteria": ["<criterion 1>", "<criterion 2>", "..."],
  "options": [
    {
      "name": "<option name>",
      "summary": "<one sentence>",
      "scores": { "<criterion>": "<short rating, e.g. 'High' | 'Low' | '3/5' | a brief phrase>" },
      "pros": ["<pro>"],
      "cons": ["<con>"]
    }
  ],
  "recommendation": "<name of the recommended option>",
  "recommendationReason": "<1-2 sentence justification>"
}

Rules:
- Extract at least 2 and at most 6 real options actually discussed or implied in the conversation. Do not invent options that were never mentioned or reasonably implied.
- criteria should be the 3-6 dimensions actually being weighed (cost, complexity, speed, risk, fit, etc. — whatever is relevant here)
- Keep every string concise and concrete`;

const DECISION_TREE_PROMPT = `You are a decision analyst. Given the conversation context below, produce a decision tree
representing the branching logic of the choice being made.

Conversation context:
{CONTEXT}

Output ONLY valid JSON (no markdown, no explanation) with this shape:
{
  "rootQuestion": "<the top-level decision question>",
  "root": {
    "label": "<condition or branch point>",
    "outcome": "<what happens / what is decided, if this is a leaf>",
    "children": [
      {
        "label": "<condition>",
        "outcome": "<result if this path is taken, or null if it branches further>",
        "children": []
      }
    ]
  },
  "recommendedPath": ["<label 1>", "<label 2>", "..."],
  "notes": "<any important caveat or assumption>"
}

Rules:
- Nest children only as deep as the actual conversation logic requires (2-3 levels is typical)
- Every leaf node (no children) MUST have a non-null "outcome"
- recommendedPath should trace the labels of the branch Atlas would recommend, root to leaf`;

const DEVIATION_LOG_PROMPT = `You are a decision analyst documenting a case where the user chose differently than what
was recommended. Given the conversation context below, produce a structured deviation log entry.

Conversation context:
{CONTEXT}

{OVERRIDE_CONTEXT}

Output ONLY valid JSON (no markdown, no explanation) with this shape:
{
  "decision": "<what was being decided>",
  "recommended": "<what Atlas recommended>",
  "recommendedReason": "<why Atlas recommended it>",
  "chosen": "<what the user actually chose instead>",
  "chosenReason": "<the user's stated or implied reason for deviating, if known — otherwise 'Not stated'>",
  "risks": ["<risk or tradeoff introduced by this deviation>"],
  "followUps": ["<thing worth revisiting later as a result of this deviation>"]
}

Rules:
- Be neutral and factual — this is a record, not a judgment
- If the user's reasoning wasn't stated, say so plainly rather than guessing`;

// ── Generation ────────────────────────────────────────────────────────────────

async function callClaude(prompt: string): Promise<Record<string, unknown> | null> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1800,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
  if (!raw) return null;
  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    logger.warn({ raw }, "decisionArtifacts: JSON parse failed");
    return null;
  }
}

export async function generateTradeoffMatrixPayload(context: string): Promise<Record<string, unknown> | null> {
  return callClaude(TRADEOFF_MATRIX_PROMPT.replace("{CONTEXT}", context));
}

export async function generateDecisionTreePayload(context: string): Promise<Record<string, unknown> | null> {
  return callClaude(DECISION_TREE_PROMPT.replace("{CONTEXT}", context));
}

export async function generateDeviationLogPayload(
  context: string,
  override?: { recommended?: string; chosen?: string; reason?: string },
): Promise<Record<string, unknown> | null> {
  const overrideContext = override
    ? `The user overrode Atlas's recommendation. Recommended: "${override.recommended ?? "unknown"}". User chose instead: "${override.chosen ?? "unknown"}". Stated reason: "${override.reason ?? "not stated"}".`
    : "";
  return callClaude(
    DEVIATION_LOG_PROMPT.replace("{CONTEXT}", context).replace("{OVERRIDE_CONTEXT}", overrideContext),
  );
}

// ── Persistence: project_artifacts + Ledger link ─────────────────────────────

function titleFor(type: DecisionArtifactType, payload: Record<string, unknown>): string {
  if (type === "tradeoff_matrix") return `Tradeoff Matrix — ${(payload.question as string) ?? "Decision"}`;
  if (type === "decision_tree") return `Decision Tree — ${(payload.rootQuestion as string) ?? "Decision"}`;
  return `Deviation Log — ${(payload.decision as string) ?? "Decision"}`;
}

function summaryFor(type: DecisionArtifactType, payload: Record<string, unknown>): string {
  if (type === "tradeoff_matrix") {
    const opts = (payload.options as Array<{ name: string }> | undefined)?.map((o) => o.name).join(", ") ?? "";
    return `Weighed: ${opts}. Recommended: ${(payload.recommendation as string) ?? "—"}.`;
  }
  if (type === "decision_tree") {
    return (payload.notes as string) ?? (payload.rootQuestion as string) ?? "Decision tree generated.";
  }
  return `Recommended "${payload.recommended ?? "—"}", chose "${payload.chosen ?? "—"}" instead.`;
}

/**
 * Saves a generated decision artifact payload as a versioned project_artifacts row
 * and creates a linked, committed Ledger entry (type: Decision) so it surfaces in
 * both the Blueprint panel and the Ledger. Non-fatal on ledger failure — the
 * artifact itself is always the source of truth.
 */
export async function saveDecisionArtifact({
  projectId,
  sessionId,
  type,
  payload,
  sourceMessageId,
}: {
  projectId: number;
  sessionId: number | null;
  type: DecisionArtifactType;
  payload: Record<string, unknown>;
  sourceMessageId?: number | null;
}): Promise<DecisionArtifactResult> {
  const title = titleFor(type, payload);

  const { rows } = await pool.query<{
    id: number; project_id: number; type: string; version: number;
    title: string; metadata: Record<string, unknown>; payload: Record<string, unknown>;
    created_at: string;
  }>(
    `INSERT INTO project_artifacts (project_id, type, version, title, metadata, payload)
     VALUES (
       $1, $2,
       (SELECT COALESCE(MAX(version), 0) + 1 FROM project_artifacts WHERE project_id = $1 AND type = $2),
       $3, $4::jsonb, $5::jsonb
     )
     RETURNING *`,
    [
      projectId,
      type,
      title,
      JSON.stringify({ source: "decision-intelligence", status: "generated" }),
      JSON.stringify(payload),
    ],
  );

  const row = rows[0];
  if (!row) throw new Error("Failed to persist decision artifact");

  let ledgerEntryId: number | null = null;
  try {
    const [entry] = await db.insert(entriesTable).values({
      projectId,
      sessionId,
      type: "Decision",
      status: "committed",
      severity: "neutral",
      mode: "decision-intelligence",
      title,
      summary: summaryFor(type, payload),
      details: JSON.stringify(payload),
      deviation: type === "deviation_log",
      ...(sourceMessageId != null ? { sourceMessageId } : {}),
      enrichmentJson: JSON.stringify({ artifactId: row.id, artifactType: type, artifactVersion: row.version }),
    } as typeof entriesTable.$inferInsert).returning({ id: entriesTable.id });
    ledgerEntryId = entry?.id ?? null;
  } catch (err) {
    logger.warn({ err, projectId, type }, "decisionArtifacts: ledger link failed — non-fatal");
  }

  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type as DecisionArtifactType,
    version: row.version,
    title: row.title,
    payload: row.payload,
    ledgerEntryId,
    createdAt: row.created_at,
  };
}

/**
 * Pulls the last N nexus_messages for a conversation as plain text context for
 * generation prompts. Falls back gracefully if the table/columns don't resolve.
 */
export async function buildContextFromMessages(
  messages: Array<{ role: string; content: string }>,
  maxChars = 6000,
): Promise<string> {
  const text = messages
    .slice(-20)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");
  return text.length > maxChars ? text.slice(-maxChars) : text;
}
