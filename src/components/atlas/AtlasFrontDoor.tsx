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
      {/* Top bar — sidebar toggle anchored left of wordmark, avatar right */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px 8px",
          minHeight: 56,
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, height: 40 }}>
          {sidebarToggle}
          <button
            onClick={onWordmarkClick}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              height: 40,
              display: "inline-flex",
              alignItems: "center",
              fontSize: 18,
              fontWeight: 500,
              color: "var(--foreground)",
              letterSpacing: "0.08em",
              lineHeight: 1,
              cursor: onWordmarkClick ? "pointer" : "default",
            }}
          >
            Atlas
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 40 }}>
          {headerActions}
        </div>
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

          {/* Input — centered, etched glass with focus glow */}
          <div
            className="atlas-input-shell"
            style={{
              margin: "0 16px",
              background: "var(--surface)",
              borderRadius: 14,
              border: "1px solid color-mix(in oklab, var(--accent-gold) 20%, transparent)",
              padding: "16px 18px",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.4)",
              position: "relative",
              transition: "border-color 220ms var(--ease-cinematic), box-shadow 220ms var(--ease-cinematic)",
            }}
          >
            <div style={{ position: "relative" }}>
              {showPlaceholder && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    color: "var(--muted-text)",
                    fontSize: 15,
                    lineHeight: 1.5,
                    opacity: 0.85,
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
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
                gap: 12,
              }}
            >
              {/* Left: attach actions (inside the border) */}
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button
                  type="button"
                  aria-label="Add"
                  title="Add (coming soon)"
                  className="atlas-icon-btn"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: "transparent",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "color-mix(in oklab, var(--accent-gold) 55%, var(--muted-text))",
                    cursor: "pointer",
                    opacity: 0.55,
                    transition: "opacity 160ms var(--ease-cinematic), color 160ms var(--ease-cinematic), transform 160ms var(--ease-cinematic)",
                    flexShrink: 0,
                  }}
                >
                  <svg viewBox="0 0 16 16" width={15} height={15} stroke="currentColor" fill="none" strokeWidth={1.6}>
                    <path d="M8 3v10M3 8h10" strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Attach file"
                  title="Attach file (coming soon)"
                  className="atlas-icon-btn"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: "transparent",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "color-mix(in oklab, var(--accent-gold) 55%, var(--muted-text))",
                    cursor: "pointer",
                    opacity: 0.55,
                    transition: "opacity 160ms var(--ease-cinematic), color 160ms var(--ease-cinematic), transform 160ms var(--ease-cinematic)",
                    flexShrink: 0,
                  }}
                >
                  {/* Paperclip */}
                  <svg viewBox="0 0 16 16" width={14} height={14} stroke="currentColor" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13.2 7.3 8 12.5a3 3 0 1 1-4.2-4.2l5.6-5.6a2 2 0 1 1 2.8 2.8L6.6 11.1a1 1 0 1 1-1.4-1.4l4.9-4.9" />
                  </svg>
                </button>
              </div>

              {/* Right: hint + mic + send */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    color: "var(--muted-text)",
                    opacity: 0.45,
                    userSelect: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  type <span style={{ color: "var(--accent-gold)", opacity: 0.9 }}>/</span> for shortcuts
                </span>
                <button
                  type="button"
                  aria-label="Voice input"
                  title="Voice (coming soon)"
                  className="atlas-icon-btn atlas-mic-btn"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: "transparent",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    color: "color-mix(in oklab, var(--accent-gold) 55%, var(--muted-text))",
                    cursor: "pointer",
                    opacity: 0.55,
                    transition: "opacity 160ms var(--ease-cinematic), color 160ms var(--ease-cinematic), transform 160ms var(--ease-cinematic)",
                    flexShrink: 0,
                  }}
                >
                  <svg viewBox="0 0 16 16" width={13} height={13} stroke="currentColor" fill="none" strokeWidth={1.6}>
                    <rect x="6" y="2" width="4" height="8" rx="2" />
                    <path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5V14" strokeLinecap="round" />
                  </svg>
                  {/* Waveform */}
                  <span className="atlas-wave" aria-hidden style={{ display: "inline-flex", alignItems: "center", gap: 1.5, height: 12 }}>
                    <i style={{ width: 1.5, background: "currentColor", borderRadius: 1, display: "block" }} />
                    <i style={{ width: 1.5, background: "currentColor", borderRadius: 1, display: "block" }} />
                    <i style={{ width: 1.5, background: "currentColor", borderRadius: 1, display: "block" }} />
                  </span>
                </button>
                <button
                  onClick={() => onSend(input, activeMode)}
                  disabled={!input.trim() || sending}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: input.trim() ? "var(--ember)" : "var(--surface)",
                    border: input.trim() ? "none" : "0.5px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: input.trim() ? "pointer" : "default",
                    boxShadow: input.trim() ? "0 0 16px -2px rgba(234,88,12,0.55)" : "none",
                    transition: "all 220ms var(--ease-cinematic)",
                  }}
                >
                  <svg
                    viewBox="0 0 16 16"
                    width={14}
                    height={14}
                    stroke={input.trim() ? "var(--background)" : "var(--muted-text)"}
                    fill="none"
                    strokeWidth={2}
                  >
                    <path d="M2 8h12M8 2l6 6-6 6" />
                  </svg>
                </button>
              </div>
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
        .atlas-input-shell:focus-within {
          border-color: color-mix(in oklab, var(--accent-gold) 55%, transparent) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.05),
            0 8px 32px rgba(0,0,0,0.45),
            0 0 22px -6px color-mix(in oklab, var(--accent-gold) 55%, transparent) !important;
        }
        .atlas-icon-btn:hover {
          opacity: 1 !important;
          color: var(--accent-gold) !important;
          transform: translateY(-1px);
        }
        .atlas-mic-btn .atlas-wave i {
          height: 3px;
          opacity: 0.75;
          animation: atlas-wave-bounce 1.1s ease-in-out infinite;
        }
        .atlas-mic-btn .atlas-wave i:nth-child(1) { animation-delay: 0ms; }
        .atlas-mic-btn .atlas-wave i:nth-child(2) { animation-delay: 140ms; }
        .atlas-mic-btn .atlas-wave i:nth-child(3) { animation-delay: 280ms; }
        @keyframes atlas-wave-bounce {
          0%, 100% { height: 3px; }
          50%      { height: 10px; }
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
