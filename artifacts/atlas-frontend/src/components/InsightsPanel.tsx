import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  stack?: ProjectStackSummary | null;
}

interface ProjectStackSummary {
  frontend: string | null;
  backend: string | null;
  database: string | null;
  hosting: string | null;
  auth: string | null;
  integrations: string[];
  repo: string | null;
  language: string | null;
  packageManager: string | null;
  lastUpdatedAt: string | null;
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

      {/* Stack */}
      <Section title="Stack">
        <StackBlock stack={intel.stack ?? null} />
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
      {explainDim && (
        <ReadinessDrawer
          row={explainDim}
          intel={intel}
          onClose={() => setExplainDim(null)}
        />
      )}
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

function Section({ title, children, trailing }: { title: string; children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <section style={{ padding: "14px 18px", borderTop: `1px solid ${BORDER}` }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: 10,
      }}>
        <div style={{
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: MUTED,
          fontFamily: MONO,
        }}>
          {title}
        </div>
        {trailing}
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

type ExplainRow = { key: string; label: string; score: number; note: string; evidence: string; applicable: boolean };

function ConfidenceGrid({
  dimensions,
  clarity,
  onExplain,
}: {
  dimensions: Intelligence["readiness"]["dimensions"];
  clarity: number;
  onExplain: (row: ExplainRow) => void;
}) {
  const rows: ExplainRow[] = [];

  const strategyDim = dimensions.strategy;
  const buildDim = dimensions.build;
  const activityDim = dimensions.activity;
  const deliveryDim = dimensions.delivery;

  if (strategyDim?.applicable) {
    rows.push({ key: "strategy", label: DIMENSION_LABEL.strategy, score: strategyDim.score, note: strategyDim.label, evidence: strategyDim.evidence ?? "", applicable: true });
  } else {
    rows.push({ key: "strategy", label: DIMENSION_LABEL.strategy, score: clarity, note: clarity >= 70 ? "Stable" : clarity >= 35 ? "Taking shape" : "Forming", evidence: `Clarity score ${clarity}% from Project DNA.`, applicable: true });
  }
  if (buildDim?.applicable) {
    rows.push({ key: "build", label: DIMENSION_LABEL.build, score: buildDim.score, note: buildDim.label, evidence: buildDim.evidence ?? "", applicable: true });
  }
  if (activityDim?.applicable) {
    rows.push({ key: "activity", label: DIMENSION_LABEL.activity, score: activityDim.score, note: activityDim.label, evidence: activityDim.evidence ?? "", applicable: true });
  }
  if (deliveryDim?.applicable) {
    rows.push({ key: "delivery", label: DIMENSION_LABEL.delivery, score: deliveryDim.score, note: deliveryDim.label, evidence: deliveryDim.evidence ?? "", applicable: true });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((r) => (
        <button
          key={r.key}
          onClick={() => onExplain(r)}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "8px 10px",
            margin: "0 -10px",
            background: "transparent",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            textAlign: "left",
            fontFamily: SANS,
            color: FG,
            WebkitTapHighlightColor: "transparent",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in oklab, var(--atlas-fg) 4%, transparent)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          aria-label={`Explain ${r.label}`}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 12.5, color: FG, fontFamily: SANS, display: "inline-flex", alignItems: "center", gap: 6 }}>
              {r.label}
              <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO }}>ⓘ</span>
            </span>
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
        </button>
      ))}
    </div>
  );
}



function DnaGrid({ dna }: { dna: Intelligence["dna"] }) {
  const items: { label: string; value: string | null; help: string; missingHint: string }[] = [
    {
      label: "Purpose",
      value: dna.purpose,
      help: "The core reason this project exists — the problem it solves and why it matters.",
      missingHint: "Tell Atlas what problem this solves and who feels it most.",
    },
    {
      label: "Audience",
      value: dna.audience,
      help: "Who this is built for — the specific person or group who benefits most.",
      missingHint: "Name the audience out loud in a conversation with Atlas.",
    },
    {
      label: "Identity",
      value: dna.identity,
      help: "What kind of product this is — the category, tone, or archetype it embodies.",
      missingHint: "Describe how you'd introduce this project in one sentence.",
    },
    {
      label: "Wedge",
      value: dna.wedge,
      help: "The sharp angle or insight that makes this different from anything else.",
      missingHint: "Talk through what only you can build here, or what others get wrong.",
    },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((i) => (
        <FieldBlock key={i.label} label={i.label} value={i.value ?? ""} help={i.help} missingHint={i.missingHint} />
      ))}
    </div>
  );
}

function FieldBlock({
  label,
  value,
  help,
  missingHint,
}: {
  label: string;
  value: string;
  help?: string;
  missingHint?: string;
}) {
  const isEmpty = !value;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: MUTED, fontFamily: MONO }}>
          {label}
        </span>
        {help && <HelpDot label={label} help={help} missingHint={isEmpty ? missingHint : undefined} />}
      </div>
      {isEmpty ? (
        <div style={{ fontSize: 13, color: MUTED, fontFamily: SANS, lineHeight: 1.5, fontStyle: "italic" }}>
          Not captured yet
        </div>
      ) : (
        <div style={{ fontSize: 13, color: FG, fontFamily: SANS, lineHeight: 1.5 }}>{value}</div>
      )}
    </div>
  );
}

function HelpDot({ label, help, missingHint }: { label: string; help: string; missingHint?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What is ${label}?`}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            border: `1px solid ${BORDER}`,
            background: "transparent",
            color: MUTED,
            fontFamily: MONO,
            fontSize: 10,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          ?
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        style={{
          width: 260,
          padding: 12,
          background: "var(--atlas-bg)",
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          fontFamily: SANS,
          zIndex: 220,
        }}
      >
        <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: GOLD, fontFamily: MONO, marginBottom: 6 }}>
          {label}
        </div>
        <div style={{ fontSize: 12.5, color: FG, lineHeight: 1.5 }}>{help}</div>
        {missingHint && (
          <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
            <span style={{ color: GOLD, fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
              How to fill this
            </span>
            {missingHint}
          </div>
        )}
      </PopoverContent>
    </Popover>
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


// ── Explain Build Readiness drawer ───────────────────────────────────────────

function ReadinessDrawer({
  row,
  intel,
  onClose,
}: {
  row: ExplainRow;
  intel: Intelligence;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const isOverall = row.key === "__overall";
  const observations = isOverall ? buildOverallObservations(intel) : buildDimensionObservations(row, intel);
  const missing = isOverall ? buildOverallMissing(intel) : buildDimensionMissing(row, intel);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in oklab, #000 55%, transparent)",
        zIndex: 200,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Explain ${row.label}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "82vh",
          background: "var(--atlas-bg)",
          borderTop: `1px solid ${BORDER}`,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          boxShadow: "0 -12px 40px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "color-mix(in oklab, var(--atlas-fg) 18%, transparent)" }} />
        </div>

        <div style={{ padding: "8px 20px 14px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: MUTED, fontFamily: MONO, marginBottom: 4 }}>
                Why this score
              </div>
              <div style={{ fontSize: 16, color: FG, fontFamily: SANS, fontWeight: 500 }}>{row.label}</div>
            </div>
            <div style={{ fontSize: 22, color: GOLD, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
              {Math.round(row.score)}%
            </div>
          </div>
          {row.note && (
            <div style={{ fontSize: 12, color: MUTED, fontFamily: SANS, marginTop: 6 }}>{row.note}</div>
          )}
        </div>

        <div style={{ overflowY: "auto", padding: "16px 20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          <DrawerBlock title="What Atlas is seeing" items={observations} emptyText="No observations recorded yet." />
          <DrawerBlock title="What would raise this" items={missing} emptyText="Nothing missing — this dimension is solid." accent="warn" />
        </div>

        <div style={{ padding: "10px 20px 14px", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: `1px solid ${BORDER}`,
              color: FG,
              fontFamily: SANS,
              fontSize: 12.5,
              padding: "8px 14px",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DrawerBlock({
  title,
  items,
  emptyText,
  accent,
}: {
  title: string;
  items: string[];
  emptyText: string;
  accent?: "warn";
}) {
  const dotColor = accent === "warn" ? "rgba(201,162,76,0.9)" : "color-mix(in oklab, var(--atlas-fg) 50%, transparent)";
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: MUTED, fontFamily: MONO, marginBottom: 8 }}>
        {title}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: MUTED, fontFamily: SANS, fontStyle: "italic" }}>{emptyText}</div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((t, i) => (
            <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: FG, fontFamily: SANS, lineHeight: 1.5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0, marginTop: 7 }} />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function buildDimensionObservations(row: ExplainRow, intel: Intelligence): string[] {
  const out: string[] = [];
  if (row.evidence) out.push(row.evidence);
  const ev = intel.health.evidence;
  if (row.key === "activity" && ev) {
    out.push(`${ev.conversationsLast7Days} conversation${ev.conversationsLast7Days === 1 ? "" : "s"} in the last 7 days.`);
    if (ev.openBlockers > 0) out.push(`${ev.openBlockers} open blocker${ev.openBlockers === 1 ? "" : "s"} in the ledger.`);
  }
  if (row.key === "strategy") {
    out.push(`DNA clarity score: ${intel.dna.confidenceScore}%.`);
    const filled = [intel.dna.purpose, intel.dna.audience, intel.dna.wedge, intel.dna.identity, intel.dna.differentiator].filter(Boolean).length;
    out.push(`${filled} of 5 core DNA fields captured.`);
  }
  if (row.key === "delivery") {
    out.push(`${intel.entries.decisions.length} committed decision${intel.entries.decisions.length === 1 ? "" : "s"} in the ledger.`);
    const openQ = intel.dna.openQuestions.length + intel.entries.openQuestionEntries.length;
    out.push(`${openQ} open question${openQ === 1 ? "" : "s"} still in tension.`);
  }
  if (row.key === "build") {
    const s = intel.stack;
    if (s) {
      const captured = [
        s.frontend && "frontend",
        s.backend && "backend",
        s.database && "database",
        s.hosting && "hosting",
        s.auth && "auth",
      ].filter(Boolean) as string[];
      if (captured.length > 0) out.push(`Stack captured: ${captured.join(", ")}.`);
      else out.push("Stack row exists but no fields captured yet.");
      if (s.integrations && s.integrations.length > 0) out.push(`Integrations tracked: ${s.integrations.join(", ")}.`);
    } else {
      out.push("No stack captured yet — Atlas hasn't seen this project's tech.");
    }
    out.push(intel.hasFlow ? "Flow map exists — architecture is being tracked." : "No flow map yet — architecture hasn't been sketched.");
  }
  return out;
}

function buildDimensionMissing(row: ExplainRow, intel: Intelligence): string[] {
  const out: string[] = [];
  if (row.key === "strategy") {
    if (!intel.dna.purpose) out.push("Purpose isn't captured yet.");
    if (!intel.dna.audience) out.push("Audience isn't defined.");
    if (!intel.dna.wedge) out.push("The wedge (what makes this different) isn't articulated.");
    if (!intel.dna.identity) out.push("Project identity is still forming.");
    if (!intel.dna.differentiator) out.push("Differentiator isn't stated.");
  }
  if (row.key === "activity") {
    const ev = intel.health.evidence;
    if (ev && ev.conversationsLast7Days < 3) out.push("More recent conversation would strengthen momentum signal.");
    if (ev && ev.openBlockers > 0) out.push("Resolve or park open blockers.");
  }
  if (row.key === "delivery") {
    if (intel.entries.decisions.length < 3) out.push("Commit more decisions from the ledger.");
    const openQ = intel.dna.openQuestions.length + intel.entries.openQuestionEntries.length;
    if (openQ > 0) out.push("Resolve open questions or move them to committed.");
  }
  if (row.key === "build") {
    if (!intel.stack) out.push("Capture the tech stack (frontend, backend, database) so Atlas can reason about architecture.");
    if (!intel.hasFlow) out.push("Sketch the flow map so Atlas can track architecture.");
  }
  return out;
}

function buildOverallObservations(intel: Intelligence): string[] {
  const out: string[] = [];
  out.push(`Overall readiness: ${intel.readiness.overall}% (${intel.readiness.label}).`);
  const dims = intel.readiness.dimensions;
  (["strategy", "build", "activity", "delivery"] as const).forEach((k) => {
    const d = dims[k];
    if (d?.applicable) out.push(`${DIMENSION_LABEL[k]}: ${Math.round(d.score)}% — ${d.label}.`);
  });
  return out;
}

function buildOverallMissing(intel: Intelligence): string[] {
  const gaps: string[] = [];
  const dims = intel.readiness.dimensions;
  (["strategy", "build", "activity", "delivery"] as const).forEach((k) => {
    const d = dims[k];
    if (d?.applicable && d.score < 70) gaps.push(`Raise ${DIMENSION_LABEL[k]} (${Math.round(d.score)}%) — tap the row to see how.`);
  });
  return gaps;
}

export default InsightsPanel;

