/**
 * atlasAnchor — global signals for the footer center "A" anchor.
 *
 * Two concerns:
 *   1. Held state — whether the composer has a live draft or a pending
 *      Joy turn. Drives the breathing gold halo behind the anchor so the
 *      user can feel that work is being held there.
 *   2. Absorb event — fired the moment a composer collapses off-screen.
 *      Drives a contained gold ripple inside the anchor ring so the user
 *      sees where the sheet went.
 *
 * The composer surfaces (ChatComposer, AskAtlasSurface) publish; the dock
 * (UnifiedContextDock) subscribes.
 */

type HeldListener = (held: boolean) => void;
type AbsorbListener = () => void;

let held = false;
const heldListeners = new Set<HeldListener>();
const absorbListeners = new Set<AbsorbListener>();

export function setAnchorHeld(next: boolean) {
  if (next === held) return;
  held = next;
  heldListeners.forEach((l) => l(held));
}

export function getAnchorHeld() {
  return held;
}

export function subscribeAnchorHeld(cb: HeldListener): () => void {
  heldListeners.add(cb);
  cb(held);
  return () => { heldListeners.delete(cb); };
}

/** Fire the contained gold ripple inside the anchor ring. */
export function triggerAnchorAbsorb() {
  absorbListeners.forEach((l) => l());
}

export function subscribeAnchorAbsorb(cb: AbsorbListener): () => void {
  absorbListeners.add(cb);
  return () => { absorbListeners.delete(cb); };
}

/** Standard funnel timing so composers stay in sync with the anchor ripple. */
export const ABSORB_DURATION_MS = 260;
