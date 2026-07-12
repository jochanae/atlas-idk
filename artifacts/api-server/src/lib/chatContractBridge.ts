/**
 * chatContractBridge.ts — Phase 2, Stage 1: CHAT vertical slice
 *
 * Connects the live chat.ts pipeline to the V1.2 Run Lifecycle Contract.
 * All functions are best-effort: they log errors but never throw, so a
 * contract-layer failure never breaks the existing chat flow.
 *
 * Integration points in chat.ts POST /api/chat:
 *   1. beginContractRun()             — right after userId/sessionId/projectId resolve
 *   2. patchResForContractCompletion() — immediately after (1), same spot
 *      The patch intercepts the "done" SSE event and auto-fires endContractRun.
 *   3. failContractRun()               — in the outer catch block
 *
 * Conversation ID mapping:
 *   chat.ts uses integer sessionId as its primary key.
 *   V1.2 contract uses a stable string conversationId.
 *   We map:  conversationId = "ws-" + sessionId
 *   This is already the pattern used by thinking_receipts in chat.ts (line ~3365).
 */

import { pool } from "@workspace/db";
import { createRun, updateRunStatus } from "../routes/runs";
import * as bus from "./runEventBus";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ContractRunCtx {
  conversationId: string;
  runId: string;
  startedAt: number;
  /** Guards against double-completion when multiple done events fire */
  _done: boolean;
}

// ---------------------------------------------------------------------------
// 1. Ensure nexus_conversations record (required for SSE auth gate)
// ---------------------------------------------------------------------------

async function ensureConversationRecord(
  sessionId: number,
  userId: number,
): Promise<string> {
  const conversationId = `ws-${sessionId}`;
  await pool.query(
    `INSERT INTO nexus_conversations
       (conversation_id, user_id, created_at, updated_at)
     VALUES ($1, $2, now(), now())
     ON CONFLICT (conversation_id) DO NOTHING`,
    [conversationId, userId],
  );
  return conversationId;
}

// ---------------------------------------------------------------------------
// 2. Begin a CHAT run — call at handler start, after auth resolves
// ---------------------------------------------------------------------------

export async function beginContractRun(
  sessionId: number,
  userId: number,
  projectId: number,
  message: string,
): Promise<ContractRunCtx | null> {
  try {
    const conversationId = await ensureConversationRecord(sessionId, userId);

    const run = await createRun({
      conversationId,
      userId,
      projectId: projectId > 0 ? projectId : null,
      intent: "CHAT",
      prompt: message,
    });

    // Persist user ConversationMessage
    await pool.query(
      `INSERT INTO conversation_messages
         (id, run_id, conversation_id, role, content, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'user', $3, now())`,
      [run.id, conversationId, message],
    );

    // Transition: received → thinking
    await updateRunStatus(run.id, conversationId, "thinking");

    logger.info(
      { runId: run.id, conversationId, sessionId },
      "chatContractBridge: run created (CHAT)",
    );

    return {
      conversationId,
      runId: run.id,
      startedAt: Date.now(),
      _done: false,
    };
  } catch (err) {
    logger.error({ err, sessionId }, "chatContractBridge: beginContractRun failed (non-fatal)");
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3. Complete a CHAT run — persists bulk token + assistant message + succeeded
// ---------------------------------------------------------------------------

export async function endContractRun(
  ctx: ContractRunCtx,
  response: string,
): Promise<void> {
  if (ctx._done) return;
  ctx._done = true;

  try {
    const elapsedMs = Date.now() - ctx.startedAt;

    // Persist the full response as one bulk token event (not per-token inserts)
    await bus.publish(ctx.conversationId, ctx.runId, "token", {
      text: response,
      bulk: true,
    });

    // Persist assistant ConversationMessage
    await pool.query(
      `INSERT INTO conversation_messages
         (id, run_id, conversation_id, role, content, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'assistant', $3, now())`,
      [ctx.runId, ctx.conversationId, response],
    );

    // Transition: thinking → succeeded  (also emits run_complete)
    await updateRunStatus(ctx.runId, ctx.conversationId, "succeeded", {
      response,
      elapsedMs,
    });

    logger.info(
      { runId: ctx.runId, conversationId: ctx.conversationId, elapsedMs },
      "chatContractBridge: run succeeded (CHAT)",
    );
  } catch (err) {
    logger.error(
      { err, runId: ctx.runId },
      "chatContractBridge: endContractRun failed (non-fatal)",
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Fail a CHAT run — call from the outer catch block
// ---------------------------------------------------------------------------

export async function failContractRun(
  ctx: ContractRunCtx | null,
  errorMsg: string,
): Promise<void> {
  if (!ctx || ctx._done) return;
  ctx._done = true;

  try {
    await updateRunStatus(ctx.runId, ctx.conversationId, "failed", {
      error: {
        code: "CHAT_ERROR",
        message: errorMsg,
        recoverable: false,
        stepId: null,
        partialWritesOccurred: false,
      },
    });

    logger.warn(
      { runId: ctx.runId, conversationId: ctx.conversationId, errorMsg },
      "chatContractBridge: run failed (CHAT)",
    );
  } catch (err) {
    logger.error(
      { err, runId: ctx.runId },
      "chatContractBridge: failContractRun failed",
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Patch res.write to auto-detect "done" and call endContractRun
//
// This is the zero-surgery integration strategy: rather than modifying each
// of the ~15 branches in chat.ts that emit a "done" event, we wrap res.write
// once and let it fire automatically.  The patch never interrupts the write
// path — errors are silently swallowed.
// ---------------------------------------------------------------------------

export function patchResForContractCompletion(
  res: { write: (...args: unknown[]) => unknown },
  ctx: ContractRunCtx,
): void {
  const original = (res.write as Function).bind(res);

  (res as Record<string, unknown>).write = function contractPatchedWrite(
    chunk: unknown,
    ...rest: unknown[]
  ): unknown {
    try {
      const text =
        typeof chunk === "string"
          ? chunk
          : Buffer.isBuffer(chunk)
            ? chunk.toString("utf8")
            : null;

      if (text) {
        for (const line of text.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6)) as Record<string, unknown>;
              if (
                parsed["type"] === "done" &&
                typeof parsed["content"] === "string" &&
                (parsed["content"] as string).length > 0
              ) {
                endContractRun(ctx, parsed["content"] as string).catch(() => {});
              }
            } catch {
              /* not JSON — ignore */
            }
          }
        }
      }
    } catch {
      /* never interrupt the write path */
    }

    return original(chunk, ...rest);
  };
}
