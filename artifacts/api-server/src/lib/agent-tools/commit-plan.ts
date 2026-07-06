import { tool } from "ai";
import { db, planArtifactsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AgentToolContext } from "./context";
import { CommitPlanInput } from "./schemas/plan";
import { withPlanErrorGuard, writePlanCommittedLedgerEntry } from "./plan-helpers";

export function commitPlanTool(ctx: AgentToolContext) {
  return tool({
    description: "Commit an approved plan so Atlas may execute write tools.",
    inputSchema: CommitPlanInput,
    execute: withPlanErrorGuard(
      async ({ planId }) => {
        const started = performance.now();
        ctx.emitToolCall("commit_plan", { planId });
        try {
          const [plan] = await db
            .select()
            .from(planArtifactsTable)
            .where(eq(planArtifactsTable.id, planId))
            .limit(1);

          if (!plan || plan.projectId !== ctx.projectId || plan.userId !== ctx.userId) {
            const ms = Math.round(performance.now() - started);
            ctx.emitToolResult("commit_plan", false, ms);
            return { ok: false, error: "Plan not found" };
          }

          if (plan.status === "committed") {
            const ms = Math.round(performance.now() - started);
            ctx.emitToolResult("commit_plan", true, ms);
            return { ok: true, planId, alreadyCommitted: true };
          }

          const committedAt = new Date();
          await db
            .update(planArtifactsTable)
            .set({ status: "committed", committedAt })
            .where(eq(planArtifactsTable.id, planId));

          await writePlanCommittedLedgerEntry(ctx.projectId, plan.title, plan.intent, ctx.messageId);

          ctx.planState.hasApprovedCommitPlan = true;
          ctx.emitNamedEvent("plan_committed", {
            planId,
            committedAt: committedAt.toISOString(),
          });

          const ms = Math.round(performance.now() - started);
          ctx.emitToolResult("commit_plan", true, ms);
          return { ok: true, planId, committedAt: committedAt.toISOString() };
        } catch (err) {
          const ms = Math.round(performance.now() - started);
          ctx.emitToolResult("commit_plan", false, ms);
          return { ok: false, error: String(err) };
        }
      },
      async (rawText) => ({
        ok: false as const,
        error: "Malformed commit_plan input",
        raw: rawText,
      }),
    ),
  });
}
