import type { ReactNode } from "react";
import { haptic } from "@/lib/haptics";

type Surface = "chat" | "ledger" | "preview";

type Props = {
  active: Surface;
  onChange: (s: Surface) => void;
};

const SURFACES: Array<{ id: Surface; label: string; icon: ReactNode }> = [
  {
    id: "chat",
    label: "Chat",
    icon: (
      <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12V4a1 1 0 011-1h10a1 1 0 011 1v6a1 1 0 01-1 1H5l-3 3z" />
      </svg>
    ),
  },
  {
    id: "ledger",
    label: "Ledger",
    icon: (
      <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2h8a1 1 0 011 1v10l-3-2-2 2-2-2-3 2V3a1 1 0 011-1z" />
        <path d="M6 6h4M6 9h2" />
      </svg>
    ),
  },
  {
    id: "preview",
    label: "Preview",
    icon: (
      <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 8s2-4 6.5-4 6.5 4 6.5 4-2 4-6.5 4S1.5 8 1.5 8z" />
        <circle cx="8" cy="8" r="1.5" />
      </svg>
    ),
  },
];

export function MobileSurfaceBar({ active, onChange }: Props) {
  return (
    <div
      className="atlas-mobile-surface-bar"
      style={{
        display: "flex",
        justifyContent: "center",
        gap: 2,
        padding: "6px 8px",
        borderRadius: 14,
        background: "rgba(15, 15, 15, 0.6)",
        border: "0.5px solid rgba(212, 175, 55, 0.12)",
      }}
    >
      {SURFACES.map((s) => {
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            onClick={() => {
              onChange(s.id);
              haptic("light");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 14px",
              borderRadius: 10,
              border: "none",
              background: isActive
                ? "rgba(212, 175, 55, 0.12)"
                : "transparent",
              color: isActive ? "var(--accent-gold)" : "var(--muted-text)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
              transition: "all 160ms ease",
              minHeight: 34,
            }}
          >
            {s.icon}
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
