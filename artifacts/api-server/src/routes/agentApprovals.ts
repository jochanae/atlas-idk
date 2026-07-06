import { Router } from "express";
import { db, planArtifactsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolvePendingApproval } from "../lib/agent-loop/approvals";
import { writePlanCommittedLedgerEntry } from "../lib/agent-tools/plan-helpers";

const router = Router();

router.post("/agent/approvals/:approvalId", async (req, res) => {
  const { approvalId } = req.params;
  const { decision } = req.body as { decision?: string };
  const userId: number = (req as any).authUser?.id as number;

  if (!decision || !["approve", "reject"].includes(decision)) {
    res.status(400).json({ error: "decision must be 'approve' or 'reject'" });
    return;
  }

  // The approvalId can be either:
  //   • An SDK-generated UUID from tool_approval_request (commit_plan blocked mid-stream)
  //   • A planId UUID from the plan_proposed event (stopAfterProposePlan flow)
  // Try the in-memory SDK approval store first, then fall back to treating it as a planId.
  const pending = resolvePendingApproval(approvalId);
  const planId = pending?.planId ?? approvalId;

  const [plan] = await db
    .select()
    .from(planArtifactsTable)
    .where(eq(planArtifactsTable.id, planId))
    .limit(1);

  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  if (plan.userId !== null && plan.userId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (decision === "approve") {
    if (plan.status === "committed") {
      res.json({ ok: true, planId, committedAt: plan.committedAt?.toISOString() });
      return;
    }

    const committedAt = new Date();
    await db
      .update(planArtifactsTable)
      .set({ status: "committed", committedAt })
      .where(eq(planArtifactsTable.id, planId));

    await writePlanCommittedLedgerEntry(plan.projectId, plan.title, plan.intent, plan.messageId);

    res.json({ ok: true, planId, committedAt: committedAt.toISOString() });
  } else {
    await db
      .update(planArtifactsTable)
      .set({ status: "rejected" })
      .where(eq(planArtifactsTable.id, planId));

    res.json({ ok: true, planId, rejected: true });
  }
});

export default router;
