import { type ReactNode, useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";

export const MODES = [
  { id: "think", label: "Think", color: "ember" },
  { id: "build", label: "Build", color: "ember" },
  { id: "explore", label: "Explore", color: "phosphor" },
  { id: "decide", label: "Decide", color: "ember" },
  { id: "audit", label: "Audit", color: "ember" },
] as const;

export type ModeId = typeof MODES[number]["id"];

export interface RecentSession {
  id: string;
  title: string;
  mode: string | null;
  created_at: string;
}

type AtlasFrontDoorProps = {
  active: boolean;
  activeMode: ModeId;
  input: string;
  sending: boolean;
  recents: RecentSession[];
  showAllRecents: boolean;
  headerActions: ReactNode;
  bottomTabs?: ReactNode;
  secondaryPanel?: ReactNode;
  inputFocusSignal: number;
  /** Anchor color shown below the input (orange when a session is active). */
  sessionDotActive?: boolean;
  onModeChange: (mode: ModeId) => void;
  onInputChange: (value: string) => void;
  onSend: (text: string, mode: ModeId) => void;
  onOpenSession: (sessionId: string) => void;
  onToggleRecents: () => void;
  onWordmarkClick?: () => void;
  children?: ReactNode;
};

export function AtlasFrontDoor({
  active,
  activeMode,
  input,
  sending,
  recents,
  showAllRecents,
  headerActions,
  bottomTabs,
  secondaryPanel,
  inputFocusSignal,
  sessionDotActive = false,
  onModeChange,
  onInputChange,
  onSend,
  onOpenSession,
  onToggleRecents,
  onWordmarkClick,
  children,
}: AtlasFrontDoorProps) {
  const pillsRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [contextOpen, setContextOpen] = useState(false);

  useEffect(() => {
    const row = pillsRef.current;
    if (!row || row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft = (row.scrollWidth - row.clientWidth) / 2;
  }, []);

  useEffect(() => {
    if (inputFocusSignal > 0) textareaRef.current?.focus();
  }, [inputFocusSignal]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend(input, activeMode);
    }
  };

  const visibleRecents = showAllRecents ? recents : recents.slice(0, 1);
  const hiddenCount = recents.length - 1;

  // Context-aware tray: real backdrop-blur over content (active workspace),
  // gradient "machined hardware" over the bare front door background.
  const trayStyle: React.CSSProperties = active
    ? {
        background: "rgba(28, 25, 23, 0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "0.5px solid rgba(120, 113, 108, 0.18)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }
    : {
        background: "linear-gradient(180deg, #1C1917 0%, #211E1B 100%)",
        border: "0.5px solid #2C2926",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 0 rgba(0,0,0,0.4)",
      };

  return (
    <div style={{ background: "#0C0A09", minHeight: "100dvh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px 8px" }}>
        <button
          onClick={onWordmarkClick}
          style={{ background: "transparent", border: "none", padding: 0, fontSize: 18, fontWeight: 500, color: "#E7E5E4", letterSpacing: "0.08em", cursor: onWordmarkClick ? "pointer" : "default" }}
        >
          Atlas
        </button>
        {headerActions}
      </div>

      {/* Presence zone */}
      <div
        style={{
          textAlign: "center",
          padding: active ? "0 24px" : "36px 24px 24px",
          opacity: active ? 0 : 1,
          maxHeight: active ? 0 : 140,
          overflow: "hidden",
          transform: active ? "translateY(-8px)" : "translateY(0)",
          transition: "opacity 300ms ease, transform 300ms ease, max-height 300ms ease, padding 300ms ease",
          pointerEvents: active ? "none" : "auto",
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 400, color: "#E7E5E4", lineHeight: 1.3, letterSpacing: "-0.01em", marginBottom: 8 }}>
          What needs a decision?
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 12, color: "#57524E", letterSpacing: "0.06em" }}>
          atlas is ready
        </div>
      </div>

      <div
        style={{
          flex: active ? 1 : "0 1 auto",
          minHeight: 0,
          opacity: active ? 1 : 0,
          transition: "opacity 300ms ease",
          pointerEvents: active ? "auto" : "none",
          display: active ? "flex" : "none",
          flexDirection: "column",
        }}
      >
        {children}
      </div>

      {!active && recents.length > 0 && (
        <div style={{ marginTop: 20, flex: 1 }}>
          <div style={{ padding: "0 20px 10px", fontFamily: "monospace", fontSize: 10, color: "#3C3530", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Continue where you left off
          </div>
          <SessionHistoryList sessions={visibleRecents} onOpenSession={onOpenSession} />
          {hiddenCount > 0 && (
            <button
              onClick={onToggleRecents}
              style={{ width: "100%", padding: "10px 20px", background: "transparent", border: "none", fontFamily: "monospace", fontSize: 10, color: "#2C2926", letterSpacing: "0.08em", cursor: "pointer", textAlign: "left" }}
            >
              {showAllRecents ? "show less" : `${hiddenCount} more`}
            </button>
          )}
        </div>
      )}

      {secondaryPanel}

      {/* Mode-chip tool tray (above input) */}
      <div style={{ padding: "0 16px 8px" }}>
        <div
          ref={pillsRef}
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "6px 8px",
            borderRadius: 14,
            overflowX: "auto",
            overflowY: "hidden",
            scrollbarWidth: "none",
            transition: "background 300ms ease, border-color 300ms ease",
            ...trayStyle,
          }}
        >
          <div style={{ display: "flex", gap: 4, width: "max-content", margin: "0 auto" }}>
            {MODES.map((m) => {
              const isActive = activeMode === m.id;
              const isPhosphor = m.color === "phosphor";
              const activeColor = isPhosphor ? "#06B6D4" : "#EA580C";
              return (
                <button
                  key={m.id}
                  onClick={() => onModeChange(m.id)}
                  style={{
                    flexShrink: 0,
                    padding: "5px 12px",
                    borderRadius: 18,
                    border: `0.5px solid ${isActive ? activeColor : "transparent"}`,
                    background: isActive
                      ? isPhosphor
                        ? "rgba(6, 182, 212, 0.08)"
                        : "rgba(234, 88, 12, 0.08)"
                      : "transparent",
                    fontFamily: "monospace",
                    fontSize: 11,
                    color: isActive ? activeColor : "#78716C",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    transition: "color 150ms ease, background 150ms ease, border-color 150ms ease",
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Input zone with Context Rail (left) */}
      <div style={{ margin: active ? "0 16px 18px" : "0 16px", display: "flex", gap: 8, alignItems: "stretch", transition: "margin 300ms ease" }}>
        {/* Context Rail */}
        <div style={{ position: "relative", display: "flex", alignItems: "flex-end" }}>
          <button
            onClick={() => setContextOpen((v) => !v)}
            aria-label="Attach context"
            style={{
              width: 40,
              height: 40,
              alignSelf: "flex-end",
              marginBottom: 2,
              borderRadius: 12,
              border: "0.5px solid #2C2926",
              background: contextOpen ? "#211E1B" : "#1C1917",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "background 150ms ease, border-color 150ms ease",
            }}
          >
            <svg viewBox="0 0 16 16" width={15} height={15} fill="none" stroke={contextOpen ? "#EA580C" : "#78716C"} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M11.5 6.5l-4.6 4.6a2.2 2.2 0 0 1-3.1-3.1l5.2-5.2a3.3 3.3 0 0 1 4.7 4.7l-5.4 5.4a4.4 4.4 0 0 1-6.2-6.2l5-5" />
            </svg>
          </button>
          {contextOpen && (
            <div
              style={{
                position: "absolute",
                bottom: 50,
                left: 0,
                width: 240,
                padding: 14,
                borderRadius: 12,
                background: "rgba(28, 25, 23, 0.92)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                border: "0.5px solid #2C2926",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                zIndex: 30,
              }}
            >
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "#57524E", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                Context
              </div>
              <div style={{ fontSize: 13, color: "#78716C", lineHeight: 1.5 }}>
                Drop a file or paste a link to ground this decision.
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "#3C3530", letterSpacing: "0.06em", marginTop: 10 }}>
                file uploads · coming soon
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div style={{ flex: 1, background: "#1C1917", borderRadius: 14, border: "0.5px solid #2C2926", padding: "14px 16px" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="anything on your mind, a build, an idea, a decision…"
            rows={2}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#E7E5E4",
              fontSize: 15,
              lineHeight: 1.5,
              resize: "none",
              fontFamily: "inherit",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: 8 }}>
            <button
              onClick={() => onSend(input, activeMode)}
              disabled={!input.trim() || sending}
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: "#EA580C",
                border: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: input.trim() ? 1 : 0.3,
                cursor: input.trim() ? "pointer" : "default",
              }}
            >
              <svg viewBox="0 0 16 16" width={14} height={14} stroke="#0C0A09" fill="none" strokeWidth={2}>
                <path d="M2 8h12M8 2l6 6-6 6"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Session anchor dot — below input */}
      <div style={{ display: "flex", justifyContent: "center", padding: "0 0 14px", marginTop: -6 }}>
        <span
          aria-label={sessionDotActive ? "Session active" : "No session"}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: sessionDotActive ? "#EA580C" : "#2C2926",
            boxShadow: sessionDotActive ? "0 0 8px rgba(234, 88, 12, 0.5)" : "none",
            animation: sessionDotActive ? "atlasPulse 2s ease-in-out infinite" : "none",
          }}
        />
        <style>{`@keyframes atlasPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>

      {bottomTabs}
    </div>
  );
}

export function SessionHistoryList({
  sessions,
  onOpenSession,
}: {
  sessions: RecentSession[];
  onOpenSession: (sessionId: string) => void;
}) {
  return (
    <>
      {sessions.map((session) => {
        const isPhosphor = session.mode === "explore";
        const dotColor = isPhosphor ? "#06B6D4" : session.mode ? "#EA580C" : "#2C2926";

        return (
          <button
            key={session.id}
            onClick={() => onOpenSession(session.id)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", border: "none", borderTop: "0.5px solid #1C1917", background: "transparent", cursor: "pointer", textAlign: "left" }}
          >
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "#78716C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 2 }}>
                {session.title || "Untitled session"}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "#3C3530", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {session.mode || "think"} · {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
              </div>
            </div>
            <span style={{ fontSize: 14, color: "#2C2926" }}>›</span>
          </button>
        );
      })}
    </>
  );
}
