import { useEffect, useState, type CSSProperties } from "react";
import { useHudFeed } from "@/hooks/useHudFeed";
import type { HudEvent } from "@/lib/hudBus";

/**
 * Listening HUD — peripheral awareness of what Atlas is extracting from the
 * live conversation. Collapsed = single line latest event. Expanded = last 5.
 *
 * Mounts as a floating panel anchored top-right inside a chat surface.
 * Content is sourced from `src/lib/hudBus.ts` (frontend pub/sub).
 */

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

const FONT_MONO = "var(--app-font-mono, 'Geist Mono', ui-monospace, monospace)";
const FONT_SANS = "var(--app-font-sans, 'Geist', ui-sans-serif, system-ui)";

function EventLine({ ev, dim }: { ev: HudEvent; dim?: boolean }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        borderTop: "1px solid rgba(255,255,255,0.03)",
        opacity: dim ? 0.55 : 1,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2, fontFamily: FONT_MONO, minWidth: 0 }}>
        <span style={{ fontSize: 9, letterSpacing: "-0.01em", textTransform: "uppercase", color: "rgb(167,139,250)", fontWeight: 700 }}>
          {ev.type}
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.9)", lineHeight: 1.3, wordBreak: "break-word" }}>
          {ev.payload}
        </span>
      </div>
      <span style={{ fontSize: 9, fontFamily: FONT_MONO, color: "rgba(255,255,255,0.2)", marginTop: 2, flexShrink: 0 }}>
        {fmtTime(ev.at)}
      </span>
    </div>
  );
}

export interface ListeningHUDProps {
  /** Pin position relative to the parent container (must be position: relative). */
  position?: { top?: number; right?: number };
  /** Hide entirely when no events yet. Default true. */
  hideWhenEmpty?: boolean;
}

export function ListeningHUD({ position = { top: 12, right: 12 }, hideWhenEmpty = true }: ListeningHUDProps) {
  const events = useHudFeed();
  const [expanded, setExpanded] = useState(false);
  const [closed, setClosed] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);

  // Bump pulse on new event arrival.
  useEffect(() => {
    if (events.length > 0) setPulseKey((k) => k + 1);
  }, [events.length]);

  if (closed) return null;
  if (events.length === 0 && hideWhenEmpty) return null;

  const latest = events[0];
  const visible = events.slice(0, 5);

  const wrapStyle: CSSProperties = {
    position: "absolute",
    top: position.top,
    right: position.right,
    zIndex: 40,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
    maxWidth: 320,
    pointerEvents: "auto",
  };

  if (!expanded) {
    return (
      <div style={wrapStyle}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Expand listening feed"
          style={{
            height: 30,
            padding: "0 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(167,139,250,0.18)",
            cursor: "pointer",
            color: "inherit",
            maxWidth: "100%",
          }}
        >
          <PulseDot key={pulseKey} />
          {latest && (
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_MONO, fontSize: 10, minWidth: 0 }}>
              <span style={{ color: "rgb(167,139,250)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.01em" }}>
                {latest.type}
              </span>
              <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 300 }}>→</span>
              <span style={{ color: "rgba(255,255,255,0.92)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                {latest.payload}
              </span>
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <div
        style={{
          width: 320,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 20px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(167,139,250,0.1)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PulseDot key={pulseKey} />
            <span style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.8)", letterSpacing: "-0.005em" }}>
              Live Extraction
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <IconBtn label="Collapse" onClick={() => setExpanded(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m18 15-6-6-6 6" />
              </svg>
            </IconBtn>
            <IconBtn label="Close" onClick={() => setClosed(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </IconBtn>
          </div>
        </div>

        {/* Feed */}
        <div>
          {visible.length === 0 && (
            <div style={{ padding: "20px 12px", textAlign: "center", fontFamily: FONT_MONO, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
              waiting for signal…
            </div>
          )}
          {visible.map((ev, i) => (
            <EventLine key={ev.id} ev={ev} dim={i === visible.length - 1 && visible.length === 5} />
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "8px 12px", background: "rgba(167,139,250,0.05)", display: "flex", justifyContent: "center" }}>
          <div style={{ height: 2, width: 32, borderRadius: 999, background: "rgba(255,255,255,0.1)" }} />
        </div>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        padding: 4,
        background: "transparent",
        border: "none",
        color: "rgba(255,255,255,0.3)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 4,
      }}
      onMouseEnter={(e) => ((e.currentTarget.style.color = "rgba(255,255,255,0.7)"))}
      onMouseLeave={(e) => ((e.currentTarget.style.color = "rgba(255,255,255,0.3)"))}
    >
      {children}
    </button>
  );
}

function PulseDot() {
  return (
    <span style={{ position: "relative", display: "inline-flex", height: 8, width: 8, flexShrink: 0 }}>
      <span
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 999,
          background: "rgb(167,139,250)",
          opacity: 0.55,
          animation: "atlas-hud-ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite",
        }}
      />
      <span
        style={{
          position: "absolute",
          inset: -2,
          borderRadius: 999,
          background: "rgb(139,92,246)",
          opacity: 0.25,
          animation: "atlas-hud-ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite 0.4s",
        }}
      />
      <span
        style={{
          position: "relative",
          display: "inline-block",
          height: 8,
          width: 8,
          borderRadius: 999,
          background: "rgb(139,92,246)",
          boxShadow: "0 0 8px rgba(139,92,246,0.6)",
        }}
      />
      <style>{`
        @keyframes atlas-hud-ping {
          0% { transform: scale(1); opacity: 0.6; }
          75%, 100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </span>
  );
}

export default ListeningHUD;
