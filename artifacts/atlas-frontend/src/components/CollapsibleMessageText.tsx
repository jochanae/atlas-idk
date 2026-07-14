import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * CollapsibleMessageText
 *
 * Wraps long user-message content with a true alpha-mask fade + "Show more"/"Show less" link.
 * Uses CSS `mask-image` so the text itself fades to transparent at the bottom — works
 * over any background (translucent bubbles included), no hard cutoff.
 */
export function CollapsibleMessageText({
  children,
  maxCollapsedPx = 320, // ~11-13 lines at ~26px line-height — relaxed so normal paragraphs never collapse
  fadeFromColor: _fadeFromColor,
  textStyle,
}: {
  children: ReactNode;
  maxCollapsedPx?: number;
  /** @deprecated kept for back-compat; mask-based fade no longer needs a color */
  fadeFromColor?: string;
  textStyle?: CSSProperties;
}) {
  void _fadeFromColor;
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const sh = ref.current.scrollHeight;
    setOverflows(sh > maxCollapsedPx + 4);
  }, [children, maxCollapsedPx]);

  const collapsed = overflows && !expanded;
  // Sharper obsidian-style fade: solid text until ~62%, then dissolves cleanly.
  // Uses alpha mask so it blends into any background (dark or light) natively.
  const fadeMask = collapsed
    ? "linear-gradient(to bottom, #000 0%, #000 62%, rgba(0,0,0,0.55) 84%, rgba(0,0,0,0) 100%)"
    : undefined;

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          maxHeight: expanded || !overflows ? "none" : maxCollapsedPx,
          overflow: "hidden",
          WebkitMaskImage: fadeMask,
          maskImage: fadeMask,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%",
          transition: "max-height 220ms ease",
          cursor: overflows ? "pointer" : "default",
        }}
        onClick={(e) => {
          if (!overflows) return;
          // Only toggle on plain taps within the text region — don't hijack
          // interactive children like links or buttons.
          const target = e.target as HTMLElement;
          if (target.closest("a,button")) return;
          setExpanded((v) => !v);
        }}
      >
        <div ref={ref} style={textStyle}>
          {children}
        </div>
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
            fontFamily: "var(--app-font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: expanded
              ? "var(--atlas-muted)"
              : "color-mix(in oklab, var(--atlas-gold) 88%, transparent)",
            opacity: expanded ? 0.7 : 1,
            textAlign: "left",
          }}
        >
          {expanded ? "Show less" : "Show more +"}
        </button>
      )}
    </div>
  );
}
