import { Router, type IRouter } from "express";
import { buildAccountCapacity, buildAccountPlan } from "../lib/account";
import { getOrCreatePool } from "../lib/capacity";

const router: IRouter = Router();

router.get("/account/plan", async (req, res): Promise<void> => {
  const authUser = (req as any).authUser;
  const pool = await getOrCreatePool(authUser.id as number);
  res.json(buildAccountPlan(authUser.subscriptionTier, pool.periodEnd));
});

router.get("/account/capacity", async (req, res): Promise<void> => {
  const userId = (req as any).authUser.id as number;
  const pool = await getOrCreatePool(userId);
  res.json(buildAccountCapacity(pool));
});

export default router;
