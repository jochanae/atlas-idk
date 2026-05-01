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
 * Below-the-fold discovery sections:
 *   1. A Moment for You — Atlas-noticed reflection prompt
 *   2. Your Momentum   — two-column metric card (decisions / parked)
 *   3. Open Loops      — parked items waiting on the user
 *   4. Check In        — soft daily prompt
 *
 * Spec: Cognac (#8B4513) numbers, Deep Teal (#004D40) "atlas noticed" tag,
 * white surfaces with 10px radius. Labels at 70% opacity to avoid the
 * "muted/invisible" look.
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
      <section id="discovery-moment" className="atlas-discovery-card atlas-discovery-moment">
        <div className="atlas-discovery-tag" style={{ color: "#004D40" }}>
          atlas noticed
        </div>
        <p className="atlas-discovery-moment-text">
          You've returned to "{lastTitle}" three times this week.
          Maybe today is the day to commit it.
        </p>
      </section>

      {/* 2. Your Momentum ------------------------------------------------- */}
      <section id="discovery-momentum" className="atlas-discovery-card">
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
      </section>

      {/* 3. Open Loops ---------------------------------------------------- */}
      <section className="atlas-discovery-card">
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
      </section>

      {/* 4. Check In ------------------------------------------------------ */}
      <section className="atlas-discovery-card">
        <div className="atlas-discovery-header">
          <h3>Check In</h3>
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
      </section>
    </div>
  );
}
