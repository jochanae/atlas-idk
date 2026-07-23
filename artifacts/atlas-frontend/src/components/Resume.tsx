import { useEffect, useRef, useState } from "react";

type ResumeData = {
  whatMoved: string[];
  whatEmerged: string;
  waitingOnYou: string;
  suggestedNextMove: string;
};

type RecentProject = {
  id: number;
  name: string;
  updatedAt: string;
};

type Props = {
  recentProjects?: RecentProject[];
  onOpenProject?: (id: number) => void;
  bustSignal?: number;
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function Resume({ recentProjects = [], onOpenProject, bustSignal = 0 }: Props) {
  const [data, setData] = useState<ResumeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const bustHandledRef = useRef(0);
  const fetchingRef = useRef(false);

  useEffect(() => {
    const isBust = bustSignal > bustHandledRef.current;
    if (fetchingRef.current && !isBust) return;

    fetchingRef.current = true;
    setIsLoading(true);

    const url = isBust ? "/api/nexus/resume?bust=1" : "/api/nexus/resume";
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ResumeData | null) => {
        if (d) setData(d);
        if (isBust) bustHandledRef.current = bustSignal;
      })
      .catch(() => {})
      .finally(() => {
        setIsLoading(false);
        fetchingRef.current = false;
      });
  }, [bustSignal]);

  const isEmpty =
    !isLoading &&
    !!data &&
    data.whatMoved.length === 0 &&
    !data.whatEmerged &&
    !data.waitingOnYou &&
    !data.suggestedNextMove;

  const hasContent = isLoading || (!!data && !isEmpty);
  const hasProjects = recentProjects.length > 0;

  if (!hasContent && !hasProjects) return null;

  return (
    <div className="atlas-discovery-card" style={{ padding: "16px 16px 14px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <h3 style={{
          margin: 0, fontSize: 9.5, fontWeight: 600,
          fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)",
          letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7,
        }}>
          Resume
        </h3>
        <span style={{
          fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)",
          opacity: 0.35, letterSpacing: "0.04em",
        }}>
          Where things stand
        </span>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: hasProjects ? 16 : 0 }}>
          <div style={{
            width: 12, height: 12, borderRadius: "50%",
            border: "1.5px solid rgba(201,162,76,0.18)",
            borderTopColor: "rgba(201,162,76,0.65)",
            animation: "bfd-spin 0.9s linear infinite",
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: 11, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)",
            opacity: 0.5, letterSpacing: "0.04em",
          }}>
            {bustSignal > 0 ? "Joy is recalibrating…" : "Joy is reading the ledger…"}
          </span>
        </div>
      )}

      {/* Empty / first-run state */}
      {isEmpty && (
        <p style={{
          margin: 0, marginBottom: hasProjects ? 16 : 0,
          fontSize: 12, color: "var(--atlas-muted)", opacity: 0.55,
          fontStyle: "italic", lineHeight: 1.55, fontFamily: "var(--app-font-sans)",
        }}>
          Nothing to resume yet. Your first conversation will begin building momentum.
        </p>
      )}

      {/* Four-section structured brief */}
      {!isLoading && data && !isEmpty && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: hasProjects ? 16 : 0 }}>

          {data.whatMoved.length > 0 && (
            <div>
              <div style={{
                fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.5,
                marginBottom: 6,
              }}>
                What moved
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
                {data.whatMoved.map((item, i) => (
                  <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{
                      fontSize: 11, color: "rgba(201,162,76,0.55)", flexShrink: 0,
                      paddingTop: 1, lineHeight: 1.45,
                    }}>
                      ›
                    </span>
                    <span style={{
                      fontSize: 12, color: "var(--atlas-fg)", opacity: 0.82,
                      lineHeight: 1.45, fontFamily: "var(--app-font-sans)",
                    }}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.whatEmerged && (
            <div style={{
              padding: "9px 11px",
              borderLeft: "2px solid rgba(201,162,76,0.35)",
              background: "rgba(201,162,76,0.03)",
              borderRadius: "0 6px 6px 0",
            }}>
              <div style={{
                fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--atlas-gold)", opacity: 0.65,
                marginBottom: 5,
              }}>
                What emerged
              </div>
              <p style={{
                margin: 0, fontSize: 12.5, color: "var(--atlas-fg)", opacity: 0.88,
                lineHeight: 1.55, fontFamily: "var(--app-font-sans)", fontStyle: "italic",
              }}>
                {data.whatEmerged}
              </p>
            </div>
          )}

          {data.waitingOnYou && (
            <div>
              <div style={{
                fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.5,
                marginBottom: 5,
              }}>
                Waiting on you
              </div>
              <p style={{
                margin: 0, fontSize: 12, color: "var(--atlas-fg)", opacity: 0.78,
                lineHeight: 1.5, fontFamily: "var(--app-font-sans)",
              }}>
                {data.waitingOnYou}
              </p>
            </div>
          )}

          {data.suggestedNextMove && (
            <div style={{
              padding: "9px 11px",
              border: "1px solid rgba(201,162,76,0.22)",
              borderRadius: 7,
              background: "rgba(201,162,76,0.025)",
            }}>
              <div style={{
                fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--atlas-gold)", opacity: 0.6,
                marginBottom: 5,
              }}>
                Next move
              </div>
              <p style={{
                margin: 0, fontSize: 12.5, color: "var(--atlas-fg)", opacity: 0.9,
                lineHeight: 1.5, fontFamily: "var(--app-font-sans)", fontWeight: 500,
              }}>
                {data.suggestedNextMove}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Recent projects list */}
      {hasProjects && (
        <>
          {hasContent && (
            <div style={{ height: 1, background: "var(--atlas-border)", marginBottom: 10 }} />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {recentProjects.slice(0, 4).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenProject?.(p.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "6px 8px", borderRadius: 7,
                  background: "transparent", border: "none",
                  cursor: onOpenProject ? "pointer" : "default",
                  textAlign: "left", transition: "background 140ms ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,162,76,0.04)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{
                  fontSize: 12, color: "var(--atlas-fg)", opacity: 0.8,
                  fontFamily: "var(--app-font-sans)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                }}>
                  {p.name}
                </span>
                <span style={{
                  fontSize: 9.5, fontFamily: "var(--app-font-mono)",
                  color: "var(--atlas-muted)", opacity: 0.4,
                  flexShrink: 0, marginLeft: 8, letterSpacing: "0.02em",
                }}>
                  {formatRelative(p.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
