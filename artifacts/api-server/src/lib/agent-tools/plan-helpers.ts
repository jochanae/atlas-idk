import { NoObjectGeneratedError } from "ai";
import { db, entriesTable } from "@workspace/db";

export async function writePlanCommittedLedgerEntry(
  projectId: number,
  title: string,
  intent: string,
): Promise<number | undefined> {
  const [row] = await db
    .insert(entriesTable)
    .values({
      projectId,
      title,
      summary: intent,
      verb: "plan_committed",
      status: "committed",
      severity: "committed",
      mode: "plan_committed",
      amField: intent,
    })
    .returning({ id: entriesTable.id });
  return row?.id;
}

export function withPlanErrorGuard<TInput, TOutput>(
  fn: (input: TInput) => Promise<TOutput>,
  fallback: (rawText: string) => TOutput | Promise<TOutput>,
): (input: TInput) => Promise<TOutput> {
  return async (input) => {
    try {
      return await fn(input);
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error) && error.text) {
        return await fallback(error.text);
      }
      throw error;
    }
  };
}

export function buildPlanProposedPayload(
  row: {
    id: string;
    version: number;
    title: string;
    intent: string;
    steps: import("@workspace/db").PlanStep[];
    openQuestions: import("@workspace/db").PlanOpenQuestion[] | null;
    estimatedEffort: string;
  },
) {
  return {
    planId: row.id,
    version: row.version,
    title: row.title,
    intent: row.intent,
    steps: row.steps,
    open_questions: row.openQuestions ?? [],
    estimated_effort: row.estimatedEffort,
  };
}
