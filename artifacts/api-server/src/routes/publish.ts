import { Router } from "express";
import { randomUUID } from "crypto";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

function publishBaseUrl(): string {
  const domains = process.env.REPLIT_DOMAINS?.split(",").map((d) => d.trim()) ?? [];
  return domains[0] ? `https://${domains[0]}` : `http://localhost:${process.env.PORT ?? 8080}`;
}

// POST /api/projects/:id/publish — publish the current build (idempotent: same token if already published)
router.post("/projects/:id/publish", async (req, res): Promise<void> => {
  const projectId = Number(req.params["id"]);
  if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }

  try {
    // Check if already published
    const existing = await pool.query<{ publish_token: string | null }>(
      "SELECT publish_token FROM projects WHERE id = $1",
      [projectId]
    );
    const existingToken = existing.rows[0]?.publish_token;

    const token = existingToken ?? randomUUID().replace(/-/g, "");

    if (!existingToken) {
      await pool.query(
        "UPDATE projects SET publish_token = $1, published_at = NOW() WHERE id = $2",
        [token, projectId]
      );
    }

    logger.info({ projectId, token, wasExisting: !!existingToken }, "project published");
    res.json({ token, url: `${publishBaseUrl()}/p/${token}`, publishedAt: new Date().toISOString() });
  } catch (err) {
    logger.error({ err, projectId }, "Failed to publish project");
    res.status(500).json({ error: "Failed to publish project" });
  }
});

// PUT /api/projects/:id/publish — republish: regenerate token (new permanent URL)
router.put("/projects/:id/publish", async (req, res): Promise<void> => {
  const projectId = Number(req.params["id"]);
  if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }

  try {
    const token = randomUUID().replace(/-/g, "");
    await pool.query(
      "UPDATE projects SET publish_token = $1, published_at = NOW() WHERE id = $2",
      [token, projectId]
    );
    logger.info({ projectId, token }, "project republished");
    res.json({ token, url: `${publishBaseUrl()}/p/${token}`, publishedAt: new Date().toISOString() });
  } catch (err) {
    logger.error({ err, projectId }, "Failed to republish project");
    res.status(500).json({ error: "Failed to republish project" });
  }
});

// DELETE /api/projects/:id/publish — unpublish (revoke permanent URL)
router.delete("/projects/:id/publish", async (req, res): Promise<void> => {
  const projectId = Number(req.params["id"]);
  if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }

  try {
    await pool.query(
      "UPDATE projects SET publish_token = NULL, published_at = NULL WHERE id = $1",
      [projectId]
    );
    logger.info({ projectId }, "project unpublished");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, projectId }, "Failed to unpublish project");
    res.status(500).json({ error: "Failed to unpublish project" });
  }
});

// GET /api/projects/:id/publish — get current publish state
router.get("/projects/:id/publish", async (req, res): Promise<void> => {
  const projectId = Number(req.params["id"]);
  if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }

  try {
    const result = await pool.query<{ publish_token: string | null; published_at: Date | null }>(
      "SELECT publish_token, published_at FROM projects WHERE id = $1",
      [projectId]
    );
    const row = result.rows[0];
    const token = row?.publish_token ?? null;
    res.json({
      token,
      url: token ? `${publishBaseUrl()}/p/${token}` : null,
      publishedAt: row?.published_at?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err, projectId }, "Failed to get publish state");
    res.status(500).json({ error: "Failed to get publish state" });
  }
});

export default router;
