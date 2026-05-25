import type { CSSProperties, ReactNode } from "react";
import { Shield } from "lucide-react";

/**
 * ChatTrayHeader — shared, ultra-quiet header for the Nexus Home chat tray
 * and the Project Workspace chat. One indicator per view: a tiny shield
 * icon denotes sovereign session state; readiness pill renders only when
 * provided (and only when the surface doesn't already show readiness elsewhere).
 *
 * Composition:
 *   ┌─ 32×4 grab handle ─┐
 *   │  {projectSlot}   [🛡]   [77% Ready?]   {rightSlot}  │
 */
export interface ChatTrayHeaderProps {
  /** 0-100. Hides the readiness pill when undefined. */
  readinessScore?: number;
  /** Active session sovereignty state — colors the shield. */
  active?: boolean;
  /** Optional click on the shield (e.g. toggle reflection mode). */
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
          minHeight: 24,
        }}
      >
        {/* Project context slot — workspace-only */}
        {projectSlot ? (
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
            {projectSlot}
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        {/* Quiet sovereignty shield — no text, no pulse, no glow */}
        <button
          type="button"
          onClick={onTrustClick}
          aria-label={active ? "Zero-trace session active" : "Zero-trace session paused"}
          title={active ? "Zero-trace · sovereign session" : "Reflection paused"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            padding: 0,
            background: "transparent",
            border: "none",
            color: active ? "var(--atlas-muted)" : "rgba(255,255,255,0.25)",
            cursor: onTrustClick ? "pointer" : "default",
            opacity: 0.7,
            transition: "opacity 160ms ease, color 160ms ease",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; }}
        >
          <Shield size={13} strokeWidth={1.6} />
        </button>

        {/* Readiness pill — neutral, single source of truth per view */}
        {readinessScore !== undefined && (
          <span
            title={`Sovereign Readiness · ${readinessScore}%`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "var(--atlas-muted)",
              fontFamily: "var(--app-font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.08em",
              fontWeight: 500,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            <span style={{ color: "var(--atlas-fg)", opacity: 0.8, fontWeight: 600 }}>
              {readinessScore}%
            </span>
            READY
          </span>
        )}

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
