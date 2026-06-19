import { useEffect, useState, useCallback } from "react";
import { API_BASE } from "@/lib/api";

const GOLD = "var(--atlas-gold)";
const MUTED = "var(--atlas-muted)";
const FG = "var(--atlas-fg)";
const MONO = "var(--app-font-mono)";
const BORDER = "var(--atlas-border)";
const GREEN = "#4ade80";
const AMBER = "#f59e0b";

type AtlasState = "Discovering" | "Pressure Testing" | "Structuring" | "Building" | "Operating";

type ProjectHealthSummary = {
  projectId: number;
  projectName: string;
  updatedAt: string;
  stage: string;
  atlasState: AtlasState;
  momentum: "Low" | "Medium" | "High";
  clarity: number;
  confidence: "Low" | "Medium" | "High";
  risk: string | null;
  nextAction: string;
};

const STATE_COLOR: Record<AtlasState, string> = {
  "Discovering":      "rgba(99,212,221,0.8)",
  "Pressure Testing": AMBER,
  "Structuring":      "rgba(167,139,250,0.85)",
  "Building":         GREEN,
  "Operating":        GOLD,
};

function momentumColor(m: string): string {
  if (m === "High") return GREEN;
  if (m === "Medium") return AMBER;
  return "rgba(255,255,255,0.3)";
}

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

function SkeletonCard() {
  return (
    <div style={{
      padding: "14px 14px", borderRadius: 10,
      border: `1px solid ${BORDER}`,
      background: "rgba(255,255,255,0.01)",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {[80, 60, 90].map((w, i) => (
        <div key={i} style={{
          height: i === 0 ? 13 : 11,
          width: `${w}%`,
          borderRadius: 4,
          background: "rgba(255,255,255,0.06)",
          animation: "phd-pulse 1.4s ease-in-out infinite",
          animationDelay: `${i * 120}ms`,
        }} />
      ))}
    </div>
  );
}

function ProjectHealthCard({
  p,
  onOpen,
}: {
  p: ProjectHealthSummary;
  onOpen: (id: number) => void;
}) {
  const stateColor = STATE_COLOR[p.atlasState] ?? GOLD;
  const mColor = momentumColor(p.momentum);

  return (
    <button
      type="button"
      onClick={() => onOpen(p.projectId)}
      style={{
        display: "flex", flexDirection: "column", gap: 9,
        width: "100%", padding: "13px 14px", borderRadius: 10,
        border: `1px solid ${BORDER}`,
        background: "rgba(255,255,255,0.012)",
        cursor: "pointer", textAlign: "left",
        transition: "border-color 150ms, background 150ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(201,162,76,0.25)";
        e.currentTarget.style.background = "rgba(201,162,76,0.03)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = BORDER;
        e.currentTarget.style.background = "rgba(255,255,255,0.012)";
      }}
    >
      {/* Row 1: name + age */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{
          fontSize: 13, fontWeight: 600, color: FG, lineHeight: 1.3,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontFamily: "var(--app-font-sans)",
        }}>
          {p.projectName}
        </span>
        <span style={{
          fontSize: 9.5, fontFamily: MONO, color: MUTED, opacity: 0.4,
          flexShrink: 0, letterSpacing: "0.04em",
        }}>
          {formatRelative(p.updatedAt)}
        </span>
      </div>

      {/* Row 2: Atlas State + Momentum + Clarity */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* State chip */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: stateColor,
            boxShadow: `0 0 5px ${stateColor}`,
          }} />
          <span style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: "0.07em",
            color: stateColor, fontWeight: 600,
          }}>
            {p.atlasState}
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 10, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />

        {/* Momentum */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, opacity: 0.4 }}>
            Momentum
          </span>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, color: mColor, letterSpacing: "0.04em" }}>
            {p.momentum}
          </span>
        </div>

        {/* Clarity */}
        {p.clarity > 0 && (
          <>
            <div style={{ width: 1, height: 10, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, opacity: 0.4 }}>
                Clarity
              </span>
              <span style={{
                fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: "0.04em",
                color: p.clarity >= 70 ? GREEN : p.clarity >= 35 ? AMBER : "rgba(255,255,255,0.35)",
              }}>
                {p.clarity}%
              </span>
            </div>
          </>
        )}
      </div>

      {/* Row 3: Next action */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 6,
        paddingTop: 2,
        borderTop: "1px solid rgba(255,255,255,0.04)",
      }}>
        <span style={{
          fontFamily: MONO, fontSize: 8.5, color: GOLD, opacity: 0.5,
          flexShrink: 0, paddingTop: 1, letterSpacing: "0.04em",
        }}>
          →
        </span>
        <span style={{
          fontSize: 11.5, color: FG, opacity: 0.7, lineHeight: 1.45,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {p.nextAction}
        </span>
      </div>
    </button>
  );
}

export function PortfolioHealthDashboard({
  onOpenProject,
}: {
  onOpenProject: (id: number) => void;
}) {
  const [projects, setProjects] = useState<ProjectHealthSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/portfolio/health`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as ProjectHealthSummary[];
      setProjects(data);
    } catch (e) {
      setError("Could not load portfolio health");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="atlas-discovery-card" style={{ padding: "16px 16px 14px" }}>
      <style>{`
        @keyframes phd-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.9; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{
          margin: 0, fontSize: 9.5, fontWeight: 600,
          fontFamily: MONO, color: FG,
          letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7,
        }}>
          Portfolio Health
        </h3>
        {projects && projects.length > 0 && (
          <span style={{
            fontFamily: MONO, fontSize: 8.5, color: MUTED, opacity: 0.4,
            letterSpacing: "0.08em",
          }}>
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Loading */}
      {projects === null && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Error */}
      {error && (
        <p style={{ margin: 0, fontSize: 11, color: MUTED, opacity: 0.5, fontStyle: "italic" }}>
          {error}
        </p>
      )}

      {/* Empty */}
      {projects && projects.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: MUTED, opacity: 0.5, lineHeight: 1.6 }}>
          No projects yet. Start a conversation to create your first one.
        </p>
      )}

      {/* Cards */}
      {projects && projects.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {projects.map(p => (
            <ProjectHealthCard key={p.projectId} p={p} onOpen={onOpenProject} />
          ))}
        </div>
      )}
    </div>
  );
}
