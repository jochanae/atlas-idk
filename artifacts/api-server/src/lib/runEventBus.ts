/**
 * RunEventBus — Phase 1 SSE infrastructure
 *
 * Owns two responsibilities:
 *   1. Persisting every event to conversation_events (DB is the event store).
 *   2. Fanning out live events to all SSE subscribers for a conversation.
 *
 * Design constraints from the contract (v1.2):
 *   - Events are written to DB BEFORE being emitted to SSE clients.
 *   - In-memory-only buses are not acceptable (must survive server restart).
 *   - seq is monotonically increasing per conversationId.
 *   - eventId is a UUID, unique per event.
 *   - replay() uses Last-Event-ID seq to return missed events from DB.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { logger } from "./logger";
import type {
  RunEvent,
  RunEventType,
} from "@workspace/run-contract";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SSEClient {
  res: Response;
  conversationId: string;
  lastSeq: number;
}

interface PersistedEvent {
  id: number;
  conversation_id: string;
  run_id: string;
  event_id: string;
  seq: number;
  type: string;
  payload: unknown;
  timestamp: Date;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// In-process subscriber registry
// ---------------------------------------------------------------------------

const subscribers = new Map<string, Set<SSEClient>>();

function getClients(conversationId: string): Set<SSEClient> {
  if (!subscribers.has(conversationId)) {
    subscribers.set(conversationId, new Set());
  }
  return subscribers.get(conversationId)!;
}

// ---------------------------------------------------------------------------
// Sequence counter — DB-backed, fetched per publish call
// ---------------------------------------------------------------------------

async function nextSeq(conversationId: string): Promise<number> {
  const result = await db.execute<{ next_seq: string }>(sql`
    SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
    FROM conversation_events
    WHERE conversation_id = ${conversationId}
  `);
  return Number(result.rows[0]?.next_seq ?? 1);
}

// ---------------------------------------------------------------------------
// Core: persist then emit
// ---------------------------------------------------------------------------

export async function publish<T>(
  conversationId: string,
  runId: string,
  type: RunEventType,
  payload: T,
): Promise<RunEvent<T>> {
  const eventId = randomUUID();
  const seq = await nextSeq(conversationId);
  const timestamp = new Date().toISOString();

  // 1. Persist to DB first — this is the durable event store.
  await db.execute(sql`
    INSERT INTO conversation_events
      (conversation_id, run_id, event_id, seq, type, payload, timestamp)
    VALUES
      (${conversationId}, ${runId}, ${eventId}, ${seq}, ${type},
       ${JSON.stringify(payload)}::jsonb, ${timestamp}::timestamptz)
  `);

  const event: RunEvent<T> = {
    eventId,
    seq,
    runId,
    conversationId,
    type,
    timestamp,
    payload,
  };

  // 2. Fan out to live subscribers.
  const clients = getClients(conversationId);
  const wire = formatSSE(event);
  for (const client of clients) {
    try {
      client.res.write(wire);
      client.lastSeq = seq;
    } catch (err) {
      logger.warn({ err, conversationId }, "runEventBus: client write failed — removing");
      clients.delete(client);
    }
  }

  return event;
}

// ---------------------------------------------------------------------------
// SSE formatting
// ---------------------------------------------------------------------------

function formatSSE(event: RunEvent<unknown>): string {
  return (
    `id: ${event.eventId}\n` +
    `event: ${event.type}\n` +
    `data: ${JSON.stringify(event)}\n\n`
  );
}

// ---------------------------------------------------------------------------
// Subscribe a new SSE client
// ---------------------------------------------------------------------------

export function subscribe(
  conversationId: string,
  res: Response,
  lastSeq: number = 0,
): () => void {
  const client: SSEClient = { res, conversationId, lastSeq };
  getClients(conversationId).add(client);

  return () => {
    getClients(conversationId).delete(client);
  };
}

// ---------------------------------------------------------------------------
// Replay events missed since lastSeq
// ---------------------------------------------------------------------------

export async function replay(
  conversationId: string,
  afterSeq: number,
  res: Response,
): Promise<number> {
  const rows = await db.execute<PersistedEvent>(sql`
    SELECT id, conversation_id, run_id, event_id, seq, type, payload, timestamp
    FROM conversation_events
    WHERE conversation_id = ${conversationId}
      AND seq > ${afterSeq}
    ORDER BY seq ASC
    LIMIT 500
  `);

  let lastSent = afterSeq;
  for (const row of rows.rows) {
    const event: RunEvent<unknown> = {
      eventId: row.event_id,
      seq: row.seq,
      runId: row.run_id,
      conversationId: row.conversation_id,
      type: row.type as RunEventType,
      timestamp: row.timestamp instanceof Date
        ? row.timestamp.toISOString()
        : String(row.timestamp),
      payload: row.payload,
    };
    res.write(formatSSE(event));
    lastSent = row.seq;
  }
  return lastSent;
}

// ---------------------------------------------------------------------------
// Get most recent run_complete snapshot for hydration
// ---------------------------------------------------------------------------

export async function getLatestRunComplete(
  conversationId: string,
): Promise<PersistedEvent | null> {
  const result = await db.execute<PersistedEvent>(sql`
    SELECT id, conversation_id, run_id, event_id, seq, type, payload, timestamp
    FROM conversation_events
    WHERE conversation_id = ${conversationId}
      AND type = 'run_complete'
    ORDER BY seq DESC
    LIMIT 1
  `);
  return result.rows[0] ?? null;
}

export async function getActiveRunEvents(
  conversationId: string,
  runId: string,
): Promise<PersistedEvent[]> {
  const result = await db.execute<PersistedEvent>(sql`
    SELECT id, conversation_id, run_id, event_id, seq, type, payload, timestamp
    FROM conversation_events
    WHERE conversation_id = ${conversationId}
      AND run_id = ${runId}
    ORDER BY seq ASC
  `);
  return result.rows;
}
