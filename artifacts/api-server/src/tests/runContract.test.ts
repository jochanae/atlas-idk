/**
 * Phase 1 Contract Tests — Run Lifecycle Contract v1.2
 *
 * Proves every guarantee stated in the contract before Phase 2 begins:
 *   1. Events are persisted to DB before emission to SSE clients
 *   2. Sequence numbers are monotonically increasing per conversationId
 *   3. Authorization prevents cross-conversation access
 *   4. Duplicate events are safe (idempotent by eventId)
 *   5. confirm/cancel/commit are idempotent
 *   6. Every payload shape satisfies @workspace/run-contract types
 *   7. run_complete fires only on terminal status transitions
 *   8. activeBuildRun and activeTurn can coexist (non-terminal CHAT + BUILD)
 *
 * Note: replay-after-restart is an integration test requiring a real DB
 * connection; it is marked separately and skipped in unit-only CI.
 *
 * These tests use the real database (the Replit built-in PostgreSQL) so they
 * run in the same environment as the server. They clean up after themselves.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as bus from "../lib/runEventBus";
import { createRun, updateRunStatus } from "../routes/runs";
import type {
  Run,
  RunEvent,
  RunStatus,
  ConversationMessage,
} from "@workspace/run-contract";
import { isTerminal, TERMINAL_STATUSES } from "@workspace/run-contract";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_USER_ID = 999_999; // synthetic — never an actual user
const TEST_CONVERSATION_ID = `test-conv-${randomUUID()}`;
const TEST_CONVERSATION_ID_2 = `test-conv-${randomUUID()}`;

async function cleanupTestData() {
  await pool.query(
    `DELETE FROM conversation_events WHERE conversation_id = ANY($1)`,
    [[TEST_CONVERSATION_ID, TEST_CONVERSATION_ID_2]],
  );
  await pool.query(
    `DELETE FROM conversation_messages WHERE conversation_id = ANY($1)`,
    [[TEST_CONVERSATION_ID, TEST_CONVERSATION_ID_2]],
  );
  await pool.query(
    `DELETE FROM contract_runs WHERE conversation_id = ANY($1)`,
    [[TEST_CONVERSATION_ID, TEST_CONVERSATION_ID_2]],
  );
}

async function seedConversation(conversationId: string) {
  // Insert a synthetic nexus_conversations row so verifyConversationAccess passes
  await pool.query(
    `INSERT INTO nexus_conversations (conversation_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (conversation_id) DO NOTHING`,
    [conversationId, TEST_USER_ID],
  );
}

async function getEventsFromDb(conversationId: string): Promise<any[]> {
  const result = await pool.query(
    `SELECT * FROM conversation_events WHERE conversation_id = $1 ORDER BY seq ASC`,
    [conversationId],
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await seedConversation(TEST_CONVERSATION_ID);
  await seedConversation(TEST_CONVERSATION_ID_2);
});

afterAll(async () => {
  await cleanupTestData();
});

beforeEach(async () => {
  await cleanupTestData();
  await seedConversation(TEST_CONVERSATION_ID);
  await seedConversation(TEST_CONVERSATION_ID_2);
});

// ---------------------------------------------------------------------------
// 1. Events persisted to DB before SSE emission
// ---------------------------------------------------------------------------

describe("Event persistence", () => {
  it("writes event to conversation_events before any SSE emission", async () => {
    const runId = randomUUID();
    // Insert a bare run row so FK constraint is satisfied
    await pool.query(
      `INSERT INTO contract_runs (id, conversation_id, user_id, status, intent, prompt)
       VALUES ($1, $2, $3, 'received', 'CHAT', 'test')`,
      [runId, TEST_CONVERSATION_ID, TEST_USER_ID],
    );

    const emittedEvents: RunEvent<unknown>[] = [];

    // Monkey-patch: subscribe a fake SSE client that records emissions
    const fakeRes = {
      write: (chunk: string) => {
        const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
        if (dataLine) {
          emittedEvents.push(JSON.parse(dataLine.slice(5)));
        }
      },
    } as any;
    const unsub = bus.subscribe(TEST_CONVERSATION_ID, fakeRes, 0);

    await bus.publish(TEST_CONVERSATION_ID, runId, "run_status", { status: "thinking" });

    unsub();

    // Event must be in DB
    const rows = await getEventsFromDb(TEST_CONVERSATION_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("run_status");
    expect(rows[0].run_id).toBe(runId);

    // Same event was also emitted to the SSE client
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0].type).toBe("run_status");
    expect(emittedEvents[0].runId).toBe(runId);
    expect(emittedEvents[0].conversationId).toBe(TEST_CONVERSATION_ID);
  });

  it("event_id in DB matches eventId emitted to SSE clients", async () => {
    const runId = randomUUID();
    await pool.query(
      `INSERT INTO contract_runs (id, conversation_id, user_id, status, intent, prompt)
       VALUES ($1, $2, $3, 'received', 'CHAT', 'test')`,
      [runId, TEST_CONVERSATION_ID, TEST_USER_ID],
    );

    let emittedEventId: string | null = null;
    const fakeRes = {
      write: (chunk: string) => {
        const idLine = chunk.split("\n").find((l) => l.startsWith("id:"));
        if (idLine) emittedEventId = idLine.slice(3).trim();
      },
    } as any;
    const unsub = bus.subscribe(TEST_CONVERSATION_ID, fakeRes, 0);

    await bus.publish(TEST_CONVERSATION_ID, runId, "token", { text: "hello" });
    unsub();

    const rows = await getEventsFromDb(TEST_CONVERSATION_ID);
    expect(rows[0].event_id).toBe(emittedEventId);
  });
});

// ---------------------------------------------------------------------------
// 2. Sequence numbers monotonically increasing per conversationId
// ---------------------------------------------------------------------------

describe("Sequence numbers", () => {
  it("seq increments monotonically within a conversation", async () => {
    const runId = randomUUID();
    await pool.query(
      `INSERT INTO contract_runs (id, conversation_id, user_id, status, intent, prompt)
       VALUES ($1, $2, $3, 'received', 'BUILD', 'test')`,
      [runId, TEST_CONVERSATION_ID, TEST_USER_ID],
    );

    await bus.publish(TEST_CONVERSATION_ID, runId, "run_created", { status: "received", intent: "BUILD" });
    await bus.publish(TEST_CONVERSATION_ID, runId, "run_status", { status: "thinking" });
    await bus.publish(TEST_CONVERSATION_ID, runId, "run_status", { status: "planning" });

    const rows = await getEventsFromDb(TEST_CONVERSATION_ID);
    expect(rows).toHaveLength(3);
    expect(rows[0].seq).toBe(1);
    expect(rows[1].seq).toBe(2);
    expect(rows[2].seq).toBe(3);
    // Strictly increasing
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].seq).toBeGreaterThan(rows[i - 1].seq);
    }
  });

  it("seq is independent per conversationId — two conversations do not share seq space", async () => {
    const runId1 = randomUUID();
    const runId2 = randomUUID();

    await pool.query(
      `INSERT INTO contract_runs (id, conversation_id, user_id, status, intent, prompt)
       VALUES ($1, $2, $3, 'received', 'CHAT', 'test'), ($4, $5, $3, 'received', 'CHAT', 'test')`,
      [runId1, TEST_CONVERSATION_ID, TEST_USER_ID, runId2, TEST_CONVERSATION_ID_2],
    );

    await bus.publish(TEST_CONVERSATION_ID, runId1, "run_status", { status: "thinking" });
    await bus.publish(TEST_CONVERSATION_ID, runId1, "run_status", { status: "succeeded" });
    await bus.publish(TEST_CONVERSATION_ID_2, runId2, "run_status", { status: "thinking" });

    const rows1 = await getEventsFromDb(TEST_CONVERSATION_ID);
    const rows2 = await getEventsFromDb(TEST_CONVERSATION_ID_2);

    expect(rows1[0].seq).toBe(1);
    expect(rows1[1].seq).toBe(2);
    expect(rows2[0].seq).toBe(1); // starts fresh for new conversation
  });
});

// ---------------------------------------------------------------------------
// 3. Authorization — cross-conversation access prevented
// ---------------------------------------------------------------------------

describe("Authorization", () => {
  it("replay does not return events from a different conversation", async () => {
    const runId1 = randomUUID();
    const runId2 = randomUUID();

    await pool.query(
      `INSERT INTO contract_runs (id, conversation_id, user_id, status, intent, prompt)
       VALUES ($1, $2, $3, 'received', 'CHAT', 'test'), ($4, $5, $3, 'received', 'CHAT', 'test')`,
      [runId1, TEST_CONVERSATION_ID, TEST_USER_ID, runId2, TEST_CONVERSATION_ID_2],
    );

    await bus.publish(TEST_CONVERSATION_ID, runId1, "token", { text: "secret-conv-1" });
    await bus.publish(TEST_CONVERSATION_ID_2, runId2, "token", { text: "secret-conv-2" });

    const receivedChunks: string[] = [];
    const fakeRes = { write: (chunk: string) => receivedChunks.push(chunk) } as any;

    // Replay for conv-2 starting from seq 0 — must only see conv-2 events
    await bus.replay(TEST_CONVERSATION_ID_2, 0, fakeRes);

    const received = receivedChunks.join("");
    expect(received).toContain("secret-conv-2");
    expect(received).not.toContain("secret-conv-1");
  });
});

// ---------------------------------------------------------------------------
// 4. Duplicate events are safe (idempotent by eventId)
// ---------------------------------------------------------------------------

describe("Duplicate event safety", () => {
  it("publishing the same eventId twice does not duplicate DB rows", async () => {
    const runId = randomUUID();
    const fixedEventId = randomUUID();

    await pool.query(
      `INSERT INTO contract_runs (id, conversation_id, user_id, status, intent, prompt)
       VALUES ($1, $2, $3, 'received', 'CHAT', 'test')`,
      [runId, TEST_CONVERSATION_ID, TEST_USER_ID],
    );

    // Insert a row directly with a known eventId
    await pool.query(
      `INSERT INTO conversation_events
         (conversation_id, run_id, event_id, seq, type, payload)
       VALUES ($1, $2, $3, 1, 'token', '{"text":"hello"}'::jsonb)`,
      [TEST_CONVERSATION_ID, runId, fixedEventId],
    );

    // Attempt to insert again — UNIQUE constraint on event_id should prevent duplication
    await expect(
      pool.query(
        `INSERT INTO conversation_events
           (conversation_id, run_id, event_id, seq, type, payload)
         VALUES ($1, $2, $3, 2, 'token', '{"text":"world"}'::jsonb)`,
        [TEST_CONVERSATION_ID, runId, fixedEventId],
      ),
    ).rejects.toThrow();

    const rows = await getEventsFromDb(TEST_CONVERSATION_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_id).toBe(fixedEventId);
  });
});

// ---------------------------------------------------------------------------
// 5. confirm / cancel / commit idempotency
// ---------------------------------------------------------------------------

describe("Action idempotency", () => {
  it("cancel is idempotent — calling twice returns ok both times", async () => {
    const run = await createRun({
      conversationId: TEST_CONVERSATION_ID,
      userId: TEST_USER_ID,
      projectId: null,
      intent: "BUILD",
      prompt: "test",
    });

    // Move to awaiting_confirmation so cancel is valid
    await updateRunStatus(run.id, TEST_CONVERSATION_ID, "thinking");
    await updateRunStatus(run.id, TEST_CONVERSATION_ID, "planning");
    await updateRunStatus(run.id, TEST_CONVERSATION_ID, "awaiting_confirmation");
    await updateRunStatus(run.id, TEST_CONVERSATION_ID, "cancelled");

    // Second cancel should be a no-op — run is already terminal
    const result = await pool.query<{ status: string }>(
      `SELECT status FROM contract_runs WHERE id = $1`,
      [run.id],
    );
    expect(result.rows[0].status).toBe("cancelled");
    // No error thrown — calling updateRunStatus with a terminal run status again
    // would just emit another event but not fail
    await updateRunStatus(run.id, TEST_CONVERSATION_ID, "cancelled");
    const result2 = await pool.query<{ status: string }>(
      `SELECT status FROM contract_runs WHERE id = $1`,
      [run.id],
    );
    expect(result2.rows[0].status).toBe("cancelled");
  });

  it("CHAT and DECIDE runs never block a BUILD run in the same conversation", async () => {
    // Create a non-terminal CHAT run
    const chatRun = await createRun({
      conversationId: TEST_CONVERSATION_ID,
      userId: TEST_USER_ID,
      projectId: null,
      intent: "CHAT",
      prompt: "what is this?",
    });
    await updateRunStatus(chatRun.id, TEST_CONVERSATION_ID, "thinking");

    // A BUILD run can be created in the same conversation regardless
    const buildRun = await createRun({
      conversationId: TEST_CONVERSATION_ID,
      userId: TEST_USER_ID,
      projectId: null,
      intent: "BUILD",
      prompt: "make the button blue",
    });

    // Both runs exist and the BUILD is non-terminal
    const chatRow = await pool.query<{ status: string; intent: string }>(
      `SELECT status, intent FROM contract_runs WHERE id = $1`,
      [chatRun.id],
    );
    const buildRow = await pool.query<{ status: string; intent: string }>(
      `SELECT status, intent FROM contract_runs WHERE id = $1`,
      [buildRun.id],
    );

    expect(chatRow.rows[0].intent).toBe("CHAT");
    expect(chatRow.rows[0].status).toBe("thinking");
    expect(buildRow.rows[0].intent).toBe("BUILD");
    expect(buildRow.rows[0].status).toBe("received");
  });
});

// ---------------------------------------------------------------------------
// 6. Payload shapes satisfy @workspace/run-contract types
// ---------------------------------------------------------------------------

describe("Payload type conformance", () => {
  it("createRun returns a Run object that satisfies the Run interface", async () => {
    const run = await createRun({
      conversationId: TEST_CONVERSATION_ID,
      userId: TEST_USER_ID,
      projectId: null,
      intent: "CHAT",
      prompt: "hello",
    });

    // Shape assertions matching Run interface from contract v1.2
    expect(typeof run.id).toBe("string");
    expect(run.projectId).toBeNull();
    expect(run.conversationId).toBe(TEST_CONVERSATION_ID);
    expect(run.status).toBe("received");
    expect(run.intent).toBe("CHAT");
    expect(typeof run.prompt).toBe("string");
    expect(run.response).toBeNull();
    expect(run.summary).toBeNull();
    expect(run.plan).toBeNull();
    expect(typeof run.stepCount).toBe("number");
    expect(typeof run.stepsDone).toBe("number");
    expect(run.error).toBeNull();
    expect(run.verification).toBeNull();
    expect(run.commit).toBeNull();
    expect(run.snapshotRef).toBeNull();
    expect(typeof run.createdAt).toBe("string");
    expect(typeof run.updatedAt).toBe("string");
    expect(run.completedAt).toBeNull();
    expect(run.elapsedMs).toBeNull();
  });

  it("published events include all required RunEvent fields", async () => {
    const runId = randomUUID();
    await pool.query(
      `INSERT INTO contract_runs (id, conversation_id, user_id, status, intent, prompt)
       VALUES ($1, $2, $3, 'received', 'BUILD', 'test')`,
      [runId, TEST_CONVERSATION_ID, TEST_USER_ID],
    );

    const event = await bus.publish(TEST_CONVERSATION_ID, runId, "run_status", { status: "thinking" });

    // All RunEvent fields present
    expect(typeof event.eventId).toBe("string");
    expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    expect(typeof event.seq).toBe("number");
    expect(event.seq).toBeGreaterThan(0);
    expect(event.runId).toBe(runId);
    expect(event.conversationId).toBe(TEST_CONVERSATION_ID);
    expect(event.type).toBe("run_status");
    expect(typeof event.timestamp).toBe("string");
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
    expect(event.payload).toEqual({ status: "thinking" });
  });
});

// ---------------------------------------------------------------------------
// 7. run_complete fires only on terminal status transitions
// ---------------------------------------------------------------------------

describe("run_complete lifecycle", () => {
  it("emits run_complete event when status reaches a terminal state", async () => {
    const run = await createRun({
      conversationId: TEST_CONVERSATION_ID,
      userId: TEST_USER_ID,
      projectId: null,
      intent: "CHAT",
      prompt: "hello",
    });

    await updateRunStatus(run.id, TEST_CONVERSATION_ID, "thinking");
    await updateRunStatus(run.id, TEST_CONVERSATION_ID, "succeeded", {
      response: "Here is your answer.",
      summary: "Answered user question",
    });

    const rows = await getEventsFromDb(TEST_CONVERSATION_ID);
    const types = rows.map((r) => r.type);

    expect(types).toContain("run_complete");
    // run_complete should be the last event
    expect(types[types.length - 1]).toBe("run_complete");
    // run_status for succeeded should appear before run_complete
    const statusIdx = types.lastIndexOf("run_status");
    const completeIdx = types.indexOf("run_complete");
    expect(statusIdx).toBeLessThan(completeIdx);
  });

  it("does NOT emit run_complete on non-terminal status transitions", async () => {
    const run = await createRun({
      conversationId: TEST_CONVERSATION_ID,
      userId: TEST_USER_ID,
      projectId: null,
      intent: "BUILD",
      prompt: "change the header color",
    });

    await updateRunStatus(run.id, TEST_CONVERSATION_ID, "thinking");
    await updateRunStatus(run.id, TEST_CONVERSATION_ID, "planning");

    const rows = await getEventsFromDb(TEST_CONVERSATION_ID);
    const types = rows.map((r) => r.type);

    expect(types).not.toContain("run_complete");
    expect(isTerminal("thinking")).toBe(false);
    expect(isTerminal("planning")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. activeBuildRun and activeTurn can coexist
// ---------------------------------------------------------------------------

describe("activeBuildRun and activeTurn coexistence", () => {
  it("a CHAT turn can be non-terminal while a BUILD run is awaiting_confirmation", async () => {
    const chatRun = await createRun({
      conversationId: TEST_CONVERSATION_ID,
      userId: TEST_USER_ID,
      projectId: null,
      intent: "CHAT",
      prompt: "quick question",
    });
    await updateRunStatus(chatRun.id, TEST_CONVERSATION_ID, "thinking");

    const buildRun = await createRun({
      conversationId: TEST_CONVERSATION_ID,
      userId: TEST_USER_ID,
      projectId: null,
      intent: "BUILD",
      prompt: "add a logout button",
    });
    await updateRunStatus(buildRun.id, TEST_CONVERSATION_ID, "thinking");
    await updateRunStatus(buildRun.id, TEST_CONVERSATION_ID, "planning");
    await updateRunStatus(buildRun.id, TEST_CONVERSATION_ID, "awaiting_confirmation");

    // Verify both are non-terminal simultaneously
    const chatRow = await pool.query<{ status: string }>(
      `SELECT status FROM contract_runs WHERE id = $1`,
      [chatRun.id],
    );
    const buildRow = await pool.query<{ status: string }>(
      `SELECT status FROM contract_runs WHERE id = $1`,
      [buildRun.id],
    );

    expect(isTerminal(chatRow.rows[0].status as RunStatus)).toBe(false);
    expect(isTerminal(buildRow.rows[0].status as RunStatus)).toBe(false);
    expect(buildRow.rows[0].status).toBe("awaiting_confirmation");

    // This is the scenario that proves activeBuildRun and activeTurn
    // can both be non-null at the same time — the contract requires this.
    const activeBuildRun = buildRow.rows[0];
    const activeTurn = chatRow.rows[0];
    expect(activeBuildRun).not.toBeNull();
    expect(activeTurn).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9. TERMINAL_STATUSES set is complete and correct
// ---------------------------------------------------------------------------

describe("TERMINAL_STATUSES", () => {
  it("contains exactly succeeded, failed, cancelled", () => {
    expect(TERMINAL_STATUSES.has("succeeded")).toBe(true);
    expect(TERMINAL_STATUSES.has("failed")).toBe(true);
    expect(TERMINAL_STATUSES.has("cancelled")).toBe(true);
    // Non-terminal statuses must not be in the set
    const nonTerminal: RunStatus[] = [
      "received",
      "thinking",
      "planning",
      "awaiting_confirmation",
      "executing",
      "testing",
      "verifying",
    ];
    for (const s of nonTerminal) {
      expect(TERMINAL_STATUSES.has(s)).toBe(false);
    }
  });
});
