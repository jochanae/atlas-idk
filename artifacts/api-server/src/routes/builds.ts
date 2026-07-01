import { Router, type IRouter } from "express";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

type BuildCommand = "typecheck" | "build";

const COMMANDS: Record<BuildCommand, string[]> = {
  typecheck: ["pnpm", "--filter", "@workspace/atlas-frontend", "run", "typecheck"],
  build:     ["pnpm", "--filter", "@workspace/atlas-frontend", "run", "build"],
};

const MAX_DURATION_MS = 120_000;
const ANSI_RE = /\x1B\[[0-9;]*m/g;

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current || current === parse(current).root) return "/home/runner/workspace";
    current = parent;
  }
}

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function summariseErrors(lines: string[]): string | null {
  const errors = lines.filter((l) =>
    /error TS\d+/.test(l) ||
    /\berror\b.*\.tsx?/.test(l) ||
    /^\s*(✗|×|Error)/.test(l),
  );
  if (errors.length === 0) return null;
  return errors.slice(0, 15).join("\n");
}

const router: IRouter = Router();

// ── POST /api/builds — start a build and stream output via SSE ────────────────
router.post("/builds", async (req, res): Promise<void> => {
  const { command = "typecheck", projectId } = (req.body ?? {}) as {
    command?: string;
    projectId?: number;
  };

  if (command !== "typecheck" && command !== "build") {
    res.status(400).json({ error: `Unknown command "${command}". Use typecheck or build.` });
    return;
  }

  const buildId = randomUUID();
  const startedAt = Date.now();
  const workspaceRoot = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
  const [bin, ...args] = COMMANDS[command as BuildCommand];

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: object) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ type: "start", buildId, command });

  const lines: string[] = [];
  let exitCode = 0;
  let timedOut = false;

  const child = spawn(bin, args, {
    cwd: workspaceRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });

  const timer = setTimeout(() => {
    timedOut = true;
    try { child.kill("SIGTERM"); } catch {}
  }, MAX_DURATION_MS);

  let outBuf = "";
  let errBuf = "";

  function drainBuf(buf: string, incoming: string, kind: "out" | "err"): string {
    const full = buf + incoming;
    const parts = full.split("\n");
    for (const part of parts.slice(0, -1)) {
      const text = stripAnsi(part).trimEnd();
      if (text) { lines.push(text); send({ type: "line", kind, text }); }
    }
    return parts[parts.length - 1];
  }

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { outBuf = drainBuf(outBuf, chunk, "out"); });
  child.stderr.on("data", (chunk: string) => { errBuf = drainBuf(errBuf, chunk, "err"); });

  child.on("close", async (code) => {
    clearTimeout(timer);
    exitCode = code ?? 1;

    // flush remaining buffer
    [outBuf, errBuf].forEach((buf, i) => {
      const text = stripAnsi(buf).trimEnd();
      if (text) { lines.push(text); send({ type: "line", kind: i === 0 ? "out" : "err", text }); }
    });

    const duration = Date.now() - startedAt;
    const status: string = timedOut ? "timeout" : exitCode === 0 ? "success" : "failed";
    const output = lines.join("\n").slice(-40_000);
    const errorSummary = summariseErrors(lines);

    send({ type: "done", buildId, command, status, exitCode, duration, errorSummary });

    try {
      await db.execute(sql`
        INSERT INTO project_builds
          (id, project_id, command, status, output, error_summary, started_at, finished_at)
        VALUES
          (${buildId}, ${projectId ?? null}, ${command}, ${status},
           ${output}, ${errorSummary}, ${new Date(startedAt)}, now())
      `);
    } catch (err) {
      logger.warn({ err }, "builds: failed to persist result");
    }

    res.end();
  });

  child.on("error", (err) => {
    clearTimeout(timer);
    send({ type: "error", message: err.message });
    res.end();
  });

  req.on("close", () => {
    if (!child.killed) { try { child.kill("SIGTERM"); } catch {} }
  });
});

// ── GET /api/builds/:id — fetch a stored result ───────────────────────────────
router.get("/builds/:id", async (req, res): Promise<void> => {
  try {
    const result = await db.execute(sql`
      SELECT * FROM project_builds WHERE id = ${req.params.id} LIMIT 1
    `);
    if (!result.rows.length) { res.status(404).json({ error: "Build not found" }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    logger.warn({ err }, "builds: GET /:id failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/projects/:projectId/builds — list recent builds ─────────────────
router.get("/projects/:projectId/builds", async (req, res): Promise<void> => {
  try {
    const result = await db.execute(sql`
      SELECT id, command, status, error_summary, started_at, finished_at
      FROM project_builds
      WHERE project_id = ${parseInt(req.params.projectId, 10)}
      ORDER BY started_at DESC
      LIMIT 20
    `);
    res.json(result.rows);
  } catch (err) {
    logger.warn({ err }, "builds: GET /projects/:id/builds failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
