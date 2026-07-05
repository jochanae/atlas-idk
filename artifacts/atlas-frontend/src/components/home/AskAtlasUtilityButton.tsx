import * as React from "react";

/**
 * AskAtlasUtilityButton — small icon button used across the Ask Atlas
 * composer utility row. Extracted from AskAtlasSurface to keep the
 * main surface file focused on layout/state.
 */
export function AskAtlasUtilityButton({
  children,
  ariaLabel,
  title,
  onClick,
  tinted,
  active,
  glowing,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  title?: string;
  onClick?: () => void;
  tinted?: boolean;
  active?: boolean;
  glowing?: boolean;
}) {
  return (
    <>
      {glowing && (
        <style>{`
          @keyframes ask-atlas-folder-glow {
            0%, 100% { box-shadow: 0 0 6px color-mix(in oklab, var(--atlas-gold) 45%, transparent), 0 0 14px color-mix(in oklab, var(--atlas-gold) 20%, transparent); }
            50% { box-shadow: 0 0 12px color-mix(in oklab, var(--atlas-gold) 75%, transparent), 0 0 24px color-mix(in oklab, var(--atlas-gold) 35%, transparent); }
          }
        `}</style>
      )}
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        title={title ?? ariaLabel}
        style={{
          width: 34,
          height: 34,
          flexShrink: 0,
          borderRadius: 10,
          border: glowing ? "1px solid color-mix(in oklab, var(--atlas-gold) 55%, transparent)" : "1px solid transparent",
          background: glowing
            ? "color-mix(in oklab, var(--atlas-gold) 12%, transparent)"
            : active
              ? "color-mix(in oklab, var(--atlas-gold) 14%, transparent)"
              : tinted
                ? "color-mix(in oklab, var(--atlas-gold) 6%, transparent)"
                : "transparent",
          color: glowing || active
            ? "var(--atlas-gold)"
            : tinted
              ? "color-mix(in oklab, var(--atlas-gold) 85%, transparent)"
              : "var(--atlas-muted)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: onClick ? "pointer" : "default",
          padding: 0,
          WebkitTapHighlightColor: "transparent",
          transition: "background 160ms ease, color 160ms ease, border-color 160ms ease, box-shadow 160ms ease",
          animation: glowing ? "ask-atlas-folder-glow 2s ease-in-out infinite" : undefined,
        }}
        onMouseEnter={(e) => {
          if (!onClick) return;
          const el = e.currentTarget as HTMLButtonElement;
          el.style.background = glowing ? "color-mix(in oklab, var(--atlas-gold) 18%, transparent)" : "color-mix(in oklab, var(--atlas-gold) 10%, transparent)";
          el.style.color = "var(--atlas-gold)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.background = glowing
            ? "color-mix(in oklab, var(--atlas-gold) 12%, transparent)"
            : active
              ? "color-mix(in oklab, var(--atlas-gold) 14%, transparent)"
              : tinted
                ? "color-mix(in oklab, var(--atlas-gold) 6%, transparent)"
                : "transparent";
          el.style.color = glowing || active
            ? "var(--atlas-gold)"
            : tinted
              ? "color-mix(in oklab, var(--atlas-gold) 85%, transparent)"
              : "var(--atlas-muted)";
        }}
      >
        {children}
      </button>
    </>
  );
}
