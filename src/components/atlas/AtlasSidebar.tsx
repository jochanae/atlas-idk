import { useEffect } from "react";
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
  User as UserIcon,
} from "lucide-react";
import type { RecentSession } from "./AtlasFrontDoor";

type Theme = "obsidian" | "parchment";

export function AtlasSidebar({
  open,
  onClose,
  recents,
  parkedCount,
  ledgerCount,
  onNewSession,
  onOpenSession,
  onOpenParking,
  email,
  theme,
  onToggleTheme,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  recents: RecentSession[];
  parkedCount: number;
  ledgerCount: number;
  onNewSession: () => void;
  onOpenSession: (id: string) => void;
  onOpenParking: () => void;
  email: string | null;
  theme: Theme;
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
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
        }}
      >
        {/* Header — toggle + wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px 12px",
            borderBottom: "0.5px solid var(--glass-border)",
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
          <span style={{ width: 18 }} />
        </div>

        {/* Top — actions */}
        <div style={{ padding: "12px 10px 8px" }}>
          <SidebarItem icon={<Plus size={15} />} label="New session" onClick={onNewSession} />
          <SidebarItem icon={<Search size={15} />} label="Search" disabled hint="soon" />
        </div>

        {/* Middle — Recents */}
        <SectionLabel>Recent sessions</SectionLabel>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 8px" }}>
          {recents.length === 0 ? (
            <EmptyState text="no sessions yet — start one from the front door." />
          ) : (
            recents.map((s) => {
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
          }}
        >
          <SidebarItem
            icon={theme === "obsidian" ? <Sun size={15} /> : <Moon size={15} />}
            label={theme === "obsidian" ? "Parchment theme" : "Obsidian theme"}
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
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "var(--ember)",
                color: "var(--background)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <UserIcon size={13} />
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
        padding: 6,
        marginRight: 4,
        display: "flex",
        alignItems: "center",
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
