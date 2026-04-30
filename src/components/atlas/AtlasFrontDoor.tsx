import { type ReactNode, useEffect, useRef, useState } from "react";
import { RotatingPlaceholder } from "./RotatingPlaceholder";
import { SystemMenu } from "./SystemMenu";

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
  /** Center element for the header (project name + dropdown). Falls back to "Atlas" wordmark. */
  headerCenter?: ReactNode;
  bottomTabs?: ReactNode;
  secondaryPanel?: ReactNode;
  utilityBarLeft?: ReactNode;
  utilityBarRight?: ReactNode;
  inputFocusSignal: number;
  sidebarToggle?: ReactNode;
  userName?: string | null;
  /** Recent sessions shown under the resting input as "Continue where you left off". */
  recents?: RecentSession[];
  onOpenSession?: (sessionId: string) => void;
  /** Optional handler invoked when the user taps "View all" under recents. */
  onViewAllRecents?: () => void;
  onModeChange: (mode: ModeId) => void;
  onInputChange: (value: string) => void;
  onSend: (text: string, mode: ModeId) => void;
  /** Cancels the in-flight Atlas request. Required when sending=true. */
  onStop?: () => void;
  onWordmarkClick?: () => void;
  children?: ReactNode;
};

export function AtlasFrontDoor({
  active,
  activeMode,
  input,
  sending,
  headerActions,
  headerCenter,
  bottomTabs,
  secondaryPanel,
  utilityBarLeft,
  utilityBarRight,
  inputFocusSignal,
  sidebarToggle,
  userName,
  recents,
  onOpenSession,
  onViewAllRecents,
  onModeChange,
  onInputChange,
  onSend,
  onStop,
  onWordmarkClick,
  children,
}: AtlasFrontDoorProps) {
  const pillsRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [pillsOverflow, setPillsOverflow] = useState(false);

  const TEXTAREA_MIN_HEIGHT = 48;
  const TEXTAREA_MAX_HEIGHT = 160;

  const adjustTextareaHeight = (element: HTMLTextAreaElement | null) => {
    if (!element) return;
    element.style.height = "0px";
    const nextHeight = Math.max(TEXTAREA_MIN_HEIGHT, Math.min(element.scrollHeight, TEXTAREA_MAX_HEIGHT));
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
  };

  const handleInputChange = (value: string) => {
    onInputChange(value);
    requestAnimationFrame(() => adjustTextareaHeight(textareaRef.current));
  };

  useEffect(() => {
    const row = pillsRef.current;
    if (!row) return;

    const updateOverflow = () => {
      setPillsOverflow(row.scrollWidth > row.clientWidth + 2);
    };

    updateOverflow();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateOverflow);
      observer.observe(row);
      const inner = row.firstElementChild;
      if (inner instanceof HTMLElement) observer.observe(inner);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateOverflow);
    return () => window.removeEventListener("resize", updateOverflow);
  }, []);

  useEffect(() => {
    if (inputFocusSignal > 0) textareaRef.current?.focus();
  }, [inputFocusSignal]);

  useEffect(() => {
    adjustTextareaHeight(textareaRef.current);
  }, [input, active]);

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
      {/* Three-point header: sidebar | project center | avatar/actions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          padding: "14px 18px 10px",
          minHeight: 56,
          gap: 8,
        }}
      >
        {/* Left: sidebar toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, height: 36 }}>
          {sidebarToggle}
          {(
            <button
              onClick={onWordmarkClick}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                height: 36,
                display: "inline-flex",
                alignItems: "center",
                fontSize: 16,
                fontWeight: 500,
                color: "var(--foreground)",
                letterSpacing: "0.08em",
                lineHeight: 1,
                cursor: onWordmarkClick ? "pointer" : "default",
              }}
            >
              Atlas
            </button>
          )}
        </div>

        {/* Center: project name + dropdown (or empty on resting) */}
        <div style={{ display: "flex", justifyContent: "center", minWidth: 0 }}>
          {headerCenter}
        </div>

        {/* Right: actions + avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36, justifyContent: "flex-end" }}>
          {headerActions}
        </div>
      </div>

      {/* Stage: holds resting hero + active chat in the SAME box for cross-fade */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Resting hero — greeting, pills, input. Fades/translates out on activate. */}
        <div
          aria-hidden={active}
          style={{
            position: active ? "absolute" : "relative",
            inset: active ? 0 : "auto",
            flex: active ? "none" : 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "stretch",
            padding: "8vh 0 4vh",
            opacity: active ? 0 : 1,
            transform: active ? "translateY(-20px)" : "translateY(0)",
            pointerEvents: active ? "none" : "auto",
            transition:
              "opacity 400ms cubic-bezier(0.4, 0, 0.2, 1), transform 400ms cubic-bezier(0.4, 0, 0.2, 1)",
            willChange: "opacity, transform",
          }}
        >
          <div style={{ textAlign: "center", padding: "0 24px 44px" }}>
            <div
              className="atlas-greeting"
              style={{
                fontWeight: 300,
                color: "var(--foreground)",
                lineHeight: 1.3,
                letterSpacing: "-0.005em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {greetingFor(new Date(), userName)}
            </div>
          </div>

          {/* Mode pills */}
          <div
            ref={pillsRef}
            className="atlas-pills-row"
            style={{
              display: "flex",
              justifyContent: pillsOverflow ? "flex-start" : "center",
              padding: pillsOverflow ? "0 22px 22px" : "0 24px 22px",
              overflowX: "auto",
              overflowY: "hidden",
              scrollbarWidth: "none",
              WebkitOverflowScrolling: "touch",
              scrollPaddingInline: 22,
            }}
          >
            <div
              className="atlas-pills-inner"
              style={{
                display: "flex",
                gap: 8,
                width: "max-content",
                margin: 0,
                paddingInline: pillsOverflow ? 4 : 0,
                flexWrap: "nowrap",
              }}
            >
              {MODES.map((m) => {
                const isActive = activeMode === m.id;
                const isPhosphor = m.color === "phosphor";
                const activeColor = isPhosphor ? "var(--phosphor)" : "var(--ember)";
                return (
                  <button
                    key={m.id}
                    onClick={() => onModeChange(m.id)}
                    className="atlas-mode-pill"
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
                onChange={(e) => handleInputChange(e.target.value)}
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
                  minHeight: TEXTAREA_MIN_HEIGHT,
                  maxHeight: TEXTAREA_MAX_HEIGHT,
                  overflowY: "hidden",
                  display: "block",
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
              {/* Left: system menu trigger */}
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <SystemMenu />
              </div>

              {/* Right: hint + mic + send */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  className="atlas-shortcut-hint"
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
                  onClick={() => (sending ? onStop?.() : onSend(input, activeMode))}
                  disabled={sending ? !onStop : !input.trim()}
                  aria-label={sending ? "Stop Atlas" : "Send"}
                  title={sending ? "Stop Atlas" : "Send"}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: sending
                      ? "var(--surface)"
                      : input.trim() ? "var(--ember)" : "var(--surface)",
                    border: sending
                      ? "0.5px solid var(--ember)"
                      : input.trim() ? "none" : "0.5px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: sending || input.trim() ? "pointer" : "default",
                    boxShadow: !sending && input.trim() ? "0 0 16px -2px rgba(234,88,12,0.55)" : "none",
                    transition: "all 220ms var(--ease-cinematic)",
                  }}
                >
                  {sending ? (
                    <svg viewBox="0 0 16 16" width={12} height={12} fill="var(--ember)">
                      <rect x="3" y="3" width="10" height="10" rx="1.5" />
                    </svg>
                  ) : (
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
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Inline timestamp — anchored under the input, in flow (not floating). */}
          <InlineTimestamp />

          {/* Continue where you left off — recent sessions list. Only when not active. */}
          {recents && recents.length > 0 && onOpenSession && (
            <div
              style={{
                margin: "20px 0 0",
                animation: "atlas-recents-in 480ms cubic-bezier(0.4, 0, 0.2, 1) 200ms backwards",
              }}
            >
              <div
                style={{
                  padding: "0 22px 6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--muted-text)",
                  opacity: 0.7,
                }}
              >
                <span>Continue where you left off</span>
                {recents.length > 3 && onViewAllRecents && (
                  <button
                    type="button"
                    onClick={onViewAllRecents}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      fontFamily: "var(--font-mono)",
                      fontSize: 9.5,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--accent-gold)",
                      opacity: 0.85,
                      cursor: "pointer",
                    }}
                  >
                    View all →
                  </button>
                )}
              </div>
              <SessionHistoryList
                sessions={recents.slice(0, 3)}
                onOpenSession={onOpenSession}
              />
            </div>
          )}
        </div>

        {/* Active session content — cross-fades in over the resting hero */}
        <div
          aria-hidden={!active}
          style={{
            position: active ? "relative" : "absolute",
            inset: active ? "auto" : 0,
            flex: active ? 1 : "none",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            opacity: active ? 1 : 0,
            transform: active ? "translateY(0)" : "translateY(20px)",
            pointerEvents: active ? "auto" : "none",
            transition:
              "opacity 400ms cubic-bezier(0.4, 0, 0.2, 1), transform 400ms cubic-bezier(0.4, 0, 0.2, 1)",
            transitionDelay: active ? "120ms" : "0ms",
            willChange: "opacity, transform",
          }}
        >
          {/* Collapsed mode indicator — replaces the row of pills in active state */}
          {active && (() => {
            const m = MODES.find((x) => x.id === activeMode);
            if (!m) return null;
            const isPhosphor = m.color === "phosphor";
            const accent = isPhosphor ? "var(--phosphor)" : "var(--ember)";
            const glow = isPhosphor ? "rgba(6,182,212,0.35)" : "rgba(234,88,12,0.4)";
            return (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "10px 16px 6px",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 10px",
                    borderRadius: 999,
                    border: `0.5px solid ${accent}`,
                    background: "var(--surface)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: accent,
                    boxShadow: `0 0 10px -3px ${glow}`,
                    animation: "atlas-tag-in 400ms cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: accent,
                      boxShadow: `0 0 6px ${accent}`,
                    }}
                  />
                  {m.label}
                </span>
              </div>
            );
          })()}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {children}
          </div>
        </div>
      </div>

      {/* Active-mode input docked at bottom — solid anchor with utility bar */}
      {active && (
        <div
          className="atlas-active-input-shell"
          style={{
            margin: "0 16px 14px",
            background: "var(--surface)",
            borderRadius: 14,
            border: "1px solid color-mix(in oklab, var(--accent-gold) 18%, var(--border))",
            padding: "12px 14px 8px",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 6px 24px rgba(0,0,0,0.35)",
            transition: "border-color 220ms var(--ease-cinematic), box-shadow 220ms var(--ease-cinematic)",
            flexShrink: 0,
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="reply to atlas…"
            rows={1}
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
              minHeight: TEXTAREA_MIN_HEIGHT,
              maxHeight: 120,
              overflowY: "hidden",
              display: "block",
            }}
          />
          {/* Utility Bar: structured, evenly spaced, muted gold */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 6,
              paddingTop: 6,
              borderTop: "0.5px solid color-mix(in oklab, var(--border) 70%, transparent)",
              gap: 12,
            }}
          >
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {utilityBarLeft}
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {utilityBarRight}
              <button
                onClick={() => (sending ? onStop?.() : onSend(input, activeMode))}
                disabled={sending ? !onStop : !input.trim()}
                aria-label={sending ? "Stop Atlas" : "Send"}
                title={sending ? "Stop Atlas" : "Send"}
                style={{
                  width: 32,
                  height: 32,
                  marginLeft: 6,
                  borderRadius: 8,
                  background: sending
                    ? "transparent"
                    : input.trim() ? "var(--ember)" : "transparent",
                  border: sending
                    ? "0.5px solid var(--ember)"
                    : input.trim() ? "none" : "0.5px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: sending || input.trim() ? 1 : 0.4,
                  cursor: sending || input.trim() ? "pointer" : "default",
                  transition: "all 220ms var(--ease-cinematic)",
                  flexShrink: 0,
                }}
              >
                {sending ? (
                  <svg viewBox="0 0 16 16" width={11} height={11} fill="var(--ember)">
                    <rect x="3" y="3" width="10" height="10" rx="1.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" width={13} height={13} stroke={input.trim() ? "var(--background)" : "var(--muted-text)"} fill="none" strokeWidth={2}>
                    <path d="M2 8h12M8 2l6 6-6 6" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {secondaryPanel}
      {bottomTabs}

      <style>{`
        .atlas-greeting { font-size: 26px; }
        @media (max-width: 480px) {
          .atlas-greeting { font-size: 22px; }
        }
        @media (max-width: 420px) {
          .atlas-shortcut-hint { display: none; }
        }
        @media (max-width: 400px) {
          .atlas-pills-row { padding-left: 14px !important; padding-right: 14px !important; }
          .atlas-pills-inner { gap: 5px !important; padding-inline: 0 !important; }
          .atlas-mode-pill { font-size: 9.5px !important; padding: 4px 8px !important; letter-spacing: 0.04em !important; }
        }
        @media (max-width: 360px) {
          .atlas-greeting { font-size: 19px; }
          .atlas-mode-pill { font-size: 9px !important; padding: 3px 7px !important; }
          .atlas-input-shell { margin: 0 12px !important; padding: 14px 14px !important; }
        }
        @keyframes atlas-rise {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes atlas-tag-in {
          from { opacity: 0; transform: translateY(-4px) scale(0.92); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes atlas-recents-in {
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
        .atlas-active-input-shell:focus-within {
          border-color: color-mix(in oklab, var(--accent-gold) 45%, var(--border)) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.04),
            0 6px 24px rgba(0,0,0,0.4),
            0 0 16px -6px color-mix(in oklab, var(--accent-gold) 45%, transparent) !important;
        }
        .atlas-utility-btn {
          width: 32px;
          height: 32px;
          border-radius: 7px;
          background: transparent;
          border: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: color-mix(in oklab, var(--accent-gold) 50%, var(--muted-text));
          cursor: pointer;
          opacity: 0.7;
          transition: opacity 160ms var(--ease-cinematic), color 160ms var(--ease-cinematic), background 160ms var(--ease-cinematic);
          flex-shrink: 0;
          position: relative;
        }
        .atlas-utility-btn:hover {
          opacity: 1;
          color: var(--accent-gold);
          background: color-mix(in oklab, var(--accent-gold) 8%, transparent);
        }
        .atlas-utility-btn[data-active="true"] {
          opacity: 1;
          color: var(--accent-gold);
          background: color-mix(in oklab, var(--accent-gold) 12%, transparent);
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
        .atlas-avatar:hover {
          transform: translateY(-1px);
          border-color: color-mix(in oklab, var(--accent-gold) 70%, var(--border)) !important;
          box-shadow:
            inset 0 1px 0 color-mix(in oklab, white 10%, transparent),
            0 0 0 1px color-mix(in oklab, var(--accent-gold) 35%, transparent),
            0 0 18px -4px color-mix(in oklab, var(--accent-gold) 55%, transparent) !important;
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

function greetingFor(now: Date, name?: string | null): string {
  const h = now.getHours();
  const period = h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
  const first = (name || "").trim().split(/\s+/)[0];
  return first ? `Good ${period}, ${first}.` : `Good ${period}.`;
}

function InlineTimestamp() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const day = days[now.getDay()];
  const mon = months[now.getMonth()];
  const date = now.getDate();
  let h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const stamp = `${day} ${mon} ${date} | ${h}:${m} ${ampm}`;
  return (
    <div
      aria-hidden
      style={{
        textAlign: "center",
        padding: "10px 22px 0",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.18em",
        color: "color-mix(in oklab, var(--foreground) 42%, transparent)",
        userSelect: "none",
      }}
    >
      {stamp}
    </div>
  );
}

