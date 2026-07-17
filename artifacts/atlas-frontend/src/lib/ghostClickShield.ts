/**
 * Mobile file pickers (esp. Android / Z Fold) synthesize a tap at the original
 * coordinates when the picker closes. By then the Plus sheet is gone, so that
 * tap lands on whatever sits underneath — on Ask Atlas that is often the
 * centered "Exit Ask Atlas" chip, which wiped the active thread.
 *
 * Install a short-lived full-viewport shield that swallows the synthetic
 * pointer/click cycle after picker open / file selection.
 */
import { attachAuditLog } from "@/lib/attachAuditLog";

const DEFAULT_MS = 450;
let activeTimer: ReturnType<typeof setTimeout> | null = null;
let activeShield: HTMLDivElement | null = null;

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

export function installGhostClickShield(
  reason: string,
  ms: number = DEFAULT_MS,
): void {
  if (typeof document === "undefined") return;

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
  return { active: !!activeShield, reason: activeShield?.dataset.atlasGhostShield ?? null };
}
