import Anthropic from "@anthropic-ai/sdk";
import {
  db,
  entriesTable,
  nexusConversationsTable,
  projectTier1MemoryTable,
  getTier1MissingFields,
  TIER1_FIELD_KEYS,
  type NexusTier1Buffer,
  type ProjectTier1Memory,
  type Tier1Answers,
  type Tier1FieldKey,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { assertProjectOwner } from "../lib/projectWorkspace";

const anthropicClient = new Anthropic();

export const TIER1_FIELDS = [
  ["building", "What are you building?"],
  ["audience", "Who is it for?"],
  ["problem", "What problem does it solve?"],
  ["outOfScope", "What's explicitly out of scope?"],
  ["successSignal", "How will you know it's working?"],
  ["constraints", "What constraints are you working within?"],
] as const satisfies ReadonlyArray<readonly [Tier1FieldKey, string]>;

export const TIER1_GUARDRAILS = `- Never batch-ask multiple foundational setup questions in one turn.
- Never prefix with "Let me ask a quick onboarding question" — structure is earned, not imposed.
- If the user pushes back on a question, call tier1_mark_skipped immediately and continue the actual conversation.
- Foundational setup gathering is opportunistic, not the goal of any turn.`;

export type Tier1LedgerMeta =
  | Tier1FieldKey
  | { source: "nexus_handoff"; fields: Tier1FieldKey[] };

/** One ledger entry per field write (tool path) or per bulk REST/handoff commit. */
export async function appendTier1LedgerEntry(
  projectId: number,
  meta?: Tier1LedgerMeta,
  opts?: { mode?: string; sourceMessageId?: number | null },
): Promise<void> {
  let title = "Tier 1 memory set";
  if (typeof meta === "string") {
    title = `Tier 1 field updated: ${meta}`;
  } else if (meta?.source === "nexus_handoff") {
    title = `Tier 1 memory set (nexus handoff: ${meta.fields.join(", ")})`;
  }
  // Engineering Event — not a product Decision (M2.2 K5 / S5)
  await db.insert(entriesTable).values({
    projectId,
    type: "EngineeringEvent",
    status: "committed",
    title,
    mode: opts?.mode ?? "auto",
    verb: "tier1_update",
    sourceMessageId: opts?.sourceMessageId ?? null,
  });
}

export function answersToColumns(
  answers: Partial<Tier1Answers>,
): Partial<typeof projectTier1MemoryTable.$inferInsert> {
  const cols: Partial<typeof projectTier1MemoryTable.$inferInsert> = {};
  if (answers.building !== undefined) cols.building = answers.building;
  if (answers.audience !== undefined) cols.audience = answers.audience;
  if (answers.problem !== undefined) cols.problem = answers.problem;
  if (answers.outOfScope !== undefined) cols.outOfScope = answers.outOfScope;
  if (answers.successSignal !== undefined) cols.successSignal = answers.successSignal;
  if (answers.constraints !== undefined) cols.constraints = answers.constraints;
  return cols;
}

export async function loadTier1ForProject(projectId: number): Promise<ProjectTier1Memory | null> {
  const [row] = await db
    .select()
    .from(projectTier1MemoryTable)
    .where(eq(projectTier1MemoryTable.projectId, projectId))
    .limit(1);
  return row ?? null;
}

export function buildTier1StatusBlock(tier1: ProjectTier1Memory | null): string {
  const missing = getTier1MissingFields(tier1);
  const filled = TIER1_FIELDS.filter(([key]) => tier1?.[key]?.trim()).map(([key]) => key);

  if (tier1?.tier1SkippedAt) {
    return `
<tier1_status>
SKIPPED. User opted out of setup questions. Do not ask about missing fields.
Only capture answers with tier1_upsert_field if the user volunteers them unprompted.
Missing (volunteer-only): ${missing.join(", ") || "none"}.
Filled: ${filled.join(", ") || "none"}.
${TIER1_GUARDRAILS}
</tier1_status>`;
  }

  const body = missing.length === 0
    ? "COMPLETE. Do not re-ask foundational setup questions."
    : `INCOMPLETE (${missing.length}/6 missing).
Filled: ${filled.join(", ") || "none"}.
Missing: ${missing.join(", ")}.
Rule: when the conversation naturally surfaces one of the missing fields,
capture the answer with the tier1_upsert_field tool. Never interrogate —
ask at most ONE setup question per turn, only when it fits the flow, and
only if the user hasn't already implicitly answered it. Do not mention
"Tier 1" by name. If the user says something like "I already told you" or
"stop asking", stop and call tier1_mark_skipped.`;

  return `
<tier1_status>
${body}
${TIER1_GUARDRAILS}
</tier1_status>`;
}

export type NexusTier1ConversationState = {
  buffer: NexusTier1Buffer | null;
  skippedAt: Date | null;
};

export function buildTier1BlockForNexusConversation(
  state: NexusTier1ConversationState | null,
): string {
  if (state?.skippedAt) {
    const filled = TIER1_FIELD_KEYS.filter((key) => state.buffer?.[key]?.trim());
    return `
<tier1_status scope="pre-project">
SKIPPED. User opted out of setup questions. Do not ask about missing fields.
Only capture answers with tier1_upsert_field if the user volunteers them unprompted.
Buffered: ${filled.join(", ") || "none"}.
${TIER1_GUARDRAILS}
</tier1_status>`;
  }

  const filled = TIER1_FIELD_KEYS.filter((key) => state?.buffer?.[key]?.trim());
  const missing = TIER1_FIELD_KEYS.filter((key) => !state?.buffer?.[key]?.trim());

  return `
<tier1_status scope="pre-project">
The user has not selected a project yet. If they describe what they're
building, who it's for, the problem, out-of-scope, success signal, or
constraints — capture the field with tier1_upsert_field. It will be
buffered on this conversation and flushed to the project's Tier 1 memory
when they open/create a workspace.
Buffered: ${filled.join(", ") || "none"}.
Missing: ${missing.join(", ")}.
Never interrogate. One field per turn max. Do not mention "Tier 1" by name.
${TIER1_GUARDRAILS}
</tier1_status>`;
}

const CONFIRMATION_RE =
  /^(yes|yeah|yep|yup|correct|right|that'?s right|that'?s it|exactly|sure|ok|okay|sounds good|affirmative)\b/i;

export function canPersistInferredConfidence(
  messages: Array<{ role: string; content: string }>,
): boolean {
  if (messages.length < 2) return false;
  const last = messages[messages.length - 1];
  const prev = messages[messages.length - 2];
  if (last.role !== "user" || prev.role !== "assistant") return false;
  return CONFIRMATION_RE.test(last.content.trim());
}

export async function upsertTier1(
  projectId: number,
  answers: Partial<Tier1Answers>,
): Promise<ProjectTier1Memory> {
  const cols = answersToColumns(answers);
  const existing = await loadTier1ForProject(projectId);

  if (!existing) {
    const [inserted] = await db
      .insert(projectTier1MemoryTable)
      .values({ projectId, ...cols })
      .returning();
    return inserted;
  }

  const [updated] = await db
    .update(projectTier1MemoryTable)
    .set(cols)
    .where(eq(projectTier1MemoryTable.projectId, projectId))
    .returning();
  return updated;
}

export async function upsertTier1Field(
  projectId: number,
  userId: number,
  field: Tier1FieldKey,
  value: string,
): Promise<{ ok: true; field: Tier1FieldKey; remaining: Tier1FieldKey[] } | { ok: false; error: string }> {
  if (!(await assertProjectOwner(projectId, userId))) {
    return { ok: false, error: "project_not_found" };
  }

  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 2000) {
    return { ok: false, error: "invalid_value" };
  }

  const existing = await loadTier1ForProject(projectId);
  let row: ProjectTier1Memory;

  if (!existing) {
    const [inserted] = await db
      .insert(projectTier1MemoryTable)
      .values({ projectId, [field]: trimmed })
      .returning();
    row = inserted;
    await appendTier1LedgerEntry(projectId, field);
  } else {
    const [updated] = await db
      .update(projectTier1MemoryTable)
      .set({ [field]: trimmed })
      .where(eq(projectTier1MemoryTable.projectId, projectId))
      .returning();
    row = updated;
    await appendTier1LedgerEntry(projectId, field);
  }

  return {
    ok: true,
    field,
    remaining: getTier1MissingFields(row),
  };
}

export async function markTier1Skipped(
  projectId: number,
  userId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertProjectOwner(projectId, userId))) {
    return { ok: false, error: "project_not_found" };
  }

  const existing = await loadTier1ForProject(projectId);
  const now = new Date();

  if (!existing) {
    await db.insert(projectTier1MemoryTable).values({
      projectId,
      tier1SkippedAt: now,
    });
  } else if (!existing.tier1SkippedAt) {
    await db
      .update(projectTier1MemoryTable)
      .set({ tier1SkippedAt: now })
      .where(eq(projectTier1MemoryTable.projectId, projectId));
  }

  return { ok: true };
}

// ── Nexus conversation buffer (pre-project Tier 1) ─────────────────────────

export async function getNexusTier1Buffer(
  conversationId: string,
  userId: number,
): Promise<NexusTier1ConversationState | null> {
  const [row] = await db
    .select({
      tier1Buffer: nexusConversationsTable.tier1Buffer,
      tier1SkippedAt: nexusConversationsTable.tier1SkippedAt,
    })
    .from(nexusConversationsTable)
    .where(and(
      eq(nexusConversationsTable.conversationId, conversationId),
      eq(nexusConversationsTable.userId, userId),
    ))
    .limit(1);
  if (!row) return null;
  return { buffer: row.tier1Buffer ?? null, skippedAt: row.tier1SkippedAt ?? null };
}

async function ensureNexusConversationRow(conversationId: string, userId: number): Promise<void> {
  await db
    .insert(nexusConversationsTable)
    .values({ conversationId, userId })
    .onConflictDoNothing();
}

export async function upsertNexusTier1BufferField(
  conversationId: string,
  userId: number,
  field: Tier1FieldKey,
  value: string,
  confidence: "explicit" | "inferred",
): Promise<
  | { ok: true; field: Tier1FieldKey; remaining: Tier1FieldKey[]; buffered: true }
  | { ok: false; error: string }
> {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 2000) {
    return { ok: false, error: "invalid_value" };
  }

  await ensureNexusConversationRow(conversationId, userId);
  const state = await getNexusTier1Buffer(conversationId, userId);
  const buffer = { ...(state?.buffer ?? {}) };
  const existing = buffer[field]?.trim() ?? "";

  if (confidence !== "explicit" && existing) {
    return { ok: false, error: "needs_confirmation" };
  }
  if (confidence !== "explicit" && !existing) {
    // inferred into empty slot is allowed when caller already validated confirmation
  }

  buffer[field] = trimmed;
  await db
    .update(nexusConversationsTable)
    .set({ tier1Buffer: buffer })
    .where(and(
      eq(nexusConversationsTable.conversationId, conversationId),
      eq(nexusConversationsTable.userId, userId),
    ));

  const remaining = TIER1_FIELD_KEYS.filter((key) => !buffer[key]?.trim());
  return { ok: true, field, remaining, buffered: true };
}

export async function markNexusTier1Skipped(
  conversationId: string,
  userId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureNexusConversationRow(conversationId, userId);
  const now = new Date();
  await db
    .update(nexusConversationsTable)
    .set({ tier1SkippedAt: now })
    .where(and(
      eq(nexusConversationsTable.conversationId, conversationId),
      eq(nexusConversationsTable.userId, userId),
    ));
  return { ok: true };
}

// ── Workspace chat Tier 1 tool extraction ─────────────────────────────────
// Runs as a lightweight Haiku call after each workspace turn (legacy path).
// The model is given the conversation + just-emitted response and asked to
// identify any Tier 1 fields the user answered in this turn.
// Returns the number of fields written (0 = nothing to surface on SSE).

const WORKSPACE_TIER1_UPSERT_TOOL: Anthropic.Tool = {
  name: "tier1_upsert_field",
  description:
    "Save one Tier 1 project memory field. Use when the user has clearly answered one of the six foundational questions in conversation. Never guess — only call with the user's actual words (lightly cleaned).",
  input_schema: {
    type: "object",
    properties: {
      field: {
        type: "string",
        enum: [...TIER1_FIELD_KEYS],
        description: "Which foundational field this answer satisfies",
      },
      value: { type: "string", description: "The user's answer, lightly cleaned" },
      confidence: {
        type: "string",
        enum: ["explicit", "inferred"],
        description: "explicit = user stated it directly; inferred = you paraphrased from context",
      },
    },
    required: ["field", "value", "confidence"],
  },
};

const WORKSPACE_TIER1_SKIP_TOOL: Anthropic.Tool = {
  name: "tier1_mark_skipped",
  description:
    "Call ONLY when the user has clearly told you to stop asking Tier 1 questions (e.g. 'skip', 'stop asking that', 'I don't want to answer'). Prevents Atlas from asking again.",
  input_schema: {
    type: "object",
    properties: {},
  },
};

const WORKSPACE_TIER1_TOOLS: Anthropic.Tool[] = [
  WORKSPACE_TIER1_UPSERT_TOOL,
  WORKSPACE_TIER1_SKIP_TOOL,
];

export async function runWorkspaceTier1Extraction(params: {
  projectId: number;
  userId: number;
  userMessage: string;
  assistantResponse: string;
  history: Array<{ role: string; content: string }>;
  tier1StatusBlock: string;
}): Promise<{ fieldsWritten: number; skipped: boolean }> {
  const { projectId, userId, userMessage, assistantResponse, history, tier1StatusBlock } = params;
  if (!projectId || !userId) return { fieldsWritten: 0, skipped: false };

  const existing = await loadTier1ForProject(projectId);
  const missing = getTier1MissingFields(existing);
  if (missing.length === 0 && !existing?.tier1SkippedAt) {
    return { fieldsWritten: 0, skipped: false };
  }

  const recentMessages = [...(history ?? [])].slice(-6);
  const extractMessages: Anthropic.MessageParam[] = [
    ...recentMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantResponse },
    {
      role: "user",
      content: `Review the conversation above. If the user answered any of the six foundational project questions (what they're building, who it's for, the problem it solves, what's out of scope, success signal, or constraints), call tier1_upsert_field for each. If the user asked to stop being asked, call tier1_mark_skipped. Otherwise call nothing.`,
    },
  ];

  let fieldsWritten = 0;
  let skipped = false;

  try {
    const resp = await anthropicClient.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system: tier1StatusBlock || "You are a memory extraction assistant.",
      messages: extractMessages,
      tools: WORKSPACE_TIER1_TOOLS,
      tool_choice: { type: "auto" },
    });

    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      if (block.name === "tier1_upsert_field") {
        const input = block.input as { field?: string; value?: string; confidence?: string };
        const field = input.field as Tier1FieldKey | undefined;
        const value = input.value ?? "";
        if (!field || !TIER1_FIELD_KEYS.includes(field)) continue;
        const result = await upsertTier1Field(projectId, userId, field, value);
        if (result.ok) fieldsWritten++;
      } else if (block.name === "tier1_mark_skipped") {
        await markTier1Skipped(projectId, userId);
        skipped = true;
      }
    }
  } catch {
    /* non-fatal — extraction failure should never affect the chat response */
  }

  return { fieldsWritten, skipped };
}

export async function clearNexusTier1Buffer(
  conversationId: string,
  userId: number,
): Promise<void> {
  await db
    .update(nexusConversationsTable)
    .set({ tier1Buffer: null, tier1SkippedAt: null })
    .where(and(
      eq(nexusConversationsTable.conversationId, conversationId),
      eq(nexusConversationsTable.userId, userId),
    ));
}

/** Gap-fill project Tier 1 from a Nexus conversation buffer; never overwrites existing answers. */
export async function flushNexusTier1BufferToProject(
  conversationId: string,
  projectId: number,
  userId: number,
): Promise<void> {
  if (!(await assertProjectOwner(projectId, userId))) return;

  const state = await getNexusTier1Buffer(conversationId, userId);
  if (!state) return;

  const existing = await loadTier1ForProject(projectId);
  const merge: Partial<Tier1Answers> = {};

  for (const key of TIER1_FIELD_KEYS) {
    const incoming = state.buffer?.[key]?.trim();
    if (!incoming) continue;
    if (!existing?.[key]?.trim()) merge[key] = incoming;
  }

  if (Object.keys(merge).length > 0) {
    await upsertTier1(projectId, merge);
    await appendTier1LedgerEntry(projectId, {
      source: "nexus_handoff",
      fields: Object.keys(merge) as Tier1FieldKey[],
    });
  }

  const afterMerge = await loadTier1ForProject(projectId);
  if (state.skippedAt && !afterMerge) {
    await markTier1Skipped(projectId, userId);
  }

  await clearNexusTier1Buffer(conversationId, userId);
}
