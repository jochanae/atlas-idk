import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * ThinkFreelyHeaderToggle — "Obsidian Lock"
 *
 * Always-visible header entry-point for Think Freely (private, zero-trace) mode.
 * Lives in the global header on /home only. Tapping it dispatches a window event
 * that the home page listens for to flip the actual reflection state; the home
 * page broadcasts state back so this toggle visually mirrors it from anywhere.
 *
 * Events:
 *   - axiom:think-freely-toggle  → user tapped the lock
 *   - axiom:think-freely-state   → home broadcasts { active: boolean }
 */
export function ThinkFreelyHeaderToggle() {
  const [active, setActive] = useState(false);
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);

  // Mirror state broadcast by /home
  useEffect(() => {
    const onState = (e: Event) => {
      const ce = e as CustomEvent<{ active: boolean }>;
      if (ce.detail && typeof ce.detail.active === "boolean") {
        setActive(ce.detail.active);
      }
    };
    window.addEventListener("axiom:think-freely-state", onState as EventListener);
    return () => window.removeEventListener("axiom:think-freely-state", onState as EventListener);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Optimistic local toggle — home will rebroadcast the truth and reconcile.
    const next = !active;
    setActive(next);

    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        (navigator as any).vibrate(next ? [10, 30, 10] : [15]);
      }
    } catch {}

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setRipples((prev) => [...prev, { id: Date.now(), x, y }]);

    window.dispatchEvent(new CustomEvent("axiom:think-freely-toggle"));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={active ? "Think Freely active — tap to end session" : "Enter Think Freely (private mode)"}
      title={active ? "Think Freely · Zero Trace" : "Think Freely"}
      style={{
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 34,
        borderRadius: 10,
        cursor: "pointer",
        background: active
          ? "rgba(8,6,5,0.78)"
          : "transparent",
        border: `1px solid ${active ? "rgba(212,175,55,0.45)" : "rgba(120,113,108,0.20)"}`,
        boxShadow: active ? "0 0 18px rgba(212,175,55,0.18)" : "none",
        transition: "background 280ms ease, border-color 280ms ease, box-shadow 280ms ease",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            initial={{ scale: 0, opacity: 0.55 }}
            animate={{ scale: 4, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            onAnimationComplete={() =>
              setRipples((prev) => prev.filter((x) => x.id !== r.id))
            }
            style={{
              position: "absolute",
              top: r.y,
              left: r.x,
              width: 34,
              height: 34,
              marginLeft: -17,
              marginTop: -17,
              borderRadius: "50%",
              pointerEvents: "none",
              background: active
                ? "radial-gradient(circle, rgba(212,175,55,0.32) 0%, rgba(212,175,55,0) 70%)"
                : "radial-gradient(circle, rgba(120,113,108,0.22) 0%, rgba(120,113,108,0) 70%)",
            }}
          />
        ))}
      </AnimatePresence>

      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        width={16}
        height={16}
        style={{
          position: "relative",
          zIndex: 1,
          stroke: active ? "var(--atlas-gold, #D4AF37)" : "rgba(168,162,158,0.7)",
          transition: "stroke 280ms ease",
        }}
      >
        {/* Sparkle — represents Global Insight */}
        <path d="M12 3 L13.6 9.3 L20 11 L13.6 12.7 L12 19 L10.4 12.7 L4 11 L10.4 9.3 Z" />
        <path d="M19 4 L19.6 5.8 L21.4 6.4 L19.6 7 L19 8.8 L18.4 7 L16.6 6.4 L18.4 5.8 Z" />
      </svg>
    </button>
  );
}
