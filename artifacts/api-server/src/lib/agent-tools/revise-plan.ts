import { tool } from "ai";
import { z } from "zod";
import { db, planArtifactsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AgentToolContext } from "./context";
import {
  RevisePlanInput,
  normalizeOpenQuestions,
  normalizePlanSteps,
  toLegacyPlanArtifact,
} from "./schemas/plan";
import { buildPlanProposedPayload, withPlanErrorGuard } from "./plan-helpers";

async function executeRevisePlan(
  ctx: AgentToolContext,
  input: z.infer<typeof RevisePlanInput>,
) {
  const started = performance.now();
  ctx.emitToolCall("revise_plan", { planId: input.planId });

  try {
    const [prior] = await db
      .select()
      .from(planArtifactsTable)
      .where(eq(planArtifactsTable.id, input.planId))
      .limit(1);

    if (!prior || prior.projectId !== ctx.projectId || prior.userId !== ctx.userId) {
      const ms = Math.round(performance.now() - started);
      ctx.emitToolResult("revise_plan", false, ms);
      return { ok: false, error: "Plan not found" };
    }

    await db
      .update(planArtifactsTable)
      .set({ status: "superseded" })
      .where(eq(planArtifactsTable.id, input.planId));

    const steps = normalizePlanSteps(input.steps);
    const openQuestions = normalizeOpenQuestions(input.open_questions);
    const newVersion = prior.version + 1;

    const [row] = await db
      .insert(planArtifactsTable)
      .values({
        messageId: ctx.messageId ?? prior.messageId,
        projectId: ctx.projectId,
        userId: ctx.userId,
        version: newVersion,
        parentId: input.planId,
        title: prior.title,
        intent: prior.intent,
        steps,
        openQuestions,
        estimatedEffort: prior.estimatedEffort,
        status: "proposed",
      })
      .returning();

    if (!row) {
      const ms = Math.round(performance.now() - started);
      ctx.emitToolResult("revise_plan", false, ms);
      return { ok: false, error: "Failed to create revised plan" };
    }

    const payload = buildPlanProposedPayload(row);
    ctx.planState.activePlanId = row.id;
    ctx.planState.latestPlanPayload = payload;

    ctx.emitNamedEvent("plan_revised", {
      parentId: input.planId,
      note: input.note ?? null,
      ...payload,
    });

    if (ctx.structuredPlanEnabled) {
      const legacy = toLegacyPlanArtifact(payload);
      ctx.res.write(`data: ${JSON.stringify({ type: "plan_start" })}\n\n`);
      ctx.res.write(`data: ${JSON.stringify(legacy)}\n\n`);
    }

    const ms = Math.round(performance.now() - started);
    ctx.emitToolResult("revise_plan", true, ms);
    return { ok: true, planId: row.id, version: newVersion, parentId: input.planId };
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    ctx.emitToolResult("revise_plan", false, ms);
    return { ok: false, error: String(err) };
  }
}

export function revisePlanTool(ctx: AgentToolContext) {
  return tool({
    description:
      "Revise an existing plan in response to user feedback. Creates a new version; do not use for tiny wording tweaks.",
    inputSchema: RevisePlanInput,
    execute: withPlanErrorGuard(
      async (input) => executeRevisePlan(ctx, input),
      async (rawText) => {
        try {
          const parsed = JSON.parse(rawText.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as z.infer<typeof RevisePlanInput>;
          if (parsed.planId && Array.isArray(parsed.steps)) {
            return executeRevisePlan(ctx, parsed);
          }
        } catch { /* fall through */ }
        return { ok: false, error: "Malformed revise_plan output", raw: rawText };
      },
    ),
  });
}
