import { useState } from "react";
import { toast } from "sonner";
import { haptic } from "@/lib/long-press-tip";
import { ICON_TOUCH_TARGET_STYLE } from "@/components/workspace/chatShared";

type Reason =
  | "incorrect"
  | "built_wrong_thing"
  | "missed_point"
  | "too_much_detail"
  | "too_little_detail"
  | "other";

const REASONS: { id: Reason; label: string }[] = [
  { id: "incorrect", label: "Incorrect" },
  { id: "built_wrong_thing", label: "Built the wrong thing" },
  { id: "missed_point", label: "Missed the point" },
  { id: "too_much_detail", label: "Too much detail" },
  { id: "too_little_detail", label: "Too little detail" },
  { id: "other", label: "Other…" },
];

async function submitFeedback(
  messageId: number,
  rating: "up" | "down",
  reason?: Reason | null,
  comment?: string,
): Promise<void> {
  await fetch(`/api/messages/${messageId}/feedback`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rating,
      ...(reason ? { reason } : {}),
      ...(comment?.trim() ? { comment: comment.trim() } : {}),
    }),
  });
}

export function MessageFeedback({
  messageId,
  compact = false,
}: {
  messageId?: number;
  compact?: boolean;
}) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  const handleUp = async () => {
    if (rating === "up") return;
    haptic.short();
    setRating("up");
    setPanelOpen(false);
    if (messageId) {
      try {
        await submitFeedback(messageId, "up");
      } catch {
        // non-critical — still show optimistic state
      }
    }
    toast.success("Thanks for the feedback");
  };

  const handleDown = () => {
    haptic.short();
    setRating("down");
    setPanelOpen((v) => !v || rating !== "down");
  };

  const sendDetails = async () => {
    if (sending) return;
    haptic.short();
    setSending(true);
    if (messageId) {
      try {
        await submitFeedback(messageId, "down", reason, comment);
      } catch {
        // non-critical
      }
    }
    setSending(false);
    setPanelOpen(false);
    toast("Thanks — noted");
  };

  const iconBtn = (
    active: boolean,
    onClick: () => void,
    title: string,
    ariaLabel: string,
    children: React.ReactNode,
  ) => (
    <button
      type="button"
      className="atlas-icon-action"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      style={{
        ...ICON_TOUCH_TARGET_STYLE,
        color: active ? "var(--atlas-gold)" : undefined,
        opacity: active ? 1 : compact ? 0.6 : 0.75,
      }}
    >
      {children}
    </button>
  );

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }}>
      <div style={{ display: "inline-flex", gap: 0 }}>
        {iconBtn(
          rating === "up",
          handleUp,
          "Helpful",
          "Mark response helpful",
          <svg width="13" height="13" viewBox="0 0 16 16" fill={rating === "up" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13.5V7l3.2-5a1.6 1.6 0 012.9 1.3L10.5 6h3.1a1.4 1.4 0 011.4 1.7l-1 5a1.6 1.6 0 01-1.6 1.3H5z" />
            <path d="M5 7H3a1 1 0 00-1 1v4.5a1 1 0 001 1h2" />
          </svg>,
        )}
        {iconBtn(
          rating === "down",
          handleDown,
          "Not helpful",
          "Mark response not helpful",
          <svg width="13" height="13" viewBox="0 0 16 16" fill={rating === "down" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 2.5V9l-3.2 5a1.6 1.6 0 01-2.9-1.3L5.5 10H2.4A1.4 1.4 0 011 8.3l1-5A1.6 1.6 0 013.6 2H11z" />
            <path d="M11 9h2a1 1 0 001-1V3.5a1 1 0 00-1-1h-2" />
          </svg>,
        )}
      </div>

      {panelOpen && rating === "down" && (
        <div
          role="dialog"
          aria-label="Feedback details"
          style={{
            marginTop: 6,
            width: 280,
            maxWidth: "calc(100vw - 32px)",
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--atlas-surface)",
            border: "1px solid color-mix(in oklab, var(--atlas-gold) 18%, transparent)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
            fontFamily: "var(--app-font-sans)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              fontSize: 10,
              fontFamily: "var(--app-font-mono)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--atlas-muted)",
              opacity: 0.7,
              marginBottom: 8,
            }}
          >
            What could be better?
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
            {REASONS.map((r) => {
              const active = reason === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { haptic.short(); setReason(r.id); }}
                  style={{
                    padding: "5px 9px",
                    fontSize: 11.5,
                    borderRadius: 999,
                    border: `0.5px solid ${active ? "color-mix(in oklab, var(--atlas-gold) 55%, transparent)" : "color-mix(in oklab, var(--atlas-border) 70%, transparent)"}`,
                    background: active ? "color-mix(in oklab, var(--atlas-gold) 14%, transparent)" : "transparent",
                    color: active ? "var(--atlas-gold)" : "var(--atlas-fg)",
                    cursor: "pointer",
                    fontFamily: "var(--app-font-sans)",
                    transition: "all 140ms ease",
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional — tell us more"
            rows={2}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 8px",
              fontSize: 12,
              fontFamily: "var(--app-font-sans)",
              color: "var(--atlas-fg)",
              background: "color-mix(in oklab, var(--atlas-bg) 80%, transparent)",
              border: "0.5px solid color-mix(in oklab, var(--atlas-border) 80%, transparent)",
              borderRadius: 6,
              resize: "none",
              outline: "none",
              marginBottom: 8,
            }}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button
              type="button"
              onClick={() => { setPanelOpen(false); }}
              style={{
                padding: "5px 11px",
                fontSize: 11,
                fontWeight: 500,
                background: "transparent",
                color: "var(--atlas-muted)",
                border: "0.5px solid color-mix(in oklab, var(--atlas-border) 60%, transparent)",
                borderRadius: 5,
                cursor: "pointer",
                fontFamily: "var(--app-font-sans)",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={(!reason && !comment.trim()) || sending}
              onClick={sendDetails}
              style={{
                padding: "5px 12px",
                fontSize: 11,
                fontWeight: 600,
                background: "color-mix(in oklab, var(--atlas-gold) 18%, transparent)",
                color: "var(--atlas-gold)",
                border: "0.5px solid color-mix(in oklab, var(--atlas-gold) 45%, transparent)",
                borderRadius: 5,
                cursor: (!reason && !comment.trim()) || sending ? "not-allowed" : "pointer",
                opacity: (!reason && !comment.trim()) || sending ? 0.5 : 1,
                fontFamily: "var(--app-font-sans)",
              }}
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
