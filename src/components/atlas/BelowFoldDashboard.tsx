import { useEffect, useRef, useState, type ReactNode } from "react";
import type { RecentSession } from "./AtlasFrontDoor";

type Props = {
  openLoopsCount: number;
  ledgerCount: number;
  parkedCount: number;
  recents: RecentSession[];
  onOpenLedger: () => void;
  onOpenParking: () => void;
  onOpenSession: (id: string) => void;
};

/**
 * RevealOnScroll — wraps a child and fades + slides it in when it enters
 * the viewport. Once revealed, stays revealed (one-shot). A staggered
 * delay is applied per index for a cascading effect.
 */
function RevealOnScroll({
  children,
  delayMs = 0,
  id,
  className,
}: {
  children: ReactNode;
  delayMs?: number;
  id?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      id={id}
      className={className}
      style={{
        opacity: revealed ? 1 : 0,
        transform: revealed ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 600ms cubic-bezier(0.4, 0, 0.2, 1) ${delayMs}ms, transform 600ms cubic-bezier(0.4, 0, 0.2, 1) ${delayMs}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Below-the-fold discovery sections:
 *   1. A Moment for You — Atlas-noticed reflection prompt
 *   2. Your Momentum   — two-column metric card (decisions / parked)
 *   3. Open Loops      — parked items waiting on the user
 *   4. Where were we   — recent sessions
 *
 * Each card scroll-reveals with a 100ms stagger as it enters the viewport.
 */
export function BelowFoldDashboard({
  openLoopsCount,
  ledgerCount,
  parkedCount,
  recents,
  onOpenLedger,
  onOpenParking,
  onOpenSession,
}: Props) {
  const lastTitle = recents[0]?.title ?? "your last session";

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        width: "100%",
        padding: "24px var(--shell-edge) 0",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* 1. A Moment for You ---------------------------------------------- */}
      <RevealOnScroll delayMs={0} id="discovery-moment" className="atlas-discovery-card atlas-discovery-moment">
        <div className="atlas-discovery-tag" style={{ color: "#004D40" }}>
          atlas noticed
        </div>
        <p className="atlas-discovery-moment-text">
          You've returned to "{lastTitle}" three times this week.
          Maybe today is the day to commit it.
        </p>
      </RevealOnScroll>

      {/* 2. Your Momentum ------------------------------------------------- */}
      <RevealOnScroll delayMs={100} id="discovery-momentum" className="atlas-discovery-card">
        <div className="atlas-discovery-header">
          <h3>Your Momentum</h3>
          <button type="button" onClick={onOpenLedger} className="atlas-discovery-link">
            Open ledger →
          </button>
        </div>
        <div className="atlas-momentum-grid">
          <div className="atlas-momentum-cell">
            <span className="atlas-momentum-num">{ledgerCount}</span>
            <span className="atlas-momentum-label">decisions committed</span>
          </div>
          <div className="atlas-momentum-cell">
            <span className="atlas-momentum-num">{parkedCount}</span>
            <span className="atlas-momentum-label">items parked</span>
          </div>
        </div>
      </RevealOnScroll>

      {/* 3. Open Loops ---------------------------------------------------- */}
      <RevealOnScroll delayMs={200} id="discovery-loops" className="atlas-discovery-card">
        <div className="atlas-discovery-header">
          <h3>Open Loops</h3>
          <button type="button" onClick={onOpenParking} className="atlas-discovery-link">
            Open parking →
          </button>
        </div>
        {openLoopsCount === 0 ? (
          <p className="atlas-discovery-empty">No open loops — you're clear.</p>
        ) : (
          <div className="atlas-momentum-cell" style={{ paddingTop: 4 }}>
            <span className="atlas-momentum-num">{openLoopsCount}</span>
            <span className="atlas-momentum-label">waiting on you</span>
          </div>
        )}
      </RevealOnScroll>

      {/* 4. Where were we ------------------------------------------------ */}
      <RevealOnScroll delayMs={300} id="discovery-checkin" className="atlas-discovery-card">
        <div className="atlas-discovery-header">
          <h3>Where were we</h3>
        </div>
        {recents.length === 0 ? (
          <p className="atlas-discovery-empty">
            No recent sessions yet — start a new thought above.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {recents.slice(0, 4).map((s) => {
              const isPhosphor = s.mode === "explore";
              const dot = isPhosphor ? "var(--phosphor)" : s.mode ? "var(--accent-gold)" : "var(--muted-text)";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onOpenSession(s.id)}
                  className="atlas-discovery-row"
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                  <span className="atlas-discovery-row-title">
                    {s.title || "Untitled session"}
                  </span>
                  <span className="atlas-discovery-row-mode">
                    {s.mode || "think"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </RevealOnScroll>
    </div>
  );
}
