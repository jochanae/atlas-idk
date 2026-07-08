import { useEffect, useRef, useState, type ReactNode } from "react";
import { PortfolioHealthDashboard } from "./PortfolioHealthDashboard";
import { CognitiveMomentumCard } from "./home/CognitiveMomentumCard";
import { useProjectState } from "../hooks/useProjectState";
import { QuickEditRow, type QuickEditProjectOption } from "./home/QuickEditRow";
// ActiveRuns moved into AtlasComposerSheet (opened from project drawer)
import { Resume } from "./Resume";
import { useAuth } from "../hooks/useAuth";

type RecentProject = {
  id: number;
  name: string;
  description?: string | null;
  updatedAt: string;
  latestSnapshotScore?: number | null;
};

type Props = {
  projects: RecentProject[];
  onOpenProject: (id: number) => void;
  onOpenLedger?: () => void;
  onOpenParking?: () => void;
  onCreateProject?: () => void;
  committedCount?: number;
  parkedCount?: number;
  bustSignal?: number;
};

type ActivityItem = {
  type: "commit" | "decision" | "session";
  projectId: number;
  projectName: string;
  title: string;
  subtitle?: string;
  url?: string;
  sha?: string;
  timestamp: string;
};

function RevealOnScroll({ children, delayMs = 0, className }: { children: ReactNode; delayMs?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setRevealed(true); return; }
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) { setRevealed(true); obs.disconnect(); } },
      { threshold: 0.12, rootMargin: "0px 0px -30px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={{
      opacity: revealed ? 1 : 0,
      transform: revealed ? "translateY(0)" : "translateY(14px)",
      transition: `opacity 550ms cubic-bezier(0.4,0,0.2,1) ${delayMs}ms, transform 550ms cubic-bezier(0.4,0,0.2,1) ${delayMs}ms`,
    }}>
      {children}
    </div>
  );
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

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const TYPE_COLOR: Record<ActivityItem["type"], string> = {
  commit:   "rgba(74,222,128,0.75)",
  decision: "rgba(201,162,76,0.8)",
  session:  "rgba(99,102,241,0.75)",
};

const TYPE_LABEL: Record<ActivityItem["type"], string> = {
  commit:   "push",
  decision: "decision",
  session:  "session",
};

function RecentActivityCard({
  projectOptions,
}: {
  projectOptions: QuickEditProjectOption[];
}) {
  const { user: authUser } = useAuth();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!authUser) return;
    fetch("/api/nexus/activity", { credentials: "include" })
      .then(r => r.ok ? r.json() : { items: [] })
      .then((data: { items: ActivityItem[] }) => setItems(data.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authUser]);

  const visible = expanded ? items : items.slice(0, 6);

  return (
    <div className="atlas-discovery-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 9.5, fontWeight: 600, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7 }}>
            Recent Activity
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.55 }}>
            {(["commit", "decision", "session"] as const).map(t => (
              <span key={t} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", letterSpacing: "0.04em" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: TYPE_COLOR[t], display: "inline-block", flexShrink: 0 }} />
                {t}
              </span>
            ))}
          </div>
        </div>
        <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.4 }}>
          Ledger
        </span>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0" }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%", border: "1.5px solid rgba(201,162,76,0.2)", borderTopColor: "rgba(201,162,76,0.7)", animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontSize: 11, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.5, letterSpacing: "0.04em" }}>Syncing…</span>
        </div>
      ) : items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--atlas-muted)", opacity: 0.5, fontStyle: "italic", lineHeight: 1.5 }}>
          No activity yet. Link a GitHub repo or start a workspace session.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {visible.map((item, i) => (
              <QuickEditRow
                key={`${item.type}-${item.projectId}-${item.timestamp}-${i}`}
                projectId={item.projectId}
                projectName={item.projectName}
                projects={projectOptions}
                row={<ActivityRowBody item={item} />}
              />
            ))}
          </div>
          {items.length > 6 && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              style={{ marginTop: 10, background: "transparent", border: "none", fontSize: 10.5, color: "var(--atlas-gold)", fontFamily: "var(--app-font-mono)", cursor: "pointer", letterSpacing: "0.04em", opacity: 0.7, padding: "4px 0" }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; }}
            >
              {expanded ? "SHOW LESS ↑" : `+${items.length - 6} MORE ↓`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ActivityRowBody({ item }: { item: ActivityItem }) {
  const dot = TYPE_COLOR[item.type];
  const label = TYPE_LABEL[item.type];
  const [showSheet, setShowSheet] = useState(false);

  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "7px 8px", borderRadius: 7,
        transition: "background 140ms ease",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(201,162,76,0.04)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: 3 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
          <span style={{
            fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)",
            background: "var(--atlas-surface)", border: "1px solid var(--atlas-border)",
            borderRadius: 4, padding: "1px 5px", letterSpacing: "0.04em", flexShrink: 0,
            whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {item.projectName}
          </span>
          <span style={{
            fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
            textTransform: "uppercase", color: dot, opacity: 0.8, flexShrink: 0,
          }}>
            {label}
          </span>
          {item.type === "commit" && item.sha ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowSheet(true);
              }}
              style={{
                background: "transparent", border: "none", padding: 0, margin: 0,
                cursor: "pointer", lineHeight: 1, flexShrink: 0,
              }}
              aria-label="Show commit details"
            >
              <span style={{ fontSize: 8.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-gold)", letterSpacing: "0.04em", textDecoration: "underline", textDecorationThickness: "1px", textUnderlineOffset: 2 }}>
                {item.sha}
              </span>
            </button>
          ) : item.sha ? (
            <span style={{ fontSize: 8.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45, letterSpacing: "0.04em" }}>
              {item.sha}
            </span>
          ) : null}
          {item.type === "commit" && item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)",
                opacity: 0.5, letterSpacing: "0.04em", textDecoration: "none",
                padding: "1px 4px", borderRadius: 3,
              }}
              aria-label="Open commit on GitHub"
            >
              ↗
            </a>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--atlas-fg)", opacity: 0.82, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--app-font-sans)" }}>
          {item.title}
        </div>
        {item.subtitle && (
          <div style={{ fontSize: 11, color: "var(--atlas-muted)", opacity: 0.55, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.subtitle}
          </div>
        )}
      </div>

      <span style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.4, flexShrink: 0, paddingTop: 2, letterSpacing: "0.02em" }}>
        {formatRelative(item.timestamp)}
      </span>

      {showSheet && item.type === "commit" && item.sha && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Commit details"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9999,
            maxHeight: "70vh", overflowY: "auto",
            background: "rgba(var(--atlas-bg-rgb),0.96)",
            borderTop: "1px solid rgba(var(--atlas-gold-rgb),0.28)",
            borderRadius: "18px 18px 0 0",
            boxShadow: "0 -18px 48px rgba(var(--atlas-bg-rgb),0.85)",
            backdropFilter: "blur(18px)",
            padding: "18px 18px calc(18px + env(safe-area-inset-bottom))",
          }}
        >
          <div style={{ width: 36, height: 3, borderRadius: 999, background: "rgba(var(--atlas-gold-rgb),0.28)", margin: "0 auto 16px" }} />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowSheet(false);
            }}
            aria-label="Close commit details"
            style={{
              position: "absolute", top: 14, right: 16,
              background: "transparent", border: "none", color: "var(--atlas-muted)",
              fontSize: 20, cursor: "pointer", padding: 0, lineHeight: 1,
            }}
          >
            ×
          </button>
          <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.65, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
                Commit SHA
              </div>
              <div style={{ fontSize: 12, fontFamily: "var(--app-font-mono)", color: "var(--atlas-gold)", lineHeight: 1.5, overflowWrap: "anywhere" }}>
                {item.sha}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.65, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 }}>
                Project
              </div>
              <div style={{ fontSize: 13, color: "var(--atlas-fg)", opacity: 0.88, lineHeight: 1.4 }}>
                {item.projectName}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.65, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 }}>
                Commit message
              </div>
              <div style={{ fontSize: 13, color: "var(--atlas-fg)", opacity: 0.88, lineHeight: 1.5 }}>
                {item.title}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.65, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 }}>
                Timestamp
              </div>
              <div style={{ fontSize: 12, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.8, lineHeight: 1.4 }}>
                {formatTimestamp(item.timestamp)}
              </div>
            </div>
            {item.url && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(item.url, "_blank", "noopener,noreferrer");
                }}
                style={{
                  alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 7,
                  marginTop: 4, padding: "6px 10px", borderRadius: 7, cursor: "pointer",
                  background: "transparent", border: "1px solid var(--atlas-border)",
                  color: "var(--atlas-muted)", fontSize: 10.5, fontFamily: "var(--app-font-mono)",
                  letterSpacing: "0.04em",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
                View on GitHub
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function BelowFoldDashboard({ projects, onOpenProject, onOpenLedger, onOpenParking, onCreateProject, committedCount = 0, parkedCount, bustSignal }: Props) {
  const mostRecentProjectId = projects.reduce<number | null>((latestId, project) => {
    if (latestId == null) return project.id;
    const latestProject = projects.find((p) => p.id === latestId);
    if (!latestProject) return project.id;
    return new Date(project.updatedAt).getTime() > new Date(latestProject.updatedAt).getTime()
      ? project.id
      : latestId;
  }, null);
  const projectState = useProjectState(mostRecentProjectId);

  if (projects.length === 0) {
    return (
      <div className="atlas-below-fold-dashboard" style={{ width: "100%", maxWidth: 560, padding: "0 0 120px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ flex: 1, height: 1, background: "var(--atlas-gold-border)" }} />
          <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.4 }}>
            Your overview
          </span>
          <div style={{ flex: 1, height: 1, background: "var(--atlas-gold-border)" }} />
        </div>

        <div className="atlas-discovery-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10, padding: "32px 24px" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid rgba(201,162,76,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(201,162,76,0.5)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--atlas-fg)", opacity: 0.75, lineHeight: 1.5, fontFamily: "var(--app-font-sans)" }}>
            Your workspace overview appears here
          </p>
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--atlas-muted)", opacity: 0.5, lineHeight: 1.6, fontStyle: "italic", maxWidth: 300 }}>
            Activity, portfolio health, and momentum will populate as you start working on projects.
          </p>
          {onCreateProject && (
            <button
              type="button"
              onClick={onCreateProject}
              style={{
                marginTop: 14,
                padding: "10px 18px",
                borderRadius: 999,
                border: "1px solid rgba(201,162,76,0.45)",
                background: "color-mix(in oklab, var(--atlas-gold) 10%, transparent)",
                color: "var(--atlas-gold)",
                fontSize: 12.5,
                fontFamily: "var(--app-font-mono)",
                letterSpacing: "0.06em",
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              + Create your first project
            </button>
          )}
        </div>

        <div className="atlas-discovery-card" style={{ opacity: 0.45 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 9.5, fontWeight: 600, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7 }}>
            Activity
          </h3>
          <p style={{ margin: 0, fontSize: 12, color: "var(--atlas-muted)", fontStyle: "italic", lineHeight: 1.5 }}>
            No activity yet. Link a GitHub repo or start a workspace session.
          </p>
        </div>

        <div className="atlas-discovery-card" style={{ opacity: 0.45 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 9.5, fontWeight: 600, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7 }}>
            Cognitive Momentum
          </h3>
          <p style={{ margin: 0, fontSize: 12, color: "var(--atlas-muted)", fontStyle: "italic", lineHeight: 1.5 }}>
            Ideas waiting for their moment.
          </p>
        </div>
      </div>
    );
  }

  const actualParked = projectState.state ? projectState.parkedCount : parkedCount ?? projects.length;

  return (
    <div className="atlas-below-fold-dashboard" style={{ width: "100%", maxWidth: 560, padding: "0 0 120px", display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{`
        @keyframes briefingSlideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bfd-spin { to { transform: rotate(360deg); } }
        @keyframes bfd-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <div style={{ flex: 1, height: 1, background: "var(--atlas-gold-border)" }} />
        <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.4 }}>
          Your overview
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--atlas-gold-border)" }} />
      </div>

      {/* RESUME — continuity surface */}
      <RevealOnScroll delayMs={0} className="bfd-col-left">
        <Resume
          recentProjects={projects.slice(0, 4)}
          onOpenProject={onOpenProject}
          bustSignal={bustSignal}
        />
      </RevealOnScroll>

      {/* PORTFOLIO HEALTH DASHBOARD */}
      <RevealOnScroll delayMs={40} className="bfd-col-left">
        <PortfolioHealthDashboard onOpenProject={onOpenProject} />
      </RevealOnScroll>

      {/* ACTIVE RUNS moved to the project drawer → Tools → Atlas Composer */}


      {/* RECENT ACTIVITY */}
      <RevealOnScroll delayMs={100} className="bfd-col-left">
        <RecentActivityCard
          projectOptions={projects.map((p) => ({ id: p.id, name: p.name }))}
        />
      </RevealOnScroll>

      {/* COGNITIVE MOMENTUM */}
      <RevealOnScroll delayMs={120} className="bfd-col-right">
        <CognitiveMomentumCard onOpenParking={onOpenParking} />
      </RevealOnScroll>
    </div>
  );
}
