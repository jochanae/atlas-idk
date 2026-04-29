import { type ReactNode, useEffect, useRef } from "react";
import { RotatingPlaceholder } from "./RotatingPlaceholder";

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
  headerActions: ReactNode;
  bottomTabs?: ReactNode;
  secondaryPanel?: ReactNode;
  inputFocusSignal: number;
  sidebarToggle?: ReactNode;
  onModeChange: (mode: ModeId) => void;
  onInputChange: (value: string) => void;
  onSend: (text: string, mode: ModeId) => void;
  onWordmarkClick?: () => void;
  children?: ReactNode;
};

export function AtlasFrontDoor({
  active,
  activeMode,
  input,
  sending,
  headerActions,
  bottomTabs,
  secondaryPanel,
  inputFocusSignal,
  sidebarToggle,
  onModeChange,
  onInputChange,
  onSend,
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

  const showPlaceholder = !input && !active;

  return (
    <div
      style={{
        background: "var(--background)",
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Top bar — sidebar toggle anchored left of wordmark */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px 8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {sidebarToggle}
          <button
            onClick={onWordmarkClick}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              fontSize: 18,
              fontWeight: 500,
              color: "var(--foreground)",
              letterSpacing: "0.08em",
              cursor: onWordmarkClick ? "pointer" : "default",
            }}
          >
            Atlas
          </button>
        </div>
        {headerActions}
      </div>

      {/* Front door hero — vertically centered, cinematic */}
      {!active && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "stretch",
            padding: "8vh 0 4vh",
            animation: "atlas-rise 420ms var(--ease-cinematic)",
          }}
        >
          <div style={{ textAlign: "center", padding: "0 24px 28px" }}>
            <div
              style={{
                fontSize: 26,
                fontWeight: 400,
                color: "var(--foreground)",
                lineHeight: 1.3,
                letterSpacing: "-0.01em",
                marginBottom: 10,
              }}
            >
              What's on your mind?
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--muted-text)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              atlas is ready
            </div>
          </div>

          {/* Mode pills */}
          <div
            ref={pillsRef}
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "0 16px 22px",
              overflowX: "auto",
              overflowY: "hidden",
              scrollbarWidth: "none",
            }}
          >
            <div style={{ display: "flex", gap: 6, width: "max-content", margin: "0 auto" }}>
              {MODES.map((m) => {
                const isActive = activeMode === m.id;
                const isPhosphor = m.color === "phosphor";
                const activeColor = isPhosphor ? "var(--phosphor)" : "var(--ember)";
                return (
                  <button
                    key={m.id}
                    onClick={() => onModeChange(m.id)}
                    style={{
                      flexShrink: 0,
                      padding: "5px 14px",
                      borderRadius: 20,
                      border: `0.5px solid ${isActive ? activeColor : "var(--border)"}`,
                      background: isActive ? "var(--surface)" : "var(--surface)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: isActive ? activeColor : "var(--muted-text)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                      boxShadow: isActive
                        ? `0 0 14px -2px ${isPhosphor ? "rgba(6,182,212,0.35)" : "rgba(234,88,12,0.45)"}`
                        : "none",
                      transition: "all 200ms var(--ease-cinematic)",
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Input — centered, etched glass */}
          <div
            style={{
              margin: "0 16px",
              background: "var(--surface)",
              borderRadius: 14,
              border: "0.5px solid var(--border)",
              padding: "16px 18px",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.4)",
              position: "relative",
            }}
          >
            <div style={{ position: "relative" }}>
              {showPlaceholder && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    color: "var(--muted-text)",
                    fontSize: 15,
                    lineHeight: 1.5,
                    opacity: 0.85,
                    pointerEvents: "none",
                  }}
                >
                  <RotatingPlaceholder mode={activeMode} paused={false} />
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--foreground)",
                  fontSize: 15,
                  lineHeight: 1.5,
                  resize: "none",
                  fontFamily: "inherit",
                  position: "relative",
                  zIndex: 1,
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 12,
              }}
            >
              <div style={{ display: "flex", gap: 8 }} />
              <button
                onClick={() => onSend(input, activeMode)}
                disabled={!input.trim() || sending}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: "var(--ember)",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: input.trim() ? 1 : 0.3,
                  cursor: input.trim() ? "pointer" : "default",
                  boxShadow: input.trim() ? "0 0 16px -2px rgba(234,88,12,0.55)" : "none",
                  transition: "all 200ms var(--ease-cinematic)",
                }}
              >
                <svg viewBox="0 0 16 16" width={14} height={14} stroke="var(--background)" fill="none" strokeWidth={2}>
                  <path d="M2 8h12M8 2l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active session content — fades & rises in */}
      {active && (
        <div
          key="active"
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            animation: "atlas-rise 400ms var(--ease-cinematic)",
          }}
        >
          {children}
        </div>
      )}

      {/* Active-mode input docked at bottom */}
      {active && (
        <div
          style={{
            margin: "0 16px 18px",
            background: "var(--surface)",
            borderRadius: 14,
            border: "0.5px solid var(--border)",
            padding: "14px 16px",
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="reply to atlas…"
            rows={2}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--foreground)",
              fontSize: 15,
              lineHeight: 1.5,
              resize: "none",
              fontFamily: "inherit",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              marginTop: 12,
            }}
          >
            <button
              onClick={() => onSend(input, activeMode)}
              disabled={!input.trim() || sending}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "var(--ember)",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: input.trim() ? 1 : 0.3,
                cursor: input.trim() ? "pointer" : "default",
              }}
            >
              <svg viewBox="0 0 16 16" width={14} height={14} stroke="var(--background)" fill="none" strokeWidth={2}>
                <path d="M2 8h12M8 2l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {secondaryPanel}
      {bottomTabs}

      <style>{`
        @keyframes atlas-rise {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// Kept exported for other callers (HistoryPanel etc.) — not used on front door anymore.
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
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 20px",
              border: "none",
              borderTop: "0.5px solid #1C1917",
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  color: "#78716C",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  marginBottom: 2,
                }}
              >
                {session.title || "Untitled session"}
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 10,
                  color: "#3C3530",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {session.mode || "think"}
              </div>
            </div>
            <span style={{ fontSize: 14, color: "#2C2926" }}>›</span>
          </button>
        );
      })}
    </>
  );
}
