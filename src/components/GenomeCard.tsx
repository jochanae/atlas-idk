import { useCallback, useEffect, useRef, useState } from "react";

const GOLD = "var(--atlas-gold)";
const MUTED = "var(--atlas-muted)";
const FG = "var(--atlas-fg)";
const BORDER = "var(--atlas-border)";
const MONO = "var(--app-font-mono)";

const STAGE_COLORS: Record<string, string> = {
  Think: "rgba(120,120,200,0.18)",
  Shape: "rgba(100,180,140,0.18)",
  Decide: "rgba(200,160,80,0.18)",
  Workspace: "rgba(80,160,200,0.18)",
  Strategize: "rgba(180,100,200,0.18)",
  Build: "rgba(80,200,120,0.18)",
  Operate: "rgba(200,100,80,0.18)",
  Evolve: "rgba(200,180,60,0.18)",
};

const STAGE_FG: Record<string, string> = {
  Think: "#8888cc",
  Shape: "#64b48c",
  Decide: "#c8a050",
  Workspace: "#50a0c8",
  Strategize: "#b464c8",
  Build: "#50c878",
  Operate: "#c86450",
  Evolve: "#c8b43c",
};

export type Genome = {
  id: number;
  projectId: number;
  purpose: string | null;
  coreEmotion: string | null;
  audience: string | null;
  identity: string | null;
  constraints: string[];
  openQuestions: string[];
  stage: string;
  confidenceScore: number;
  lastEvolvedAt: string | null;
  updatedAt: string;
};

export function GenomeCard({ projectId }: { projectId: number | string }) {
  const [genome, setGenome] = useState<Genome | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchGenome = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/genome`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setGenome(data as Genome);
    } catch {
      // non-fatal
    } finally {
      if (!silent) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchGenome();
    intervalRef.current = setInterval(() => void fetchGenome(true), 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchGenome]);

  const handleExtract = async () => {
    setExtracting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/genome/extract`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.genome) setGenome(data.genome as Genome);
    } catch {
      // non-fatal
    } finally {
      setExtracting(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        border: `1px solid ${BORDER}`, borderRadius: 10,
        padding: "14px 16px", marginBottom: 14,
        background: "rgba(255,255,255,0.015)",
        color: MUTED, fontFamily: MONO, fontSize: 11,
        letterSpacing: "0.08em",
      }}>
        Loading genome\u2026
      </div>
    );
  }

  if (!genome) return null;

  const hasData = genome.purpose || genome.audience || genome.openQuestions.length > 0;
  const stageColor = STAGE_COLORS[genome.stage] ?? "rgba(150,150,150,0.15)";
  const stageFg = STAGE_FG[genome.stage] ?? MUTED;
  const topQuestions = genome.openQuestions.slice(0, 2);

  return (
    <div style={{
      border: `1px solid ${BORDER}`, borderRadius: 10,
      marginBottom: 14, overflow: "hidden",
      background: "rgba(255,255,255,0.015)",
    }}>
      {/* Header row */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", cursor: "pointer",
          borderBottom: collapsed ? "none" : `1px solid ${BORDER}`,
        }}
        onClick={() => setCollapsed(c => !c)}
        role="button"
        aria-expanded={!collapsed}
      >
        <span style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: "0.2em",
          textTransform: "uppercase", color: GOLD, opacity: 0.85,
          flexShrink: 0,
        }}>
          Project DNA
        </span>

        <span style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em",
          textTransform: "uppercase",
          background: stageColor, color: stageFg,
          borderRadius: 999, padding: "2px 8px",
          border: `1px solid ${stageFg}44`,
          flexShrink: 0,
        }}>
          {genome.stage}
        </span>

        {genome.confidenceScore > 0 && (
          <span style={{
            fontFamily: MONO, fontSize: 9, color: MUTED,
            letterSpacing: "0.08em", flexShrink: 0,
          }}>
            {genome.confidenceScore}%
          </span>
        )}

        <span style={{ flex: 1 }} />

        <button
          onClick={e => { e.stopPropagation(); void handleExtract(); }}
          disabled={extracting}
          style={{
            background: "transparent", border: "none",
            color: MUTED, fontFamily: MONO, fontSize: 9,
            letterSpacing: "0.1em", textTransform: "uppercase",
            cursor: extracting ? "default" : "pointer",
            opacity: extracting ? 0.4 : 0.6, padding: "2px 4px",
            flexShrink: 0,
          }}
          title="Re-extract genome from conversation"
        >
          {extracting ? "Extracting\u2026" : "\u21bb Extract"}
        </button>

        <span style={{ color: MUTED, fontSize: 10, opacity: 0.5, flexShrink: 0 }}>
          {collapsed ? "\u25b8" : "\u25be"}
        </span>
      </div>

      {!collapsed && (
        <div style={{ padding: "12px 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {!hasData ? (
            <div style={{
              fontFamily: MONO, fontSize: 10, color: MUTED,
              letterSpacing: "0.08em", lineHeight: 1.5, opacity: 0.6,
            }}>
              No genome data yet. Chat with Atlas in this project to extract insights automatically.
            </div>
          ) : (
            <>
              {genome.purpose && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD, opacity: 0.7, marginBottom: 4 }}>
                    Purpose
                  </div>
                  <div style={{ fontSize: 13, color: FG, lineHeight: 1.55, opacity: 0.9 }}>
                    {genome.purpose}
                  </div>
                </div>
              )}

              {genome.audience && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD, opacity: 0.7, marginBottom: 4 }}>
                    Who it is for
                  </div>
                  <div style={{ fontSize: 12.5, color: FG, lineHeight: 1.5, opacity: 0.85 }}>
                    {genome.audience}
                  </div>
                </div>
              )}

              {genome.coreEmotion && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD, opacity: 0.7 }}>
                    Feeling
                  </div>
                  <span style={{
                    fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    background: "rgba(201,162,76,0.1)", color: GOLD,
                    borderRadius: 999, padding: "2px 9px",
                    border: "1px solid rgba(201,162,76,0.25)",
                  }}>
                    {genome.coreEmotion}
                  </span>
                </div>
              )}

              {topQuestions.length > 0 && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD, opacity: 0.7, marginBottom: 6 }}>
                    Open Questions
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
                    {topQuestions.map((q, i) => (
                      <li key={i} style={{
                        fontSize: 12, color: FG, lineHeight: 1.5, opacity: 0.8,
                        paddingLeft: 12, position: "relative",
                      }}>
                        <span style={{ position: "absolute", left: 0, color: MUTED, opacity: 0.6 }}>\u2022</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
