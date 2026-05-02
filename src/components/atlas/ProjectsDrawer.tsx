import { useEffect, useState } from "react";
import {
  Plus, X, Folder, ChevronDown, ChevronRight,
  MessageSquare, BookOpen, Inbox, Feather,
  Hammer, Compass, ShieldCheck, LogOut, User as UserIcon,
} from "lucide-react";

export type DrawerProject = {
  id: string;
  name: string;
  thumbnailUrl?: string | null;
};

export type DrawerSession = {
  id: string;
  title: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  projects: DrawerProject[];
  activeProjectId?: string | null;
  onOpenProject: (id: string) => void;
  onNewProject: () => void;
  // New menu wiring (all optional so existing call sites don't break)
  sessions?: DrawerSession[];
  activeSessionId?: string | null;
  onOpenSession?: (id: string) => void;
  onOpenGallery?: () => void;          // "See all projects" → ProjectGallery
  onOpenLedger?: () => void;
  onOpenParkingLot?: () => void;
  onOpenThinkFreely?: () => void;
  onOpenWorkshop?: () => void;
  onOpenCompass?: () => void;
  onOpenGuardReport?: () => void;
  userLabel?: string | null;
  onSignOut?: () => void;
};

/**
 * ProjectsDrawer — full left-side menu.
 *
 *  ┌──────────────────────────┐
 *  │ Projects ▾  [+]          │  (collapsible — list of project chips)
 *  │   • project a            │
 *  │   • project b            │
 *  │   See all projects →     │  (opens rich ProjectGallery sheet)
 *  ├──────────────────────────┤
 *  │ NAVIGATE                 │
 *  │   Sessions ▾             │
 *  │     · session 1          │
 *  │   Decision Ledger        │
 *  │   Parking Lot            │
 *  │   Think Freely           │
 *  ├──────────────────────────┤
 *  │ TOOLS                    │
 *  │   Workshop               │
 *  │   Project Compass        │
 *  │   Guard Report           │
 *  ├──────────────────────────┤
 *  │  user · sign out         │  (pinned)
 *  └──────────────────────────┘
 */
export function ProjectsDrawer({
  open,
  onClose,
  projects,
  activeProjectId,
  onOpenProject,
  onNewProject,
  sessions = [],
  activeSessionId,
  onOpenSession,
  onOpenGallery,
  onOpenLedger,
  onOpenParkingLot,
  onOpenThinkFreely,
  onOpenWorkshop,
  onOpenCompass,
  onOpenGuardReport,
  userLabel,
  onSignOut,
}: Props) {
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [sessionsExpanded, setSessionsExpanded] = useState(true);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const visibleProjects = projects.slice(0, 6);
  const hasMoreProjects = projects.length > visibleProjects.length;

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(2px)",
          zIndex: 90,
        }}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-label="Menu"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "min(86vw, 320px)",
          background: "var(--surface, var(--background))",
          borderRight: "1px solid color-mix(in oklab, var(--accent-gold) 14%, var(--border))",
          boxShadow: "8px 0 32px -8px rgba(0,0,0,0.45)",
          zIndex: 91,
          display: "flex",
          flexDirection: "column",
          animation: "atlas-projects-in 220ms cubic-bezier(.2,.8,.2,1)",
        }}
      >
        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid color-mix(in oklab, var(--accent-gold) 10%, var(--border))",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.02em",
              color: "var(--foreground)",
            }}
          >
            <Folder size={15} strokeWidth={1.6} />
            Menu
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            style={iconBtnStyle}
          >
            <X size={15} strokeWidth={1.6} />
          </button>
        </header>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px 14px" }}>
          {/* ── PROJECTS ── */}
          <SectionHeader
            label="Projects"
            expanded={projectsExpanded}
            onToggle={() => setProjectsExpanded((v) => !v)}
            trailing={
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNewProject();
                  onClose();
                }}
                aria-label="New project"
                style={{ ...iconBtnStyle, width: 24, height: 24 }}
              >
                <Plus size={13} strokeWidth={1.8} />
              </button>
            }
          />
          {projectsExpanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 8 }}>
              {visibleProjects.length === 0 ? (
                <EmptyHint text="No projects yet." />
              ) : (
                visibleProjects.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    active={p.id === activeProjectId}
                    onClick={() => {
                      onOpenProject(p.id);
                      onClose();
                    }}
                  />
                ))
              )}
              {(hasMoreProjects || onOpenGallery) && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenGallery?.();
                    onClose();
                  }}
                  style={{
                    margin: "4px 8px 0",
                    padding: "6px 8px",
                    background: "transparent",
                    border: "none",
                    color: "color-mix(in oklab, var(--accent-gold) 80%, var(--foreground))",
                    fontFamily: "Inter, sans-serif",
                    fontSize: 11.5,
                    fontWeight: 500,
                    textAlign: "left",
                    cursor: "pointer",
                    borderRadius: 6,
                  }}
                >
                  {hasMoreProjects ? `See all ${projects.length} projects →` : "Open project gallery →"}
                </button>
              )}
            </div>
          )}

          <Divider />

          {/* ── NAVIGATE ── */}
          <GroupLabel>Navigate</GroupLabel>

          {/* Sessions (collapsible — only relevant when a project is active) */}
          {activeProjectId && (
            <>
              <SectionHeader
                label="Sessions"
                small
                expanded={sessionsExpanded}
                onToggle={() => setSessionsExpanded((v) => !v)}
                leading={<MessageSquare size={13} strokeWidth={1.6} />}
              />
              {sessionsExpanded && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 6 }}>
                  {sessions.length === 0 ? (
                    <EmptyHint text="No sessions yet." indent />
                  ) : (
                    sessions.slice(0, 8).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          onOpenSession?.(s.id);
                          onClose();
                        }}
                        style={{
                          ...rowStyle,
                          padding: "5px 10px 5px 30px",
                          background:
                            s.id === activeSessionId
                              ? "color-mix(in oklab, var(--accent-gold) 8%, transparent)"
                              : "transparent",
                          fontWeight: s.id === activeSessionId ? 600 : 400,
                        }}
                      >
                        <span style={{ ...rowLabelStyle, fontSize: 12 }}>
                          {s.title || "Untitled"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}

          <NavRow icon={<BookOpen size={14} strokeWidth={1.6} />} label="Decision Ledger" onClick={() => { onOpenLedger?.(); onClose(); }} />
          <NavRow icon={<Inbox size={14} strokeWidth={1.6} />} label="Parking Lot" onClick={() => { onOpenParkingLot?.(); onClose(); }} />
          <NavRow icon={<Feather size={14} strokeWidth={1.6} />} label="Think Freely" onClick={() => { onOpenThinkFreely?.(); onClose(); }} />

          <Divider />

          {/* ── TOOLS ── */}
          <GroupLabel>Tools</GroupLabel>
          <NavRow icon={<Hammer size={14} strokeWidth={1.6} />} label="Workshop" onClick={() => { onOpenWorkshop?.(); onClose(); }} />
          <NavRow icon={<Compass size={14} strokeWidth={1.6} />} label="Project Compass" onClick={() => { onOpenCompass?.(); onClose(); }} />
          <NavRow icon={<ShieldCheck size={14} strokeWidth={1.6} />} label="Guard Report" onClick={() => { onOpenGuardReport?.(); onClose(); }} />
        </div>

        {/* User footer (pinned) */}
        {(userLabel || onSignOut) && (
          <footer
            style={{
              flexShrink: 0,
              padding: "10px 12px calc(env(safe-area-inset-bottom, 0px) + 10px)",
              borderTop: "1px solid color-mix(in oklab, var(--accent-gold) 10%, var(--border))",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 28, height: 28, borderRadius: 8,
                background: "color-mix(in oklab, var(--accent-gold) 18%, var(--surface))",
                border: "1px solid color-mix(in oklab, var(--accent-gold) 25%, var(--border))",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "color-mix(in oklab, var(--accent-gold) 80%, var(--foreground))",
                flexShrink: 0,
              }}
            >
              <UserIcon size={13} strokeWidth={1.7} />
            </div>
            <span
              style={{
                flex: 1, minWidth: 0,
                fontFamily: "Inter, sans-serif",
                fontSize: 12,
                color: "var(--foreground)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {userLabel || "Account"}
            </span>
            {onSignOut && (
              <button
                type="button"
                onClick={() => { onSignOut(); onClose(); }}
                aria-label="Sign out"
                title="Sign out"
                style={iconBtnStyle}
              >
                <LogOut size={14} strokeWidth={1.6} />
              </button>
            )}
          </footer>
        )}
      </aside>

      <style>{`
        @keyframes atlas-projects-in {
          from { transform: translateX(-12px); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
      `}</style>
    </>
  );
}

/* ─── Sub-components ─── */

const iconBtnStyle: React.CSSProperties = {
  width: 30, height: 30,
  display: "flex", alignItems: "center", justifyContent: "center",
  borderRadius: 8, border: "none", background: "transparent",
  color: "var(--foreground)", cursor: "pointer",
};

const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10,
  width: "100%", padding: "7px 10px",
  borderRadius: 8, border: "1px solid transparent",
  background: "transparent", color: "var(--foreground)",
  cursor: "pointer", textAlign: "left",
  transition: "background 140ms ease",
  fontFamily: "Inter, sans-serif",
};

const rowLabelStyle: React.CSSProperties = {
  flex: 1, minWidth: 0,
  fontSize: 12.5, fontWeight: 500,
  letterSpacing: "0.005em",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

function SectionHeader({
  label, expanded, onToggle, trailing, leading, small,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
  leading?: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "2px 4px 2px 6px" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          flex: 1,
          display: "flex", alignItems: "center", gap: 6,
          padding: small ? "5px 6px" : "6px 8px",
          borderRadius: 6, border: "none", background: "transparent",
          color: small
            ? "var(--foreground)"
            : "color-mix(in oklab, var(--accent-gold) 70%, var(--foreground))",
          fontFamily: "Inter, sans-serif",
          fontSize: small ? 12 : 11,
          fontWeight: small ? 500 : 600,
          letterSpacing: small ? "0.005em" : "0.08em",
          textTransform: small ? "none" : "uppercase",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {expanded
          ? <ChevronDown size={11} strokeWidth={1.8} />
          : <ChevronRight size={11} strokeWidth={1.8} />}
        {leading}
        <span style={{ flex: 1 }}>{label}</span>
      </button>
      {trailing}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "6px 14px 4px",
        fontFamily: "Inter, sans-serif",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--muted-text, var(--muted-foreground))",
      }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        margin: "8px 10px",
        background: "color-mix(in oklab, var(--accent-gold) 10%, var(--border))",
      }}
    />
  );
}

function EmptyHint({ text, indent }: { text: string; indent?: boolean }) {
  return (
    <div
      style={{
        padding: indent ? "6px 10px 6px 30px" : "8px 12px",
        fontFamily: "Inter, sans-serif",
        fontSize: 11.5,
        color: "var(--muted-text, var(--muted-foreground))",
      }}
    >
      {text}
    </div>
  );
}

function NavRow({
  icon, label, onClick,
}: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={rowStyle}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          "color-mix(in oklab, var(--accent-gold) 5%, transparent)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      <span style={{ display: "flex", color: "color-mix(in oklab, var(--accent-gold) 60%, var(--foreground))" }}>
        {icon}
      </span>
      <span style={rowLabelStyle}>{label}</span>
    </button>
  );
}

function ProjectRow({
  project, active, onClick,
}: { project: DrawerProject; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...rowStyle,
        padding: "6px 10px",
        background: active
          ? "color-mix(in oklab, var(--accent-gold) 10%, transparent)"
          : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!active)
          (e.currentTarget as HTMLButtonElement).style.background =
            "color-mix(in oklab, var(--accent-gold) 5%, transparent)";
      }}
      onMouseLeave={(e) => {
        if (!active)
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      <div
        style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          background: project.thumbnailUrl
            ? `center/cover url(${project.thumbnailUrl})`
            : "linear-gradient(135deg, color-mix(in oklab, var(--accent-gold) 28%, var(--surface)) 0%, var(--surface) 100%)",
          border: "1px solid color-mix(in oklab, var(--accent-gold) 18%, var(--border))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "Inter, sans-serif",
          fontSize: 11, fontWeight: 600,
          color: "color-mix(in oklab, var(--accent-gold) 80%, var(--foreground))",
        }}
      >
        {!project.thumbnailUrl && (project.name?.[0]?.toUpperCase() || "•")}
      </div>
      <span style={{ ...rowLabelStyle, fontWeight: active ? 600 : 500 }}>
        {project.name}
      </span>
    </button>
  );
}
