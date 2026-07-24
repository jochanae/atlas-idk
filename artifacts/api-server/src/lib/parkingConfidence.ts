/**
 * Parking Lot intake confidence gates (product contract v0.2).
 *
 * 95–100 → auto-park (rare)
 * 80–94  → ask user; do not silent-park
 * <80    → do not park automatically
 */
export const PARK_AUTO_MIN = 95;
export const PARK_ASK_MIN = 80;

export type ParkConfidenceAction = "auto-park" | "ask" | "skip";

export function parkActionForConfidence(confidence: number): ParkConfidenceAction {
  if (!Number.isFinite(confidence)) return "skip";
  if (confidence >= PARK_AUTO_MIN) return "auto-park";
  if (confidence >= PARK_ASK_MIN) return "ask";
  return "skip";
}

export function shouldAutoPark(confidence: number): boolean {
  return parkActionForConfidence(confidence) === "auto-park";
}
