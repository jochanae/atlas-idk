import { useEffect, useRef, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

type ThemeId = "obsidian" | "parchment";
type Mode = "light" | "dark" | "system";

type Props = {
  theme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
};

const STORAGE_KEY = "atlas.theme.mode";

function systemPrefersDark() {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

function modeToTheme(mode: Mode): ThemeId {
  if (mode === "light") return "parchment";
  if (mode === "dark") return "obsidian";
  return systemPrefersDark() ? "obsidian" : "parchment";
}

export function ThemeDropdown({ theme, onThemeChange }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem(STORAGE_KEY) as Mode | null) ?? "dark";
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  // Apply mode → theme on mount + when mode changes
  useEffect(() => {
    const applied = modeToTheme(mode);
    if (applied !== theme) onThemeChange(applied);
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to OS theme changes when in system mode
  useEffect(() => {
    if (mode !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => onThemeChange(mq.matches ? "obsidian" : "parchment");
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [mode, onThemeChange]);

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

  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Theme"
        title="Theme"
        style={{
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 10,
          border: "1px solid color-mix(in oklab, var(--accent-gold) 18%, var(--border))",
          background: "color-mix(in oklab, var(--surface) 80%, transparent)",
          color: "var(--foreground)",
          cursor: "pointer",
          transition: "background 160ms ease, border-color 160ms ease",
        }}
      >
        <Icon size={15} strokeWidth={1.6} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            minWidth: 160,
            background: "var(--surface)",
            border: "1px solid color-mix(in oklab, var(--accent-gold) 18%, var(--border))",
            borderRadius: 12,
            boxShadow: "0 24px 60px -20px rgba(0,0,0,0.55)",
            padding: 4,
            zIndex: 80,
          }}
        >
          {(["light", "dark", "system"] as Mode[]).map((m) => {
            const ItemIcon = m === "light" ? Sun : m === "dark" ? Moon : Monitor;
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "none",
                  background: active
                    ? "color-mix(in oklab, var(--accent-gold) 12%, transparent)"
                    : "transparent",
                  color: active
                    ? "color-mix(in oklab, var(--accent-gold) 85%, var(--foreground))"
                    : "var(--foreground)",
                  fontFamily: "Inter, sans-serif",
                  fontSize: 12.5,
                  textTransform: "capitalize",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <ItemIcon size={14} strokeWidth={1.5} />
                {m}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
