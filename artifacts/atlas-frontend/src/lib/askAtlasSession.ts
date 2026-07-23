/**
 * askAtlasSession — typed wrapper around the three storage keys that
 * back the Ask Joy surface. Consolidating the reads/writes here means
 * the surface + home shell no longer sprinkle raw localStorage /
 * sessionStorage calls across the codebase.
 *
 * Storage keys (kept identical to preserve existing user sessions):
 *   - atlas-ask-atlas-conversation-id  (local + session mirror)
 *   - atlas-ask-atlas-surface-open     (local, "1" when surface is open)
 *   - atlas-ask-atlas-closed           (session, "1" when user closed it)
 */

const CONV_KEY = "atlas-ask-atlas-conversation-id";
const OPEN_KEY = "atlas-ask-atlas-surface-open";
const CLOSED_KEY = "atlas-ask-atlas-closed";

function safeLocalGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSessionGet(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function safeLocalSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}
function safeSessionSet(key: string, value: string) {
  try { sessionStorage.setItem(key, value); } catch {}
}
function safeLocalRemove(key: string) {
  try { localStorage.removeItem(key); } catch {}
}
function safeSessionRemove(key: string) {
  try { sessionStorage.removeItem(key); } catch {}
}

export const askAtlasSession = {
  // Conversation id ─ mirrored in both storages
  getConversationId(): string | null {
    return safeSessionGet(CONV_KEY) ?? safeLocalGet(CONV_KEY);
  },
  setConversationId(id: string) {
    safeLocalSet(CONV_KEY, id);
    safeSessionSet(CONV_KEY, id);
  },
  clearConversationId() {
    safeLocalRemove(CONV_KEY);
    safeSessionRemove(CONV_KEY);
  },

  // Surface open flag ─ localStorage
  isSurfaceOpen(): boolean {
    return safeLocalGet(OPEN_KEY) === "1";
  },
  setSurfaceOpen(open: boolean) {
    if (open) safeLocalSet(OPEN_KEY, "1");
    else safeLocalRemove(OPEN_KEY);
  },

  // Manually-closed flag ─ sessionStorage (resets per tab)
  isClosed(): boolean {
    return safeSessionGet(CLOSED_KEY) === "1";
  },
  markClosed() {
    safeSessionSet(CLOSED_KEY, "1");
  },
  clearClosed() {
    safeSessionRemove(CLOSED_KEY);
  },
};

export const ASK_ATLAS_STORAGE_KEYS = {
  conversationId: CONV_KEY,
  surfaceOpen: OPEN_KEY,
  closed: CLOSED_KEY,
} as const;

export function openAskAtlasFromWorkspace(navigate: (path: string) => void): void {
  askAtlasSession.clearClosed();
  navigate("/home");
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent("axiom:ask-atlas"));
  }, 30);
}
