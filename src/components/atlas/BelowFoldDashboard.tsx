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
 * Below-the-fold dashboard surfaces:
 *   • Open Loops — parked items waiting on the user
 *   • Ledger Stats — committed-decision counters
 *   • Moments — recent sessions you can pick back up
 *
 * Designed to live under the resting greeting/prompt. Scroll down to reveal.
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
  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* Open Loops */}
      <section className="atlas-belowfold-section">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Open Loops</h3>
          <button
            type="button"
            onClick={onOpenParking}
            style={{
              background: "transparent",
              border: "none",
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--accent-gold)",
              opacity: 0.85,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Open parking →
          </button>
        </div>
        <div className="atlas-belowfold-stat">
          <span className="atlas-belowfold-stat-num">{openLoopsCount}</span>
          <span className="atlas-belowfold-stat-label">parked items waiting</span>
        </div>
      </section>

      {/* Ledger Stats */}
      <section className="atlas-belowfold-section">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Ledger Stats</h3>
          <button
            type="button"
            onClick={onOpenLedger}
            style={{
              background: "transparent",
              border: "none",
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--accent-gold)",
              opacity: 0.85,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Open ledger →
          </button>
        </div>
        <div className="atlas-belowfold-stat">
          <span className="atlas-belowfold-stat-num">{ledgerCount}</span>
          <span className="atlas-belowfold-stat-label">decisions committed</span>
        </div>
        <div className="atlas-belowfold-stat">
          <span className="atlas-belowfold-stat-num">{parkedCount}</span>
          <span className="atlas-belowfold-stat-label">items parked total</span>
        </div>
      </section>

      {/* Moments */}
      <section className="atlas-belowfold-section">
        <h3>Moments</h3>
        {recents.length === 0 ? (
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              color: "var(--muted-text)",
              opacity: 0.7,
              margin: 0,
            }}
          >
            No recent sessions yet — start a new thought above.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {recents.slice(0, 6).map((s) => {
              const isPhosphor = s.mode === "explore";
              const dot = isPhosphor ? "var(--phosphor)" : s.mode ? "var(--ember)" : "var(--muted-text)";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onOpenSession(s.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    background: "transparent",
                    border: "none",
                    borderBottom: "0.5px dashed color-mix(in oklab, var(--border) 80%, transparent)",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                  <span
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 13,
                      color: "var(--foreground)",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      opacity: 0.85,
                    }}
                  >
                    {s.title || "Untitled session"}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--muted-text)",
                      opacity: 0.6,
                      flexShrink: 0,
                    }}
                  >
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
