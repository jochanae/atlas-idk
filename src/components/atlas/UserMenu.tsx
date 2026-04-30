import { useEffect, useRef, useState } from "react";
import { Sun, Moon, Command, LogOut } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import type { User } from "@supabase/supabase-js";

type Props = {
  user: User;
  theme: "obsidian" | "parchment";
  onThemeChange: (t: "obsidian" | "parchment") => void;
  onSignOut: () => void;
  onOpenShortcuts?: () => void;
};

export function UserMenu({ user, theme, onThemeChange, onSignOut, onOpenShortcuts }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ||
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Account";

  const isObsidian = theme === "obsidian";

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <UserAvatar user={user} size={44} onClick={() => setOpen((o) => !o)} showStatusPulse />

      {open && (
        <div
          role="menu"
          className="atlas-user-menu"
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            width: 248,
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--surface) 96%, transparent) 0%, color-mix(in oklab, var(--background) 92%, transparent) 100%)",
            backdropFilter: "blur(18px) saturate(140%)",
            WebkitBackdropFilter: "blur(18px) saturate(140%)",
            border: "1px solid color-mix(in oklab, var(--accent-gold) 18%, var(--border))",
            borderRadius: 14,
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 60px -20px rgba(0,0,0,0.65), 0 0 0 1px color-mix(in oklab, var(--accent-gold) 6%, transparent)",
            padding: 6,
            zIndex: 80,
            animation: "atlas-menu-in 220ms var(--ease-cinematic, cubic-bezier(.2,.8,.2,1))",
            transformOrigin: "top right",
          }}
        >
          {/* Identity header */}
          <div
            style={{
              padding: "12px 12px 14px",
              borderBottom: "1px solid color-mix(in oklab, var(--accent-gold) 10%, var(--border))",
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--foreground)",
                letterSpacing: "0.01em",
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displayName}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono, ui-monospace, monospace)",
                fontSize: 10.5,
                color: "var(--muted-text, var(--muted-foreground))",
                marginTop: 3,
                letterSpacing: "0.02em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user.email}
            </div>
          </div>

          {/* Inline theme toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 10px",
              borderRadius: 8,
              fontFamily: "Inter, sans-serif",
              fontSize: 12.5,
              color: "var(--foreground)",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isObsidian ? <Moon size={14} strokeWidth={1.5} /> : <Sun size={14} strokeWidth={1.5} />}
              Appearance
            </span>
            <button
              type="button"
              onClick={() => onThemeChange(isObsidian ? "parchment" : "obsidian")}
              aria-label="Toggle theme"
              className="atlas-theme-switch"
              style={{
                position: "relative",
                width: 42,
                height: 22,
                borderRadius: 999,
                border: "1px solid color-mix(in oklab, var(--accent-gold) 30%, var(--border))",
                background: isObsidian
                  ? "color-mix(in oklab, var(--background) 80%, #000)"
                  : "color-mix(in oklab, var(--accent-gold) 35%, #F5E6C7)",
                cursor: "pointer",
                padding: 0,
                transition: "background 300ms var(--ease-cinematic, cubic-bezier(.2,.8,.2,1))",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: isObsidian ? 2 : 22,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: isObsidian
                    ? "linear-gradient(135deg, #2A2724 0%, color-mix(in oklab, var(--accent-gold) 70%, #1C1917) 100%)"
                    : "linear-gradient(135deg, #FFF8E7 0%, #F5E6C7 100%)",
                  boxShadow:
                    "0 1px 3px rgba(0,0,0,0.4), 0 0 6px color-mix(in oklab, var(--accent-gold) 30%, transparent)",
                  transition: "left 300ms var(--ease-cinematic, cubic-bezier(.2,.8,.2,1)), background 300ms ease",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: isObsidian ? "var(--accent-gold)" : "#8B6F2A",
                }}
              >
                {isObsidian ? <Moon size={9} strokeWidth={2} /> : <Sun size={9} strokeWidth={2} />}
              </span>
            </button>
          </div>

          {/* Shortcuts */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenShortcuts?.();
            }}
            className="atlas-menu-item"
            style={menuItemStyle}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Command size={14} strokeWidth={1.5} />
              Shortcuts
            </span>
            <span style={kbdHintStyle}>⌘ /</span>
          </button>

          {/* Divider */}
          <div
            style={{
              height: 1,
              margin: "6px 8px",
              background: "color-mix(in oklab, var(--accent-gold) 8%, var(--border))",
            }}
          />

          {/* Sign out */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="atlas-menu-item atlas-menu-danger"
            style={menuItemStyle}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <LogOut size={14} strokeWidth={1.5} />
              Sign out
            </span>
            <span style={kbdHintStyle}>⌘ ⇧ Q</span>
          </button>
        </div>
      )}

      <style>{`
        @keyframes atlas-menu-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .atlas-menu-item {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border-radius: 8px;
          background: transparent;
          border: none;
          color: var(--foreground);
          font-family: Inter, sans-serif;
          font-size: 12.5px;
          cursor: pointer;
          transition: background 160ms ease, color 160ms ease;
        }
        .atlas-menu-item:hover {
          background: color-mix(in oklab, var(--accent-gold) 8%, transparent);
          color: color-mix(in oklab, var(--accent-gold) 85%, var(--foreground));
        }
        .atlas-menu-danger:hover {
          background: color-mix(in oklab, #c0392b 14%, transparent);
          color: #f1a89e;
        }
      `}</style>
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  width: "100%",
};

const kbdHintStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  fontSize: 10,
  letterSpacing: "0.06em",
  color: "color-mix(in oklab, var(--muted-text, var(--muted-foreground)) 70%, transparent)",
  opacity: 0.7,
};
