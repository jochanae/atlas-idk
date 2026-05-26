import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * CollapsibleMessageText
 *
 * Wraps long user-message content with a fade-mask collapse + "Show more"/"Show less" link.
 * Used in both home/nexus and workspace user bubbles for consistent long-paste handling.
 *
 * Measures the rendered content height; if it exceeds maxCollapsedPx, clamps and overlays
 * a bottom gradient mask matching the bubble background so the last visible line softly fades.
 */
export function CollapsibleMessageText({
  children,
  maxCollapsedPx = 168, // ~7 lines at 24px line-height
  fadeFromColor = "rgba(201,162,76,0.12)", // user-bubble gold tint by default
  textStyle,
}: {
  children: ReactNode;
  maxCollapsedPx?: number;
  fadeFromColor?: string;
  textStyle?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const sh = ref.current.scrollHeight;
    setOverflows(sh > maxCollapsedPx + 4);
  }, [children, maxCollapsedPx]);

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          position: "relative",
          maxHeight: expanded || !overflows ? "none" : maxCollapsedPx,
          overflow: "hidden",
        }}
      >
        <div ref={ref} style={textStyle}>
          {children}
        </div>
        {overflows && !expanded && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 56,
              pointerEvents: "none",
              background: `linear-gradient(to bottom, transparent 0%, ${fadeFromColor} 90%)`,
            }}
          />
        )}
      </div>
      {overflows && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          style={{
            marginTop: 6,
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: "var(--app-font-sans)",
            fontSize: 13,
            color: "var(--atlas-muted)",
            opacity: 0.75,
            textAlign: "left",
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
