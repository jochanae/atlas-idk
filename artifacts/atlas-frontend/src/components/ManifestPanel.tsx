import { useState, useEffect, useRef } from "react";
import type { ManifestDecision } from "@/components/workspace/PreviewPanel";

// ── Constants ──────────────────────────────────────────────────────────────────
const MONO = "var(--app-font-mono)";
const SANS = "var(--app-font-sans)";
const GOLD = "rgba(201,162,76,0.9)";
const MUTED = "var(--atlas-muted)";
const FG = "var(--atlas-fg)";
const BORDER = "var(--atlas-border)";
const GREEN = "#6EE7B7";
const AMBER = "#f59e0b";

// Theme-aware alternatives for hardcoded rgba-white values
const CIRCLE_EMPTY = "color-mix(in oklab, var(--atlas-fg) 35%, transparent)";
const LOCKED_ICON = "color-mix(in oklab, var(--atlas-fg) 28%, transparent)";

const READINESS_THRESHOLD = 40;

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProjectGenome {
  purpose: string | null;
  coreEmotion: string | null;
  audience: string | null;
  confidenceScore: number;
  health: { clarity: number; momentum: string; confidence: string };
  openQuestions: string[];
}

type TargetStatus = "available" | "warning" | "locked";

interface DnaAnchor {
  label: string;
  value: string | null;
}

interface Target {
  id: string;
  label: string;
  status: TargetStatus;
  reason: string;
}

// ── Derivation helpers ────────────────────────────────────────────────────────
function deriveAnchors(genome: ProjectGenome | null): DnaAnchor[] {
  return [
    { label: "Core intent", value: genome?.purpose ?? null },
    { label: "Core audience", value: genome?.audience ?? null },
    { label: "Brand voice", value: genome?.coreEmotion ?? null },
  ];
}

function deriveTargets(genome: ProjectGenome | null): Target[] {
  if (!genome) {
    return [
      { id: "landing-page", label: "Landing page", status: "locked", reason: "Awaiting analysis…" },
      { id: "web-app", label: "Web app", status: "locked", reason: "Awaiting analysis…" },
      { id: "beta-program", label: "Beta program", status: "locked", reason: "Awaiting analysis…" },
      { id: "investor-deck", label: "Investor deck", status: "locked", reason: "Awaiting analysis…" },
      { id: "mobile-app", label: "Mobile app", status: "locked", reason: "Awaiting analysis…" },
    ];
  }
  const { clarity } = genome.health;
  const hasIntent = Boolean(genome.purpose);
  const hasAudience = Boolean(genome.audience);
  const hasBrand = Boolean(genome.coreEmotion);
  function status(unlocked: boolean, warn: boolean): TargetStatus {
    if (unlocked) return "available";
    if (warn) return "warning";
    return "locked";
  }
  return [
    {
      id: "landing-page", label: "Landing page",
      status: status(hasIntent && clarity >= 30, hasIntent && clarity >= 15),
      reason: !hasIntent ? "Needs core intent" : clarity < 30 ? "Nearly ready" : "Ready to materialize",
    },
    {
      id: "web-app", label: "Web app",
      status: status(hasIntent && hasAudience && clarity >= 50, hasIntent && clarity >= 35),
      reason: !hasIntent ? "Needs core intent" : !hasAudience ? "Needs audience" : clarity < 50 ? `${50 - clarity}% more clarity` : "Ready to materialize",
    },
    {
      id: "beta-program", label: "Beta program",
      status: status(hasIntent && hasAudience && clarity >= 55, hasIntent && hasAudience && clarity >= 40),
      reason: !hasIntent ? "Needs core intent" : !hasAudience ? "Needs audience" : clarity < 55 ? "Needs more clarity" : "Ready to materialize",
    },
    {
      id: "investor-deck", label: "Investor deck",
      status: status(hasIntent && hasAudience && hasBrand && clarity >= 65, hasIntent && hasAudience && clarity >= 50),
      reason: !hasIntent ? "Needs core intent" : !hasAudience ? "Needs audience" : !hasBrand ? "Needs brand voice" : clarity < 65 ? "Needs conviction" : "Ready to materialize",
    },
    {
      id: "mobile-app", label: "Mobile app",
      status: status(hasIntent && hasAudience && hasBrand && clarity >= 75, hasIntent && hasAudience && hasBrand && clarity >= 60),
      reason: !hasIntent ? "Needs core intent" : !hasAudience ? "Needs audience" : !hasBrand ? "Needs brand voice" : clarity < 75 ? "Needs stronger foundation" : "Ready to materialize",
    },
  ];
}

// ── Readiness ring ────────────────────────────────────────────────────────────
function ReadinessRing({ score }: { score: number }) {
  const r = 10;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score));
  const dash = (pct / 100) * circ;
  const color = score >= 67 ? GREEN : score >= 34 ? AMBER : CIRCLE_EMPTY;
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" style={{ flexShrink: 0 }}>
      <circle cx="14" cy="14" r={r} fill="none" stroke="color-mix(in oklab, var(--atlas-fg) 10%, transparent)" strokeWidth="2.5" />
      <circle
        cx="14" cy="14" r={r} fill="none" stroke={color} strokeWidth="2.5"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 14 14)"
        style={{ transition: "stroke-dasharray 600ms ease, stroke 400ms ease" }}
      />
      <text x="14" y="18" textAnchor="middle" fill={color}
        style={{ fontSize: 7, fontFamily: MONO, fontWeight: 700 }}>
        {pct}
      </text>
    </svg>
  );
}

// ── Target row ────────────────────────────────────────────────────────────────
function TargetRow({ target, selected, onSelect }: { target: Target; selected: boolean; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const isLocked = target.status === "locked";
  const isAvailable = target.status === "available";
  const iconColor = isAvailable ? GOLD : target.status === "warning" ? AMBER : LOCKED_ICON;

  return (
    <div
      onClick={!isLocked ? onSelect : undefined}
      onMouseEnter={() => !isLocked && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7,
        cursor: isLocked ? "default" : "pointer",
        background: selected ? "rgba(201,162,76,0.09)" : hovered ? "color-mix(in oklab, var(--atlas-fg) 4%, transparent)" : "transparent",
        border: `1px solid ${selected ? "rgba(201,162,76,0.28)" : "transparent"}`,
        opacity: isLocked ? 0.52 : 1,
        transition: "background 150ms ease, border-color 150ms ease",
        marginBottom: 1,
      }}
    >
      <span style={{ color: iconColor, fontSize: 11, flexShrink: 0, lineHeight: 1 }}>
        {isAvailable ? "▶" : isLocked ? "🔒" : "⚠"}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontFamily: SANS, color: FG,
          fontWeight: isAvailable ? 600 : selected ? 600 : 400,
          opacity: isAvailable ? 1 : 0.88,
        }}>{target.label}</div>
        <div style={{ fontSize: 9, fontFamily: MONO, color: MUTED, opacity: 0.65, letterSpacing: "0.02em", marginTop: 1 }}>{target.reason}</div>
      </div>
      {selected && <div style={{ width: 5, height: 5, borderRadius: "50%", background: GOLD, flexShrink: 0 }} />}
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: 8, letterSpacing: "0.16em",
      textTransform: "uppercase", color: MUTED, opacity: 0.65, marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export interface ManifestPanelProps {
  projectId: number | null;
  projectName?: string | null;
  readiness: number;
  onMaterialize: (targetId: string) => void;
  manifestDecision?: ManifestDecision | null;
  manifestLoading?: boolean;
}

export function ManifestPanel({
  projectId,
  projectName,
  readiness,
  onMaterialize,
  manifestLoading = false,
}: ManifestPanelProps) {
  const [genome, setGenome] = useState<ProjectGenome | null>(null);
  const [genomeLoading, setGenomeLoading] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [materializeHover, setMaterializeHover] = useState(false);
  const prevProjectId = useRef<number | null>(null);

  const isReady = readiness >= READINESS_THRESHOLD;

  useEffect(() => {
    if (!projectId || projectId <= 0) return;
    if (prevProjectId.current === projectId) return;
    prevProjectId.current = projectId;
    setGenomeLoading(true);
    setGenome(null);
    fetch(`/api/projects/${projectId}/genome`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.genome) setGenome(data.genome as ProjectGenome);
        else if (data?.purpose !== undefined) setGenome(data as ProjectGenome);
      })
      .catch(() => {})
      .finally(() => setGenomeLoading(false));
  }, [projectId]);

  const anchors = deriveAnchors(genome);
  const targets = deriveTargets(genome);
  const known = anchors.filter(a => a.value);
  const openQuestions = genome?.openQuestions ?? [];

  const hasSelected = Boolean(selectedTarget);
  const selectedIsAvailable = targets.find(t => t.id === selectedTarget)?.status === "available";

  // Phase B: work observation only — real open question or silence; no field-checklist homework.
  const nextAction = openQuestions[0]?.trim() || "";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--atlas-surface-alt)" }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px 10px",
        borderBottom: `1px solid ${BORDER}`,
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTED, opacity: 0.65, marginBottom: 3 }}>
            Manifest
          </div>
          <div style={{ fontFamily: SANS, fontSize: 11, color: FG, opacity: 0.75 }}>
            What can become real
          </div>
        </div>
        <ReadinessRing score={readiness} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {genomeLoading ? (
          <div style={{ padding: 24, display: "flex", justifyContent: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: MUTED, opacity: 0.65, letterSpacing: "0.12em" }}>
              Reading project…
            </div>
          </div>
        ) : (
          <div style={{ padding: "16px 16px 12px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Joy knows */}
            <div>
              <SectionLabel>Joy knows</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {projectName && (
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, opacity: 0.6, flexShrink: 0, minWidth: 60 }}>Project</span>
                    <span style={{ fontFamily: SANS, fontSize: 12, color: FG, opacity: 0.9 }}>{projectName}</span>
                  </div>
                )}
                {known.length === 0 && (
                  <div style={{ fontFamily: SANS, fontSize: 12, color: MUTED, opacity: 0.65, lineHeight: 1.5, paddingLeft: 2 }}>
                    —
                  </div>
                )}
                {known.map(a => (
                  <div key={a.label} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ color: GREEN, fontSize: 11, flexShrink: 0, marginTop: 1, lineHeight: 1 }}>✓</span>
                    <div style={{ fontFamily: SANS, fontSize: 12, color: FG, fontWeight: 500, lineHeight: 1.5 }}>{a.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Open tensions — work language only (Phase B: not a capture checklist) */}
            {openQuestions.length > 0 && (
              <div>
                <SectionLabel>Open</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {openQuestions.slice(0, 3).map((q, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ color: CIRCLE_EMPTY, fontSize: 11, flexShrink: 0, lineHeight: 1, marginTop: 1 }}>○</span>
                      <div style={{ fontFamily: SANS, fontSize: 12, color: MUTED, opacity: 0.72, lineHeight: 1.45 }}>{q}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Available opportunities */}
            <div>
              <SectionLabel>Available opportunities</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {targets.map(t => (
                  <TargetRow
                    key={t.id}
                    target={t}
                    selected={selectedTarget === t.id}
                    onSelect={() => setSelectedTarget(t.id === selectedTarget ? null : t.id)}
                  />
                ))}
              </div>
            </div>

            {/* Open tension cue — only when we have real work language */}
            {!isReady && nextAction.trim() && (
              <div style={{
                padding: "11px 13px",
                borderRadius: 8,
                background: "color-mix(in oklab, var(--atlas-fg) 3%, transparent)",
                border: `1px solid ${BORDER}`,
              }}>
                <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.15em", textTransform: "uppercase", color: MUTED, opacity: 0.6, marginBottom: 5 }}>
                  Open
                </div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: FG, opacity: 0.82, lineHeight: 1.55 }}>
                  {nextAction}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer — ▶ Materialize */}
      <div style={{ padding: "12px 16px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
        {isReady ? (
          <button
            type="button"
            disabled={!hasSelected || !selectedIsAvailable || manifestLoading}
            onMouseEnter={() => setMaterializeHover(true)}
            onMouseLeave={() => setMaterializeHover(false)}
            onClick={() => selectedTarget && onMaterialize(selectedTarget)}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 8,
              border: `1px solid ${hasSelected && selectedIsAvailable ? "rgba(201,162,76,0.4)" : BORDER}`,
              background: hasSelected && selectedIsAvailable
                ? (materializeHover ? "rgba(201,162,76,0.15)" : "rgba(201,162,76,0.08)")
                : "color-mix(in oklab, var(--atlas-fg) 3%, transparent)",
              cursor: hasSelected && selectedIsAvailable && !manifestLoading ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 160ms ease",
              opacity: hasSelected && selectedIsAvailable ? 1 : 0.5,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <polygon points="2,1 11,6 2,11" fill={hasSelected && selectedIsAvailable ? GOLD : "color-mix(in oklab, var(--atlas-fg) 40%, transparent)"} />
            </svg>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: hasSelected && selectedIsAvailable ? GOLD : MUTED }}>
              {manifestLoading ? "Materializing…" : hasSelected ? "Materialize" : "Select a target above"}
            </span>
          </button>
        ) : (
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED, opacity: 0.55, textAlign: "center" }}>
            ▶ available at {READINESS_THRESHOLD}% signal
          </div>
        )}
      </div>
    </div>
  );
}
