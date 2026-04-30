/**
 * Global haptic feedback utility.
 * Uses the Vibration API on supported devices (mobile); no-ops silently elsewhere.
 */

type Intensity = "light" | "medium" | "heavy";

const patterns: Record<Intensity, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: [30, 10, 30],
};

/** Trigger haptic feedback. Silent no-op on devices without vibration support. */
export function haptic(intensity: Intensity = "light") {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(patterns[intensity]);
    }
  } catch {
    // Silently swallow — haptics are a progressive enhancement.
  }
}
