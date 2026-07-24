import { useEffect, useState, useCallback } from "react";

export type AtlasState = "Discovering" | "Pressure Testing" | "Structuring" | "Building" | "Operating";

export type ProjectHealth = {
  clarity: number;
  momentum: "Low" | "Medium" | "High";
  confidence: "Low" | "Medium" | "High";
  risk: string | null;
  nextAction: string;
  atlasState?: AtlasState;
};

export type ProjectGenome = {
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
  lastExtractedAt: string | null;
  createdAt: string;
  updatedAt: string;
  health: ProjectHealth;
};

const GOLD = "var(--atlas-gold)";
const MUTED = "var(--atlas-muted)";
const FG = "var(--atlas-fg)";
const BORDER = "var(--atlas-border)";
const MONO = "var(--app-font-mono)";
const GREEN = "#4ade80";
const AMBER = "#f59e0b";

function momentumColor(m: ProjectHealth["momentum"]): string {
  if (m === "High") return GREEN;
  if (m === "Medium") return AMBER;
  return "rgba(255,255,255,0.3)";
}

function confidenceColor(c: ProjectHealth["confidence"]): string {
  if (c === "High") return GREEN;
  if (c === "Medium") return AMBER;
  return "rgba(255,255,255,0.3)";
}

function clarityColor(pct: number): string {
  if (pct >= 70) return GREEN;
  if (pct >= 35) return AMBER;
  return "rgba(255,255,255,0.3)";
}

function HealthMetric({
  label, value, color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{
        fontFamily: MONO, fontSize: 8, letterSpacing: "0.16em",
        textTransform: "uppercase", color: MUTED, opacity: 0.4,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: MONO, fontSize: 12, fontWeight: 600,
        color: color ?? FG, opacity: color ? 1 : 0.85,
        letterSpacing: "0.04em",
      }}>
        {value}
      </span>
    </div>
  );
}

function HealthPanel({ health }: { health: ProjectHealth }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Metrics only — Phase B: no Joy State / Stage track (process theater) */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <HealthMetric label="Clarity" value={`${health.clarity}%`} color={clarityColor(health.clarity)} />
        <HealthMetric label="Momentum" value={health.momentum} color={momentumColor(health.momentum)} />
        <HealthMetric label="Confidence" value={health.confidence} color={confidenceColor(health.confidence)} />
      </div>

      {/* Risk — work language only */}
      {health.risk && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED, opacity: 0.4, flexShrink: 0 }}>
            Risk
          </span>
          <span style={{ fontSize: 11, color: "rgba(251,146,60,0.85)", lineHeight: 1.4, opacity: 0.9 }}>
            {health.risk}
          </span>
        </div>
      )}

      {/* Open tension — real work observation only; omit when empty (no Mad Lib homework) */}
      {health.nextAction?.trim() ? (
        <div style={{
          padding: "8px 10px",
          borderRadius: 6,
          border: "1px solid rgba(201,162,76,0.2)",
          background: "rgba(201,162,76,0.04)",
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD, opacity: 0.55 }}>
            Open
          </span>
          <span style={{ fontSize: 11.5, color: FG, lineHeight: 1.5, opacity: 0.9 }}>
            {health.nextAction}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function GenomeDetails({ genome }: { genome: ProjectGenome }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {genome.purpose && (
        <div>
          <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, opacity: 0.35, marginBottom: 3 }}>
            Purpose
          </div>
          <div style={{ fontSize: 11.5, color: FG, lineHeight: 1.5, opacity: 0.82 }}>
            {genome.purpose}
          </div>
        </div>
      )}

      {genome.audience && (
        <div>
          <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, opacity: 0.35, marginBottom: 3 }}>
            For
          </div>
          <div style={{ fontSize: 11.5, color: FG, lineHeight: 1.5, opacity: 0.82 }}>
            {genome.audience}
          </div>
        </div>
      )}

      {genome.coreEmotion && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, opacity: 0.35 }}>
            Core
          </span>
          <span style={{
            fontFamily: MONO, fontSize: 9, color: GOLD, opacity: 0.75,
            background: "rgba(201,162,76,0.08)", padding: "2px 7px",
            borderRadius: 4, border: "1px solid rgba(201,162,76,0.12)",
          }}>
            {genome.coreEmotion}
          </span>
        </div>
      )}

      {genome.openQuestions.length > 0 && (
        <div>
          <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, opacity: 0.35, marginBottom: 5 }}>
            Open Questions
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {genome.openQuestions.slice(0, 2).map((q, i) => (
              <div key={i} style={{
                fontSize: 11, color: MUTED, lineHeight: 1.5, opacity: 0.7,
                paddingLeft: 8,
                borderLeft: "1px solid rgba(201,162,76,0.18)",
              }}>
                {q}
              </div>
            ))}
            {genome.openQuestions.length > 2 && (
              <div style={{ fontFamily: MONO, fontSize: 8, color: MUTED, opacity: 0.3, paddingLeft: 8 }}>
                +{genome.openQuestions.length - 2} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function GenomeCard({
  projectId,
  refreshKey,
}: {
  projectId: number | string;
  refreshKey?: number;
}) {
  const [genome, setGenome] = useState<ProjectGenome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/genome`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      setGenome(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  useEffect(() => {
    const t = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const triggerExtract = async () => {
    if (extracting) return;
    setExtracting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/genome/extract`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.genome) setGenome(data.genome);
      }
    } catch { /* non-fatal */ } finally {
      setExtracting(false);
    }
  };

  const hasHealth = genome && (
    genome.health.clarity > 0 ||
    genome.purpose ||
    genome.confidenceScore > 0
  );

  return (
    <div style={{
      marginBottom: 14,
      borderRadius: 10,
      border: `1px solid ${hasHealth ? "rgba(201,162,76,0.2)" : BORDER}`,
      background: hasHealth ? "rgba(201,162,76,0.02)" : "rgba(255,255,255,0.012)",
      overflow: "hidden",
      transition: "border-color 300ms, background 300ms",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "9px 12px 8px",
        borderBottom: `1px solid ${hasHealth ? "rgba(201,162,76,0.1)" : "rgba(255,255,255,0.04)"}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {hasHealth && (
            <span style={{
              display: "inline-block", width: 5, height: 5, borderRadius: "50%",
              background: GOLD, flexShrink: 0,
              boxShadow: "0 0 6px rgba(201,162,76,0.5)",
            }} />
          )}
          <span style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: hasHealth ? GOLD : MUTED,
            opacity: hasHealth ? 0.75 : 0.35,
          }}>
            Project Health
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {hasHealth && (
            <button
              onClick={() => setShowDetails(d => !d)}
              style={{
                background: "transparent", border: "none",
                fontFamily: MONO, fontSize: 8, letterSpacing: "0.12em",
                textTransform: "uppercase", color: MUTED, opacity: 0.35,
                cursor: "pointer", padding: "2px 0",
              }}
            >
              {showDetails ? "less" : "details"}
            </button>
          )}
          {!loading && (
            <button
              onClick={triggerExtract}
              disabled={extracting}
              style={{
                background: "transparent", border: "none",
                fontFamily: MONO, fontSize: 8, letterSpacing: "0.12em",
                textTransform: "uppercase", color: MUTED, opacity: extracting ? 0.25 : 0.4,
                cursor: extracting ? "default" : "pointer", padding: "2px 0",
              }}
            >
              {extracting ? "reading…" : "sync"}
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: "10px 12px 12px" }}>
        {loading && (
          <div style={{ fontSize: 11, color: MUTED, opacity: 0.35, textAlign: "center", padding: "8px 0" }}>
            Loading…
          </div>
        )}

        {!loading && error && (
          <div style={{ fontSize: 11, color: MUTED, opacity: 0.35 }}>{error}</div>
        )}

        {!loading && !error && !hasHealth && (
          <div style={{ fontSize: 11, color: MUTED, opacity: 0.35, lineHeight: 1.6 }}>
            Health builds as you work. Keep going — Joy is learning.
          </div>
        )}

        {!loading && !error && hasHealth && genome && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <HealthPanel health={genome.health} />

            {showDetails && (genome.purpose || genome.audience || genome.coreEmotion || genome.openQuestions.length > 0) && (
              <div style={{
                paddingTop: 10,
                borderTop: "1px solid rgba(255,255,255,0.05)",
              }}>
                <GenomeDetails genome={genome} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
