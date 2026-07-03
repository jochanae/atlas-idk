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

    // Record in execution_runs so BUILD_RUN shell runs are first-class run entities.
    if (projectId) {
      try {
        const runId = randomUUID();
        const runStatus = status === "success" ? "succeeded" : "failed";
        await db.execute(sql`
          INSERT INTO execution_runs
            (id, project_id, thread_id, message_id, mode, status, summary, started_at, completed_at, elapsed_ms)
          VALUES
            (${runId}, ${projectId}, null, null, 'operational', ${runStatus},
             ${command + " run"}, ${new Date(startedAt)}, now(), ${duration})
        `);
        await db.execute(sql`
          INSERT INTO execution_run_steps (run_id, verb, target, status, detail)
          VALUES (${runId}, 'BUILD_RUN', ${command}, ${runStatus === "succeeded" ? "ok" : "fail"}, ${errorSummary})
        `);
        logger.info({ runId, projectId, command, status: runStatus }, "execution_run: BUILD_RUN recorded");
      } catch (err) {
        logger.warn({ err }, "builds: execution_run persist failed — non-fatal");
      }
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

// ── GET /api/projects/:projectId/runs — list execution runs with steps ───────
// Phase 2 read-only: confirms execution_runs is the durable truth source before
// WorkspaceRunCard is wired to consume it.
router.get("/projects/:projectId/runs", async (req, res): Promise<void> => {
  const projectId = parseInt(req.params.projectId, 10);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  try {
    // Fetch runs ordered newest-first
    const runsResult = await db.execute(sql`
      SELECT
        id, project_id, thread_id, message_id, mode, status, summary,
        receipts, started_at, completed_at, elapsed_ms
      FROM execution_runs
      WHERE project_id = ${projectId}
      ORDER BY started_at DESC
      LIMIT 50
    `);

    if (runsResult.rows.length === 0) {
      res.json({ runs: [] });
      return;
    }

    // Fetch all steps for the returned runs in one query
    const runIds = runsResult.rows.map((r) => r.id as string);
    const stepsResult = await db.execute(sql`
      SELECT id, run_id, verb, target, status, detail, created_at
      FROM execution_run_steps
      WHERE run_id = ANY(${runIds})
      ORDER BY run_id, created_at ASC
    `);

    // Group steps by run_id
    const stepsByRunId = new Map<string, typeof stepsResult.rows>();
    for (const step of stepsResult.rows) {
      const rid = step.run_id as string;
      if (!stepsByRunId.has(rid)) stepsByRunId.set(rid, []);
      stepsByRunId.get(rid)!.push(step);
    }

    const runs = runsResult.rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      threadId: r.thread_id,
      messageId: r.message_id,
      mode: r.mode,
      status: r.status,
      summary: r.summary,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      elapsedMs: r.elapsed_ms,
      steps: (stepsByRunId.get(r.id as string) ?? []).map((s) => ({
        id: s.id,
        verb: s.verb,
        target: s.target,
        status: s.status,
        detail: s.detail,
        createdAt: s.created_at,
      })),
    }));

    res.json({ runs });
  } catch (err) {
    logger.warn({ err }, "runs: GET /projects/:id/runs failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/runs/:id — fetch a single execution run (for /runs/:id page) ────
router.get("/runs/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  if (!id) { res.status(400).json({ error: "Missing run id" }); return; }

  try {
    const runResult = await db.execute(sql`
      SELECT id, project_id, thread_id, message_id, mode, status, summary,
             started_at, completed_at, elapsed_ms
      FROM execution_runs
      WHERE id = ${id}
      LIMIT 1
    `);
    if (runResult.rows.length === 0) {
      res.status(404).json({ error: "Run not found" }); return;
    }
    const r = runResult.rows[0];

    const stepsResult = await db.execute(sql`
      SELECT id, run_id, verb, target, status, detail, created_at
      FROM execution_run_steps
      WHERE run_id = ${id}
      ORDER BY created_at ASC
    `);

    res.json({
      id: r.id,
      projectId: r.project_id,
      threadId: r.thread_id,
      messageId: r.message_id,
      mode: r.mode,
      status: r.status,
      summary: r.summary,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      elapsedMs: r.elapsed_ms,
      steps: stepsResult.rows.map((s) => ({
        id: s.id,
        verb: s.verb,
        target: s.target,
        status: s.status,
        detail: s.detail,
        createdAt: s.created_at,
      })),
    });
  } catch (err) {
    logger.warn({ err }, "runs: GET /runs/:id failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
