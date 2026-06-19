import {
  useGetProjectManifest,
  getGetProjectManifestQueryKey,
} from "@workspace/api-client-local";
import type { DnaAnchor, BuildTarget } from "@workspace/api-client-local";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONO = "var(--app-font-mono)";
const SANS = "var(--app-font-sans)";
const GOLD = "rgba(201,162,76,0.9)";
const MUTED = "var(--atlas-muted)";
const FG = "var(--atlas-fg)";
const BORDER = "var(--atlas-border)";
const GREEN = "#6EE7B7";
const AMBER = "#f59e0b";

type Completeness = "absent" | "thin" | "sufficient" | "locked";

function completenessColor(c: Completeness): string {
  if (c === "locked") return GOLD;
  if (c === "sufficient") return GREEN;
  if (c === "thin") return AMBER;
  return "rgba(255,255,255,0.22)";
}

function scoreColor(score: number): string {
  if (score >= 67) return GREEN;
  if (score >= 34) return AMBER;
  return "rgba(255,255,255,0.28)";
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function ConfidenceBar({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <div style={{ padding: "12px 14px", borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
        <span style={{
          fontFamily: MONO, fontSize: 8, letterSpacing: "0.16em",
          textTransform: "uppercase", color: MUTED, opacity: 0.45,
        }}>
          Confidence
        </span>
        <span style={{
          fontFamily: MONO, fontSize: 15, fontWeight: 700,
          color, lineHeight: 1, letterSpacing: "-0.01em",
        }}>
          {score}
          <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.6, marginLeft: 2 }}>/ 100</span>
        </span>
      </div>
      <div style={{
        height: 3, borderRadius: 3,
        background: "rgba(255,255,255,0.06)",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${score}%`,
          borderRadius: 3,
          background: color,
          opacity: 0.75,
          transition: "width 600ms cubic-bezier(0.16,1,0.3,1)",
          boxShadow: score > 0 ? `0 0 8px ${color}60` : "none",
        }} />
      </div>
    </div>
  );
}

function AnchorCard({ anchor }: { anchor: DnaAnchor }) {
  const c = anchor.completeness as Completeness;
  const color = completenessColor(c);
  const hasValue = anchor.value && anchor.value.trim().length > 0;

  return (
    <div style={{
      padding: "10px 12px",
      borderBottom: `1px solid ${BORDER}`,
      transition: "background 150ms ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{
          fontFamily: MONO, fontSize: 8, letterSpacing: "0.14em",
          textTransform: "uppercase", color: MUTED, opacity: 0.45,
        }}>
          {anchor.label}
        </span>
        <span style={{
          fontFamily: MONO, fontSize: 7.5, letterSpacing: "0.08em",
          textTransform: "uppercase", color,
          background: `color-mix(in srgb, ${color} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} 22%, transparent)`,
          borderRadius: 4, padding: "1px 5px",
          opacity: hasValue ? 0.9 : 0.55,
        }}>
          {c}
        </span>
      </div>

      {hasValue ? (
        <p style={{
          margin: 0, fontSize: 12,
          color: FG,
          opacity: c === "thin" ? 0.70 : c === "locked" ? 0.95 : 0.84,
          lineHeight: 1.5,
          fontFamily: SANS,
          fontStyle: c === "locked" ? "italic" : "normal",
        }}>
          {anchor.value}
        </p>
      ) : (
        <p style={{
          margin: 0, fontSize: 11,
          color: MUTED,
          opacity: 0.38,
          lineHeight: 1.5,
          fontStyle: "italic",
          fontFamily: SANS,
        }}>
          {anchor.question}
        </p>
      )}
    </div>
  );
}

function BuildTargetRow({ target }: { target: BuildTarget }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8,
      padding: "7px 14px",
      opacity: target.unlocked ? 1 : 0.35,
    }}>
      <span style={{
        width: 14, height: 14, borderRadius: "50%", flexShrink: 0, marginTop: 1,
        background: target.unlocked ? "rgba(201,162,76,0.15)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${target.unlocked ? "rgba(201,162,76,0.35)" : "rgba(255,255,255,0.1)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {target.unlocked ? (
          <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="rgba(201,162,76,0.85)" strokeWidth="1.8" strokeLinecap="round">
            <path d="M2 5.2l2.2 2.2 3.8-4" />
          </svg>
        ) : (
          <svg width="6" height="6" viewBox="0 0 10 10" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.6" strokeLinecap="round">
            <rect x="2" y="4.5" width="6" height="4.5" rx="1" />
            <path d="M3.5 4.5V3a1.5 1.5 0 013 0v1.5" />
          </svg>
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11.5, fontFamily: SANS,
          color: target.unlocked ? FG : MUTED,
          fontWeight: target.unlocked ? 500 : 400,
          lineHeight: 1.35,
        }}>
          {target.label}
        </div>
        <div style={{
          fontSize: 10, fontFamily: MONO,
          color: MUTED, opacity: 0.45,
          letterSpacing: "0.02em", marginTop: 2,
          lineHeight: 1.35,
        }}>
          {target.reason}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type Props = {
  projectId: number | null;
  projectName?: string | null;
};

export function ManifestPanel({ projectId, projectName }: Props) {
  const { data, isLoading, isError } = useGetProjectManifest(
    projectId ?? 0,
    {
      query: {
        enabled: projectId !== null && projectId > 0,
        queryKey: getGetProjectManifestQueryKey(projectId ?? 0),
      },
    },
  );

  if (projectId === null || projectId <= 0) {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "32px 20px", textAlign: "center", gap: 10,
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--atlas-muted)" strokeWidth="1.2" strokeLinecap="round" style={{ opacity: 0.3 }}>
          <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M19.07 4.93l-2.83 2.83M7.76 16.24l-2.83 2.83" />
        </svg>
        <p style={{
          margin: 0, fontSize: 11.5, color: MUTED, opacity: 0.45,
          lineHeight: 1.55, fontFamily: SANS, fontStyle: "italic",
        }}>
          Open a project to see its Manifest.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
      }}>
        <div style={{
          width: 12, height: 12, borderRadius: "50%",
          border: "1.5px solid rgba(201,162,76,0.15)",
          borderTopColor: "rgba(201,162,76,0.6)",
          animation: "manifest-spin 0.9s linear infinite",
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: 10.5, fontFamily: MONO, color: MUTED,
          opacity: 0.45, letterSpacing: "0.08em",
        }}>
          Reading genome…
        </span>
        <style>{`@keyframes manifest-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "32px 20px", textAlign: "center",
      }}>
        <p style={{
          margin: 0, fontSize: 11, color: MUTED, opacity: 0.4,
          fontStyle: "italic", fontFamily: SANS,
        }}>
          Could not load manifest.
        </p>
      </div>
    );
  }

  const anchors = [
    data.anchors.coreIntent,
    data.anchors.surfaceStrategy,
    data.anchors.coreAudience,
    data.anchors.brandPosture,
  ];

  const unlockedCount = (data.buildTargets ?? []).filter(t => t.unlocked).length;
  const displayName = projectName ?? data.projectName;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Panel header */}
      <div style={{
        flexShrink: 0, padding: "0 14px", height: 44,
        display: "flex", alignItems: "center", gap: 8,
        borderBottom: `1px solid ${BORDER}`,
        background: "var(--atlas-surface-alt)",
      }}>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.8 }}>
          <circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 2" />
        </svg>
        <span style={{
          fontSize: 10, fontFamily: MONO, fontWeight: 700,
          letterSpacing: "0.14em", textTransform: "uppercase",
          color: GOLD, opacity: 0.85, flex: 1, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {displayName}
        </span>
        {data.lastExtractedAt && (
          <span style={{
            fontSize: 8.5, fontFamily: MONO, color: MUTED,
            opacity: 0.35, letterSpacing: "0.04em", flexShrink: 0,
          }}>
            {formatAgo(data.lastExtractedAt)}
          </span>
        )}
        {!data.lastExtractedAt && (
          <span style={{
            fontSize: 8.5, fontFamily: MONO, color: MUTED,
            opacity: 0.3, letterSpacing: "0.04em", flexShrink: 0,
          }}>
            raw
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto" }} className="scrollbar-none">

        {/* Confidence score */}
        <ConfidenceBar score={data.confidenceScore} />

        {/* Stage + open questions count */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "7px 14px", borderBottom: `1px solid ${BORDER}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, opacity: 0.4 }}>Stage</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: GOLD, opacity: 0.7, letterSpacing: "0.06em" }}>
              {data.stage}
            </span>
          </div>
          {(data.openQuestions ?? []).length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke={AMBER} strokeWidth="1.6" strokeLinecap="round" style={{ opacity: 0.65 }}>
                <circle cx="8" cy="8" r="6" /><path d="M8 5.5v.5m0 4v.5" />
              </svg>
              <span style={{ fontFamily: MONO, fontSize: 8.5, color: AMBER, opacity: 0.7, letterSpacing: "0.04em" }}>
                {data.openQuestions.length} open
              </span>
            </div>
          )}
        </div>

        {/* Section label: DNA Anchors */}
        <div style={{
          padding: "8px 14px 4px",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontFamily: MONO, fontSize: 7.5, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTED, opacity: 0.35 }}>
            DNA Anchors
          </span>
          <div style={{ flex: 1, height: 1, background: `${BORDER}` }} />
        </div>

        {/* 4 anchor cards */}
        {anchors.map((anchor, i) => (
          <AnchorCard key={i} anchor={anchor} />
        ))}

        {/* Section label: Build Targets */}
        {(data.buildTargets ?? []).length > 0 && (
          <>
            <div style={{
              padding: "8px 14px 4px", marginTop: 4,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ fontFamily: MONO, fontSize: 7.5, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTED, opacity: 0.35 }}>
                Build Targets
              </span>
              {unlockedCount > 0 && (
                <span style={{
                  fontFamily: MONO, fontSize: 7.5, letterSpacing: "0.06em",
                  color: GOLD, opacity: 0.65,
                  background: "rgba(201,162,76,0.08)",
                  border: "1px solid rgba(201,162,76,0.18)",
                  borderRadius: 4, padding: "1px 5px",
                }}>
                  {unlockedCount} unlocked
                </span>
              )}
              <div style={{ flex: 1, height: 1, background: BORDER }} />
            </div>

            <div style={{ paddingBottom: 12 }}>
              {(data.buildTargets ?? []).map(target => (
                <BuildTargetRow key={target.id} target={target} />
              ))}
            </div>
          </>
        )}

        {/* Open questions — shown if any */}
        {(data.openQuestions ?? []).length > 0 && (
          <>
            <div style={{
              padding: "8px 14px 4px", marginTop: 4,
              display: "flex", alignItems: "center", gap: 6,
              borderTop: `1px solid ${BORDER}`,
            }}>
              <span style={{ fontFamily: MONO, fontSize: 7.5, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTED, opacity: 0.35 }}>
                Open Questions
              </span>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
            </div>
            <div style={{ padding: "0 14px 16px", display: "flex", flexDirection: "column", gap: 5 }}>
              {(data.openQuestions ?? []).map((q, i) => (
                <div key={i} style={{
                  fontSize: 11, color: MUTED, lineHeight: 1.5, opacity: 0.6,
                  paddingLeft: 8,
                  borderLeft: "1px solid rgba(201,162,76,0.2)",
                  fontFamily: SANS,
                }}>
                  {q}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
