import { useSyncExternalStore } from "react";

/**
 * Feeder channel attachment — stub backed by localStorage.
 *
 * Frontend-only signal that says "this Nexus / ambient thread is attached
 * to a committed project as a feeder channel." Written when CommitPill arms,
 * cleared on explicit detach. Backend persistence (attached_project_id on
 * threads row) will replace this later; the API surface here is what every
 * caller uses so the swap is mechanical.
 *
 * The Living Thread is singular today, so a single global key is sufficient.
 * If/when per-conversation feeders land, switch `KEY_PREFIX` based callers
 * to `feederKey(conversationId)` — the read/write/subscribe contract stays
 * identical.
 */

const GLOBAL_KEY = "atlas-nexus-feeder";
const EVENT = "atlas-feeder-change";

export interface FeederAttachment {
  projectId: number;
  projectTitle: string;
  attachedAt: string; // ISO
}

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}

export function getFeeder(key: string = GLOBAL_KEY): FeederAttachment | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FeederAttachment;
    if (typeof parsed?.projectId !== "number" || !parsed?.projectTitle) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setFeeder(
  attachment: Omit<FeederAttachment, "attachedAt">,
  key: string = GLOBAL_KEY,
) {
  if (typeof window === "undefined") return;
  const payload: FeederAttachment = { ...attachment, attachedAt: new Date().toISOString() };
  window.localStorage.setItem(key, JSON.stringify(payload));
  emit();
}

export function clearFeeder(key: string = GLOBAL_KEY) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
  emit();
}

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/** React hook — re-renders when the feeder attachment changes. */
export function useFeeder(key: string = GLOBAL_KEY): FeederAttachment | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      return raw; // stable snapshot for change detection
    },
    () => null,
  ) ? getFeeder(key) : null;
}
