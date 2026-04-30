import { useState } from "react";
import { X, Check } from "lucide-react";

/* ──────────────────────────────────────────────────────────
   Design System Engine
   
   A bottom-sheet panel for managing Atlas's Luxury Obsidian
   design tokens. Users can view/switch themes and see the
   active token palette. Generated code automatically uses
   the active design system.
   ────────────────────────────────────────────────────────── */

export type ThemeId = "obsidian" | "parchment" | "midnight" | "ember";

export interface ThemePreset {
  id: ThemeId;
  name: string;
  description: string;
  colors: {
    background: string;
    surface: string;
    foreground: string;
    accent: string;
    muted: string;
  };
}

const THEME_PRESETS: ThemePreset[] = [
  {
    id: "obsidian",
    name: "Luxury Obsidian",
    description: "Dark volcanic stone with gold accents. The default Atlas aesthetic.",
    colors: {
      background: "#1a1814",
      surface: "#23201b",
      foreground: "#e8e4dd",
      accent: "#c9a24c",
      muted: "#6b6560",
    },
  },
  {
    id: "parchment",
    name: "Parchment",
    description: "Warm light theme inspired by aged paper and ink.",
    colors: {
      background: "#f5f0e8",
      surface: "#ebe5da",
      foreground: "#2d2a26",
      accent: "#8b6914",
      muted: "#9a9590",
    },
  },
  {
    id: "midnight",
    name: "Midnight Indigo",
    description: "Deep navy with electric indigo accents. Sophisticated tech feel.",
    colors: {
      background: "#0a0a1a",
      surface: "#141432",
      foreground: "#e0e0f0",
      accent: "#4f46e5",
      muted: "#5a5880",
    },
  },
  {
    id: "ember",
    name: "Charcoal & Ember",
    description: "Dark charcoal with warm ember accents. Premium and bold.",
    colors: {
      background: "#1a1a1a",
      surface: "#2d2d2d",
      foreground: "#e8e4dd",
      accent: "#e85d3a",
      muted: "#6b6560",
    },
  },
];

// ─── Token display ───────────────────────────────────────

function TokenRow({ label, value, preview }: { label: string; value: string; preview: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 0",
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          background: preview,
          border: "0.5px solid rgba(255,255,255,0.1)",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--muted-text)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          width: 80,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          color: "var(--foreground)",
          letterSpacing: "0.04em",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  activeTheme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
};

export function DesignSystemDrawer({
  open,
  onClose,
  activeTheme,
  onThemeChange,
}: Props) {
  const [view, setView] = useState<"themes" | "tokens">("themes");
  const active = THEME_PRESETS.find((t) => t.id === activeTheme) ?? THEME_PRESETS[0];

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          zIndex: 80,
          animation: "atlas-fade-in 200ms ease",
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "75vh",
          zIndex: 81,
          background: "rgba(28, 25, 23, 0.95)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid color-mix(in oklab, var(--accent-gold) 20%, transparent)",
          borderBottom: "none",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: "0 -20px 60px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "atlas-sys-menu-in 280ms cubic-bezier(0.34, 1.2, 0.64, 1)",
          transformOrigin: "bottom center",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px 12px",
            borderBottom: "0.5px solid var(--glass-border)",
            flexShrink: 0,
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 15,
                fontWeight: 600,
                color: "var(--foreground)",
                margin: 0,
              }}
            >
              Design System
            </h2>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--accent-gold)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                margin: "4px 0 0",
              }}
            >
              {active.name}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "transparent",
              border: "none",
              color: "var(--muted-text)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* View toggle */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "12px 20px",
            flexShrink: 0,
          }}
        >
          {(["themes", "tokens"] as const).map((v) => {
            const isActive = view === v;
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: "5px 14px",
                  borderRadius: 999,
                  border: `0.5px solid ${isActive ? "var(--accent-gold)" : "var(--border)"}`,
                  background: isActive
                    ? "color-mix(in oklab, var(--accent-gold) 12%, transparent)"
                    : "transparent",
                  color: isActive ? "var(--accent-gold)" : "var(--muted-text)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {v === "themes" ? "Themes" : "Tokens"}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 16px 24px",
          }}
        >
          {view === "themes" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {THEME_PRESETS.map((theme) => {
                const isCurrent = theme.id === activeTheme;
                return (
                  <button
                    key={theme.id}
                    onClick={() => onThemeChange(theme.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "14px 16px",
                      borderRadius: 12,
                      border: `0.5px solid ${isCurrent ? "var(--accent-gold)" : "var(--border)"}`,
                      background: isCurrent
                        ? "color-mix(in oklab, var(--accent-gold) 6%, var(--surface))"
                        : "var(--surface)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 200ms ease",
                      width: "100%",
                    }}
                  >
                    {/* Color swatches */}
                    <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                      {Object.values(theme.colors).map((c, i) => (
                        <div
                          key={i}
                          style={{
                            width: 16,
                            height: 28,
                            borderRadius: i === 0 ? "4px 0 0 4px" : i === 4 ? "0 4px 4px 0" : 0,
                            background: c,
                            border: "0.5px solid rgba(255,255,255,0.05)",
                          }}
                        />
                      ))}
                    </div>

                    {/* Text */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-sans)",
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--foreground)",
                        }}
                      >
                        {theme.name}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-sans)",
                          fontSize: 10.5,
                          color: "var(--muted-text)",
                          marginTop: 2,
                        }}
                      >
                        {theme.description}
                      </div>
                    </div>

                    {/* Check */}
                    {isCurrent && (
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: "var(--accent-gold)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Check size={12} color="#1a1814" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--muted-text)",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  padding: "8px 0 4px",
                  borderBottom: "0.5px solid var(--glass-border)",
                  marginBottom: 4,
                }}
              >
                Active: {active.name}
              </div>
              <TokenRow label="background" value={active.colors.background} preview={active.colors.background} />
              <TokenRow label="surface" value={active.colors.surface} preview={active.colors.surface} />
              <TokenRow label="foreground" value={active.colors.foreground} preview={active.colors.foreground} />
              <TokenRow label="accent" value={active.colors.accent} preview={active.colors.accent} />
              <TokenRow label="muted" value={active.colors.muted} preview={active.colors.muted} />

              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--muted-text)",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  padding: "16px 0 4px",
                  borderBottom: "0.5px solid var(--glass-border)",
                  marginBottom: 4,
                }}
              >
                Effects
              </div>
              <TokenRow label="glass-bg" value="rgba(bg, 0.75)" preview="rgba(28,25,23,0.75)" />
              <TokenRow label="glass-blur" value="20px" preview="transparent" />
              <TokenRow label="gold-glow" value="0 0 20px accent" preview={active.colors.accent} />

              <div
                style={{
                  marginTop: 16,
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "color-mix(in oklab, var(--accent-gold) 6%, transparent)",
                  border: "0.5px solid color-mix(in oklab, var(--accent-gold) 15%, transparent)",
                }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 11,
                    color: "var(--muted-text)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  These tokens are automatically applied to all code generated by Atlas.
                  Switch themes above to change the default aesthetic for new components.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
