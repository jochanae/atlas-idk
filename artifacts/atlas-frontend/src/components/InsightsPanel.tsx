import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";

/**
 * InsightsPanel — v1 read-only intelligence surface.
 *
 * Replaces the legacy "Manifest" documentation slot with a living project
 * briefing composed from data Atlas already knows:
 *   - Atlas Summary (generated briefing — what Atlas thinks right now)
 *   - Atlas Confidence (four-dimension readiness)
 *   - Project DNA (purpose, audience, wedge, identity)
 *   - Manifest (vision-level: purpose + core emotion)
 *   - Major Decisions (committed ledger entries)
 *   - Open Questions / In Tension
 *   - Affects (Flow Map link)
 *
 * v2 will make this reasoning-layer (drift, risks, coaching, momentum).
 * v1 keeps it read-only from /api/projects/:id/intelligence.
 */

const SANS = "var(--app-font-sans)";
const MONO = "var(--app-font-mono)";
const FG = "var(--atlas-fg)";
const MUTED = "var(--atlas-muted)";
const BORDER = "var(--atlas-border)";
const GOLD = "rgba(201,162,76,0.9)";

interface Intelligence {
  projectName?: string | null;
  dna: {
    purpose: string | null;
    coreEmotion: string | null;
    audience: string | null;
    identity: string | null;
    wedge: string | null;
    differentiator: string | null;
    stage: string;
    constraints: string[];
    openQuestions: string[];
    confidenceScore: number;
  };
  health: {
    clarity: number;
    confidence: "Low" | "Medium" | "High";
    momentum: "Low" | "Medium" | "High";
    atlasState: string;
    risk: string | null;
    nextAction: string;
    evidence?: {
      conversationsLast7Days: number;
      openBlockers: number;
      openConstraints: number;
      openQuestions: number;
      confidenceScore: number;
    };
  };
  readiness: {
    overall: number;
    label: string;
    dimensions: Partial<Record<"build" | "strategy" | "activity" | "delivery", {
      score: number;
      label: string;
      applicable: boolean;
      evidence: string;
    }>>;
  };
  entries: {
    decisions: { id: number; title: string; summary: string | null; status: string; createdAt: string }[];
    openQuestionEntries: { id: number; title: string; summary: string | null; type: string; createdAt: string }[];
  };
  hasFlow: boolean;
}

// Map readiness dimensions → user-facing labels
const DIMENSION_LABEL: Record<string, string> = {
  strategy: "Vision",
  build: "Architecture",
  activity: "Workflow Understanding",
  delivery: "Build Readiness",
};

function stageArc(stage: string): string {
  const arcs: Record<string, string> = {
    Think: "shaping the idea",
    Shape: "defining the shape",
    Decide: "pressure-testing commitments",
    Workspace: "setting up execution",
    Strategize: "sequencing the plan",
    Build: "implementing",
    Operate: "running and learning",
    Evolve: "iterating on what works",
  };
  return arcs[stage] ?? "in motion";
}

function briefingLines(intel: Intelligence): string[] {
  const lines: string[] = [];
  const { dna, health, readiness, entries } = intel;

  // Where the project stands
  if (dna.stage) {
    lines.push(`You're in the ${dna.stage} phase — ${stageArc(dna.stage)}.`);
  }

  // Clarity read
  if (dna.confidenceScore >= 70) {
    lines.push(`The vision is stable (${dna.confidenceScore}% clarity).`);
  } else if (dna.confidenceScore >= 35) {
    lines.push(`The vision is taking shape (${dna.confidenceScore}% clarity) — worth another pass.`);
  } else if (dna.confidenceScore > 0) {
    lines.push(`The vision is still forming (${dna.confidenceScore}% clarity).`);
  }

  // Momentum
  const conv = health.evidence?.conversationsLast7Days ?? 0;
  if (health.momentum === "High") {
    lines.push(`Momentum is strong — ${conv} conversations in the last 7 days.`);
  } else if (health.momentum === "Medium") {
    lines.push(`Momentum is steady (${conv} recent conversations).`);
  } else if (conv === 0) {
    lines.push(`Nothing new in the last 7 days — the thread's gone quiet.`);
  } else {
    lines.push(`Momentum is light — only ${conv} recent conversation${conv === 1 ? "" : "s"}.`);
  }

  // Risk / tension
  if (health.risk) {
    lines.push(`Watching: ${health.risk}.`);
  }

  // Open questions
  const openQ = dna.openQuestions.length + entries.openQuestionEntries.length;
  if (openQ > 0) {
    lines.push(`${openQ} open question${openQ === 1 ? "" : "s"} still in tension.`);
  }

  // Committed decisions
  if (entries.decisions.length > 0) {
    lines.push(`${entries.decisions.length} decision${entries.decisions.length === 1 ? "" : "s"} committed.`);
  }

  // Next action
  if (health.nextAction) {
    lines.push(`Next: ${health.nextAction}`);
  }

  return lines;
}

export function InsightsPanel({ projectId, onOpenFlow }: { projectId: number | null; onOpenFlow?: () => void }) {
  const [, setLocation] = useLocation();
  const [intel, setIntel] = useState<Intelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explainDim, setExplainDim] = useState<null | { key: string; label: string; score: number; note: string; evidence: string; applicable: boolean }>(null);



  useEffect(() => {
    if (!projectId) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/projects/${projectId}/intelligence`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Intelligence>;
      })
      .then((d) => setIntel(d))
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Failed to load insights");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [projectId]);

  const briefing = useMemo(() => (intel ? briefingLines(intel) : []), [intel]);

  if (!projectId) {
    return (
      <PanelShell>
        <EmptyState>Open a project to see its Insights.</EmptyState>
      </PanelShell>
    );
  }

  if (loading && !intel) {
    return (
      <PanelShell>
        <EmptyState>Reading the project…</EmptyState>
      </PanelShell>
    );
  }

  if (error && !intel) {
    return (
      <PanelShell>
        <EmptyState>Couldn't load Insights — {error}</EmptyState>
      </PanelShell>
    );
  }

  if (!intel) return <PanelShell><EmptyState>No insights yet.</EmptyState></PanelShell>;

  const { dna, health, readiness, entries, hasFlow } = intel;

  return (
    <PanelShell>
      {/* Header */}
      <div style={{ padding: "18px 18px 8px" }}>
        <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: GOLD, fontFamily: MONO }}>
          Insights
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, color: FG, marginTop: 4, fontFamily: SANS, letterSpacing: -0.01 }}>
          {intel.projectName ?? "This project"}
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4, fontFamily: SANS }}>
          What Atlas thinks is happening right now.
        </div>
      </div>

      {/* Atlas Summary */}
      <Section title="Atlas's perspective">
        <div style={{
          borderLeft: `2px solid ${GOLD}`,
          paddingLeft: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}>
          {briefing.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 13, fontFamily: SANS, margin: 0 }}>
              Not enough context yet — keep the conversation going.
            </p>
          ) : (
            briefing.map((line, i) => (
              <p key={i} style={{
                color: i === 0 ? FG : MUTED,
                fontSize: 13,
                lineHeight: 1.55,
                fontFamily: SANS,
                margin: 0,
              }}>
                {line}
              </p>
            ))
          )}
        </div>
      </Section>

      {/* Atlas Confidence */}
      <Section title="Atlas confidence" trailing={
        <button
          onClick={() => setExplainDim({ key: "__overall", label: "Build readiness overall", score: readiness.overall, note: readiness.label, evidence: "", applicable: true })}
          style={{ background: "transparent", border: "none", color: GOLD, fontFamily: SANS, fontSize: 11, cursor: "pointer", padding: 0 }}
        >
          Explain
        </button>
      }>
        <ConfidenceGrid dimensions={readiness.dimensions} clarity={health.clarity} onExplain={setExplainDim} />
      </Section>


      {/* Project DNA */}
      <Section title="Project DNA">
        <DnaGrid dna={dna} />
      </Section>

      {/* Manifest (vision + emotion) */}
      {(dna.purpose || dna.coreEmotion || dna.differentiator) && (
        <Section title="Manifest">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dna.purpose && <FieldBlock label="Purpose" value={dna.purpose} />}
            {dna.coreEmotion && <FieldBlock label="Core emotion" value={dna.coreEmotion} />}
            {dna.differentiator && <FieldBlock label="Differentiator" value={dna.differentiator} />}
          </div>
        </Section>
      )}

      {/* Major Decisions */}
      <Section title={`Major decisions${entries.decisions.length ? ` · ${entries.decisions.length}` : ""}`}>
        {entries.decisions.length === 0 ? (
          <EmptyLine>No committed decisions yet.</EmptyLine>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {entries.decisions.slice(0, 6).map((d) => (
              <EntryRow key={d.id} title={d.title} summary={d.summary} status={d.status} />
            ))}
          </ul>
        )}
      </Section>

      {/* Open Questions / In Tension */}
      <Section title="Open questions">
        {dna.openQuestions.length === 0 && entries.openQuestionEntries.length === 0 ? (
          <EmptyLine>Nothing unresolved.</EmptyLine>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {dna.openQuestions.map((q, i) => (
              <QuestionRow key={`g-${i}`} text={q} />
            ))}
            {entries.openQuestionEntries.slice(0, 6).map((e) => (
              <QuestionRow key={`e-${e.id}`} text={e.title} />
            ))}
          </ul>
        )}
      </Section>

      {/* Affects — Flow Map link */}
      <Section title="Affects">
        <button
          onClick={() => (onOpenFlow ? onOpenFlow() : setLocation("/map"))}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "12px 14px",
            background: "transparent",
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            cursor: "pointer",
            color: FG,
            fontFamily: SANS,
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            {hasFlow ? "Open the Flow Map to see what depends on what" : "No flow mapped yet — start one"}
          </span>
          <span style={{ color: MUTED, fontSize: 11 }}>→</span>
        </button>
      </Section>

      <div style={{ height: 24 }} />
    </PanelShell>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      overflowX: "hidden",
      background: "var(--atlas-bg)",
      color: FG,
      WebkitOverflowScrolling: "touch",
    }}>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: "14px 18px", borderTop: `1px solid ${BORDER}` }}>
      <div style={{
        fontSize: 10,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: MUTED,
        fontFamily: MONO,
        marginBottom: 10,
      }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: 32,
      textAlign: "center",
      color: MUTED,
      fontSize: 13,
      fontFamily: SANS,
    }}>{children}</div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p style={{ color: MUTED, fontSize: 12.5, fontFamily: SANS, margin: 0, fontStyle: "italic" }}>{children}</p>;
}

function ConfidenceGrid({
  dimensions,
  clarity,
}: {
  dimensions: Intelligence["readiness"]["dimensions"];
  clarity: number;
}) {
  const rows: { key: string; label: string; score: number; note: string }[] = [];

  // Add clarity first as Vision if strategy dimension is missing
  const strategyDim = dimensions.strategy;
  const buildDim = dimensions.build;
  const activityDim = dimensions.activity;
  const deliveryDim = dimensions.delivery;

  if (strategyDim?.applicable) {
    rows.push({ key: "strategy", label: DIMENSION_LABEL.strategy, score: strategyDim.score, note: strategyDim.label });
  } else {
    rows.push({ key: "strategy", label: DIMENSION_LABEL.strategy, score: clarity, note: clarity >= 70 ? "Stable" : clarity >= 35 ? "Taking shape" : "Forming" });
  }
  if (buildDim?.applicable) {
    rows.push({ key: "build", label: DIMENSION_LABEL.build, score: buildDim.score, note: buildDim.label });
  }
  if (activityDim?.applicable) {
    rows.push({ key: "activity", label: DIMENSION_LABEL.activity, score: activityDim.score, note: activityDim.label });
  }
  if (deliveryDim?.applicable) {
    rows.push({ key: "delivery", label: DIMENSION_LABEL.delivery, score: deliveryDim.score, note: deliveryDim.label });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 12.5, color: FG, fontFamily: SANS }}>{r.label}</span>
            <span style={{ fontSize: 12, color: GOLD, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
              {Math.round(r.score)}%
            </span>
          </div>
          <div style={{
            height: 3,
            borderRadius: 2,
            background: "color-mix(in oklab, var(--atlas-fg) 8%, transparent)",
            overflow: "hidden",
          }}>
            <div style={{
              width: `${Math.min(100, Math.max(0, r.score))}%`,
              height: "100%",
              background: GOLD,
              transition: "width 400ms var(--ease-standard, ease)",
            }} />
          </div>
          <span style={{ fontSize: 11, color: MUTED, fontFamily: SANS }}>{r.note}</span>
        </div>
      ))}
    </div>
  );
}

function DnaGrid({ dna }: { dna: Intelligence["dna"] }) {
  const items: { label: string; value: string | null }[] = [
    { label: "Purpose", value: dna.purpose },
    { label: "Audience", value: dna.audience },
    { label: "Identity", value: dna.identity },
    { label: "Wedge", value: dna.wedge },
  ];
  const known = items.filter((i) => i.value);
  if (known.length === 0) return <EmptyLine>DNA still forming.</EmptyLine>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {known.map((i) => (
        <FieldBlock key={i.label} label={i.label} value={i.value ?? ""} />
      ))}
    </div>
  );
}

function FieldBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: MUTED, fontFamily: MONO, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: FG, fontFamily: SANS, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

function EntryRow({ title, summary, status }: { title: string; summary: string | null; status: string }) {
  return (
    <li style={{
      padding: "10px 12px",
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      background: "color-mix(in oklab, var(--atlas-fg) 2%, transparent)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 13, color: FG, fontFamily: SANS, fontWeight: 500 }}>{title}</span>
        <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO, textTransform: "uppercase", letterSpacing: 0.8 }}>
          {status}
        </span>
      </div>
      {summary && (
        <div style={{ fontSize: 12, color: MUTED, fontFamily: SANS, marginTop: 4, lineHeight: 1.5 }}>{summary}</div>
      )}
    </li>
  );
}

function QuestionRow({ text }: { text: string }) {
  return (
    <li style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      fontSize: 12.5,
      color: FG,
      fontFamily: SANS,
      lineHeight: 1.5,
    }}>
      <span style={{ color: GOLD, marginTop: 2 }}>?</span>
      <span>{text}</span>
    </li>
  );
}

export default InsightsPanel;
