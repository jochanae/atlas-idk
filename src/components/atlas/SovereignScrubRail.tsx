import { useState, useRef, useCallback, useEffect, type RefObject } from "react";
import { haptic } from "@/lib/haptics";

export type ScrubNotch = {
  id: string;
  label: string;
  position: number; // 0-1 normalised position in chat
  kind: "thinking" | "building" | "verifying" | "commit" | "message";
};

type Props = {
  notches: ScrubNotch[];
  scrollContainerRef: RefObject<HTMLElement | null>;
  visible?: boolean;
};

export function SovereignScrubRail({ notches, scrollContainerRef, visible = true }: Props) {
  const [active, setActive] = useState(false);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const lastHapticNotch = useRef<string | null>(null);

  const scrollTo = useCallback(
    (fraction: number) => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const maxScroll = el.scrollHeight - el.clientHeight;
      el.scrollTo({ top: maxScroll * fraction, behavior: "smooth" });
    },
    [scrollContainerRef],
  );

  const handleInteraction = useCallback(
    (clientY: number) => {
      const rail = railRef.current;
      if (!rail) return;
      const rect = rail.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      setHoverY(fraction);
      scrollTo(fraction);

      // Haptic feedback on notch pass
      const closest = notches.reduce<ScrubNotch | null>((best, n) => {
        if (!best) return n;
        return Math.abs(n.position - fraction) < Math.abs(best.position - fraction) ? n : best;
      }, null);
      if (closest && Math.abs(closest.position - fraction) < 0.03) {
        if (lastHapticNotch.current !== closest.id) {
          lastHapticNotch.current = closest.id;
          haptic("light");
        }
      }
    },
    [notches, scrollTo],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setActive(true);
      handleInteraction(e.clientY);
    },
    [handleInteraction],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!active) return;
      handleInteraction(e.clientY);
    },
    [active, handleInteraction],
  );

  const onPointerUp = useCallback(() => {
    setActive(false);
    lastHapticNotch.current = null;
    // Fade out after delay
    setTimeout(() => setHoverY(null), 800);
  }, []);

  useEffect(() => {
    if (!active) return;
    const up = () => {
      setActive(false);
      lastHapticNotch.current = null;
      setTimeout(() => setHoverY(null), 800);
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [active]);

  if (!visible || notches.length === 0) return null;

  const NOTCH_COLORS: Record<ScrubNotch["kind"], string> = {
    thinking: "var(--accent-gold)",
    building: "var(--ember)",
    verifying: "var(--phosphor)",
    commit: "var(--accent-gold)",
    message: "var(--muted-text)",
  };

  return (
    <div
      ref={railRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: "fixed",
        right: 2,
        top: 56,
        bottom: 80,
        width: active ? 28 : 14,
        zIndex: 55,
        cursor: "grab",
        transition: "width 250ms cubic-bezier(.2,.8,.2,1), opacity 300ms ease",
        opacity: active || hoverY != null ? 1 : 0.5,
        display: "flex",
        alignItems: "stretch",
      }}
    >
      {/* Rail track */}
      <div
        style={{
          position: "absolute",
          right: 6,
          top: 0,
          bottom: 0,
          width: 2,
          borderRadius: 1,
          background: active
            ? "linear-gradient(to bottom, color-mix(in oklab, var(--accent-gold) 40%, transparent), color-mix(in oklab, var(--accent-gold) 15%, transparent))"
            : "color-mix(in oklab, var(--accent-gold) 12%, transparent)",
          transition: "background 300ms ease",
        }}
      />

      {/* Notches */}
      {notches.map((n) => (
        <div
          key={n.id}
          style={{
            position: "absolute",
            right: 3,
            top: `${n.position * 100}%`,
            width: active ? 12 : 6,
            height: 2,
            borderRadius: 1,
            background: NOTCH_COLORS[n.kind],
            opacity: active ? 0.9 : 0.5,
            transition: "width 200ms ease, opacity 200ms ease",
            transform: "translateY(-1px)",
          }}
          title={n.label}
        />
      ))}

      {/* Scrub indicator */}
      {active && hoverY != null && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: `${hoverY * 100}%`,
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            pointerEvents: "none",
          }}
        >
          {/* Tooltip showing nearest notch label */}
          {(() => {
            const closest = notches.reduce<ScrubNotch | null>((best, n) => {
              if (!best) return n;
              return Math.abs(n.position - hoverY) < Math.abs(best.position - hoverY) ? n : best;
            }, null);
            if (!closest || Math.abs(closest.position - hoverY) > 0.08) return null;
            return (
              <div
                style={{
                  position: "absolute",
                  right: 32,
                  whiteSpace: "nowrap",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  color: "var(--accent-gold)",
                  background: "var(--glass-bg)",
                  backdropFilter: "blur(12px)",
                  padding: "3px 8px",
                  borderRadius: 4,
                  border: "0.5px solid color-mix(in oklab, var(--accent-gold) 25%, transparent)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
                  animation: "atlas-scrub-tooltip 200ms ease forwards",
                }}
              >
                {closest.label}
              </div>
            );
          })()}
          {/* Thumb */}
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "var(--accent-gold)",
              boxShadow: "0 0 12px color-mix(in oklab, var(--accent-gold) 50%, transparent)",
              animation: "atlas-state-pulse 1.8s ease-in-out infinite",
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes atlas-scrub-tooltip {
          from { opacity: 0; transform: translateX(8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
