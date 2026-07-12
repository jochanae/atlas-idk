/**
 * Phase 1 — Run Lifecycle Contract endpoints
 *
 * Implements all endpoints defined in docs/RUN_LIFECYCLE_CONTRACT.md v1.2.
 * Does NOT touch nexus.ts or chat.ts. Purely additive.
 *
 * Routes mounted at /api:
 *   GET  /api/sse/conversation/:conversationId         — SSE stream
 *   GET  /api/conversations/:conversationId/messages   — paginated history
 *   GET  /api/runs                                     — list runs
 *   GET  /api/runs/:id                                 — single run
 *   GET  /api/runs/:id/steps                           — step metadata
 *   GET  /api/runs/:id/changes                         — file diffs
 *   GET  /api/runs/:id/terminal                        — paginated shell output
 *   GET  /api/runs/:id/outputs                         — artifact metadata
 *   POST /api/runs/:id/confirm                         — Gate 1
 *   POST /api/runs/:id/cancel                          — cancel any non-terminal run
 *   POST /api/runs/:id/commit                          — trigger GitHub commit
 */

import { Router } from "express";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import * as bus from "../lib/runEventBus";
import { randomUUID } from "node:crypto";
import type {
  Run,
  RunStep,
  RunChange,
  RunArtifact,
  RunCommit,
  ConversationMessage,
  ConversationPage,
  RunStatus,
} from "@workspace/run-contract";
import { isTerminal } from "@workspace/run-contract";

const router = Router();

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function getUserId(req: any): number | null {
  return (req.authUser?.id as number) ?? null;
}

// ---------------------------------------------------------------------------
// DB row → Run (canonical shape from contract v1.2)
// ---------------------------------------------------------------------------

function rowToRun(row: any): Run {
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    conversationId: row.conversation_id,
    status: row.status as RunStatus,
    intent: row.intent,
    prompt: row.prompt ?? "",
    response: row.response ?? null,
    summary: row.summary ?? null,
    plan: row.plan ?? null,
    stepCount: row.step_count ?? 0,
    stepsDone: row.steps_done ?? 0,
    error: row.error ?? null,
    verification: row.verification ?? null,
    commit: row.commit_state ?? null,
    snapshotRef: row.snapshot_ref ?? null,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at ?? ""),
    updatedAt: row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : String(row.updated_at ?? ""),
    completedAt: row.completed_at
      ? (row.completed_at instanceof Date
        ? row.completed_at.toISOString()
        : String(row.completed_at))
      : null,
    elapsedMs: row.elapsed_ms ?? null,
  };
}

function rowToStep(row: any): RunStep {
  return {
    id: row.id,
    runId: row.run_id,
    seq: row.seq,
    verb: row.verb,
    status: row.status ?? "pending",
    title: row.title ?? "",
    detail: row.detail ?? null,
    filePath: row.file_path ?? null,
    command: row.command ?? null,
    exitCode: row.exit_code ?? null,
    outputSummary: row.output_summary ?? null,
    artifact: row.artifact ?? null,
    startedAt: row.started_at
      ? (row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at))
      : null,
    completedAt: row.completed_at
      ? (row.completed_at instanceof Date ? row.completed_at.toISOString() : String(row.completed_at))
      : null,
  };
}

// ---------------------------------------------------------------------------
// Authorization: verify caller owns the conversation
// ---------------------------------------------------------------------------

async function verifyConversationAccess(
  conversationId: string,
  userId: number,
): Promise<boolean> {
  const result = await db.execute<{ user_id: number }>(sql`
    SELECT user_id FROM nexus_conversations
    WHERE conversation_id = ${conversationId}
    LIMIT 1
  `);
  const row = result.rows[0];
  return row?.user_id === userId;
}

async function verifyRunAccess(runId: string, userId: number): Promise<boolean> {
  const result = await db.execute<{ user_id: number }>(sql`
    SELECT user_id FROM contract_runs WHERE id = ${runId} LIMIT 1
  `);
  const row = result.rows[0];
  return row?.user_id === userId;
}

// ---------------------------------------------------------------------------
// SSE — GET /api/sse/conversation/:conversationId
// ---------------------------------------------------------------------------

router.get("/sse/conversation/:conversationId", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { conversationId } = req.params;
    if (!conversationId) {
      res.status(400).json({ error: "conversationId required" });
      return;
    }

    const hasAccess = await verifyConversationAccess(conversationId, userId);
    if (!hasAccess) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Determine replay starting point
    const lastEventId = req.headers["last-event-id"];
    const afterSeq = lastEventId ? Number(lastEventId) : 0;

    if (afterSeq > 0) {
      // Reconnect: replay missed events
      await bus.replay(conversationId, afterSeq, res);
    } else {
      // Fresh connect: send current state
      const activeRun = await getActiveRun(conversationId);
      if (activeRun) {
        // Replay all events for the active run
        const events = await bus.getActiveRunEvents(conversationId, activeRun.id);
        for (const evt of events) {
          res.write(
            `id: ${evt.event_id}\nevent: ${evt.type}\ndata: ${JSON.stringify({
              eventId: evt.event_id,
              seq: evt.seq,
              runId: evt.run_id,
              conversationId: evt.conversation_id,
              type: evt.type,
              timestamp: evt.timestamp instanceof Date
                ? evt.timestamp.toISOString()
                : String(evt.timestamp),
              payload: evt.payload,
            })}\n\n`,
          );
        }
      } else {
        // Send latest run_complete as snapshot
        const snapshot = await bus.getLatestRunComplete(conversationId);
        if (snapshot) {
          res.write(
            `id: ${snapshot.event_id}\nevent: run_complete\ndata: ${JSON.stringify({
              eventId: snapshot.event_id,
              seq: snapshot.seq,
              runId: snapshot.run_id,
              conversationId: snapshot.conversation_id,
              type: "run_complete",
              timestamp: snapshot.timestamp instanceof Date
                ? snapshot.timestamp.toISOString()
                : String(snapshot.timestamp),
              payload: snapshot.payload,
            })}\n\n`,
          );
        }
      }
    }

    // Keep-alive heartbeat every 25 seconds
    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
      }
    }, 25_000);

    // Subscribe to live events
    const unsubscribe = bus.subscribe(conversationId, res, afterSeq);

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch (err) {
    logger.error({ err }, "SSE handler error");
    if (!res.headersSent) {
      res.status(500).json({ error: "INTERNAL", message: "SSE setup failed" });
    }
  }
});

// ---------------------------------------------------------------------------
// Conversation messages — GET /api/conversations/:conversationId/messages
// ---------------------------------------------------------------------------

router.get("/conversations/:conversationId/messages", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { conversationId } = req.params;
    const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
    const cursor = req.query["cursor"] as string | undefined;

    const hasAccess = await verifyConversationAccess(conversationId, userId);
    if (!hasAccess) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    // Decode opaque cursor (base64-encoded createdAt ISO string)
    let beforeTs: string | null = null;
    if (cursor) {
      try {
        beforeTs = Buffer.from(cursor, "base64").toString("utf8");
      } catch {
        res.status(400).json({ error: "Invalid cursor" });
        return;
      }
    }

    const rows = await db.execute<any>(
      beforeTs
        ? sql`
            SELECT id, run_id, conversation_id, role, content, created_at
            FROM conversation_messages
            WHERE conversation_id = ${conversationId}
              AND created_at < ${beforeTs}::timestamptz
            ORDER BY created_at ASC
            LIMIT ${limit + 1}
          `
        : sql`
            SELECT id, run_id, conversation_id, role, content, created_at
            FROM conversation_messages
            WHERE conversation_id = ${conversationId}
            ORDER BY created_at ASC
            LIMIT ${limit + 1}
          `,
    );

    const hasMore = rows.rows.length > limit;
    const messages: ConversationMessage[] = rows.rows
      .slice(0, limit)
      .map((r: any) => ({
        id: r.id,
        runId: r.run_id,
        conversationId: r.conversation_id,
        role: r.role,
        content: r.content,
        createdAt: r.created_at instanceof Date
          ? r.created_at.toISOString()
          : String(r.created_at),
      }));

    const lastMessage = messages[messages.length - 1];
    const nextCursor = hasMore && lastMessage
      ? Buffer.from(lastMessage.createdAt).toString("base64")
      : null;

    const totalResult = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count
      FROM conversation_messages
      WHERE conversation_id = ${conversationId}
    `);
    const total = Number(totalResult.rows[0]?.count ?? 0);

    const page: ConversationPage = { messages, nextCursor, total };
    res.json(page);
  } catch (err) {
    logger.error({ err }, "GET /conversations/:id/messages error");
    res.status(500).json({ error: "INTERNAL", message: "Failed to fetch messages" });
  }
});

// ---------------------------------------------------------------------------
// Helper: get active (non-terminal) run for a conversation
// ---------------------------------------------------------------------------

async function getActiveRun(conversationId: string): Promise<any | null> {
  const result = await db.execute<any>(sql`
    SELECT * FROM contract_runs
    WHERE conversation_id = ${conversationId}
      AND status NOT IN ('succeeded', 'failed', 'cancelled')
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// GET /api/runs?conversationId=&projectId=
// ---------------------------------------------------------------------------

router.get("/runs", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const conversationId = req.query["conversationId"] as string | undefined;
    const projectIdStr = req.query["projectId"] as string | undefined;

    if (!conversationId) {
      res.status(400).json({ error: "conversationId is required" });
      return;
    }

    const hasAccess = await verifyConversationAccess(conversationId, userId);
    if (!hasAccess) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    const rows = projectIdStr
      ? await db.execute<any>(sql`
          SELECT * FROM contract_runs
          WHERE conversation_id = ${conversationId}
            AND project_id = ${Number(projectIdStr)}
          ORDER BY created_at DESC
          LIMIT 100
        `)
      : await db.execute<any>(sql`
          SELECT * FROM contract_runs
          WHERE conversation_id = ${conversationId}
          ORDER BY created_at DESC
          LIMIT 100
        `);

    res.json(rows.rows.map(rowToRun));
  } catch (err) {
    logger.error({ err }, "GET /runs error");
    res.status(500).json({ error: "INTERNAL", message: "Failed to fetch runs" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/runs/:id
// ---------------------------------------------------------------------------

router.get("/runs/:id", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    const result = await db.execute<any>(sql`
      SELECT * FROM contract_runs WHERE id = ${id} LIMIT 1
    `);
    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    if (row.user_id !== userId) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    res.json(rowToRun(row));
  } catch (err) {
    logger.error({ err }, "GET /runs/:id error");
    res.status(500).json({ error: "INTERNAL", message: "Failed to fetch run" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/runs/:id/steps
// ---------------------------------------------------------------------------

router.get("/runs/:id/steps", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    if (!(await verifyRunAccess(id, userId))) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    const result = await db.execute<any>(sql`
      SELECT * FROM contract_run_steps
      WHERE run_id = ${id}
      ORDER BY seq ASC
    `);

    res.json(result.rows.map(rowToStep) as RunStep[]);
  } catch (err) {
    logger.error({ err }, "GET /runs/:id/steps error");
    res.status(500).json({ error: "INTERNAL", message: "Failed to fetch steps" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/runs/:id/changes
// ---------------------------------------------------------------------------

router.get("/runs/:id/changes", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    if (!(await verifyRunAccess(id, userId))) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    const result = await db.execute<any>(sql`
      SELECT id, run_id, file_path, verb, before_content, after_content, status
      FROM contract_run_changes
      WHERE run_id = ${id}
      ORDER BY seq ASC
    `);

    const changes: RunChange[] = result.rows.map((r: any) => ({
      stepId: r.id,
      filePath: r.file_path,
      verb: r.verb,
      beforeContent: r.before_content ?? null,
      afterContent: r.after_content ?? null,
      status: r.status ?? "pending",
    }));

    res.json(changes);
  } catch (err) {
    logger.error({ err }, "GET /runs/:id/changes error");
    res.status(500).json({ error: "INTERNAL", message: "Failed to fetch changes" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/runs/:id/terminal
// ---------------------------------------------------------------------------

router.get("/runs/:id/terminal", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    if (!(await verifyRunAccess(id, userId))) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    const page = Math.max(1, Number(req.query["page"] ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(req.query["pageSize"] ?? 50)));
    const offset = (page - 1) * pageSize;

    const [rowsResult, countResult] = await Promise.all([
      db.execute<any>(sql`
        SELECT step_id, stream, text, timestamp
        FROM contract_terminal_lines
        WHERE run_id = ${id}
        ORDER BY id ASC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      db.execute<{ count: string }>(sql`
        SELECT COUNT(*)::text AS count
        FROM contract_terminal_lines
        WHERE run_id = ${id}
      `),
    ]);

    const totalLines = Number(countResult.rows[0]?.count ?? 0);

    res.json({
      lines: rowsResult.rows.map((r: any) => ({
        stepId: r.step_id,
        stream: r.stream,
        text: r.text,
        timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
      })),
      totalLines,
      page,
      pageSize,
    });
  } catch (err) {
    logger.error({ err }, "GET /runs/:id/terminal error");
    res.status(500).json({ error: "INTERNAL", message: "Failed to fetch terminal output" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/runs/:id/outputs
// ---------------------------------------------------------------------------

router.get("/runs/:id/outputs", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    if (!(await verifyRunAccess(id, userId))) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    const result = await db.execute<any>(sql`
      SELECT id, run_id, step_id, name, type, mime_type, size_bytes,
             status, download_url, preview_url, created_at
      FROM contract_run_outputs
      WHERE run_id = ${id}
      ORDER BY created_at ASC
    `);

    const outputs: RunArtifact[] = result.rows.map((r: any) => ({
      id: r.id,
      runId: r.run_id,
      stepId: r.step_id,
      name: r.name,
      type: r.type,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes ?? null,
      status: r.status,
      downloadUrl: r.download_url ?? null,
      previewUrl: r.preview_url ?? null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));

    res.json(outputs);
  } catch (err) {
    logger.error({ err }, "GET /runs/:id/outputs error");
    res.status(500).json({ error: "INTERNAL", message: "Failed to fetch outputs" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/runs/:id/confirm — Gate 1
// ---------------------------------------------------------------------------

router.post("/runs/:id/confirm", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    const runResult = await db.execute<any>(sql`
      SELECT * FROM contract_runs WHERE id = ${id} LIMIT 1
    `);
    const run = runResult.rows[0];

    if (!run) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    if (run.user_id !== userId) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    const status = run.status as RunStatus;

    // Idempotent: already past awaiting_confirmation
    if (status === "executing" || isTerminal(status)) {
      res.json({ ok: true });
      return;
    }

    if (status !== "awaiting_confirmation") {
      res.status(409).json({
        error: "INVALID_STATE",
        current: status,
        required: ["awaiting_confirmation"],
      });
      return;
    }

    await db.execute(sql`
      UPDATE contract_runs
      SET status = 'executing', updated_at = now()
      WHERE id = ${id}
    `);

    await bus.publish(run.conversation_id, id, "run_status", { status: "executing" });

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "POST /runs/:id/confirm error");
    res.status(500).json({ error: "INTERNAL", message: "confirm failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/runs/:id/cancel
// ---------------------------------------------------------------------------

router.post("/runs/:id/cancel", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    const runResult = await db.execute<any>(sql`
      SELECT * FROM contract_runs WHERE id = ${id} LIMIT 1
    `);
    const run = runResult.rows[0];

    if (!run) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    if (run.user_id !== userId) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    const status = run.status as RunStatus;

    // Idempotent
    if (status === "cancelled" || isTerminal(status)) {
      res.json({ ok: true });
      return;
    }

    const partialWritesOccurred =
      status === "executing" || status === "testing" || status === "verifying";

    const errorPayload = {
      code: "CANCELLED_PARTIAL",
      message: partialWritesOccurred
        ? "Cancelled mid-execution — some files may have been partially updated."
        : "Cancelled before execution.",
      recoverable: false,
      stepId: null,
      partialWritesOccurred,
    };

    await db.execute(sql`
      UPDATE contract_runs
      SET status = 'cancelled',
          updated_at = now(),
          completed_at = now(),
          error = ${JSON.stringify(errorPayload)}::jsonb
      WHERE id = ${id}
    `);

    await bus.publish(run.conversation_id, id, "run_status", { status: "cancelled" });
    await bus.publish(
      run.conversation_id,
      id,
      "run_complete",
      { run: await fetchRun(id) },
    );

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "POST /runs/:id/cancel error");
    res.status(500).json({ error: "INTERNAL", message: "cancel failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/runs/:id/commit — trigger GitHub commit (Gate 2)
// ---------------------------------------------------------------------------

router.post("/runs/:id/commit", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    const runResult = await db.execute<any>(sql`
      SELECT * FROM contract_runs WHERE id = ${id} LIMIT 1
    `);
    const run = runResult.rows[0];

    if (!run) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    if (run.user_id !== userId) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    const status = run.status as RunStatus;
    if (status !== "succeeded") {
      res.status(409).json({
        error: "INVALID_STATE",
        current: status,
        required: ["succeeded"],
      });
      return;
    }

    const existingCommit: RunCommit | null = run.commit_state ?? null;

    // Idempotent: already committed
    if (existingCommit?.status === "succeeded" && existingCommit.sha) {
      res.json({ ok: true, sha: existingCommit.sha, url: existingCommit.url });
      return;
    }

    // Mark as running
    const runningCommit: RunCommit = {
      status: "running",
      sha: null,
      url: null,
      error: null,
      committedAt: null,
    };
    await db.execute(sql`
      UPDATE contract_runs
      SET commit_state = ${JSON.stringify(runningCommit)}::jsonb, updated_at = now()
      WHERE id = ${id}
    `);
    await bus.publish(run.conversation_id, id, "commit_update", { commit: runningCommit });

    // Phase 1: placeholder — real GitHub push wired in Phase 2+
    // For now, mark as failed with a clear reason so Lovable can see the event.
    const failedCommit: RunCommit = {
      status: "failed",
      sha: null,
      url: null,
      error: "GitHub push not yet wired — Phase 2 required.",
      committedAt: null,
    };
    await db.execute(sql`
      UPDATE contract_runs
      SET commit_state = ${JSON.stringify(failedCommit)}::jsonb, updated_at = now()
      WHERE id = ${id}
    `);
    await bus.publish(run.conversation_id, id, "commit_update", { commit: failedCommit });

    res.status(501).json({
      error: "NOT_IMPLEMENTED",
      message: "GitHub commit wiring is Phase 2. The commit_update SSE events were emitted.",
    });
  } catch (err) {
    logger.error({ err }, "POST /runs/:id/commit error");
    res.status(500).json({ error: "INTERNAL", message: "commit failed" });
  }
});

// ---------------------------------------------------------------------------
// Helper: fetch single run as Run shape
// ---------------------------------------------------------------------------

async function fetchRun(id: string): Promise<Run> {
  const result = await db.execute<any>(sql`
    SELECT * FROM contract_runs WHERE id = ${id} LIMIT 1
  `);
  const row = result.rows[0];
  if (!row) throw new Error(`run not found: ${id}`);
  return rowToRun(row);
}

// ---------------------------------------------------------------------------
// CREATE run — used by Phase 2 pipeline integration
// Exported so nexus.ts can call it once Phase 2 begins.
// ---------------------------------------------------------------------------

export interface CreateRunOptions {
  conversationId: string;
  userId: number;
  projectId: number | null;
  intent: "CHAT" | "DECIDE" | "BUILD";
  prompt: string;
  snapshotRef?: string;
}

export async function createRun(opts: CreateRunOptions): Promise<Run> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.execute(sql`
    INSERT INTO contract_runs
      (id, project_id, conversation_id, user_id, status, intent,
       prompt, step_count, steps_done, created_at, updated_at)
    VALUES
      (${id}, ${opts.projectId}, ${opts.conversationId}, ${opts.userId},
       'received', ${opts.intent}, ${opts.prompt}, 0, 0,
       now(), now())
  `);

  await bus.publish(opts.conversationId, id, "run_created", {
    status: "received",
    intent: opts.intent,
  });

  return fetchRun(id);
}

// ---------------------------------------------------------------------------
// UPDATE run status — exported for Phase 2 pipeline integration
//
// Uses pool.query with a dynamically-built SET clause to avoid the drizzle
// conditional-fragment composition issue.
// ---------------------------------------------------------------------------

export async function updateRunStatus(
  runId: string,
  conversationId: string,
  status: RunStatus,
  extra?: Partial<{
    response: string;
    summary: string;
    plan: unknown;
    error: unknown;
    verification: unknown;
    elapsedMs: number;
  }>,
): Promise<void> {
  const terminal = isTerminal(status);
  const params: unknown[] = [status, runId];
  const setClauses: string[] = ["status = $1", "updated_at = now()"];

  if (terminal) {
    setClauses.push("completed_at = now()");
  }
  if (extra?.response !== undefined) {
    params.push(extra.response);
    setClauses.push(`response = $${params.length}`);
  }
  if (extra?.summary !== undefined) {
    params.push(extra.summary);
    setClauses.push(`summary = $${params.length}`);
  }
  if (extra?.plan !== undefined) {
    params.push(JSON.stringify(extra.plan));
    setClauses.push(`plan = $${params.length}::jsonb`);
  }
  if (extra?.error !== undefined) {
    params.push(JSON.stringify(extra.error));
    setClauses.push(`error = $${params.length}::jsonb`);
  }
  if (extra?.verification !== undefined) {
    params.push(JSON.stringify(extra.verification));
    setClauses.push(`verification = $${params.length}::jsonb`);
  }
  if (extra?.elapsedMs !== undefined) {
    params.push(extra.elapsedMs);
    setClauses.push(`elapsed_ms = $${params.length}`);
  }

  await pool.query(
    `UPDATE contract_runs SET ${setClauses.join(", ")} WHERE id = $2`,
    params,
  );

  await bus.publish(conversationId, runId, "run_status", { status });

  if (terminal) {
    const run = await fetchRun(runId);
    await bus.publish(conversationId, runId, "run_complete", { run });
  }
}

export default router;
