/**
 * Turn-level idempotency across the full message/run lifecycle (T4).
 *
 * Phases: accepted → user_persisted → attachments_linked → run_started
 *       → assistant_persisted → done
 *
 * Store is injectable (Map for tests; production may use DB/memory).
 */

export type TurnIdempotencyPhase =
  | "accepted"
  | "user_persisted"
  | "attachments_linked"
  | "run_started"
  | "assistant_persisted"
  | "done";

export type TurnIdempotencyRecord = {
  userId: number;
  clientMessageId: string;
  conversationId: string | null;
  phase: TurnIdempotencyPhase;
  userMessageId?: number;
  assistantMessageId?: number;
  runId?: string;
  createdAt: number;
  updatedAt: number;
};

export type TurnIdempotencyKey = {
  userId: number;
  clientMessageId: string;
};

export type TurnIdempotencyStore = Map<string, TurnIdempotencyRecord>;

function storageKey(key: TurnIdempotencyKey): string {
  return `${key.userId}:${key.clientMessageId}`;
}

export function beginTurnIdempotency(
  store: TurnIdempotencyStore,
  input: TurnIdempotencyKey & {
    conversationId: string | null;
    phase?: TurnIdempotencyPhase;
  },
): { created: boolean; record: TurnIdempotencyRecord } {
  const k = storageKey(input);
  const existing = store.get(k);
  if (existing) {
    return { created: false, record: existing };
  }
  const now = Date.now();
  const record: TurnIdempotencyRecord = {
    userId: input.userId,
    clientMessageId: input.clientMessageId,
    conversationId: input.conversationId,
    phase: input.phase ?? "accepted",
    createdAt: now,
    updatedAt: now,
  };
  store.set(k, record);
  return { created: true, record };
}

export function completeTurnIdempotency(
  store: TurnIdempotencyStore,
  key: TurnIdempotencyKey,
  patch: Partial<
    Pick<
      TurnIdempotencyRecord,
      "phase" | "userMessageId" | "assistantMessageId" | "runId" | "conversationId"
    >
  >,
): TurnIdempotencyRecord | null {
  const k = storageKey(key);
  const existing = store.get(k);
  if (!existing) return null;
  const next: TurnIdempotencyRecord = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  };
  store.set(k, next);
  return next;
}

export function findTurnIdempotency(
  store: TurnIdempotencyStore,
  key: TurnIdempotencyKey,
): TurnIdempotencyRecord | null {
  return store.get(storageKey(key)) ?? null;
}

/** Process-local store for the canonical nexus pipeline. */
export const processTurnIdempotencyStore: TurnIdempotencyStore = new Map();
