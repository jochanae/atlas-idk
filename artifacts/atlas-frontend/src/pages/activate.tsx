/**
 * ActivationSequence — first-ever sign-in choreography.
 *
 * Reads as "Joy is coming online" — not "your workspace is loading."
 * Sequence (parchment + obsidian):
 *   1. 0.0s → constellation dots fade in, staggered
 *   2. 0.8s → dots converge toward center + Axiom logo strokes draw
 *   3. 1.6s → wordmark + tagline reveal
 *   4. 3.6s → auto-continue to /home
 *
 * Warm-boot mode (subsequent sign-ins): compressed ~450ms pulse only.
 *
 * Color handling:
 *   Obsidian → --atlas-gold (#D4AF37) with luminous glow.
 *   Parchment → deeper gold via CSS var override + soft warm shadow (no glow).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

type Mode = "full" | "warm" | "welcome";

const CONSTELLATION = [
  { x: 22, y: 30 }, { x: 78, y: 26 }, { x: 14, y: 62 },
  { x: 86, y: 66 }, { x: 34, y: 82 }, { x: 66, y: 84 },
  { x: 50, y: 18 }, { x: 50, y: 90 },
];

export default function ActivatePage() {
  const [, navigate] = useLocation();
  const mode: Mode = useMemo(() => {
    try {
      const m = sessionStorage.getItem("atlas-activation-mode");
      if (m === "warm" || m === "welcome") return m;
      return "full";
    } catch { return "full"; }
  }, []);
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(0);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    try {
      localStorage.setItem("atlas-activation-seen", "1");
      localStorage.setItem("atlas-last-sign-in", new Date().toISOString());
      sessionStorage.removeItem("atlas-activation-mode");
    } catch {}
    navigate("/home", { replace: true });
  };

  useEffect(() => {
    if (mode === "warm") {
      const t = setTimeout(finish, 450);
      return () => clearTimeout(t);
    }
    if (mode === "welcome") {
      // Compressed: dots settle, mark + "Welcome back" reveal, exit.
      const t1 = setTimeout(() => setPhase(1), 300);
      const t2 = setTimeout(() => setPhase(2), 600);
      const t3 = setTimeout(() => setPhase(3), 900);
      const t4 = setTimeout(finish, 1400);
      return () => { [t1, t2, t3, t4].forEach(clearTimeout); };
    }
    const t1 = setTimeout(() => setPhase(1), 800);
    const t2 = setTimeout(() => setPhase(2), 1600);
    const t3 = setTimeout(() => setPhase(3), 2400);
    const t4 = setTimeout(finish, 3600);
    return () => { [t1, t2, t3, t4].forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Allow user to skip
  useEffect(() => {
    const skip = () => finish();
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mode === "warm") {
    return (
      <div className="atlas-activate-root" role="status" aria-label="Signing you in">
        <motion.div
          className="atlas-activate-warm-pulse"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: [0, 1, 0.6], scale: [0.7, 1.05, 1] }}
          transition={{ duration: 0.42, ease: "easeOut" }}
        />
        <StyleTag />
      </div>
    );
  }

  return (
    <div className="atlas-activate-root" role="status" aria-label="Joy is coming online">
      <div className="atlas-activate-stage">
        {/* Constellation dots */}
        {CONSTELLATION.map((p, i) => (
          <motion.span
            key={i}
            className="atlas-activate-star"
            initial={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
            animate={
              phase === 0
                ? { opacity: 0.7, scale: 1 }
                : { opacity: 0, scale: 0.2, x: (50 - p.x) * 1.6, y: (50 - p.y) * 1.6 }
            }
            transition={{
              duration: phase === 0 ? 0.6 : 0.7,
              delay: phase === 0 ? i * 0.06 : 0,
              ease: "easeOut",
            }}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          />
        ))}

        {/* Axiom mark — draws in on phase 1 */}
        <AnimatePresence>
          {phase >= 1 && (
            <motion.svg
              key="mark"
              className="atlas-activate-mark"
              viewBox="0 0 100 100"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              aria-hidden
            >
              <motion.polygon
                points="50,18 30,82 40,82 52,42"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.15 }}
              />
              <motion.polygon
                points="50,18 70,82 60,82 48,42"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.25 }}
              />
              <motion.rect
                x="36" y="60" width="28" height="6" rx="1"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.4, delay: 0.45 }}
                style={{ transformOrigin: "50% 50%" }}
              />
            </motion.svg>
          )}
        </AnimatePresence>

        {/* Wordmark + tagline */}
        <AnimatePresence>
          {phase >= 2 && (
            <motion.div
              key="text"
              className="atlas-activate-text"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            >
              <div className="atlas-activate-wordmark">AXIOM</div>
              <motion.div
                className="atlas-activate-tagline"
                initial={{ opacity: 0 }}
                animate={{ opacity: phase >= 3 ? 0.7 : 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                {mode === "welcome" ? "Welcome back" : "Your workspace is coming online"}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <StyleTag />
    </div>
  );
}

function StyleTag() {
  return (
    <style>{`
      .atlas-activate-root {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--atlas-bg);
        z-index: 9999;
        overflow: hidden;
      }
      .atlas-activate-stage {
        position: relative;
        width: min(80vw, 420px);
        height: min(80vw, 420px);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .atlas-activate-star {
        position: absolute;
        width: 6px;
        height: 6px;
        margin-left: -3px;
        margin-top: -3px;
        border-radius: 50%;
        background: var(--atlas-gold, #D4AF37);
        box-shadow: 0 0 12px color-mix(in oklab, var(--atlas-gold, #D4AF37) 55%, transparent);
        pointer-events: none;
      }
      [data-theme="parchment"] .atlas-activate-star {
        background: #A87C1F;
        box-shadow: 0 1px 6px rgba(120, 80, 20, 0.28);
      }
      .atlas-activate-mark {
        position: absolute;
        width: 96px;
        height: 96px;
        fill: var(--atlas-gold, #D4AF37);
        filter: drop-shadow(0 0 24px color-mix(in oklab, var(--atlas-gold, #D4AF37) 45%, transparent));
      }
      [data-theme="parchment"] .atlas-activate-mark {
        fill: #A87C1F;
        filter: drop-shadow(0 3px 10px rgba(120, 80, 20, 0.22));
      }
      .atlas-activate-text {
        position: absolute;
        bottom: -12%;
        left: 0;
        right: 0;
        text-align: center;
      }
      .atlas-activate-wordmark {
        font-family: var(--app-font-mono, ui-monospace, monospace);
        font-size: 15px;
        letter-spacing: 0.42em;
        color: var(--atlas-gold, #D4AF37);
      }
      [data-theme="parchment"] .atlas-activate-wordmark {
        color: #A87C1F;
      }
      .atlas-activate-tagline {
        margin-top: 10px;
        font-size: 12px;
        color: var(--atlas-muted);
        letter-spacing: 0.05em;
        font-style: italic;
      }
      .atlas-activate-warm-pulse {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--atlas-gold, #D4AF37);
        box-shadow: 0 0 32px color-mix(in oklab, var(--atlas-gold, #D4AF37) 55%, transparent);
      }
      [data-theme="parchment"] .atlas-activate-warm-pulse {
        background: #A87C1F;
        box-shadow: 0 4px 16px rgba(120, 80, 20, 0.28);
      }
      @media (prefers-reduced-motion: reduce) {
        .atlas-activate-star, .atlas-activate-mark, .atlas-activate-text, .atlas-activate-warm-pulse {
          animation: none !important;
          transition: none !important;
        }
      }
    `}</style>
  );
}
