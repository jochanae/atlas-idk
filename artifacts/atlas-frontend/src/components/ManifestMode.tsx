import { useState, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Completeness = "absent" | "thin" | "sufficient";
type TargetStatus = "available" | "warning" | "locked";

interface ProjectGenome {
  purpose: string | null;
  coreEmotion: string | null;
  audience: string | null;
  confidenceScore: number;
  health: {
    clarity: number;
    momentum: string;
    confidence: string;
  };
  openQuestions: string[];
}

interface DnaAnchorLocal {
  label: string;
  value: string | null;
  completeness: Completeness;
}

interface StaticTarget {
  id: string;
  label: string;
  status: TargetStatus;
  reason: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONO = "var(--app-font-mono)";
const SANS = "var(--app-font-sans)";
const GOLD = "rgba(201,162,76,0.9)";
const GOLD_DIM = "rgba(201,162,76,0.22)";
const MUTED = "var(--atlas-muted)";
const FG = "var(--atlas-fg)";
const BORDER = "var(--atlas-border)";
const GREEN = "#6EE7B7";
const AMBER = "#f59e0b";
const BG = "var(--atlas-bg)";
const SURFACE = "var(--atlas-surface)";

// ── Color helpers ─────────────────────────────────────────────────────────────

function completenessColor(c: Completeness): string {
  if (c === "sufficient") return GREEN;
  if (c === "thin") return AMBER;
  return "rgba(255,255,255,0.22)";
}

function completenessLabel(c: Completeness): string {
  if (c === "sufficient") return "✓";
  if (c === "thin") return "⚠";
  return "—";
}

function scoreColor(score: number): string {
  if (score >= 67) return GREEN;
  if (score >= 34) return AMBER;
  return "rgba(255,255,255,0.28)";
}

// ── DNA derivation ─────────────────────────────────────────────────────────────

function deriveAnchors(genome: ProjectGenome | null): DnaAnchorLocal[] {
  if (!genome) {
    return [
      { label: "Core Intent", value: null, completeness: "absent" },
      { label: "Core Audience", value: null, completeness: "absent" },
      { label: "Brand Posture", value: null, completeness: "absent" },
      { label: "Surface Strategy", value: null, completeness: "absent" },
    ];
  }

  const clarity = genome.health.clarity;

  function anchorCompleteness(value: string | null, threshold = 40): Completeness {
    if (!value) return "absent";
    if (clarity < threshold) return "thin";
    return "sufficient";
  }

  const surfaceValue =
    genome.purpose && genome.audience && clarity >= 50
      ? `${clarity}% clarity across intent and audience`
      : null;

  return [
    {
      label: "Core Intent",
      value: genome.purpose,
      completeness: anchorCompleteness(genome.purpose, 35),
    },
    {
      label: "Core Audience",
      value: genome.audience,
      completeness: anchorCompleteness(genome.audience, 40),
    },
    {
      label: "Brand Posture",
      value: genome.coreEmotion,
      completeness: anchorCompleteness(genome.coreEmotion, 45),
    },
    {
      label: "Surface Strategy",
      value: surfaceValue,
      completeness: anchorCompleteness(surfaceValue, 50),
    },
  ];
}

// ── Target derivation ─────────────────────────────────────────────────────────

function deriveTargets(genome: ProjectGenome | null): StaticTarget[] {
  if (!genome) {
    const reasons = [
      { id: "landing-page", label: "Landing Page" },
      { id: "database-schema", label: "Database Schema" },
      { id: "web-app", label: "Web App" },
      { id: "beta-program", label: "Beta Program" },
      { id: "investor-deck", label: "Investor Deck" },
      { id: "mobile-app", label: "Mobile App" },
    ];
    return reasons.map((t) => ({
      ...t,
      status: "locked" as TargetStatus,
      reason: "Awaiting DNA analysis…",
    }));
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
      id: "landing-page",
      label: "Landing Page",
      status: status(hasIntent && clarity >= 30, hasIntent && clarity >= 15),
      reason: !hasIntent
        ? "Needs core intent"
        : clarity < 15
          ? "Continue defining your vision"
          : clarity < 30
            ? "Nearly ready"
            : "Ready to manifest",
    },
    {
      id: "database-schema",
      label: "Database Schema",
      status: status(hasIntent && clarity >= 25, hasIntent && clarity >= 10),
      reason: !hasIntent
        ? "Needs core intent"
        : clarity < 25
          ? "Needs more clarity"
          : "Ready to manifest",
    },
    {
      id: "web-app",
      label: "Web App",
      status: status(
        hasIntent && hasAudience && clarity >= 50,
        hasIntent && clarity >= 35,
      ),
      reason: !hasIntent
        ? "Needs core intent"
        : !hasAudience
          ? "Needs audience definition"
          : clarity < 50
            ? `${50 - clarity}% more clarity needed`
            : "Ready to manifest",
    },
    {
      id: "beta-program",
      label: "Beta Program",
      status: status(
        hasIntent && hasAudience && clarity >= 55,
        hasIntent && hasAudience && clarity >= 40,
      ),
      reason: !hasIntent
        ? "Needs core intent"
        : !hasAudience
          ? "Needs audience definition"
          : clarity < 55
            ? "Needs deeper clarity"
            : "Ready to manifest",
    },
    {
      id: "investor-deck",
      label: "Investor Deck",
      status: status(
        hasIntent && hasAudience && hasBrand && clarity >= 65,
        hasIntent && hasAudience && clarity >= 50,
      ),
      reason: !hasIntent
        ? "Needs core intent"
        : !hasAudience
          ? "Needs audience definition"
          : !hasBrand
            ? "Needs brand posture"
            : clarity < 65
              ? "Needs stronger conviction"
              : "Ready to manifest",
    },
    {
      id: "mobile-app",
      label: "Mobile App",
      status: status(
        hasIntent && hasAudience && hasBrand && clarity >= 75,
        hasIntent && hasAudience && hasBrand && clarity >= 60,
      ),
      reason: !hasIntent
        ? "Needs core intent"
        : !hasAudience
          ? "Needs audience definition"
          : !hasBrand
            ? "Needs brand posture"
            : clarity < 75
              ? "Needs stronger foundation"
              : "Ready to manifest",
    },
  ];
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 8,
        letterSpacing: "0.18em",
        textTransform: "uppercase" as const,
        color: MUTED,
        opacity: 0.45,
        marginBottom: 12,
        paddingTop: 2,
      }}
    >
      {children}
    </div>
  );
}

function AnchorRow({ anchor }: { anchor: DnaAnchorLocal }) {
  const color = completenessColor(anchor.completeness);
  const icon = completenessLabel(anchor.completeness);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column" as const,
        gap: 4,
        padding: "10px 0",
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase" as const,
            color: MUTED,
            opacity: 0.55,
          }}
        >
          {anchor.label}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: "0.04em",
            color,
            opacity: 0.85,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span>{icon}</span>
          <span style={{ fontSize: 8, opacity: 0.7, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
            {anchor.completeness}
          </span>
        </span>
      </div>
      {anchor.value ? (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: FG,
            opacity: anchor.completeness === "thin" ? 0.65 : 0.82,
            lineHeight: 1.55,
            fontFamily: SANS,
          }}
        >
          {anchor.value}
        </p>
      ) : (
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: MUTED,
            opacity: 0.35,
            lineHeight: 1.55,
            fontStyle: "italic",
            fontFamily: SANS,
          }}
        >
          Not yet defined
        </p>
      )}
    </div>
  );
}

function TargetRow({
  target,
  selected,
  onSelect,
}: {
  target: StaticTarget;
  selected: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isAvailable = target.status === "available";
  const isWarning = target.status === "warning";
  const isLocked = target.status === "locked";

  const iconColor = isAvailable ? GOLD : isWarning ? AMBER : "rgba(255,255,255,0.2)";

  function StatusIcon() {
    if (isAvailable) {
      return (
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
          <path
            d="M2 5.2l2.2 2.2 3.8-4"
            stroke="rgba(201,162,76,0.9)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    }
    if (isWarning) {
      return (
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
          <path
            d="M5 2v4M5 7.5v.5"
            stroke={AMBER}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    }
    return (
      <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
        <rect x="2" y="4.5" width="6" height="4.5" rx="1" stroke="rgba(255,255,255,0.25)" strokeWidth="1.4" />
        <path d="M3.5 4.5V3a1.5 1.5 0 013 0v1.5" stroke="rgba(255,255,255,0.25)" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <div
      onClick={!isLocked ? onSelect : undefined}
      onMouseEnter={() => !isLocked && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 8,
        cursor: isLocked ? "default" : "pointer",
        background: selected
          ? "rgba(201,162,76,0.09)"
          : hovered
            ? "rgba(255,255,255,0.035)"
            : "transparent",
        border: selected
          ? "1px solid rgba(201,162,76,0.28)"
          : "1px solid transparent",
        opacity: isLocked ? 0.35 : 1,
        transition: "background 150ms ease, border-color 150ms ease",
        marginBottom: 2,
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          flexShrink: 0,
          background: isAvailable
            ? "rgba(201,162,76,0.1)"
            : isWarning
              ? "rgba(245,158,11,0.1)"
              : "rgba(255,255,255,0.04)",
          border: `1px solid ${iconColor}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <StatusIcon />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontFamily: SANS,
            color: FG,
            fontWeight: selected ? 600 : 400,
            lineHeight: 1.35,
          }}
        >
          {target.label}
        </div>
        <div
          style={{
            fontSize: 10,
            fontFamily: MONO,
            color: MUTED,
            opacity: 0.5,
            letterSpacing: "0.02em",
            marginTop: 2,
          }}
        >
          {target.reason}
        </div>
      </div>

      {selected && (
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: GOLD,
            flexShrink: 0,
            boxShadow: "0 0 6px rgba(201,162,76,0.6)",
          }}
        />
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface ManifestModeProps {
  projectId: number | null;
  projectName?: string | null;
  onClose: () => void;
  onMaterialize: (targetId: string) => void;
  loading?: boolean;
}

export function ManifestMode({
  projectId,
  projectName,
  onClose,
  onMaterialize,
  loading = false,
}: ManifestModeProps) {
  const [genome, setGenome] = useState<ProjectGenome | null>(null);
  const [genomeLoading, setGenomeLoading] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [materializeHover, setMaterializeHover] = useState(false);
  const [visible, setVisible] = useState(false);

  // Animate in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 16);
    return () => clearTimeout(t);
  }, []);

  // Fetch genome
  useEffect(() => {
    if (!projectId || projectId <= 0) return;
    setGenomeLoading(true);
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
  const readiness = genome?.health.clarity ?? 0;
  const readinessColor = scoreColor(readiness);

  const selectedTargetObj = targets.find((t) => t.id === selectedTarget);
  const canMaterialize =
    selectedTarget !== null &&
    selectedTargetObj?.status !== "locked" &&
    !loading;

  function handleMaterialize() {
    if (!canMaterialize || !selectedTarget) return;
    onMaterialize(selectedTarget);
  }

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 220);
  }

  return (
    <>
      <style>{`
        @keyframes manifest-mode-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 40,
          background: BG,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(6px)",
          transition: "opacity 220ms cubic-bezier(0.16,1,0.3,1), transform 220ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Ambient top glow */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 200,
            background:
              "radial-gradient(ellipse at 50% -20%, rgba(201,162,76,0.07) 0%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {/* Header */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px 12px",
            borderBottom: `1px solid ${BORDER}`,
            background: BG,
            backdropFilter: "blur(8px)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: GOLD,
                display: "inline-block",
                boxShadow: "0 0 8px rgba(201,162,76,0.5)",
                flexShrink: 0,
              }}
            />
            <div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: GOLD,
                  opacity: 0.85,
                  lineHeight: 1,
                  marginBottom: 3,
                }}
              >
                Manifest Mode
              </div>
              {projectName && (
                <div
                  style={{
                    fontSize: 12,
                    color: MUTED,
                    opacity: 0.55,
                    fontFamily: SANS,
                    lineHeight: 1,
                  }}
                >
                  {projectName}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            title="Exit Manifest Mode"
            aria-label="Exit Manifest Mode"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: MUTED,
              opacity: 0.5,
              fontSize: 18,
              lineHeight: 1,
              padding: "4px 6px",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "opacity 150ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = "0.5";
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            position: "relative",
            zIndex: 1,
            maxWidth: 560,
            width: "100%",
            margin: "0 auto",
            padding: "24px 20px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 32,
          }}
        >
          {/* ── Section 1: DNA Snapshot ── */}
          <section>
            <SectionLabel>Project DNA</SectionLabel>

            {/* Readiness bar */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 8,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: MUTED,
                    opacity: 0.45,
                  }}
                >
                  Readiness
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 16,
                    fontWeight: 700,
                    color: genomeLoading ? MUTED : readinessColor,
                    lineHeight: 1,
                    letterSpacing: "-0.01em",
                    opacity: genomeLoading ? 0.4 : 1,
                  }}
                >
                  {genomeLoading ? "—" : `${readiness}`}
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 400,
                      opacity: 0.6,
                      marginLeft: 2,
                    }}
                  >
                    / 100
                  </span>
                </span>
              </div>
              <div
                style={{
                  height: 3,
                  borderRadius: 3,
                  background: "rgba(255,255,255,0.06)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${readiness}%`,
                    borderRadius: 3,
                    background: readinessColor,
                    opacity: 0.75,
                    transition: "width 700ms cubic-bezier(0.16,1,0.3,1)",
                    boxShadow:
                      readiness > 0 ? `0 0 8px ${readinessColor}60` : "none",
                  }}
                />
              </div>
            </div>

            {/* Anchor rows */}
            <div
              style={{
                borderRadius: 8,
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                padding: "0 14px",
                overflow: "hidden",
              }}
            >
              {anchors.map((anchor) => (
                <AnchorRow key={anchor.label} anchor={anchor} />
              ))}
              {anchors[anchors.length - 1] && (
                <div style={{ height: 2 }} />
              )}
            </div>
          </section>

          {/* ── Section 2: Build Targets ── */}
          <section>
            <SectionLabel>Available Realities</SectionLabel>
            <div
              style={{
                borderRadius: 8,
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                padding: "6px",
              }}
            >
              {targets.map((target) => (
                <TargetRow
                  key={target.id}
                  target={target}
                  selected={selectedTarget === target.id}
                  onSelect={() =>
                    setSelectedTarget(
                      selectedTarget === target.id ? null : target.id,
                    )
                  }
                />
              ))}
            </div>
          </section>

          {/* ── Section 3: Materialize Action ── */}
          <section>
            <SectionLabel>Materialize</SectionLabel>
            <button
              type="button"
              onClick={handleMaterialize}
              disabled={!canMaterialize}
              onMouseEnter={() => canMaterialize && setMaterializeHover(true)}
              onMouseLeave={() => setMaterializeHover(false)}
              style={{
                width: "100%",
                padding: "14px 20px",
                borderRadius: 10,
                border: canMaterialize
                  ? `1px solid ${materializeHover ? "rgba(201,162,76,0.55)" : GOLD_DIM}`
                  : `1px solid ${BORDER}`,
                background: canMaterialize
                  ? materializeHover
                    ? "rgba(201,162,76,0.12)"
                    : "rgba(201,162,76,0.06)"
                  : "rgba(255,255,255,0.02)",
                cursor: canMaterialize ? "pointer" : "not-allowed",
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: canMaterialize ? GOLD : MUTED,
                opacity: canMaterialize ? (materializeHover ? 1 : 0.88) : 0.4,
                transition:
                  "background 160ms ease, border-color 160ms ease, opacity 160ms ease, box-shadow 160ms ease",
                boxShadow:
                  canMaterialize && materializeHover
                    ? "0 0 20px rgba(201,162,76,0.12)"
                    : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {loading ? (
                <>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      border: "1px solid rgba(201,162,76,0.5)",
                      borderTopColor: GOLD,
                      animation: "spin 700ms linear infinite",
                    }}
                  />
                  Generating…
                </>
              ) : selectedTarget ? (
                <>
                  Materialize{" "}
                  {targets.find((t) => t.id === selectedTarget)?.label}
                </>
              ) : (
                "Select a target above"
              )}
            </button>

            {/* Execution Feed note */}
            {!selectedTarget && !loading && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${BORDER}`,
                }}
              >
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 8,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: MUTED,
                    opacity: 0.4,
                    marginBottom: 5,
                  }}
                >
                  Execution Feed
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: MUTED,
                    opacity: 0.4,
                    fontFamily: SANS,
                    lineHeight: 1.5,
                  }}
                >
                  Build history and artifacts live in the Changes tab.
                </div>
              </div>
            )}
          </section>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </>
  );
}
