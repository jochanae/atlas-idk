import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { RecentSession } from "./AtlasFrontDoor";

/** Activity feed item — supplied from caller, optional. */
export type ActivityItem = {
  type: "commit" | "decision" | "session";
  projectId: string;
  projectName: string;
  title: string;
  subtitle?: string;
  url?: string;
  sha?: string;
  timestamp: string;
};

/** Project card with optional readiness score (0-100). */
export type ProjectWithScore = {
  id: string;
  name: string;
  description?: string | null;
  updatedAt: string;
  latestSnapshotScore?: number | null;
};

type Props = {
  openLoopsCount: number;
  ledgerCount: number;
  parkedCount: number;
  recents: RecentSession[];
  onOpenLedger: () => void;
  onOpenParking: () => void;
  onOpenSession: (id: string) => void;

  /* ── Harvested from Axiom — all optional ───────────────────────── */
  /** Atlas-prepared "where were we" briefing (single string, may be multi-sentence). */
  briefing?: string | null;
  briefingLoading?: boolean;
  /** Recent projects with optional readiness scores — shown as a card list. */
  projectsWithScores?: ProjectWithScore[];
  onOpenProject?: (id: string) => void;
  /** Pre-fetched activity items — rendered only when provided. */
  activityItems?: ActivityItem[];
};

/**
 * RevealOnScroll — fade + slide in when entering viewport. One-shot.
 */
function RevealOnScroll({
  children,
  delayMs = 0,
  id,
  className,
}: {
  children: ReactNode;
  delayMs?: number;
  id?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      id={id}
      className={className}
      style={{
        opacity: revealed ? 1 : 0,
        transform: revealed ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 600ms cubic-bezier(0.4, 0, 0.2, 1) ${delayMs}ms, transform 600ms cubic-bezier(0.4, 0, 0.2, 1) ${delayMs}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TYPE_COLOR: Record<ActivityItem["type"], string> = {
  commit: "rgba(74,222,128,0.75)",
  decision: "rgba(201,162,76,0.8)",
  session: "rgba(99,102,241,0.75)",
};

const TYPE_LABEL: Record<ActivityItem["type"], string> = {
  commit: "push",
  decision: "decision",
  session: "session",
};

/** Compact inline readiness ring (no external dep). */
function CompactReadinessRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const color =
    clamped >= 90 ? "#6EE7B7" : clamped >= 70 ? "var(--accent-gold)" : "var(--ember)";
  const circumference = 2 * Math.PI * 9;
  const offset = circumference * (1 - clamped / 100);
  return (
    <span style={{ position: "relative", width: 22, height: 22, flexShrink: 0 }} aria-label={`Readiness ${clamped}%`}>
      <svg width="22" height="22" viewBox="0 0 22 22">
        <circle cx="11" cy="11" r="9" fill="none" stroke="var(--border)" strokeWidth="1.5" opacity="0.5" />
        <circle
          cx="11" cy="11" r="9" fill="none"
          stroke={color} strokeWidth="1.5" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 11 11)"
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
      </svg>
      <span style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--app-font-mono)", fontSize: 8, color, fontWeight: 600, letterSpacing: 0,
      }}>
        {clamped}
      </span>
    </span>
  );
}

export function BelowFoldDashboard({
  openLoopsCount,
  ledgerCount,
  parkedCount,
  recents,
  onOpenLedger,
  onOpenParking,
  onOpenSession,
  briefing,
  briefingLoading,
  projectsWithScores,
  onOpenProject,
  activityItems,
}: Props) {
  const lastTitle = recents[0]?.title ?? "your last session";
  const [showBriefing, setShowBriefing] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const hasBriefingCapability = briefing != null || briefingLoading === true;
  const visibleActivity =
    activityItems && (activityExpanded ? activityItems : activityItems.slice(0, 6));

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        width: "100%",
        padding: "24px var(--shell-edge) 0",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <style>{`
        @keyframes briefingSlideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bfd-spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* 1. A Moment for You ---------------------------------------------- */}
      <RevealOnScroll delayMs={0} id="discovery-moment" className="atlas-discovery-card atlas-discovery-moment">
        <div className="atlas-discovery-tag" style={{ color: "#004D40" }}>
          atlas noticed
        </div>
        <p className="atlas-discovery-moment-text">
          You've returned to "{lastTitle}" three times this week.
          Maybe today is the day to commit it.
        </p>
      </RevealOnScroll>

      {/* 2. Where were we (with optional briefing toggle) ---------------- */}
      <RevealOnScroll delayMs={80} id="discovery-where" className="atlas-discovery-card">
        <div className="atlas-discovery-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3>Where were we</h3>
            {hasBriefingCapability && (
              <button
                type="button"
                onClick={() => setShowBriefing((v) => !v)}
                title="Show briefing"
                style={{
                  background: showBriefing ? "color-mix(in oklab, var(--accent-gold) 12%, transparent)" : "transparent",
                  border: `1px solid color-mix(in oklab, var(--accent-gold) ${showBriefing ? 35 : 18}%, transparent)`,
                  borderRadius: 5,
                  padding: "2px 6px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  transition: "all 150ms ease",
                }}
              >
                <span style={{ fontSize: 10, color: "var(--accent-gold)", opacity: showBriefing ? 1 : 0.6, fontFamily: "var(--app-font-mono)" }}>✦</span>
                <span style={{ fontSize: 8.5, color: "var(--accent-gold)", opacity: showBriefing ? 0.9 : 0.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Briefing
                </span>
              </button>
            )}
          </div>
        </div>

        {showBriefing && hasBriefingCapability && (
          <div
            style={{
              marginTop: 8,
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 8,
              background: "color-mix(in oklab, var(--accent-gold) 4%, transparent)",
              border: "1px solid color-mix(in oklab, var(--accent-gold) 12%, transparent)",
              animation: "briefingSlideDown 200ms ease forwards",
            }}
          >
            {briefingLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", border: "1.5px solid color-mix(in oklab, var(--accent-gold) 20%, transparent)", borderTopColor: "var(--accent-gold)", animation: "bfd-spin 0.8s linear infinite" }} />
                <span style={{ fontSize: 11, fontFamily: "var(--app-font-mono)", color: "var(--muted-text)", letterSpacing: "0.04em" }}>
                  Atlas is preparing your briefing…
                </span>
              </div>
            ) : briefing ? (
              (() => {
                const sentences = briefing.split(/(?<=[.!?])\s+/);
                const status = sentences[0] ?? "";
                const rest = sentences.slice(1).join(" ");
                return (
                  <>
                    <p style={{ margin: 0, fontSize: 12.5, color: "var(--foreground)", lineHeight: 1.6, opacity: 0.88 }}>
                      {status}
                    </p>
                    {rest && (
                      <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--accent-gold)", opacity: 0.7, fontStyle: "italic", lineHeight: 1.5 }}>
                        {rest}
                      </p>
                    )}
                  </>
                );
              })()
            ) : (
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--muted-text)", fontStyle: "italic" }}>
                No briefing available yet.
              </p>
            )}
          </div>
        )}

        {recents.length === 0 ? (
          <p className="atlas-discovery-empty">
            No recent sessions yet — start a new thought above.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {recents.slice(0, 4).map((s) => {
              const isPhosphor = s.mode === "explore";
              const dot = isPhosphor ? "var(--phosphor)" : s.mode ? "var(--accent-gold)" : "var(--muted-text)";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onOpenSession(s.id)}
                  className="atlas-discovery-row"
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                  <span className="atlas-discovery-row-title">
                    {s.title || "Untitled session"}
                  </span>
                  <span className="atlas-discovery-row-mode">{s.mode || "think"}</span>
                </button>
              );
            })}
          </div>
        )}
      </RevealOnScroll>

      {/* 3. Project cards with readiness scores (optional) --------------- */}
      {projectsWithScores && projectsWithScores.length > 0 && (
        <RevealOnScroll delayMs={160} id="discovery-projects" className="atlas-discovery-card">
          <div className="atlas-discovery-header">
            <h3>Projects</h3>
            <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)" }}>
              Readiness
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {projectsWithScores.slice(0, 5).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenProject?.(p.id)}
                disabled={!onOpenProject}
                style={{
                  display: "flex", alignItems: "center", gap: 11,
                  width: "100%", padding: "8px", borderRadius: 8,
                  border: "none", background: "transparent",
                  cursor: onOpenProject ? "pointer" : "default", textAlign: "left",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </div>
                  {p.description && (
                    <div style={{ fontSize: 11, color: "var(--muted-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                      {p.description}
                    </div>
                  )}
                </div>
                <CompactReadinessRing score={p.latestSnapshotScore ?? 0} />
                <div style={{ fontSize: 10, color: "var(--muted-text)", fontFamily: "var(--app-font-mono)", flexShrink: 0 }}>
                  {formatRelative(p.updatedAt)}
                </div>
              </button>
            ))}
          </div>
        </RevealOnScroll>
      )}

      {/* 4. Activity feed (optional, rendered only when items provided) -- */}
      {activityItems && (
        <RevealOnScroll delayMs={200} id="discovery-activity" className="atlas-discovery-card">
          <div className="atlas-discovery-header">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3>Activity</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.6 }}>
                {(["commit", "decision", "session"] as const).map((t) => (
                  <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--muted-text)" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: TYPE_COLOR[t], display: "inline-block" }} />
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {activityItems.length === 0 ? (
            <p className="atlas-discovery-empty">No activity yet.</p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {visibleActivity!.map((item, i) => {
                  const dot = TYPE_COLOR[item.type];
                  const label = TYPE_LABEL[item.type];
                  const row = (
                    <div style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "7px 8px", borderRadius: 7,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0, marginTop: 5 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                          <span style={{
                            fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--muted-text)",
                            background: "var(--surface)", border: "1px solid var(--border)",
                            borderRadius: 4, padding: "1px 5px",
                          }}>
                            {item.projectName}
                          </span>
                          <span style={{
                            fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
                            textTransform: "uppercase", color: dot,
                          }}>
                            {label}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.title}
                        </div>
                      </div>
                      <span style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--muted-text)", flexShrink: 0, paddingTop: 2 }}>
                        {formatRelative(item.timestamp)}
                      </span>
                    </div>
                  );
                  if (item.type === "commit" && item.url) {
                    return (
                      <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block" }}>
                        {row}
                      </a>
                    );
                  }
                  return onOpenProject ? (
                    <div key={i} onClick={() => onOpenProject(item.projectId)} style={{ cursor: "pointer" }}>
                      {row}
                    </div>
                  ) : (
                    <div key={i}>{row}</div>
                  );
                })}
              </div>
              {activityItems.length > 6 && (
                <button
                  type="button"
                  onClick={() => setActivityExpanded((v) => !v)}
                  style={{
                    marginTop: 10, background: "transparent", border: "none",
                    fontSize: 10.5, color: "var(--accent-gold)",
                    fontFamily: "var(--app-font-mono)", cursor: "pointer",
                    letterSpacing: "0.04em", padding: "4px 0",
                  }}
                >
                  {activityExpanded ? "SHOW LESS ↑" : `+${activityItems.length - 6} MORE ↓`}
                </button>
              )}
            </>
          )}
        </RevealOnScroll>
      )}

      {/* 5. Your Momentum ------------------------------------------------- */}
      <RevealOnScroll delayMs={260} id="discovery-momentum" className="atlas-discovery-card">
        <div className="atlas-discovery-header">
          <h3>Your Momentum</h3>
          <button type="button" onClick={onOpenLedger} className="atlas-discovery-link">
            Open ledger →
          </button>
        </div>
        <div className="atlas-momentum-grid">
          <div className="atlas-momentum-cell">
            <span className="atlas-momentum-num">{ledgerCount}</span>
            <span className="atlas-momentum-label">decisions committed</span>
          </div>
          <div className="atlas-momentum-cell">
            <span className="atlas-momentum-num">{parkedCount}</span>
            <span className="atlas-momentum-label">items parked</span>
          </div>
        </div>
      </RevealOnScroll>

      {/* 6. Open Loops ---------------------------------------------------- */}
      <RevealOnScroll delayMs={340} id="discovery-loops" className="atlas-discovery-card">
        <div className="atlas-discovery-header">
          <h3>Unfinished Thoughts</h3>
          <button type="button" onClick={onOpenParking} className="atlas-discovery-link">
            Open parking →
          </button>
        </div>
        {openLoopsCount === 0 ? (
          <p className="atlas-discovery-empty">No open loops — you're clear.</p>
        ) : (
          <div className="atlas-momentum-cell" style={{ paddingTop: 4 }}>
            <span className="atlas-momentum-num">{openLoopsCount}</span>
            <span className="atlas-momentum-label">waiting on you</span>
          </div>
        )}
      </RevealOnScroll>

      {/* 7. View full analytics → /dashboard ---------------------------- */}
      <RevealOnScroll delayMs={420}>
        <div style={{ textAlign: "center", paddingTop: 4 }}>
          <Link
            to="/dashboard"
            className="font-mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--accent-gold)",
              textDecoration: "none",
              opacity: 0.75,
              transition: "opacity 140ms",
            }}
          >
            View full analytics →
          </Link>
        </div>
      </RevealOnScroll>
    </div>
  );
}
