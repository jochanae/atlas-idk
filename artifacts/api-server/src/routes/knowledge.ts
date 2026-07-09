import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { computeProjectKnowledge } from "../lib/projectKnowledge";

const router: IRouter = Router();

const QuerySchema = z.object({
  concept: z.string().min(1).max(200),
});

function authUserId(req: import("express").Request): number {
  return (req as any).authUser.id as number;
}

// ── GET /knowledge?concept=<phrase> ──────────────────────────────────────────
// "Show me every invite flow I've ever built" — ranked by implementation
// maturity across all of the user's projects.

router.get("/knowledge", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide ?concept=<phrase>" });
    return;
  }

  try {
    const result = await computeProjectKnowledge(userId, parsed.data.concept);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "project-knowledge failed");
    res.status(500).json({ error: "Failed to compute project knowledge" });
  }
});

export default router;
