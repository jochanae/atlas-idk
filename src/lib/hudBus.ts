/**
 * Listening HUD event bus — frontend-only, in-memory pub/sub.
 *
 * Surfaces "what Atlas is hearing" inline with conversation flow:
 * intent classified, memory written, decision caught, attachment ingested,
 * navigation logged. Backend can later replace this by pushing events
 * onto the same bus from an SSE handler.
 */

export type HudEventType =
  | "INTENT"
  | "MEMORY"
  | "DECISION"
  | "INGESTED"
  | "NAVIGATED"
  | "EXTRACTED"
  | "TENSION";

export interface HudEvent {
  id: string;
  type: HudEventType;
  payload: string;
  /** ISO timestamp */
  at: string;
}

type Listener = (events: HudEvent[]) => void;

const MAX_EVENTS = 20;

let events: HudEvent[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(events);
}

export function pushHudEvent(type: HudEventType, payload: string) {
  const ev: HudEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    payload,
    at: new Date().toISOString(),
  };
  events = [ev, ...events].slice(0, MAX_EVENTS);
  emit();
}

export function subscribeHud(listener: Listener): () => void {
  listeners.add(listener);
  listener(events);
  return () => {
    listeners.delete(listener);
  };
}

export function getHudEvents(): HudEvent[] {
  return events;
}

export function clearHudEvents() {
  events = [];
  emit();
}
