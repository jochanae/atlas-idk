/**
 * SSE subscription for /api/sse/conversation/:conversationId with the
 * reconnection semantics from RUN_LIFECYCLE_CONTRACT §7:
 *
 *   - Native EventSource sends Last-Event-ID automatically on reconnect,
 *     but only when the browser reconnects. We wrap it with an explicit
 *     retry loop so we can implement the specified backoff and surface
 *     connection state to the UI.
 *   - Backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s.
 *   - Idempotency: events carry an eventId; consumers must dedupe.
 *   - REST is the recovery source of truth — this module never mutates
 *     application state on its own; it only forwards events and status.
 */
import type { TypedRunEvent } from "@contract";
import { apiUrl } from "./api";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface SseHandle {
  close(): void;
}

export interface SseOptions {
  conversationId: string;
  onEvent: (evt: TypedRunEvent) => void;
  onStatus: (status: ConnectionStatus) => void;
  /** Never emit an event with seq <= this on reconnect. Optional dedupe hint. */
  getLastSeenSeq?: () => number;
}

const BACKOFF_SEQUENCE_MS = [1000, 2000, 4000, 8000, 16000, 30000];

export function openConversationStream(opts: SseOptions): SseHandle {
  const { conversationId, onEvent, onStatus, getLastSeenSeq } = opts;
  let es: EventSource | null = null;
  let closed = false;
  let attempt = 0;
  let backoffTimer: ReturnType<typeof setTimeout> | null = null;

  const url = apiUrl(`/api/sse/conversation/${encodeURIComponent(conversationId)}`);

  const connect = () => {
    if (closed) return;
    onStatus(attempt === 0 ? "connecting" : "reconnecting");
    try {
      // withCredentials → cookie session per contract §7
      es = new EventSource(url, { withCredentials: true });
    } catch (err) {
      scheduleReconnect();
      return;
    }

    es.onopen = () => {
      attempt = 0;
      onStatus("connected");
    };

    // The server emits typed events with `event:` names. We parse whatever
    // arrives on the default `message` channel AND on each named channel so
    // we tolerate either wire style.
    const handleRaw = (data: string) => {
      let parsed: TypedRunEvent;
      try {
        parsed = JSON.parse(data) as TypedRunEvent;
      } catch {
        return;
      }
      // Live token events are ephemeral (seq = -1) and must bypass the
      // watermark check — they are never replayed from the event store.
      if (parsed.type !== "token") {
        const lastSeen = getLastSeenSeq?.() ?? 0;
        if (typeof parsed.seq === "number" && parsed.seq <= lastSeen) return;
      }
      onEvent(parsed);
    };

    const NAMED_EVENTS = [
      "run_created", "run_status", "token", "plan_ready",
      "step_update", "verification_update", "commit_update",
      "run_complete", "stream_error",
    ] as const;

    for (const name of NAMED_EVENTS) {
      es.addEventListener(name, (e) => handleRaw((e as MessageEvent).data));
    }
    es.onmessage = (e) => handleRaw(e.data);

    es.onerror = () => {
      // EventSource will attempt its own reconnect, but we want deterministic
      // backoff and a visible reconnecting state. Close and reschedule.
      if (closed) return;
      es?.close();
      es = null;
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (closed) return;
    onStatus("reconnecting");
    const delay = BACKOFF_SEQUENCE_MS[Math.min(attempt, BACKOFF_SEQUENCE_MS.length - 1)];
    attempt += 1;
    backoffTimer = setTimeout(connect, delay);
  };

  connect();

  return {
    close() {
      closed = true;
      if (backoffTimer) clearTimeout(backoffTimer);
      es?.close();
      es = null;
      onStatus("disconnected");
    },
  };
}
