/**
 * Mobile file pickers (esp. Android / Z Fold) synthesize a tap at the original
 * coordinates when the picker closes. By then the Plus sheet is gone, so that
 * tap lands on whatever sits underneath — on Ask Atlas that is often the
 * centered "Exit Ask Atlas" chip, which wiped the active thread.
 *
 * Document pickers (PowerPoint / Files app) are worse than the photo gallery:
 * they background the tab longer and the synthetic tap often arrives well after
 * a short shield would have expired. Track picker-pending across visibility
 * returns and re-arm a longer shield when the page comes back.
 */
import { attachAuditLog } from "@/lib/attachAuditLog";

/** Default shield after a quick gallery-style picker interaction. */
export const GHOST_SHIELD_DEFAULT_MS = 450;
/** Longer shield after document / Office file selection (pptx etc.). */
export const GHOST_SHIELD_DOCUMENT_MS = 2000;
/** Re-arm window when returning from a backgrounded native picker. */
export const GHOST_SHIELD_VISIBILITY_MS = 2000;

const PICKER_PENDING_KEY = "atlas-picker-pending";

let activeTimer: ReturnType<typeof setTimeout> | null = null;
let activeShield: HTMLDivElement | null = null;
let pickerPending = false;
let visibilityHooked = false;

function block(ev: Event) {
  ev.preventDefault();
  ev.stopPropagation();
  try {
    attachAuditLog(
      "ghost_click_blocked",
      { type: ev.type, reason: activeShield?.dataset.atlasGhostShield ?? "unknown" },
      "global",
    );
  } catch {
    /* ignore */
  }
}

const BLOCKED_EVENTS = [
  "pointerdown",
  "pointerup",
  "pointercancel",
  "click",
  "auxclick",
  "touchstart",
  "touchend",
  "mousedown",
  "mouseup",
] as const;

function setPendingStorage(pending: boolean) {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (pending) sessionStorage.setItem(PICKER_PENDING_KEY, "1");
    else sessionStorage.removeItem(PICKER_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

function readPendingStorage(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(PICKER_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

function ensureVisibilityHook() {
  if (visibilityHooked || typeof document === "undefined") return;
  visibilityHooked = true;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (!pickerPending && !readPendingStorage()) return;
    pickerPending = true;
    installGhostClickShield("picker_visibility_return", GHOST_SHIELD_VISIBILITY_MS);
    // Cancelled Documents pickers often skip the change event — expire pending
    // after the visibility shield so Exit is not stuck forever.
    window.setTimeout(() => {
      if (pickerPending) clearPickerPending();
    }, GHOST_SHIELD_VISIBILITY_MS);
  });
  // Cold start after Android Documents killed the WebView mid-picker.
  if (readPendingStorage()) {
    pickerPending = true;
    installGhostClickShield("picker_pending_restore", GHOST_SHIELD_VISIBILITY_MS);
    window.setTimeout(() => {
      if (pickerPending) clearPickerPending();
    }, GHOST_SHIELD_VISIBILITY_MS);
  }
}

/** True while a native file/camera picker is expected to return. */
export function isPickerPending(): boolean {
  return pickerPending || readPendingStorage();
}

export function markPickerPending(reason: string = "picker_open"): void {
  pickerPending = true;
  setPendingStorage(true);
  ensureVisibilityHook();
  try {
    attachAuditLog("picker_pending", { pending: true, reason }, "global");
  } catch {
    /* ignore */
  }
}

export function clearPickerPending(): void {
  pickerPending = false;
  setPendingStorage(false);
  try {
    attachAuditLog("picker_pending", { pending: false }, "global");
  } catch {
    /* ignore */
  }
}

/** Office / document-like files need a longer post-select shield. */
export function isDocumentLikeFile(file: Pick<File, "name" | "type">): boolean {
  const mime = (file.type || "").toLowerCase();
  const name = file.name || "";
  if (mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/")) {
    return false;
  }
  if (
    /officedocument|msword|ms-excel|ms-powerpoint|vnd\.ms-|application\/pdf|text\/|application\/json|application\/zip/.test(
      mime,
    )
  ) {
    return true;
  }
  return /\.(pptx?|docx?|xlsx?|pdf|txt|md|csv|tsv|rtf|odt|ods|odp|zip|json)$/i.test(name);
}

export function shieldMsForFiles(files: Array<Pick<File, "name" | "type">>): number {
  if (files.some(isDocumentLikeFile)) return GHOST_SHIELD_DOCUMENT_MS;
  return GHOST_SHIELD_DEFAULT_MS;
}

export function installGhostClickShield(
  reason: string,
  ms: number = GHOST_SHIELD_DEFAULT_MS,
): void {
  if (typeof document === "undefined") return;
  ensureVisibilityHook();

  // Refresh duration if a shield is already up (picker open → file selected).
  if (activeShield) {
    if (activeTimer) clearTimeout(activeTimer);
    activeShield.dataset.atlasGhostShield = reason;
    activeTimer = setTimeout(removeGhostClickShield, ms);
    attachAuditLog("ghost_click_shield", { reason, ms, refreshed: true }, "global");
    return;
  }

  const shield = document.createElement("div");
  shield.dataset.atlasGhostShield = reason;
  shield.setAttribute("aria-hidden", "true");
  shield.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483646",
    "touch-action:none",
    "cursor:default",
    "background:transparent",
  ].join(";");

  for (const type of BLOCKED_EVENTS) {
    shield.addEventListener(type, block, true);
  }
  document.body.appendChild(shield);
  activeShield = shield;
  activeTimer = setTimeout(removeGhostClickShield, ms);
  attachAuditLog("ghost_click_shield", { reason, ms, refreshed: false }, "global");
}

export function removeGhostClickShield(): void {
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  if (activeShield) {
    for (const type of BLOCKED_EVENTS) {
      activeShield.removeEventListener(type, block, true);
    }
    activeShield.remove();
    activeShield = null;
  }
}

/** Test helper */
export function __ghostClickShieldForTests() {
  return {
    active: !!activeShield,
    reason: activeShield?.dataset.atlasGhostShield ?? null,
    pickerPending,
  };
}

/** Test helper — reset module state between cases. */
export function __resetGhostClickShieldForTests() {
  removeGhostClickShield();
  pickerPending = false;
  setPendingStorage(false);
}
