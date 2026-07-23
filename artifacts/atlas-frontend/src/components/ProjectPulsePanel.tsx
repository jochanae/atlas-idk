import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { X, Check } from "lucide-react";
import { useUpdateProject, getGetProjectQueryKey, getListProjectsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { LIFECYCLE_META, type Lifecycle } from "@/lib/lifecycle";
import { useTier1Memory } from "@/hooks/useTier1Memory";
import { TIER1_QUESTIONS, openTier1IntakeSheet, type Tier1FieldKey } from "@/lib/tier1Memory";

interface Props {
  projectId: number;
  projectName: string;
  state: Lifecycle;
  readinessScore: number | null;
  decisionCount: number | null;
  hasRepo: boolean;
  lastActivityAt: string | null;
  themes: string[];
  recentDecisions: Array<{ title: string; at?: string | null }>;
  onClose: () => void;
}

interface GenomeEvidence {
  scope: "project";
  signals: {
    conversationsLast7Days: number;
    totalSessions: number;
    committedDecisions: number;
    parkedItems: number;
    openBlockers: number;
    openConstraints: number;
    openQuestions: number;
    confidenceScore: number;
  };
  derivations: {
    momentum: string;
    clarity: string;
    state: string;
  };
}

interface GenomeHealth {
  clarity: number;
  momentum: "Low" | "Medium" | "High";
  confidence: "Low" | "Medium" | "High";
  risk: string | null;
  nextAction: string;
  atlasState: string;
  evidence: GenomeEvidence;
}

interface GenomeResponse {
  health: GenomeHealth;
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? singular + "s")}`;
}

/**
 * Read-only window into Atlas's understanding of the project.
 * Tapping the lifecycle glyph opens this. No actions, no commit buttons.
 */
export function ProjectPulsePanel(props: Props) {
  const {
    projectId, projectName, state, readinessScore, decisionCount, hasRepo,
    lastActivityAt, themes, recentDecisions, onClose,
  } = props;

  const meta = LIFECYCLE_META[state];
  const updateProject = useUpdateProject();
  const queryClient = useQueryClient();
  const [justMarked, setJustMarked] = useState(false);

  const { data: genomeData } = useQuery<GenomeResponse>({
    queryKey: ["genome", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/genome`, { credentials: "include" });
      if (!res.ok) throw new Error("genome fetch failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const evidence = genomeData?.health?.evidence ?? null;

  const handleMarkBuilt = () => {
    updateProject.mutate(
      { id: projectId, data: { status: "built" } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          setJustMarked(true);
          setTimeout(() => { setJustMarked(false); onClose(); }, 900);
        },
      }
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const score = readinessScore ?? 0;
  const dCount = decisionCount ?? 0;
  const coherence = score >= 60 ? "High" : score >= 30 ? "Building" : "Early";
  const momentum =
    dCount >= 3 ? "Increasing" :
    dCount >= 1 ? "Steady" :
    "Nascent";

  const isEmpty = themes.length === 0 && recentDecisions.length === 0 && !lastActivityAt && dCount === 0;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 13000,
        background: "rgba(var(--atlas-bg-rgb), 0.55)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
        animation: "atlas-fade-in 180ms ease",
      }}
    >
      <style>{`
        @keyframes atlas-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes atlas-pulse-rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
      <div
        role="dialog"
        aria-label={`${projectName} pulse`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "min(560px, 94vw)",
          maxHeight: "min(90vh, 900px)",
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          background: "rgba(var(--atlas-surface-rgb), 0.96)",
          border: "1px solid rgba(var(--atlas-gold-rgb), 0.22)",
          borderRadius: 16,
          boxShadow: "0 24px 80px rgba(0,0,0,0.35), inset 0 1px 0 rgba(var(--atlas-gold-rgb), 0.06)",
          padding: "clamp(18px, 3vw, 26px)",
          animation: "atlas-pulse-rise 240ms cubic-bezier(0.22,1,0.36,1)",
          fontFamily: "var(--app-font-sans)",
          color: "var(--atlas-fg)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-gold)",
              letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.85, marginBottom: 4,
            }}>
              Atlas Pulse
            </div>
            <div style={{
              fontSize: 17, fontWeight: 600, lineHeight: 1.2,
              display: "flex", alignItems: "center", gap: 8,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{projectName}</span>
              <span style={{ color: meta.color, fontSize: 15, flexShrink: 0 }}>{meta.glyph}</span>
            </div>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{
              flexShrink: 0, width: 28, height: 28, borderRadius: 6,
              border: "1px solid rgba(201,162,76,0.15)", background: "transparent",
              color: "var(--atlas-muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={14} strokeWidth={1.6} />
          </button>
        </div>

        {/* Project DNA — the 6 Tier1 slots Atlas is capturing */}
        <PulseDnaSection projectId={projectId} />

        {/* Current state */}
        <Section label="Current State">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: meta.color, fontSize: 14 }}>{meta.glyph}</span>
            <span style={{ color: "var(--atlas-fg)", fontSize: 13, fontWeight: 500 }}>{meta.label}</span>
            <span style={{ color: "var(--atlas-muted)", fontSize: 12, opacity: 0.7 }}>— {meta.description}</span>
          </div>
        </Section>

        {isEmpty && !evidence ? (
          <div style={{
            marginTop: 14, padding: "14px 14px",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10,
            fontSize: 12.5, color: "var(--atlas-muted)", lineHeight: 1.55,
          }}>
            This project is brand new. Atlas hasn&apos;t gathered enough signal yet — themes and decisions will appear here as the conversation deepens.
          </div>
        ) : (
          <>
            {themes.length > 0 && (
              <Section label="Emerging Themes">
                <ul style={listStyle}>
                  {themes.slice(0, 6).map((t, i) => (
                    <li key={i} style={liStyle}>{t}</li>
                  ))}
                </ul>
              </Section>
            )}

            {recentDecisions.length > 0 && (
              <Section label="Recent Decisions">
                <ul style={listStyle}>
                  {recentDecisions.slice(0, 4).map((d, i) => (
                    <li key={i} style={liStyle}>
                      {d.title}
                      {d.at && <span style={{ color: "var(--atlas-muted)", opacity: 0.6, marginLeft: 6, fontSize: 11 }}>· {relTime(d.at)}</span>}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Explainability: what Atlas observed before concluding anything */}
            {evidence && <EvidenceBlock evidence={evidence} lastActivityAt={lastActivityAt} />}

            <Section label="Atlas Concludes">
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
                {evidence ? (
                  <>
                    <Row k="Momentum" v={genomeData?.health?.momentum ?? "—"} note={evidence.derivations.momentum} />
                    <Row k="Clarity" v={`${evidence.signals.confidenceScore}%`} note={evidence.derivations.clarity} />
                    <Row k="State" v={genomeData?.health?.atlasState ?? "—"} note={evidence.derivations.state} />
                    {genomeData?.health?.risk && <Row k="Risk" v={genomeData.health.risk} />}
                  </>
                ) : (
                  <>
                    <Row k="Coherence" v={coherence} />
                    <Row k="Momentum" v={momentum} />
                    {readinessScore != null && <Row k="Readiness" v={`${readinessScore}%`} />}
                    {hasRepo && <Row k="Repository" v="Linked" />}
                  </>
                )}
              </div>
            </Section>

            {lastActivityAt && (
              <Section label="Last Meaningful Activity">
                <span style={{ fontSize: 12.5, color: "var(--atlas-fg)", opacity: 0.85 }}>
                  {relTime(lastActivityAt)}
                </span>
              </Section>
            )}
          </>
        )}

        {/* Mark as Built — user-confirmed transition */}
        {state !== "built" && (
          <div style={{ marginTop: 18 }}>
            <button
              type="button"
              onClick={handleMarkBuilt}
              disabled={updateProject.isPending || justMarked}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${justMarked ? "rgba(120,180,160,0.55)" : "rgba(201,162,76,0.32)"}`,
                background: justMarked ? "rgba(120,180,160,0.16)" : "rgba(201,162,76,0.10)",
                color: justMarked ? "rgba(180,220,200,0.95)" : "var(--atlas-gold)",
                cursor: updateProject.isPending ? "not-allowed" : "pointer",
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: "var(--app-font-sans)",
                letterSpacing: "0.02em",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "all 180ms ease",
              }}
            >
              <Check size={14} strokeWidth={2} />
              {justMarked ? "Marked as Built" : updateProject.isPending ? "Saving…" : "Mark as Built"}
            </button>
            <div style={{ marginTop: 6, fontSize: 10.5, color: "var(--atlas-muted)", opacity: 0.6, fontFamily: "var(--app-font-mono)", lineHeight: 1.5 }}>
              Built means complete and successful. This is your call — Atlas won&apos;t make it for you.
            </div>
          </div>
        )}

        {/* Footnote */}
        <div style={{
          marginTop: 16, paddingTop: 12,
          borderTop: "1px solid rgba(201,162,76,0.1)",
          fontSize: 10.5, color: "var(--atlas-muted)", opacity: 0.55,
          fontFamily: "var(--app-font-mono)", letterSpacing: "0.04em", lineHeight: 1.5,
        }}>
          Shaping and Committed are Atlas assessments — they shift automatically as evidence accrues. Built is your call.
        </div>
      </div>
    </div>,
    document.body
  );
}

function EvidenceBlock({ evidence, lastActivityAt }: { evidence: GenomeEvidence; lastActivityAt: string | null }) {
  const s = evidence.signals;

  const bullets: string[] = [];

  if (s.conversationsLast7Days > 0) {
    bullets.push(plural(s.conversationsLast7Days, "conversation") + " this week");
  } else if (s.totalSessions > 0) {
    bullets.push(plural(s.totalSessions, "session") + " total · none this week");
  } else {
    bullets.push("No conversations yet");
  }

  if (s.committedDecisions > 0) bullets.push(plural(s.committedDecisions, "committed decision"));
  if (s.parkedItems > 0) bullets.push(plural(s.parkedItems, "parked item"));
  if (s.openBlockers > 0) bullets.push(plural(s.openBlockers, "open blocker"));
  if (s.openConstraints > 0) bullets.push(plural(s.openConstraints, "constraint"));
  if (s.openQuestions > 0) bullets.push(plural(s.openQuestions, "open question"));
  if (lastActivityAt) bullets.push(`Last activity ${relTime(lastActivityAt)}`);

  return (
    <Section label="Atlas Observed">
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {bullets.map((b, i) => (
          <li key={i} style={{
            fontSize: 12, color: "var(--atlas-fg)", opacity: 0.8, lineHeight: 1.5,
            display: "flex", alignItems: "baseline", gap: 7,
          }}>
            <span style={{
              flexShrink: 0, width: 4, height: 4, borderRadius: "50%",
              background: "rgba(var(--atlas-gold-rgb), 0.55)",
              display: "inline-block", marginBottom: 1,
            }} />
            {b}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)",
        letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.6, marginBottom: 6,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: "var(--atlas-muted)", opacity: 0.75, fontSize: 12.5 }}>{k}</span>
        <span style={{ color: "var(--atlas-fg)", fontSize: 12.5 }}>{v}</span>
      </div>
      {note && (
        <div style={{
          fontSize: 10.5, color: "var(--atlas-muted)", opacity: 0.5,
          fontFamily: "var(--app-font-mono)", lineHeight: 1.4,
          paddingLeft: 0, letterSpacing: "0.01em",
        }}>
          {note}
        </div>
      )}
    </div>
  );
}

const listStyle: React.CSSProperties = {
  listStyle: "none", padding: 0, margin: 0,
  display: "flex", flexDirection: "column", gap: 5,
};
const liStyle: React.CSSProperties = {
  fontSize: 12.5, color: "var(--atlas-fg)", opacity: 0.88, lineHeight: 1.45,
  paddingLeft: 12, position: "relative",
};

const SHORT_LABEL: Record<Tier1FieldKey, string> = {
  building: "What",
  audience: "Who",
  problem: "Why",
  outOfScope: "Not",
  successSignal: "Signal",
  constraints: "Bounds",
};

function PulseDnaSection({ projectId }: { projectId: number }) {
  const { memory } = useTier1Memory(projectId);
  const missing = memory?.missing ?? TIER1_QUESTIONS.map((q) => q.key);
  const filledKeys = TIER1_QUESTIONS.map((q) => q.key).filter((k) => !missing.includes(k));
  const filledCount = filledKeys.length;
  const complete = filledCount >= 6;

  return (
    <div style={{
      marginTop: 4, marginBottom: 6, padding: "12px 12px",
      border: "1px solid rgba(var(--atlas-gold-rgb), 0.22)",
      borderRadius: 12,
      background: "color-mix(in oklab, var(--atlas-gold) 4%, transparent)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 5, height: 5, borderRadius: "50%",
          background: "var(--atlas-gold)", opacity: complete ? 0.9 : 0.75,
        }} />
        <span style={{
          fontFamily: "var(--app-font-mono)", fontSize: 9,
          letterSpacing: "0.16em", textTransform: "uppercase",
          color: "var(--atlas-gold)",
        }}>
          Project DNA · {filledCount}/6
        </span>
        <span style={{
          fontFamily: "var(--app-font-mono)", fontSize: 9,
          letterSpacing: "0.16em", textTransform: "uppercase",
          color: "rgba(var(--atlas-muted-rgb), 0.55)",
        }}>
          {complete ? "captured" : "capturing"}
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={openTier1IntakeSheet}
          style={{
            padding: "3px 9px", borderRadius: 6,
            background: "transparent",
            border: "1px solid rgba(var(--atlas-gold-rgb), 0.3)",
            color: "var(--atlas-gold)",
            fontFamily: "var(--app-font-mono)", fontSize: 9,
            letterSpacing: "0.14em", textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          {complete ? "Review" : "Fill"}
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {TIER1_QUESTIONS.map((q) => {
          const filled = filledKeys.includes(q.key);
          return (
            <span
              key={q.key}
              title={filled ? `${q.label} — captured` : `${q.label} — pending`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 8px", borderRadius: 999,
                background: filled
                  ? "rgba(var(--atlas-gold-rgb), 0.14)"
                  : "rgba(var(--atlas-bg-rgb), 0.5)",
                border: `1px solid rgba(var(--atlas-gold-rgb), ${filled ? 0.4 : 0.12})`,
                color: filled ? "var(--atlas-gold)" : "rgba(var(--atlas-muted-rgb), 0.65)",
                fontFamily: "var(--app-font-mono)", fontSize: 9,
                letterSpacing: "0.1em", textTransform: "uppercase",
              }}
            >
              {filled ? <Check size={9} strokeWidth={3} /> : null}
              {SHORT_LABEL[q.key]}
            </span>
          );
        })}
      </div>
    </div>
  );
}
