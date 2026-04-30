import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
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
  const [expanded, setExpanded] = useState(false);

  const activeSurface = SURFACES.find((s) => s.id === active) ?? SURFACES[0];

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Collapsed state: active tab breadcrumb + ghost toggle */}
      <button
        onClick={() => {
          setExpanded((o) => !o);
          haptic("light");
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 12px",
          borderRadius: 10,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          transition: "all 160ms ease",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--accent-gold)",
            opacity: expanded ? 0.5 : 0.7,
            transition: "opacity 160ms ease",
          }}
        >
          {activeSurface.label}
        </span>
        <ChevronDown
          size={10}
          strokeWidth={1.5}
          style={{
            color: "var(--accent-gold)",
            opacity: 0.5,
            transform: expanded ? "rotate(180deg)" : "rotate(0)",
            transition: "transform 220ms cubic-bezier(.2,.8,.2,1)",
          }}
        />
      </button>

      {/* Expanded: glass slide-down panel with all three surfaces */}
      {expanded && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 2,
            padding: "6px 8px",
            borderRadius: 14,
            background: "var(--glass-bg)",
            backdropFilter: "blur(var(--glass-blur)) saturate(140%)",
            WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(140%)",
            border: "0.5px solid var(--glass-border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(212,175,55,0.06)",
            zIndex: 60,
            animation: "atlas-surface-slide 220ms cubic-bezier(.2,.8,.2,1)",
            transformOrigin: "top center",
          }}
        >
          {SURFACES.map((s) => {
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                onClick={() => {
                  onChange(s.id);
                  setExpanded(false);
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
                    ? "color-mix(in oklab, var(--accent-gold) 12%, transparent)"
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
      )}
    </div>
  );
}
