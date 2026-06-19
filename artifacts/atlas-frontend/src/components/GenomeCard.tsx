import { useEffect, useState, useCallback } from "react";

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
};

const STAGES = ["Think", "Shape", "Decide", "Workspace", "Strategize", "Build", "Operate", "Evolve"] as const;

const GOLD = "var(--atlas-gold)";
const MUTED = "var(--atlas-muted)";
const FG = "var(--atlas-fg)";
const BORDER = "var(--atlas-border)";
const MONO = "var(--app-font-mono)";

function StageBar({ stage }: { stage: string }) {
  const idx = STAGES.indexOf(stage as (typeof STAGES)[number]);
  const active = idx >= 0 ? idx : 0;

  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      {STAGES.map((s, i) => (
        <div
          key={s}
          title={s}
          style={{
            height: 3,
            flex: 1,
            borderRadius: 2,
            background: i <= active ? GOLD : "rgba(201,162,76,0.12)",
            opacity: i === active ? 1 : i < active ? 0.6 : 0.3,
            transition: "background 300ms",
          }}
        />
      ))}
    </div>
  );
}

function ConfidencePip({ score }: { score: number }) {
  const filled = Math.round((score / 100) * 5);
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: i < filled ? GOLD : "rgba(201,162,76,0.15)",
            transition: "background 300ms",
          }}
        />
      ))}
      <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, opacity: 0.55, marginLeft: 4 }}>
        {score}%
      </span>
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

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/genome`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      setGenome(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load genome");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  // Poll every 60 seconds
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

  const isEmpty = !genome?.purpose && !genome?.audience && (genome?.confidenceScore ?? 0) === 0;
  const hasContent = genome && !isEmpty;

  return (
    <div style={{
      marginBottom: 14,
      borderRadius: 10,
      border: `1px solid ${hasContent ? "rgba(201,162,76,0.18)" : BORDER}`,
      background: hasContent ? "rgba(201,162,76,0.025)" : "rgba(255,255,255,0.012)",
      overflow: "hidden",
      transition: "border-color 300ms, background 300ms",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 13px 8px",
        borderBottom: `1px solid ${hasContent ? "rgba(201,162,76,0.1)" : "rgba(255,255,255,0.04)"}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {hasContent && (
            <span style={{
              display: "inline-block", width: 5, height: 5, borderRadius: "50%",
              background: GOLD, flexShrink: 0,
              boxShadow: "0 0 6px rgba(201,162,76,0.5)",
            }} />
          )}
          <span style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: hasContent ? GOLD : MUTED,
            opacity: hasContent ? 0.8 : 0.4,
          }}>
            Genome
          </span>
          {hasContent && genome?.stage && (
            <span style={{
              fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.1em",
              color: MUTED, opacity: 0.5,
              textTransform: "uppercase",
            }}>
              · {genome.stage}
            </span>
          )}
        </div>

        {!loading && (
          <button
            onClick={triggerExtract}
            disabled={extracting}
            style={{
              background: "transparent", border: "none",
              fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.12em",
              textTransform: "uppercase", color: MUTED, opacity: extracting ? 0.3 : 0.45,
              cursor: extracting ? "default" : "pointer", padding: "2px 0",
            }}
          >
            {extracting ? "reading…" : "update"}
          </button>
        )}
      </div>

      <div style={{ padding: "10px 13px 12px" }}>
        {loading && (
          <div style={{ fontSize: 11, color: MUTED, opacity: 0.4, textAlign: "center", padding: "8px 0" }}>
            Loading…
          </div>
        )}

        {!loading && error && (
          <div style={{ fontSize: 11, color: MUTED, opacity: 0.4 }}>{error}</div>
        )}

        {!loading && !error && !hasContent && (
          <div style={{ fontSize: 11, color: MUTED, opacity: 0.4, lineHeight: 1.6 }}>
            Genome builds as you converse. Keep talking — Atlas listens.
          </div>
        )}

        {!loading && !error && hasContent && genome && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Stage bar + confidence */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <StageBar stage={genome.stage} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: MONO, fontSize: 8.5, color: MUTED, opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {genome.stage}
                </span>
                <ConfidencePip score={genome.confidenceScore} />
              </div>
            </div>

            {/* Purpose */}
            {genome.purpose && (
              <div>
                <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, opacity: 0.4, marginBottom: 3 }}>
                  Purpose
                </div>
                <div style={{ fontSize: 12, color: FG, lineHeight: 1.5, opacity: 0.88 }}>
                  {genome.purpose}
                </div>
              </div>
            )}

            {/* Audience */}
            {genome.audience && (
              <div>
                <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, opacity: 0.4, marginBottom: 3 }}>
                  Audience
                </div>
                <div style={{ fontSize: 12, color: FG, lineHeight: 1.5, opacity: 0.88 }}>
                  {genome.audience}
                </div>
              </div>
            )}

            {/* Core emotion */}
            {genome.coreEmotion && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, opacity: 0.4 }}>
                  Core
                </span>
                <span style={{
                  fontFamily: MONO, fontSize: 9.5, color: GOLD, opacity: 0.8,
                  background: "rgba(201,162,76,0.08)", padding: "2px 8px",
                  borderRadius: 4, border: "1px solid rgba(201,162,76,0.15)",
                }}>
                  {genome.coreEmotion}
                </span>
              </div>
            )}

            {/* Open questions */}
            {genome.openQuestions.length > 0 && (
              <div>
                <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, opacity: 0.4, marginBottom: 5 }}>
                  Open Questions
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {genome.openQuestions.slice(0, 2).map((q, i) => (
                    <div key={i} style={{
                      fontSize: 11, color: MUTED, lineHeight: 1.5, opacity: 0.75,
                      paddingLeft: 8,
                      borderLeft: "1px solid rgba(201,162,76,0.2)",
                    }}>
                      {q}
                    </div>
                  ))}
                  {genome.openQuestions.length > 2 && (
                    <div style={{ fontFamily: MONO, fontSize: 8.5, color: MUTED, opacity: 0.35, paddingLeft: 8 }}>
                      +{genome.openQuestions.length - 2} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
