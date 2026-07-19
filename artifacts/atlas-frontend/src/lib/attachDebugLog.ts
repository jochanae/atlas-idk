/**
 * attachDebugLog — lightweight attachment-lifecycle instrumentation.
 *
 * Writes timestamped events to:
 *   1. localStorage key "atlas_adbg" (survives page reloads)
 *   2. console.log (visible in remote DevTools / iOS Web Inspector)
 *
 * Access from the browser console:
 *   window.atlasDebugLog()         — returns the full log array
 *   window.atlasDebugClear()       — clears the log
 *   window.atlasDebugPrint()       — console.table the full log
 *
 * This module is instrumentation-only. It must never alter behaviour —
 * every call is wrapped in try/catch and has no observable side-effects.
 *
 * Remove this file and its call sites when the remount investigation is complete.
 */

const STORE_KEY = "atlas_adbg";
const MAX_ENTRIES = 300;

export type DebugEntry = {
  t: number;
  ts: string;
  event: string;
  [key: string]: unknown;
};

/** Staged-file count mirror — updated by useStagedAttachments so the
 *  visibilitychange handler (which runs outside React) can read it. */
let _stagedCount = 0;

export function setStagedCount(n: number): void {
  _stagedCount = n;
  try { sessionStorage.setItem("atlas_sc", String(n)); } catch {}
}

export function getStagedCount(): number {
  return _stagedCount;
}

export function logEvent(event: string, data?: Record<string, unknown>): void {
  try {
    const ts = new Date().toISOString().replace("T", " ").slice(0, 23);
    const entry: DebugEntry = { t: Date.now(), ts, event, ...(data ?? {}) };

    try {
      const arr: DebugEntry[] = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
      arr.push(entry);
      if (arr.length > MAX_ENTRIES) arr.splice(0, arr.length - MAX_ENTRIES);
      localStorage.setItem(STORE_KEY, JSON.stringify(arr));
    } catch {
      // localStorage may be unavailable (private browsing quota, etc.) — ignore.
    }

    // eslint-disable-next-line no-console
    console.log(`[📎 AttachDebug ${ts}] ${event}`, data ?? "");
  } catch {
    // Never throw from instrumentation.
  }
}

export function getLog(): DebugEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function clearLog(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {}
}

/** Install global console helpers so the log can be read from DevTools. */
export function installDebugGlobals(): void {
  try {
    (window as unknown as Record<string, unknown>).atlasDebugLog = getLog;
    (window as unknown as Record<string, unknown>).atlasDebugClear = clearLog;
    (window as unknown as Record<string, unknown>).atlasDebugPrint = () => {
      // eslint-disable-next-line no-console
      console.table(getLog());
    };
  } catch {}
}
