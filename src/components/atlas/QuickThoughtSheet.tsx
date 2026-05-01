import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
  /** Hint shown above the input — e.g. active session title. */
  contextLabel?: string | null;
  sending?: boolean;
};

/**
 * QuickThoughtSheet — compact bottom sheet triggered by the footer's
 * center Atlas button. Posts the entered text to whatever session is
 * currently active (parent decides; if no session, parent should
 * auto-create one via its existing send flow).
 */
export function QuickThoughtSheet({ open, onClose, onSubmit, contextLabel, sending }: Props) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    const t = window.setTimeout(() => taRef.current?.focus(), 80);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    onSubmit(trimmed);
    setText("");
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(2px)",
          zIndex: 95,
          animation: "atlas-qt-fade 200ms ease forwards",
        }}
      />

      <div
        role="dialog"
        aria-label="Drop a thought"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 96,
          background: "var(--surface, #1C1917)",
          borderTop: "1px solid color-mix(in oklab, var(--accent-gold) 30%, var(--border))",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          boxShadow: "0 -16px 40px -8px rgba(0,0,0,0.6)",
          padding: "12px 16px max(env(safe-area-inset-bottom, 0px), 14px)",
          animation: "atlas-qt-slide 240ms cubic-bezier(.2,.8,.2,1) forwards",
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            background: "color-mix(in oklab, var(--foreground) 18%, transparent)",
            margin: "2px auto 12px",
          }}
        />

        {/* Context line */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
            gap: 12,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              fontSize: 9.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted-text, var(--muted-foreground))",
              opacity: 0.75,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            {contextLabel ? `→ ${contextLabel}` : "→ Drop a thought"}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 26,
              height: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              color: "var(--muted-text, var(--muted-foreground))",
              cursor: "pointer",
              borderRadius: 6,
            }}
          >
            <X size={14} strokeWidth={1.6} />
          </button>
        </div>

        {/* Input */}
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What's on your mind?"
          rows={2}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--foreground)",
            fontFamily: "var(--font-sans)",
            fontSize: 17,
            lineHeight: 1.5,
            resize: "none",
            minHeight: 56,
            maxHeight: "30vh",
          }}
        />

        {/* Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            marginTop: 8,
            gap: 10,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              fontSize: 10,
              letterSpacing: "0.08em",
              color: "var(--muted-text, var(--muted-foreground))",
              opacity: 0.55,
            }}
          >
            ↵ to send
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || !!sending}
            aria-label="Send"
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: text.trim() ? "#EA580C" : "transparent",
              border: text.trim() ? "none" : "0.5px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: text.trim() ? "pointer" : "default",
              opacity: text.trim() ? 1 : 0.5,
              transition: "all 200ms cubic-bezier(.2,.8,.2,1)",
            }}
          >
            <svg
              viewBox="0 0 20 20"
              width={14}
              height={14}
              fill={text.trim() ? "#0C0A09" : "none"}
              stroke={text.trim() ? "#0C0A09" : "var(--muted-text)"}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2.5 10L17 3 13 17l-3.5-5.5z" />
              <path d="M17 3 9.5 11.5" />
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes atlas-qt-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes atlas-qt-slide {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
