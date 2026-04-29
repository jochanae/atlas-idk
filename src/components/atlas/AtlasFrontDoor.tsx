import { type ReactNode, useEffect, useRef } from "react";
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
          What's on your mind?
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 12, color: "#57524E", letterSpacing: "0.06em" }}>
          atlas is ready
        </div>
      </div>

      {/* Mode pills */}
      <div
        ref={pillsRef}
        style={{
          display: "flex",
          justifyContent: "center",
          padding: active ? "0 20px" : "0 20px 20px",
          maxHeight: active ? 0 : 48,
          overflowX: "auto",
          overflowY: "hidden",
          scrollbarWidth: "none",
          opacity: active ? 0 : 1,
          transform: active ? "translateY(-12px)" : "translateY(0)",
          transition: "opacity 200ms ease, transform 200ms ease, max-height 200ms ease, padding 200ms ease",
          pointerEvents: active ? "none" : "auto",
        }}
      >
        <div style={{ display: "flex", gap: 6, width: "max-content", margin: "0 auto" }}>
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
                  padding: "5px 14px",
                  borderRadius: 20,
                  border: `0.5px solid ${isActive ? activeColor : "#2C2926"}`,
                  background: isActive && isPhosphor ? "#080C10" : "#1C1917",
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: isActive ? activeColor : "#78716C",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {m.label}
              </button>
            );
          })}
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

      {/* Input zone */}
      <div style={{ margin: active ? "0 16px 18px" : "0 16px", background: "#1C1917", borderRadius: 14, border: "0.5px solid #2C2926", padding: "14px 16px", transition: "margin 300ms ease" }}>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              <svg key="u" viewBox="0 0 16 16" width={13} height={13} stroke="#4A4540" fill="none" strokeWidth={1.5}><path d="M8 1v10M4 7l4 4 4-4"/><path d="M2 14h12"/></svg>,
              <svg key="a" viewBox="0 0 16 16" width={13} height={13} stroke="#4A4540" fill="none" strokeWidth={1.5}><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 8h6M8 5v6"/></svg>,
              <svg key="p" viewBox="0 0 16 16" width={13} height={13} stroke="#4A4540" fill="none" strokeWidth={1.5}><circle cx="8" cy="6" r="2"/><path d="M4 14c0-2.2 1.8-4 4-4s4 1.8 4 4"/></svg>
            ].map((icon, i) => (
              <button key={i} style={{ width: 28, height: 28, borderRadius: 6, border: "0.5px solid #2C2926", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                {icon}
              </button>
            ))}
          </div>
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
