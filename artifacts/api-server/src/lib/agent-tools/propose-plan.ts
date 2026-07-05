import { tool } from "ai";
import { NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { db, planArtifactsTable } from "@workspace/db";
import type { AgentToolContext } from "./context";
import {
  ProposePlanInput,
  clampEstimatedEffort,
  normalizeOpenQuestions,
  normalizePlanSteps,
  parsePlanInputFallback,
  toLegacyPlanArtifact,
} from "./schemas/plan";
import { buildPlanProposedPayload, withPlanErrorGuard } from "./plan-helpers";

async function executeProposePlan(
  ctx: AgentToolContext,
  input: z.infer<typeof ProposePlanInput>,
) {
  const started = performance.now();
  ctx.emitToolCall("propose_plan", { title: input.title });

  try {
    const steps = normalizePlanSteps(input.steps);
    const openQuestions = normalizeOpenQuestions(input.open_questions);
    const estimatedEffort = clampEstimatedEffort(input.estimated_effort);

    const [row] = await db
      .insert(planArtifactsTable)
      .values({
        messageId: ctx.messageId ?? null,
        projectId: ctx.projectId,
        userId: ctx.userId,
        version: 1,
        parentId: null,
        title: input.title.slice(0, 200),
        intent: input.intent,
        steps,
        openQuestions,
        estimatedEffort,
        status: "proposed",
      })
      .returning();

    if (!row) {
      const ms = Math.round(performance.now() - started);
      ctx.emitToolResult("propose_plan", false, ms);
      return { ok: false, error: "Failed to create plan" };
    }

    const payload = buildPlanProposedPayload(row);
    ctx.planState.activePlanId = row.id;
    ctx.planState.latestPlanPayload = payload;
    ctx.emitNamedEvent("plan_proposed", payload);

    if (ctx.structuredPlanEnabled) {
      const legacy = toLegacyPlanArtifact(payload);
      ctx.res.write(`data: ${JSON.stringify({ type: "plan_start" })}\n\n`);
      ctx.res.write(`data: ${JSON.stringify(legacy)}\n\n`);
    }

    const ms = Math.round(performance.now() - started);
    ctx.emitToolResult("propose_plan", true, ms);
    return { ok: true, planId: row.id, version: 1 };
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    ctx.emitToolResult("propose_plan", false, ms);
    return { ok: false, error: String(err) };
  }
}

export function proposePlanTool(ctx: AgentToolContext) {
  return tool({
    description:
      "Emit a structured plan for the user to review before any build action. Use whenever the user's intent implies multiple coordinated changes.",
    inputSchema: ProposePlanInput,
    execute: withPlanErrorGuard(
      async (input) => executeProposePlan(ctx, input),
      async (rawText) => {
        const fallback = parsePlanInputFallback(rawText);
        if (fallback) {
          return executeProposePlan(ctx, fallback);
        }
        ctx.emitNamedEvent("plan_proposed", { raw: rawText, parseError: true });
        return { ok: false, error: "Malformed plan output", raw: rawText };
      },
    ),
  });
}

/** Re-export for tests — guard handles NoObjectGeneratedError at execute boundary. */
export function isPlanParseError(error: unknown): boolean {
  return NoObjectGeneratedError.isInstance(error);
}
