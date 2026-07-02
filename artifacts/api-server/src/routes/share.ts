import { Router } from "express";
import { randomUUID } from "crypto";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

function shareBaseUrl(): string {
  const domains = process.env.REPLIT_DOMAINS?.split(",").map((d) => d.trim()) ?? [];
  return domains[0] ? `https://${domains[0]}` : `http://localhost:${process.env.PORT ?? 8080}`;
}

// POST /api/projects/:id/share — generate (or regenerate) a share token
router.post("/projects/:id/share", async (req, res): Promise<void> => {
  const projectId = Number(req.params["id"]);
  if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }

  const token = randomUUID().replace(/-/g, "");
  try {
    await pool.query("UPDATE projects SET share_token = $1 WHERE id = $2", [token, projectId]);
    logger.info({ projectId }, "share token generated");
    res.json({ token, url: `${shareBaseUrl()}/share/${token}` });
  } catch (err) {
    logger.error({ err, projectId }, "Failed to generate share token");
    res.status(500).json({ error: "Failed to generate share token" });
  }
});

// DELETE /api/projects/:id/share — revoke share token
router.delete("/projects/:id/share", async (req, res): Promise<void> => {
  const projectId = Number(req.params["id"]);
  if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }

  try {
    await pool.query("UPDATE projects SET share_token = NULL WHERE id = $1", [projectId]);
    logger.info({ projectId }, "share token revoked");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, projectId }, "Failed to revoke share token");
    res.status(500).json({ error: "Failed to revoke share token" });
  }
});

// GET /api/projects/:id/share — get current share state
router.get("/projects/:id/share", async (req, res): Promise<void> => {
  const projectId = Number(req.params["id"]);
  if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }

  try {
    const result = await pool.query<{ share_token: string | null }>(
      "SELECT share_token FROM projects WHERE id = $1",
      [projectId]
    );
    const token = result.rows[0]?.share_token ?? null;
    res.json({ token, url: token ? `${shareBaseUrl()}/share/${token}` : null });
  } catch (err) {
    logger.error({ err, projectId }, "Failed to get share state");
    res.status(500).json({ error: "Failed to get share state" });
  }
});

export default router;
