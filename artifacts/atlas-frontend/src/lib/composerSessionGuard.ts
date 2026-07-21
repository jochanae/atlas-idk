/**
 * Composer-session guard for auth expiry (Milestone 1 / INT-01).
 *
 * When the user is mid-thought (typing, attaching, Ask Atlas open with a
 * thread), a confirmed 401 must soft-pause — never hard-redirect to /login
 * and wipe the conversation.
 */

import { getAskAtlasComposerDraft } from "@/lib/composerDraftStore";
import { isPickerPending } from "@/lib/ghostClickShield";

export const SOFT_AUTH_PAUSE_KEY = "atlas-soft-auth-pause";
export const SOFT_AUTH_PAUSE_EVENT = "atlas:soft-auth-pause";

export type SoftAuthPauseDetail = {
  reason: string;
  at: number;
  source?: string;
};

function readBodyFlag(attr: string, expected: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    return document.body?.getAttribute(attr) === expected;
  } catch {
    return false;
  }
}

function hasFocusedComposer(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    if (el.closest?.("[data-atlas-composer]")) return true;
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const v = (el as HTMLInputElement | HTMLTextAreaElement).value ?? "";
      if (v.trim().length > 0) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * True when hard-redirecting to login would interrupt an active conversation.
 */
export function isActiveComposerSession(): boolean {
  if (isPickerPending()) return true;
  if (readBodyFlag("data-axiom-ask-atlas", "true")) return true;
  if (readBodyFlag("data-axiom-thread", "active")) return true;
  if (hasFocusedComposer()) return true;

  try {
    const draft = getAskAtlasComposerDraft();
    if (draft.input.trim().length > 0) return true;
    if (draft.files.length > 0) return true;
  } catch {
    /* ignore */
  }

  try {
    const wsDraft = sessionStorage.getItem("atlas-workspace-composer-input");
    if (wsDraft && wsDraft.trim().length > 0) return true;
  } catch {
    /* ignore */
  }

  return false;
}

/**
 * Hard login redirect is allowed only when no composer session is active.
 * Acceptance (INT-01): start typing / attach, expire session → no unexpected
 * redirect while work is in progress.
 */
export function shouldHardRedirectOnConfirmedAuthExpiry(): boolean {
  return !isActiveComposerSession();
}

export function markSoftAuthPause(
  reason: string,
  source: string = "auth_expiry",
): SoftAuthPauseDetail {
  const detail: SoftAuthPauseDetail = {
    reason,
    at: Date.now(),
    source,
  };
  try {
    sessionStorage.setItem(SOFT_AUTH_PAUSE_KEY, JSON.stringify(detail));
  } catch {
    /* ignore */
  }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(SOFT_AUTH_PAUSE_EVENT, { detail }),
      );
    }
  } catch {
    /* ignore */
  }
  return detail;
}

export function readSoftAuthPause(): SoftAuthPauseDetail | null {
  try {
    const raw = sessionStorage.getItem(SOFT_AUTH_PAUSE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SoftAuthPauseDetail;
    if (!parsed || typeof parsed.reason !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSoftAuthPause(): void {
  try {
    sessionStorage.removeItem(SOFT_AUTH_PAUSE_KEY);
  } catch {
    /* ignore */
  }
}

/** Test helper */
export function __resetComposerSessionGuardForTests(): void {
  clearSoftAuthPause();
}
