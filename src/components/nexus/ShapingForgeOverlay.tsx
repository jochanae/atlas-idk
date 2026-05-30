import { useEffect } from "react";
import { createPortal } from "react-dom";

export interface ShapingPayload {
  title: string;
  audience: string;
  tension: string;
  what: string;
}

interface Props {
  open: boolean;
  payload: ShapingPayload;
  held: boolean;
  onClose: () => void;
  onCommit: () => void;
  onRelease: () => void;
  onDropFacet: (field: keyof ShapingPayload) => void;
}

const GOLD = "var(--atlas-gold)";

const FACETS: Array<{ key: keyof ShapingPayload; label: string }> = [
  { key: "audience", label: "Audience" },
  { key: "tension", label: "Friction" },
  { key: "what", label: "Scope" },
];

export function ShapingForgeOverlay({
  open,
  payload,
  held,
  onClose,
  onCommit,
  onRelease,
  onDropFacet,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const tags = FACETS
    .map((f) => ({ ...f, value: (payload[f.key] ?? "").trim() }))
    .filter((t) => t.value.length > 0);

  const anchor = payload.title?.trim()
    ? payload.tension?.trim()
      ? `${payload.title} — addressing ${payload.tension.toLowerCase()}.`
      : `${payload.title}.`
    : "Atlas is shaping the core thesis from this conversation.";

  const holdingItems = tags.map((t) => `${t.label}: ${t.value}`);

  const missing = FACETS.find((f) => !(payload[f.key] ?? "").trim());
  const trajectory = missing
    ? `Awaiting your read on ${missing.label.toLowerCase()} to sharpen the frame.`
    : held
      ? "Frame is anchored. Ready to move into build."
      : "Frame is taking shape. Keep going or commit when ready.";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Shaping Forge"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(10,10,10,0.55)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "72px 16px 16px",
        animation: "shapingForgeFade 180ms ease-out",
        overflowY: "auto",
      }}
    >
      <style>{`
        @keyframes shapingForgeFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes shapingForgeRise {
          from { opacity: 0; transform: scale(0.96) translateY(4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes shapingFilamentBreath {
          0%, 100% { opacity: 0.4 }
          50% { opacity: 1 }
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 16,
          border: `1px solid color-mix(in oklab, ${GOLD} 25%, transparent)`,
          background: "rgba(18,16,12,0.92)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          padding: "20px 20px 16px",
          animation: "shapingForgeRise 220ms cubic-bezier(0.2,0.8,0.2,1)",
          color: "var(--atlas-fg)",
        }}
      >
        {/* Filament */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div
            style={{
              width: 64,
              height: 1,
              background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
              animation: "shapingFilamentBreath 2s ease-in-out infinite",
            }}
          />
        </div>

        {/* Tag strip */}
        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
            {tags.map((t) => (
              <span
                key={t.key}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 8px",
                  borderRadius: 999,
                  border: `1px solid color-mix(in oklab, ${GOLD} 25%, transparent)`,
                  background: "rgba(201,162,76,0.06)",
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 10,
                  color: GOLD,
                  letterSpacing: "0.04em",
                }}
              >
                <span style={{ opacity: 0.6 }}>[{t.label}]</span>
                <span>{t.value}</span>
                <button
                  type="button"
                  aria-label={`Drop ${t.label}`}
                  onClick={() => onDropFacet(t.key)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: GOLD,
                    opacity: 0.5,
                    cursor: "pointer",
                    padding: 0,
                    marginLeft: 2,
                    fontSize: 11,
                    lineHeight: 1,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Anchor */}
        <Section label="The Anchor">
          <p style={proseStyle}>{anchor}</p>
        </Section>

        {/* Holding */}
        {holdingItems.length > 0 && (
          <Section label="Holding">
            <ul style={{ ...proseStyle, margin: 0, paddingLeft: 18 }}>
              {holdingItems.map((it) => (
                <li key={it} style={{ marginBottom: 4 }}>{it}</li>
              ))}
            </ul>
          </Section>
        )}

        {/* Trajectory */}
        <Section label="Trajectory">
          <p style={{ ...proseStyle, fontStyle: "italic", opacity: 0.85 }}>{trajectory}</p>
        </Section>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 20,
            paddingTop: 14,
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              onRelease();
              onClose();
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--atlas-muted)",
              fontFamily: "var(--app-font-mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
              padding: "6px 4px",
            }}
          >
            Release
          </button>
          <button
            type="button"
            onClick={() => {
              onCommit();
              onClose();
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 999,
              border: `1px solid color-mix(in oklab, ${GOLD} 50%, transparent)`,
              background: "rgba(201,162,76,0.12)",
              color: GOLD,
              fontFamily: "var(--app-font-mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Commit <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const proseStyle = {
  fontSize: 14,
  lineHeight: 1.6,
  letterSpacing: "-0.01em",
  color: "var(--atlas-fg)",
  margin: 0,
} as const;

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontFamily: "var(--app-font-mono)",
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--atlas-muted)",
          marginBottom: 6,
        }}
      >
        ── {label} ──
      </div>
      {children}
    </div>
  );
}
