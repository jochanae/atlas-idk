import type { CSSProperties, ReactNode } from "react";

/**
 * ChatTrayHeader — shared header for the Nexus Home chat tray and the
 * Project Workspace chat. Single component, two mount points, identical
 * tokens. The project switcher slot renders only when supplied (workspace),
 * gracefully hides on home.
 *
 * Composition:
 *   ┌─ 32×4 grab handle ─┐
 *   │   [ZERO-TRACE ●]   [READY 64%]      {projectSlot}      {rightSlot} │
 */
export interface ChatTrayHeaderProps {
  /** 0-100. Hides the readiness pill when undefined. */
  readinessScore?: number;
  /** Active session sovereignty state — when true the trust badge pulses. */
  active?: boolean;
  /** Optional click on the trust pill (e.g. toggle reflection mode). */
  onTrustClick?: () => void;
  /** Project context slot — workspace passes a switcher, home leaves empty. */
  projectSlot?: ReactNode;
  /** Right-side utility cluster (vault, briefing, clear, etc.). */
  rightSlot?: ReactNode;
  /** Optional grab-handle click (collapse/minimize). */
  onGrabHandleClick?: () => void;
  style?: CSSProperties;
}

export function ChatTrayHeader({
  readinessScore,
  active = true,
  onTrustClick,
  projectSlot,
  rightSlot,
  onGrabHandleClick,
  style,
}: ChatTrayHeaderProps) {
  return (
    <div
      className="atlas-chat-tray-header"
      style={{
        display: "flex",
        flexDirection: "column",
        background: "transparent",
        ...style,
      }}
    >
      <style>{`
        @keyframes atlasZeroTracePulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.25); }
        }
        .atlas-zt-dot { animation: atlasZeroTracePulse 1.8s ease-in-out infinite; }
        .atlas-zt-pill:hover { background: rgba(245,158,11,0.16); border-color: rgba(245,158,11,0.32); }
        .atlas-zt-pill:focus-visible { outline: 2px solid rgba(245,158,11,0.5); outline-offset: 2px; }
      `}</style>

      {/* Grab handle — 32×4 pill, centered */}
      <button
        type="button"
        onClick={onGrabHandleClick}
        aria-label="Collapse tray"
        title={onGrabHandleClick ? "Drag or tap to collapse" : undefined}
        style={{
          alignSelf: "center",
          width: 32,
          height: 4,
          borderRadius: 999,
          background: "rgba(255,255,255,0.10)",
          border: "none",
          padding: 0,
          margin: "6px 0 4px",
          cursor: onGrabHandleClick ? "pointer" : "default",
          transition: "background 160ms ease",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.20)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.10)"; }}
      />

      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "2px 16px 6px",
          minHeight: 28,
        }}
      >
        {/* ZERO-TRACE micro-pill */}
        <button
          type="button"
          onClick={onTrustClick}
          className="atlas-zt-pill"
          aria-label="Zero-trace session"
          title="Zero-trace · sovereign session"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "2px 8px",
            borderRadius: 999,
            background: "rgba(245,158,11,0.10)",
            border: "1px solid rgba(245,158,11,0.20)",
            color: "rgb(245,158,11)",
            fontFamily: "var(--app-font-mono)",
            fontSize: 9.5,
            letterSpacing: "0.10em",
            fontWeight: 600,
            cursor: onTrustClick ? "pointer" : "default",
            lineHeight: 1,
            transition: "background 160ms ease, border-color 160ms ease",
          }}
        >
          <span
            className={active ? "atlas-zt-dot" : undefined}
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "rgb(245,158,11)",
              boxShadow: "0 0 6px rgba(245,158,11,0.6)",
              display: "inline-block",
            }}
          />
          ZERO-TRACE
        </button>

        {/* Readiness pill — neutral dark */}
        {readinessScore !== undefined && (
          <span
            title={`Sovereign Readiness · ${readinessScore}%`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--atlas-muted)",
              fontFamily: "var(--app-font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.08em",
              fontWeight: 500,
              lineHeight: 1,
            }}
          >
            READY
            <span style={{ color: "var(--atlas-fg)", opacity: 0.85, fontWeight: 600 }}>
              {readinessScore}%
            </span>
          </span>
        )}

        {/* Project context slot — workspace-only */}
        {projectSlot && (
          <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center" }}>
            {projectSlot}
          </div>
        )}
        {!projectSlot && <div style={{ flex: 1 }} />}

        {/* Right utility cluster */}
        {rightSlot && (
          <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            {rightSlot}
          </div>
        )}
      </div>
    </div>
  );
}
