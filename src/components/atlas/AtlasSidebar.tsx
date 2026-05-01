import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  PanelLeft,
  Plus,
  Search,
  BookOpen,
  ParkingCircle,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import type { RecentSession } from "./AtlasFrontDoor";
import type { BuildStateEntry } from "./BuildStateTimeline";
import { BuildStateTimeline } from "./BuildStateTimeline";
import type { User } from "@supabase/supabase-js";

type Theme = "obsidian" | "parchment";

type ProjectThumb = {
  id: string;
  name: string;
  thumbnailUrl?: string | null;
};

export function AtlasSidebar({
  open,
  onClose,
  recents,
  parkedCount,
  ledgerCount,
  onNewSession,
  onNewProject,
  onOpenSession,
  onOpenParking,
  onOpenProjects,
  email,
  theme,
  onToggleTheme,
  onSignOut,
  user,
  projects,
  buildHistory,
}: {
  open: boolean;
  onClose: () => void;
  recents: RecentSession[];
  parkedCount: number;
  ledgerCount: number;
  onNewSession: () => void;
  onNewProject?: () => void;
  onOpenSession: (id: string) => void;
  onOpenParking: () => void;
  onOpenProjects?: () => void;
  email: string | null;
  theme: Theme;
  onToggleTheme: () => void;
  onSignOut: () => void;
  user?: User | null;
  projects?: ProjectThumb[];
  buildHistory?: BuildStateEntry[];
}) {
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [recentsExpanded, setRecentsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // Filter projects & sessions by search query
  const q = searchQuery.toLowerCase().trim();
  const filteredProjects = useMemo(
    () => (projects ?? []).filter((p) => !q || p.name.toLowerCase().includes(q)),
    [projects, q],
  );
  const filteredRecents = useMemo(
    () => recents.filter((s) => !q || (s.title || "").toLowerCase().includes(q)),
    [recents, q],
  );

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Avatar
  const avatarUrl =
    user?.user_metadata?.avatar_url ??
    user?.user_metadata?.picture ??
    null;
  const avatarInitial = (email ?? "A")[0].toUpperCase();

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 280ms var(--ease-cinematic)",
          zIndex: 60,
        }}
      />
      {/* Drawer */}
      <aside
        aria-hidden={!open}
        className="atlas-sidebar-scroll"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "min(86vw, 320px)",
          background: "var(--glass-bg)",
          backdropFilter: "blur(var(--glass-blur)) saturate(140%)",
          WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(140%)",
          borderRight: "0.5px solid var(--glass-border)",
          boxShadow: "12px 0 48px rgba(0,0,0,0.6)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 320ms var(--ease-cinematic)",
          zIndex: 70,
          display: "flex",
          flexDirection: "column",
          color: "var(--foreground)",
          overflowY: "auto",
        }}
      >
        {/* Header — toggle + wordmark + avatar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px 12px",
            borderBottom: "0.5px solid var(--glass-border)",
            position: "sticky",
            top: 0,
            zIndex: 2,
            background: "var(--glass-bg)",
            backdropFilter: "blur(var(--glass-blur))",
          }}
        >
          <button
            onClick={onClose}
            aria-label="Close sidebar"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted-text)",
              cursor: "pointer",
              padding: 4,
              display: "flex",
            }}
          >
            <PanelLeft size={18} />
          </button>
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: "0.08em",
              color: "var(--foreground)",
            }}
          >
            Atlas
          </span>
          {/* User avatar */}
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              overflow: "hidden",
              flexShrink: 0,
              border: "1.5px solid color-mix(in oklab, var(--accent-gold) 45%, transparent)",
              boxShadow: "0 0 6px rgba(212,175,55,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: avatarUrl
                ? "transparent"
                : "linear-gradient(135deg, #2A2724, #1C1917)",
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "color-mix(in oklab, var(--accent-gold) 75%, #F5E6C7)",
                }}
              >
                {avatarInitial}
              </span>
            )}
          </span>
        </div>

        {/* Search bar — top of sidebar */}
        <div style={{ padding: "10px 12px 4px" }}>
          {searchOpen ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "var(--surface-alt)",
                borderRadius: 8,
                border: "0.5px solid var(--glass-border)",
                padding: "0 8px",
                height: 34,
              }}
            >
              <Search size={13} style={{ color: "var(--muted-text)", flexShrink: 0 }} />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects & sessions…"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--foreground)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.02em",
                }}
              />
              <button
                onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, display: "flex", color: "var(--muted-text)" }}
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "6px 4px",
                borderRadius: 6,
                color: "var(--muted-text)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-alt)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Search size={14} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.04em" }}>
                Search projects & sessions
              </span>
            </button>
          )}
        </div>

        {/* My Projects — collapsible (chevron toggles local state only) */}
        {projects && (
          <>
            <button
              onClick={() => setProjectsExpanded((v) => !v)}
              aria-expanded={projectsExpanded}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 16px 6px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  color: "var(--muted-text)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  flex: 1,
                }}
              >
                My Projects
              </span>
              {projectsExpanded ? (
                <ChevronDown size={12} style={{ color: "var(--muted-text)" }} />
              ) : (
                <ChevronRight size={12} style={{ color: "var(--muted-text)" }} />
              )}
            </button>
            <div
              style={{
                maxHeight: projectsExpanded ? "min(56vh, 620px)" : 0,
                overflowY: projectsExpanded ? "auto" : "hidden",
                overflowX: "hidden",
                transition: "max-height 300ms cubic-bezier(.2,.8,.2,1)",
                padding: projectsExpanded ? "0 12px 14px" : "0 12px 0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  paddingTop: 6,
                }}
              >
                {filteredProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onOpenProjects?.()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: "0.5px solid transparent",
                      background: "transparent",
                      cursor: "pointer",
                      width: "100%",
                      textAlign: "left",
                      transition: "background 160ms ease, border-color 160ms ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--surface-alt)";
                      e.currentTarget.style.borderColor = "color-mix(in oklab, var(--accent-gold) 25%, transparent)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = "transparent";
                    }}
                  >
                    {/* 44x44 PWA-standard thumbnail */}
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        flexShrink: 0,
                        borderRadius: 10,
                        border: "0.5px solid var(--glass-border)",
                        background: "linear-gradient(135deg, color-mix(in oklab, var(--accent-gold) 8%, var(--background)), color-mix(in oklab, var(--accent-gold) 3%, var(--surface)))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      {p.thumbnailUrl ? (
                        <img
                          src={p.thumbnailUrl}
                          alt={p.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 28 28" fill="none" stroke="var(--accent-gold)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }}>
                          <rect x="3" y="3" width="22" height="16" rx="2" />
                          <circle cx="9" cy="10" r="2" />
                          <path d="M25 15l-5-4-4 3-3-2-7 5" />
                        </svg>
                      )}
                    </div>
                    {/* Project name to the right */}
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontFamily: "var(--font-sans)",
                        fontSize: 13,
                        color: "var(--foreground)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        letterSpacing: "-0.005em",
                      }}
                    >
                      {p.name}
                    </span>
                  </button>
                ))}
                {/* + New Project row */}
                {!q && (
                  <button
                    onClick={onNewProject ?? onNewSession}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: "1px dashed color-mix(in oklab, var(--accent-gold) 25%, transparent)",
                      background: "transparent",
                      cursor: "pointer",
                      width: "100%",
                      textAlign: "left",
                      transition: "background 160ms ease, border-color 160ms ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "color-mix(in oklab, var(--accent-gold) 5%, transparent)";
                      e.currentTarget.style.borderColor = "color-mix(in oklab, var(--accent-gold) 50%, transparent)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = "color-mix(in oklab, var(--accent-gold) 25%, transparent)";
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        flexShrink: 0,
                        borderRadius: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Plus size={18} style={{ color: "var(--accent-gold)", opacity: 0.7 }} />
                    </div>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--accent-gold)",
                        opacity: 0.75,
                      }}
                    >
                      New project
                    </span>
                  </button>
                )}
              </div>
              {q && filteredProjects.length === 0 && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-text)", padding: "8px 4px", textAlign: "center" }}>
                  No matching projects
                </div>
              )}
            </div>
          </>
        )}

        {/* New session action */}
        <div style={{ padding: "4px 10px 2px" }}>
          <SidebarItem icon={<Plus size={15} />} label="New session" onClick={onNewSession} />
        </div>

        {/* Recent Sessions — collapsible */}
        <button
          onClick={() => setRecentsExpanded((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 16px 4px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              color: "var(--muted-text)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              flex: 1,
            }}
          >
            Recent sessions
          </span>
          {recentsExpanded ? (
            <ChevronDown size={12} style={{ color: "var(--muted-text)" }} />
          ) : (
            <ChevronRight size={12} style={{ color: "var(--muted-text)" }} />
          )}
        </button>
        <div
          style={{
            maxHeight: recentsExpanded ? 2000 : 0,
            overflow: "hidden",
            transition: "max-height 300ms cubic-bezier(.2,.8,.2,1)",
            padding: recentsExpanded ? "0 clamp(4px, 2vw, 6px) 8px" : "0 clamp(4px, 2vw, 6px) 0",
          }}
        >
          {filteredRecents.length === 0 ? (
            <EmptyState text={q ? "No matching sessions" : "no sessions yet — start one from the front door."} />
          ) : (
            filteredRecents.map((s) => {
              const isPhosphor = s.mode === "explore";
              const dot = isPhosphor ? "#06B6D4" : s.mode ? "#EA580C" : "#2C2926";
              return (
                <button
                  key={s.id}
                  onClick={() => onOpenSession(s.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    background: "transparent",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    textAlign: "left",
                    color: "var(--foreground)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-alt)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: dot,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 12.5,
                        color: "var(--foreground)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {s.title || "Untitled"}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontFamily: "var(--font-mono)",
                        fontSize: 9.5,
                        color: "var(--muted-text)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginTop: 1,
                      }}
                    >
                      {s.mode || "think"} · {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Build State Timeline (last N steps) */}
        {buildHistory && buildHistory.length > 0 && (
          <div style={{ padding: "0 10px 8px" }}>
            <BuildStateTimeline entries={buildHistory.slice(-6)} />
          </div>
        )}

        {/* Workspace links */}
        <SectionLabel>Workspace</SectionLabel>
        <div style={{ padding: "0 10px 10px" }}>
          <SidebarItem
            icon={<ParkingCircle size={15} />}
            label="Parking Lot"
            badge={parkedCount > 0 ? parkedCount : undefined}
            onClick={onOpenParking}
            ghost={parkedCount === 0}
            ghostHint="nothing parked yet"
          />
          <SidebarLinkItem
            to="/ledger"
            icon={<BookOpen size={15} />}
            label="Ledger"
            badge={ledgerCount > 0 ? ledgerCount : undefined}
            ghost={ledgerCount === 0}
            ghostHint="no decisions yet — commit one from Decide mode"
            onClick={onClose}
          />
        </div>

        {/* Bottom — theme + profile */}
        <div
          style={{
            borderTop: "0.5px solid var(--glass-border)",
            padding: "10px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            marginTop: "auto",
          }}
        >
          <SidebarItem
            icon={theme === "obsidian" ? <Sun size={15} /> : <Moon size={15} />}
            label={theme === "obsidian" ? "Executive Light theme" : "Obsidian theme"}
            onClick={onToggleTheme}
            hint="preview"
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px",
              borderRadius: 6,
              background: "var(--surface-alt)",
              border: "0.5px solid var(--glass-border)",
              marginTop: 4,
            }}
          >
            {/* Profile avatar */}
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                overflow: "hidden",
                flexShrink: 0,
                border: "1px solid color-mix(in oklab, var(--accent-gold) 35%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: avatarUrl
                  ? "transparent"
                  : "var(--ember)",
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--background)",
                  }}
                >
                  {avatarInitial}
                </span>
              )}
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 11.5,
                color: "var(--foreground)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {email ?? "—"}
            </span>
            <button
              onClick={onSignOut}
              aria-label="Sign out"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--muted-text)",
                cursor: "pointer",
                padding: 4,
                display: "flex",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ember)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted-text)")}
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open sidebar"
      style={{
        background: "transparent",
        border: "none",
        color: "var(--muted-text)",
        cursor: "pointer",
        width: 40,
        height: 40,
        padding: 0,
        marginRight: 2,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        flexShrink: 0,
        transition: "color 180ms var(--ease-cinematic), filter 180ms var(--ease-cinematic)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--ember)";
        e.currentTarget.style.filter = "drop-shadow(0 0 6px rgba(234,88,12,0.5))";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--muted-text)";
        e.currentTarget.style.filter = "none";
      }}
    >
      <PanelLeft size={18} />
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 16px 6px",
        fontFamily: "var(--font-mono)",
        fontSize: 9.5,
        color: "var(--muted-text)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  onClick,
  badge,
  hint,
  disabled,
  ghost,
  ghostHint,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  badge?: number;
  hint?: string;
  disabled?: boolean;
  ghost?: boolean;
  ghostHint?: string;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={ghost && ghostHint ? ghostHint : undefined}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        background: "transparent",
        border: "none",
        borderRadius: 6,
        cursor: disabled ? "default" : "pointer",
        textAlign: "left",
        color: disabled || ghost ? "var(--muted-text)" : "var(--foreground)",
        opacity: disabled ? 0.45 : 1,
        fontSize: 13,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = "var(--surface-alt)";
      }}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ display: "flex", color: "var(--muted-text)" }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {typeof badge === "number" && (
        <span
          style={{
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            background: "var(--ember)",
            color: "var(--background)",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 5px",
          }}
        >
          {badge}
        </span>
      )}
      {hint && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--muted-text)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {hint}
        </span>
      )}
    </button>
  );
}

function SidebarLinkItem({
  to,
  icon,
  label,
  badge,
  ghost,
  ghostHint,
  onClick,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  ghost?: boolean;
  ghostHint?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      title={ghost && ghostHint ? ghostHint : undefined}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        borderRadius: 6,
        textDecoration: "none",
        color: ghost ? "var(--muted-text)" : "var(--foreground)",
        fontSize: 13,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-alt)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ display: "flex", color: "var(--muted-text)" }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {typeof badge === "number" && (
        <span
          style={{
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            background: "var(--ember)",
            color: "var(--background)",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 5px",
          }}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        margin: "4px 8px",
        border: "0.5px dashed var(--border)",
        borderRadius: 6,
        fontSize: 11.5,
        color: "var(--muted-text)",
        lineHeight: 1.5,
      }}
    >
      {text}
    </div>
  );
}
