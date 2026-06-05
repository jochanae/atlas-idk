/**
 * ReflectionSurface — standalone Global Insight chat surface.
 *
 * Owns its own fixed-overlay layout, isolated scroll container, and a
 * minimal composer. No `reflectionLocked` ternaries, no shared scroll
 * with the ambient home shell. Renders only when `open` is true.
 *
 * Layout invariants:
 *   - Fixed positioning below the page header (--atlas-header-height)
 *   - Scroll lives ONLY inside `.atlas-reflection-scroll`
 *   - Composer is pinned to the bottom edge (above the safe-area inset)
 */
import { useEffect, useRef } from "react";

export type ReflectionMessage = {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  createdAt?: string;
};

export type ReflectionLiveStep = {
  verb: string;
  target?: string | null;
  status?: "ok" | "warn" | "fail" | string;
} | null;

interface Props {
  open: boolean;
  messages: ReflectionMessage[];
  input: string;
  setInput: (v: string) => void;
  onSubmit: () => void | Promise<void>;
  isSending: boolean;
  isStreaming: boolean;
  pendingPhrase: string;
  liveStep?: ReflectionLiveStep;
  isListening: boolean;
  toggleVoice: () => void;
  onOpenHistory: () => void | Promise<void>;
  onExit: () => void;
}

export function ReflectionSurface({
  open,
  messages,
  input,
  setInput,
  onSubmit,
  isSending,
  isStreaming,
  pendingPhrase,
  liveStep,
  isListening,
  toggleVoice,
  onOpenHistory,
  onExit,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll on new messages / streaming
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [open, messages.length, isStreaming]);

  if (!open) return null;

  const canSubmit = input.trim().length > 0 && !isSending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    void onSubmit();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="atlas-reflection-surface"
      role="dialog"
      aria-label="Global Insight"
      style={{
        position: "fixed",
        top: "var(--atlas-header-height, 56px)",
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--atlas-bg)",
        zIndex: 60,
        // Defensive — never let ambient page scroll bleed through
        overscrollBehavior: "contain",
        touchAction: "none",
      }}
    >
      {/* Header strip */}
      <div
        style={{
          flexShrink: 0,
          padding: "14px 20px 12px",
          textAlign: "center",
          position: "relative",
          borderBottom: "1px solid rgba(212,175,55,0.08)",
        }}
      >
        <button
          type="button"
          onClick={onExit}
          aria-label="Close Global Insight"
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            width: 32,
            height: 32,
            borderRadius: 999,
            background: "transparent",
            border: "1px solid rgba(212,175,55,0.25)",
            color: "var(--atlas-gold)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
        <h1
          style={{
            margin: 0,
            fontSize: "var(--ts-display-md, 22px)",
            fontWeight: 300,
            letterSpacing: "-0.02em",
            background: "linear-gradient(135deg, #F2D89A 0%, #C9A24C 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Global Insight
        </h1>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 11,
            color: "var(--atlas-gold)",
            opacity: 0.7,
            fontFamily: "var(--app-font-mono)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Strategic view · All projects
        </p>
      </div>

      {/* Isolated scroll container — the ONLY scroll surface in this view */}
      <div
        ref={scrollRef}
        className="atlas-reflection-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          padding: "20px 20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {messages.length === 0 && !isStreaming && (
          <div
            style={{
              textAlign: "center",
              opacity: 0.45,
              fontFamily: "var(--app-font-mono)",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--atlas-muted)",
              marginTop: 40,
            }}
          >
            Ask the global view…
          </div>
        )}

        {messages.map((msg, i) =>
          msg.role === "assistant" ? (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--app-font-mono)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--atlas-gold)",
                  opacity: 0.55,
                }}
              >
                Atlas
              </span>
              <div
                style={{
                  fontSize: 16,
                  lineHeight: 1.75,
                  color: "var(--atlas-fg)",
                  fontFamily: "var(--app-font-sans)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  opacity: 0.92,
                }}
              >
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--app-font-mono)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(212,175,55,0.85)",
                  opacity: 0.65,
                }}
              >
                You
              </span>
              <div
                style={{
                  padding: "10px 14px",
                  background: "rgba(212,175,55,0.05)",
                  border: "1px solid rgba(212,175,55,0.22)",
                  borderRadius: 12,
                  maxWidth: "82%",
                  fontSize: 16,
                  lineHeight: 1.6,
                  color: "var(--atlas-fg)",
                  fontFamily: "var(--app-font-sans)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {msg.content}
              </div>
            </div>
          ),
        )}

        {isStreaming && !messages.some((m) => m.streaming && m.content.length > 0) && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.75 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--atlas-gold)",
                animation: "atlas-pulse 1.4s ease-in-out infinite",
              }}
            />
            <span
              style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: 11,
                letterSpacing: "0.08em",
                color: "var(--atlas-muted)",
              }}
            >
              {liveStep ? `${liveStep.verb}${liveStep.target ? " " + liveStep.target : ""}` : pendingPhrase}
            </span>
          </div>
        )}
      </div>

      {/* Composer — pinned to bottom, OUTSIDE the scroll container */}
      <div
        style={{
          flexShrink: 0,
          padding: "10px 16px calc(10px + env(safe-area-inset-bottom, 0px))",
          background: "var(--atlas-bg)",
          borderTop: "1px solid rgba(212,175,55,0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 8,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(212,175,55,0.18)",
            borderRadius: 14,
            padding: "8px 10px",
          }}
        >
          <button
            type="button"
            onClick={() => void onOpenHistory()}
            aria-label="Open history"
            title="Where were we?"
            style={{
              width: 32,
              height: 32,
              flexShrink: 0,
              borderRadius: 999,
              background: "rgba(212,175,55,0.10)",
              border: "1px solid rgba(212,175,55,0.28)",
              color: "rgba(212,175,55,0.85)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
            </svg>
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask the global view…"
            rows={1}
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              color: "var(--atlas-fg)",
              fontSize: 16,
              lineHeight: 1.5,
              fontFamily: "var(--app-font-sans)",
              padding: "6px 4px",
              maxHeight: 140,
            }}
          />

          <button
            type="button"
            onClick={toggleVoice}
            aria-label={isListening ? "Stop voice" : "Voice input"}
            style={{
              width: 32,
              height: 32,
              flexShrink: 0,
              borderRadius: 8,
              border: "none",
              background: isListening ? "rgba(201,162,76,0.10)" : "transparent",
              color: isListening ? "var(--atlas-gold)" : "var(--atlas-muted)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="11" rx="3" />
              <path d="M5 10a7 7 0 0014 0" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>

          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              if (canSubmit) handleSubmit();
            }}
            onClick={(e) => {
              if (e.detail === 0) handleSubmit();
            }}
            disabled={!canSubmit}
            aria-label="Send"
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              borderRadius: 999,
              border: "none",
              background: canSubmit ? "rgba(212,175,55,0.14)" : "transparent",
              color: canSubmit ? "var(--atlas-gold)" : "var(--atlas-muted)",
              cursor: canSubmit ? "pointer" : "not-allowed",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              opacity: isSending ? 0.5 : 1,
              transition: "background 160ms ease, color 160ms ease",
            }}
          >
            <svg viewBox="0 0 20 20" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 10L17 3 13 17l-3.5-5.5z" />
              <path d="M17 3 9.5 11.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReflectionSurface;
