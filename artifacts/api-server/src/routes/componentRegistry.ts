import { Router, type IRouter } from "express";
import { computeComponentRegistry } from "../lib/componentRegistry";

const router: IRouter = Router();

function authUserId(req: import("express").Request): number {
  return (req as any).authUser.id as number;
}

// ── GET /component-registry ─────────────────────────────────────────────────
// Scans every owned project for exported React components and groups
// duplicates across projects — extraction candidates for a shared library.

router.get("/component-registry", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  try {
    const result = await computeComponentRegistry(userId);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "component-registry failed");
    res.status(500).json({ error: "Failed to compute component registry" });
  }
});

export default router;
