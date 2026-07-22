import { Router, type IRouter } from "express";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { db, entriesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { assertProjectOwner, ensureProjectWorkspaceDir } from "../lib/projectWorkspace";

const router: IRouter = Router();

export type VerifyKind = "typecheck" | "test" | "lint" | "build";

const MAX_DURATION_MS = 180_000;
const ANSI_RE = /\x1B\[[0-9;]*m/g;

const TARGET_LABELS: Record<VerifyKind, string> = {
  typecheck: "Type Check",
  test: "Tests",
  lint: "Lint",
  build: "Build",
};

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function parseFailingCount(kind: VerifyKind, lines: string[], exitCode: number): number | undefined {
  if (exitCode === 0) return undefined;
  const text = lines.join("\n");
  if (kind === "test") {
    const failedTests = text.match(/(\d+)\s+failed/i);
    if (failedTests) return Number(failedTests[1]);
    const testFiles = text.match(/Failed Tests\s+(\d+)/i);
    if (testFiles) return Number(testFiles[1]);
  }
  if (kind === "typecheck") {
    const tsErrors = text.match(/Found (\d+) error/i);
    if (tsErrors) return Number(tsErrors[1]);
    const errorCount = lines.filter((l) => /error TS\d+/.test(l)).length;
    if (errorCount > 0) return errorCount;
  }
  if (kind === "lint") {
    const problems = text.match(/(\d+)\s+problems?\s*\((\d+)\s+errors?/i);
    if (problems) return Number(problems[2] ?? problems[1]);
  }
  return undefined;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveCommand(workspaceDir: string, kind: VerifyKind): Promise<{ bin: string; args: string[] }> {
  const pkgPath = join(workspaceDir, "package.json");
  const hasPkg = await fileExists(pkgPath);

  if (kind === "typecheck") {
    if (await fileExists(join(workspaceDir, "node_modules/.bin/tsgo"))) {
      return { bin: "bunx", args: ["tsgo", "--noEmit"] };
    }
    if (await fileExists(join(workspaceDir, "node_modules/.bin/tsc"))) {
      return { bin: "bunx", args: ["tsc", "--noEmit"] };
    }
    return { bin: "tsc", args: ["--noEmit"] };
  }

  if (kind === "test") {
    return { bin: "bunx", args: ["vitest", "run", "--reporter=default"] };
  }

  if (kind === "lint") {
    if (hasPkg) {
      try {
        const pkg = JSON.parse(await (await import("node:fs/promises")).readFile(pkgPath, "utf8")) as { scripts?: Record<string, string> };
        if (pkg.scripts?.lint) return { bin: "bun", args: ["run", "lint"] };
      } catch { /* fall through */ }
    }
    return { bin: "bunx", args: ["eslint", ".", "--max-warnings=0"] };
  }

  // build
  if (hasPkg) {
    try {
      const pkg = JSON.parse(await (await import("node:fs/promises")).readFile(pkgPath, "utf8")) as { scripts?: Record<string, string> };
      if (pkg.scripts?.build) return { bin: "bun", args: ["run", "build"] };
    } catch { /* fall through */ }
  }
  return { bin: "bun", args: ["run", "build"] };
}

function spawnInWorkspace(workspaceDir: string, bin: string, args: string[]) {
  return spawn(bin, args, {
    cwd: workspaceDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", CI: "1" },
    shell: false,
  });
}

async function persistVerificationEntry({
  projectId,
  kind,
  status,
  durationMs,
  failingCount,
  parentRunId,
}: {
  projectId: number;
  kind: VerifyKind;
  status: "passed" | "failed";
  durationMs: number;
  failingCount?: number;
  parentRunId?: string;
}): Promise<number | null> {
  const label = TARGET_LABELS[kind];
  const title = `Verified · ${label} · ${status} · ${formatDuration(durationMs)}`;
  const createdAt = new Date().toISOString();
  const enrichment = {
    kind: "verification" as const,
    target: kind,
    status,
    ...(failingCount != null ? { failingCount } : {}),
    durationMs,
    ...(parentRunId ? { parentRunId } : {}),
    createdAt,
  };

  try {
    const [entry] = await db.insert(entriesTable).values({
      projectId,
      type: "EngineeringEvent",
      status: "committed",
      severity: status === "passed" ? "committed" : "blocker",
      mode: "verification",
      verb: "verify",
      title,
      summary: status === "failed" && failingCount != null
        ? `${failingCount} failing`
        : `${label} ${status}`,
      enrichmentJson: JSON.stringify(enrichment),
    } as typeof entriesTable.$inferInsert).returning({ id: entriesTable.id });
    return entry?.id ?? null;
  } catch (err) {
    logger.warn({ err, projectId, kind }, "verify: failed to persist ledger entry");
    return null;
  }
}

// POST /api/projects/:id/verify — run verification command, stream stdout via SSE
router.post("/projects/:id/verify", async (req, res): Promise<void> => {
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }

  const userId = (req as { authUser?: { id?: number } }).authUser?.id;
  if (!userId || !(await assertProjectOwner(projectId, userId))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const { kind, parentRunId } = (req.body ?? {}) as { kind?: string; parentRunId?: string };
  const validKinds: VerifyKind[] = ["typecheck", "test", "lint", "build"];
  if (!kind || !validKinds.includes(kind as VerifyKind)) {
    res.status(400).json({ error: `Invalid kind. Use one of: ${validKinds.join(", ")}` });
    return;
  }
  const verifyKind = kind as VerifyKind;

  let workspaceDir: string;
  try {
    workspaceDir = await ensureProjectWorkspaceDir(projectId);
  } catch (err) {
    logger.warn({ err, projectId }, "verify: workspace unavailable");
    res.status(500).json({ error: "Project workspace unavailable" });
    return;
  }

  const { bin, args } = await resolveCommand(workspaceDir, verifyKind);
  const startedAt = Date.now();

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: object) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ type: "start", kind: verifyKind, command: [bin, ...args].join(" ") });

  const lines: string[] = [];
  let exitCode = 0;
  let timedOut = false;

  const child = spawnInWorkspace(workspaceDir, bin, args);

  const timer = setTimeout(() => {
    timedOut = true;
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
  }, MAX_DURATION_MS);

  let outBuf = "";
  let errBuf = "";

  function drainBuf(buf: string, incoming: string, stream: "stdout" | "stderr"): string {
    const full = buf + incoming;
    const parts = full.split("\n");
    for (const part of parts.slice(0, -1)) {
      const text = stripAnsi(part).trimEnd();
      if (!text) continue;
      lines.push(text);
      send({ type: "output", stream, text });
    }
    return parts[parts.length - 1];
  }

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { outBuf = drainBuf(outBuf, chunk, "stdout"); });
  child.stderr.on("data", (chunk: string) => { errBuf = drainBuf(errBuf, chunk, "stderr"); });

  const finish = async (code: number | null) => {
    clearTimeout(timer);
    exitCode = timedOut ? 1 : (code ?? 1);

    for (const [buf, stream] of [[outBuf, "stdout"], [errBuf, "stderr"]] as const) {
      const text = stripAnsi(buf).trimEnd();
      if (text) {
        lines.push(text);
        send({ type: "output", stream, text });
      }
    }

    const durationMs = Date.now() - startedAt;
    const status: "passed" | "failed" = exitCode === 0 && !timedOut ? "passed" : "failed";
    const failingCount = parseFailingCount(verifyKind, lines, exitCode);

    const entryId = await persistVerificationEntry({
      projectId,
      kind: verifyKind,
      status,
      durationMs,
      failingCount,
      parentRunId: typeof parentRunId === "string" ? parentRunId : undefined,
    });

    send({
      type: "done",
      kind: verifyKind,
      status,
      durationMs,
      ...(failingCount != null ? { failingCount } : {}),
      ...(entryId != null ? { entryId } : {}),
    });
    res.end();
  };

  child.on("close", (code) => { void finish(code); });
  child.on("error", (err) => {
    send({ type: "error", message: err.message });
    void finish(1);
  });

  req.on("close", () => {
    if (!child.killed) {
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
    }
  });
});

// GET /api/projects/:id/verify/status — latest verification status per kind
router.get("/projects/:id/verify/status", async (req, res): Promise<void> => {
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }

  const userId = (req as { authUser?: { id?: number } }).authUser?.id;
  if (!userId || !(await assertProjectOwner(projectId, userId))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const rows = await db
    .select({
      enrichmentJson: entriesTable.enrichmentJson,
      createdAt: entriesTable.createdAt,
    })
    .from(entriesTable)
    .where(eq(entriesTable.projectId, projectId))
    .orderBy(desc(entriesTable.createdAt));

  const latest: Partial<Record<VerifyKind, {
    status: "passed" | "failed";
    failingCount?: number;
    durationMs: number;
    createdAt: string;
  }>> = {};

  for (const row of rows) {
    if (!row.enrichmentJson) continue;
    try {
      const meta = JSON.parse(row.enrichmentJson) as {
        kind?: string;
        target?: VerifyKind;
        status?: "passed" | "failed";
        failingCount?: number;
        durationMs?: number;
      };
      if (meta.kind !== "verification" || !meta.target) continue;
      if (latest[meta.target]) continue;
      latest[meta.target] = {
        status: meta.status ?? "failed",
        failingCount: meta.failingCount,
        durationMs: meta.durationMs ?? 0,
        createdAt: row.createdAt.toISOString(),
      };
    } catch { /* skip malformed */ }
  }

  res.json({ latest });
});

export default router;
