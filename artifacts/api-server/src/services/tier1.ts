import {
  db,
  entriesTable,
  projectTier1MemoryTable,
  getTier1MissingFields,
  type ProjectTier1Memory,
  type Tier1Answers,
  type Tier1FieldKey,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { assertProjectOwner } from "../lib/projectWorkspace";

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

/** One ledger entry per field write (tool path) or per bulk REST commit. */
export async function appendTier1LedgerEntry(projectId: number, field?: Tier1FieldKey): Promise<void> {
  const title = field ? `Tier 1 field updated: ${field}` : "Tier 1 memory set";
  await db.insert(entriesTable).values({
    projectId,
    type: "Decision",
    status: "committed",
    title,
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
