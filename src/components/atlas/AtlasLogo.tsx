/**
 * AtlasLogo — "The Celestial Compass" mark.
 *
 * A minimalist, geometric stamp combining three elements:
 *   • The Sphere — an open circle representing the world of projects.
 *   • The Pillar — a strong vertical line representing foundation.
 *   • The Vertex — an upward chevron forming the implicit "A" and momentum.
 *
 * Adaptive: uses `currentColor` for stroke so it inherits from text color or
 * any explicit `color` prop. Pair with theme accents (Cognac in light,
 * Muted Amber in dark) for the Sovereign brand stamp.
 */

type Props = {
  size?: number;
  strokeWidth?: number;
  /** Optional override; otherwise inherits currentColor from parent. */
  color?: string;
  className?: string;
  title?: string;
  /** Adds a soft outer drop-shadow glow (good for the dark/Obsidian theme). */
  glow?: boolean;
};

export function AtlasLogo({
  size = 22,
  strokeWidth = 1.6,
  color,
  className,
  title = "Atlas",
  glow = false,
}: Props) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={title}
      className={className}
      style={
        glow
          ? { filter: "drop-shadow(0 0 6px rgba(180, 83, 9, 0.55))" }
          : undefined
      }
    >
      {/* The Sphere — open circle (gap at top to suggest a celestial opening) */}
      <path d="M22 6.5 A11 11 0 1 1 10 6.5" />
      {/* The Pillar — vertical foundation line */}
      <line x1="16" y1="7" x2="16" y2="25" opacity="0.85" />
      {/* The Vertex — upward chevron (the implicit 'A') */}
      <path d="M10.5 18 L16 12.5 L21.5 18" />
    </svg>
  );
}
