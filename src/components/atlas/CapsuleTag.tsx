import type { ReactNode } from "react";
import type { Severity } from "./StatusGlyph";

/**
 * CapsuleTag — small bracketed tag like [ COMMIT ] or [ #BUILD-782 ].
 *
 * Visual contract: gold-bordered ghost by default; severity tints the border
 * + text without filling the surface. Always monospace, always uppercase.
 */
export function CapsuleTag({
  children,
  severity = "neutral",
  variant = "ghost",
  size = "sm",
}: {
  children: ReactNode;
  severity?: Severity;
  variant?: "ghost" | "solid";
  size?: "xs" | "sm";
}) {
  const color = {
    blocker: "var(--ember)",
    parked: "var(--accent-gold)",
    committed: "var(--phosphor)",
    neutral: "var(--accent-gold)",
  }[severity];

  const padding = size === "xs" ? "1px 6px" : "2px 8px";
  const fontSize = size === "xs" ? 9 : 10;

  if (variant === "solid") {
    return (
      <span
        className="inline-flex items-center font-mono uppercase tracking-[0.1em] rounded-sm"
        style={{
          padding,
          fontSize,
          background: `color-mix(in oklab, ${color} 14%, transparent)`,
          color,
          border: `0.5px solid color-mix(in oklab, ${color} 50%, transparent)`,
        }}
      >
        {children}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center font-mono uppercase tracking-[0.1em] rounded-sm"
      style={{
        padding,
        fontSize,
        background: "transparent",
        color: `color-mix(in oklab, ${color} 85%, var(--foreground))`,
        border: `0.5px solid color-mix(in oklab, ${color} 55%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}
