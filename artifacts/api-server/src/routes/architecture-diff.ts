import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { computeArchitectureDiff } from "../lib/architectureDiff";

const router: IRouter = Router();

const projectIdParam = z.coerce.number().int().positive();

function authUserId(req: import("express").Request): number {
  return (req as any).authUser.id as number;
}

// ── GET /projects/:id/architecture-diff?compareTo=<projectId> ───────────────

router.get("/projects/:id/architecture-diff", async (req, res): Promise<void> => {
  const userId = authUserId(req);
  const idParsed = projectIdParam.safeParse(req.params.id);
  const compareToParsed = projectIdParam.safeParse(req.query.compareTo);

  if (!idParsed.success || !compareToParsed.success) {
    res.status(400).json({ error: "Invalid project id(s). Provide ?compareTo=<projectId>." });
    return;
  }

  const projectAId = idParsed.data;
  const projectBId = compareToParsed.data;

  if (projectAId === projectBId) {
    res.status(400).json({ error: "Cannot compare a project to itself" });
    return;
  }

  try {
    const result = await computeArchitectureDiff(userId, projectAId, projectBId);
    if (!result) {
      res.status(404).json({ error: "One or both projects not found" });
      return;
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "architecture-diff failed");
    res.status(500).json({ error: "Failed to compute architecture diff" });
  }
});

export default router;
