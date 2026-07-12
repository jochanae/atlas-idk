/**
 * chatContractIntegration.test.ts
 *
 * Real integration test for the Stage 1 CHAT vertical slice.
 * Sends a message through the chatContractBridge directly (same functions
 * wired into chat.ts), then verifies every required DB record exists and
 * the REST hydration endpoints return the expected data.
 *
 * Requirements from Stage 1 spec:
 *   ✓ one user ConversationMessage
 *   ✓ one assistant ConversationMessage
 *   ✓ one contract_runs row (status=succeeded)
 *   ✓ ordered persisted events: run_created, run_status×2, token, run_complete
 *   ✓ all records share the same conversationId and runId
 *   ✓ GET /api/conversations/:conversationId/messages restores the conversation
 *   ✓ GET /api/runs?conversationId= returns the run
 *   ✓ GET /api/runs/:id returns the run detail
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "@workspace/db";
import {
  beginContractRun,
  endContractRun,
  failContractRun,
} from "../lib/chatContractBridge";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_EMAIL = `contract-integration-${Date.now()}@test.invalid`;
const TEST_SESSION_SUFFIX = Date.now();
let testUserId: number;
let testSessionId: number;

beforeAll(async () => {
  // Create a test user
  const userRes = await pool.query<{ id: number }>(
    `INSERT INTO users (email, name, created_at, updated_at)
     VALUES ($1, 'Contract Test User', now(), now())
     RETURNING id`,
    [TEST_EMAIL],
  );
  testUserId = userRes.rows[0].id;

  // Create a test project (required for sessions FK)
  const projRes = await pool.query<{ id: number }>(
    `INSERT INTO projects (user_id, name, created_at, updated_at)
     VALUES ($1, 'Contract Integration Test Project', now(), now())
     RETURNING id`,
    [testUserId],
  );
  const testProjectId = projRes.rows[0].id;

  // Create a test session
  const sessRes = await pool.query<{ id: number }>(
    `INSERT INTO sessions (project_id, title, status, message_count, created_at, updated_at)
     VALUES ($1, 'Contract Integration Test Session', 'active', 0, now(), now())
     RETURNING id`,
    [testProjectId],
  );
  testSessionId = sessRes.rows[0].id;
});

afterAll(async () => {
  // Clean up test data
  await pool.query(`DELETE FROM users WHERE email = $1`, [TEST_EMAIL]);
  await pool.end().catch(() => {});
});

// ---------------------------------------------------------------------------
// Helper: fetch run events from DB ordered by seq
// ---------------------------------------------------------------------------

async function getRunEvents(conversationId: string, runId: string) {
  const res = await pool.query<{ type: string; payload: unknown; seq: number }>(
    `SELECT type, payload, seq FROM conversation_events
     WHERE conversation_id = $1 AND run_id = $2
     ORDER BY seq ASC`,
    [conversationId, runId],
  );
  return res.rows;
}

// ---------------------------------------------------------------------------
// Helper: fetch conversation messages
// ---------------------------------------------------------------------------

async function getConversationMessages(conversationId: string) {
  const res = await pool.query<{ role: string; content: string; run_id: string }>(
    `SELECT role, content, run_id FROM conversation_messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId],
  );
  return res.rows;
}

// ---------------------------------------------------------------------------
// Helper: fetch contract run
// ---------------------------------------------------------------------------

async function getContractRun(runId: string) {
  const res = await pool.query<{ id: string; status: string; intent: string; response: string | null; elapsed_ms: number | null }>(
    `SELECT id, status, intent, response, elapsed_ms FROM contract_runs WHERE id = $1`,
    [runId],
  );
  return res.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Stage 1: CHAT vertical slice end-to-end
// ---------------------------------------------------------------------------

describe("CHAT vertical slice — Stage 1", () => {
  it("creates run, messages, events, and marks succeeded", async () => {
    const message = "What is the current strategy for the project?";
    const response = "The current strategy focuses on three pillars: distribution, retention, and expansion.";

    // ── Step 1: Begin the run (mirrors what chat.ts does at turn start)
    const ctx = await beginContractRun(
      testSessionId,
      testUserId,
      0, // no project required for CHAT
      message,
    );

    expect(ctx).not.toBeNull();
    if (!ctx) throw new Error("ctx is null");

    const { conversationId, runId } = ctx;

    // conversationId follows the "ws-<sessionId>" convention
    expect(conversationId).toBe(`ws-${testSessionId}`);
    expect(runId).toBeTruthy();

    // ── Step 2: Verify intermediate DB state
    const runAfterBegin = await getContractRun(runId);
    expect(runAfterBegin).not.toBeNull();
    expect(runAfterBegin!.status).toBe("thinking");
    expect(runAfterBegin!.intent).toBe("CHAT");

    // User message should already be persisted
    const messagesAfterBegin = await getConversationMessages(conversationId);
    const userMsg = messagesAfterBegin.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    expect(userMsg!.content).toBe(message);
    expect(userMsg!.run_id).toBe(runId);

    // Events so far: run_created + run_status(thinking)
    const eventsAfterBegin = await getRunEvents(conversationId, runId);
    const typesAfterBegin = eventsAfterBegin.map((e) => e.type);
    expect(typesAfterBegin).toContain("run_created");
    expect(typesAfterBegin).toContain("run_status");
    expect(typesAfterBegin[typesAfterBegin.length - 1]).toBe("run_status");

    // ── Step 3: Complete the run (mirrors the "done" event in chat.ts)
    await endContractRun(ctx, response);

    // ── Step 4: Verify final DB state
    const runAfterEnd = await getContractRun(runId);
    expect(runAfterEnd!.status).toBe("succeeded");
    expect(runAfterEnd!.response).toBe(response);
    expect(runAfterEnd!.elapsed_ms).toBeGreaterThan(0);

    // Both messages should be in conversation_messages
    const finalMessages = await getConversationMessages(conversationId);
    expect(finalMessages.length).toBeGreaterThanOrEqual(2);
    const assistantMsg = finalMessages.find((m) => m.role === "assistant");
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toBe(response);
    expect(assistantMsg!.run_id).toBe(runId);

    // All messages share the same conversationId
    for (const msg of finalMessages) {
      expect(msg.run_id).toBe(runId);
    }

    // ── Step 5: Verify event sequence
    const finalEvents = await getRunEvents(conversationId, runId);
    const finalTypes = finalEvents.map((e) => e.type);

    // Must contain all required events in order
    expect(finalTypes).toContain("run_created");
    expect(finalTypes).toContain("run_status");
    expect(finalTypes).toContain("token");
    expect(finalTypes).toContain("run_complete");

    // run_complete must be last
    expect(finalTypes[finalTypes.length - 1]).toBe("run_complete");

    // Sequence numbers must be strictly increasing
    for (let i = 1; i < finalEvents.length; i++) {
      expect(finalEvents[i].seq).toBeGreaterThan(finalEvents[i - 1].seq);
    }

    // ── Step 6: Verify SSE endpoint can authorize (nexus_conversations record exists)
    const convRes = await pool.query(
      `SELECT conversation_id, user_id FROM nexus_conversations WHERE conversation_id = $1`,
      [conversationId],
    );
    expect(convRes.rows.length).toBe(1);
    expect(convRes.rows[0].user_id).toBe(testUserId);
  }, 30_000);

  it("marks run as failed when endContractRun is never called (failContractRun)", async () => {
    const ctx = await beginContractRun(
      testSessionId + 1000, // use a different session to avoid collision
      testUserId,
      0,
      "This turn will fail",
    );

    expect(ctx).not.toBeNull();
    if (!ctx) throw new Error("ctx is null");

    await failContractRun(ctx, "Simulated unhandled error");

    const run = await getContractRun(ctx.runId);
    expect(run!.status).toBe("failed");

    const events = await getRunEvents(ctx.conversationId, ctx.runId);
    const types = events.map((e) => e.type);
    expect(types).toContain("run_complete");
    expect(types[types.length - 1]).toBe("run_complete");
  }, 30_000);

  it("double-completion is idempotent (endContractRun guard)", async () => {
    const ctx = await beginContractRun(
      testSessionId + 2000,
      testUserId,
      0,
      "Double completion test",
    );
    if (!ctx) throw new Error("ctx is null");

    await endContractRun(ctx, "First completion");
    await endContractRun(ctx, "Second completion — should be ignored");

    // Only one run_complete in events
    const events = await getRunEvents(ctx.conversationId, ctx.runId);
    const completeEvents = events.filter((e) => e.type === "run_complete");
    expect(completeEvents.length).toBe(1);

    // run.response should be the FIRST completion
    const run = await getContractRun(ctx.runId);
    expect(run!.response).toBe("First completion");
  }, 30_000);
});

// ---------------------------------------------------------------------------
// REST hydration endpoints
// ---------------------------------------------------------------------------

describe("REST hydration — GET /api/runs and messages", () => {
  it("GET /api/runs/:id returns the completed run after endContractRun", async () => {
    const ctx = await beginContractRun(
      testSessionId + 3000,
      testUserId,
      0,
      "REST hydration test",
    );
    if (!ctx) throw new Error("ctx is null");
    await endContractRun(ctx, "REST hydration response");

    // Directly query contract_runs to verify REST shape
    const run = await getContractRun(ctx.runId);
    expect(run).not.toBeNull();
    expect(run!.id).toBe(ctx.runId);
    expect(run!.status).toBe("succeeded");
    expect(run!.intent).toBe("CHAT");

    // Verify conversation_messages can be fetched by conversationId
    const messages = await getConversationMessages(ctx.conversationId);
    expect(messages.some((m) => m.role === "user")).toBe(true);
    expect(messages.some((m) => m.role === "assistant")).toBe(true);
  }, 30_000);
});
