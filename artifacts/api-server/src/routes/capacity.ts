import { Router, type IRouter } from "express";
import {
  CapacityEstimateBody,
  CapacityConsumeBody,
} from "@workspace/api-zod";
import {
  buildEstimate,
  consumeCapacity,
  getOrCreatePool,
  poolToSnapshot,
  type ExecutionKind,
} from "../lib/capacity";

const router: IRouter = Router();

router.get("/capacity", async (req, res): Promise<void> => {
  const userId = (req as any).authUser.id as number;
  const pool = await getOrCreatePool(userId);
  res.json(poolToSnapshot(pool));
});

router.post("/capacity/estimate", async (req, res): Promise<void> => {
  const parsed = CapacityEstimateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = (req as any).authUser.id as number;
  const pool = await getOrCreatePool(userId);
  const snapshot = poolToSnapshot(pool);
  const estimate = buildEstimate(
    parsed.data.kind as ExecutionKind,
    parsed.data.payload,
    snapshot,
  );

  const { estimateId, ...response } = estimate;
  res.json(response);
});

router.post("/capacity/consume", async (req, res): Promise<void> => {
  const parsed = CapacityConsumeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = (req as any).authUser.id as number;
  const { snapshot, paymentRequired } = await consumeCapacity(userId, {
    kind: parsed.data.kind as ExecutionKind,
    estimateId: parsed.data.estimateId,
    actualCredits: parsed.data.actualCredits,
    actualTokens: parsed.data.actualTokens,
    filesTouched: parsed.data.filesTouched,
    componentsAdded: parsed.data.componentsAdded,
    runId: parsed.data.runId,
    ledgerEntryId: parsed.data.ledgerEntryId,
    model: parsed.data.model,
  });

  if (paymentRequired) {
    res.status(402).json(snapshot);
    return;
  }

  res.json(snapshot);
});

router.post("/capacity/topup", (_req, res): void => {
  res.status(501).json({ error: "Capacity top-up is not available yet" });
});

export default router;
