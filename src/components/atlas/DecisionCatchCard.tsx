import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { proceedAnyway, type DecisionCatchPayload } from "@/lib/decision-catch";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

/**
 * DecisionCatchCard — the most important component in the product.
 *
 * Renders inline below an assistant message when the server detected a
 * structured catch in the prose. Two buttons, no third option:
 *   • Proceed anyway → logs a deviation entry, calls onProceeded.
 *   • Adjust         → calls onAdjust so the chat surface can prompt
 *                       the user to reframe (CommitPrompt flow).
 *
 * Pauses the flow visually but does not block typing.
 */
export interface DecisionCatchCardProps {
  payload: DecisionCatchPayload;
  messageId: string;
  projectId: string;
  sessionId: string | null;
  /** True once a successor entry has been written for this catch. */
  resolved?: boolean;
  onProceeded?: (entryId: string) => void;
  onAdjust?: () => void;
}

export function DecisionCatchCard({
  payload,
  messageId,
  projectId,
  sessionId,
  resolved = false,
  onProceeded,
  onAdjust,
}: DecisionCatchCardProps) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState(false);

  const handleProceed = async () => {
    if (!user || busy || resolved) return;
    setBusy(true);
    try {
      const entry = await proceedAnyway({
        userId: user.id,
        projectId,
        sessionId,
        sourceMessageId: messageId,
        catchPayload: payload,
        reason: reason || undefined,
      });
      toast.success("Logged as intentional tradeoff");
      onProceeded?.(entry.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not log deviation");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="alert"
      aria-label="Decision Catch"
      style={{
        marginTop: 10,
        padding: "12px 14px",
        borderRadius: 10,
        background:
          "linear-gradient(180deg, color-mix(in oklab, var(--ember) 6%, transparent), transparent)",
        border: "1px solid color-mix(in oklab, var(--ember) 40%, var(--border))",
        boxShadow:
          "0 0 0 1px color-mix(in oklab, var(--ember) 8%, transparent) inset",
        opacity: resolved ? 0.55 : 1,
      }}
    >
      {/* Header: label + linked decision */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "var(--ember)",
            boxShadow: "0 0 6px var(--ember)",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase" as const,
            color: "var(--ember)",
          }}
        >
          {resolved ? "Catch · resolved" : "Before you do"}
        </span>
        <Link
          to="/ledger"
          search={{ focus: payload.against.id }}
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            letterSpacing: "0.08em",
            color: "var(--muted-text)",
            textDecoration: "none",
          }}
        >
          View decision →
        </Link>
      </div>

      {/* The lead sentence in Atlas's own voice */}
      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--foreground)",
        }}
      >
        {payload.leadSentence}
      </p>

      {!resolved && (
        <>
          {showReason && (
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="One line on why — optional, but it helps later."
              rows={2}
              style={{
                marginTop: 10,
                width: "100%",
                background: "var(--surface-alt)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 13,
                color: "var(--foreground)",
                fontFamily: "var(--font-sans)",
                outline: "none",
                resize: "vertical",
              }}
            />
          )}

          <div
            style={{
              marginTop: 12,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!showReason) {
                  setShowReason(true);
                  return;
                }
                void handleProceed();
              }}
              style={{
                padding: "7px 14px",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.08em",
                textTransform: "uppercase" as const,
                background: "transparent",
                color: "var(--ember)",
                border: "1px solid var(--ember)",
                borderRadius: 4,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.5 : 1,
              }}
            >
              {busy ? "Logging…" : showReason ? "Confirm proceed" : "Proceed anyway"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setShowReason(false);
                setReason("");
                onAdjust?.();
              }}
              style={{
                padding: "7px 14px",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.08em",
                textTransform: "uppercase" as const,
                background: "var(--accent-gold)",
                color: "var(--background)",
                border: "1px solid var(--accent-gold)",
                borderRadius: 4,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              Adjust
            </button>
            {showReason && (
              <button
                type="button"
                onClick={() => {
                  setShowReason(false);
                  setReason("");
                }}
                style={{
                  marginLeft: "auto",
                  padding: "7px 8px",
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.08em",
                  background: "transparent",
                  color: "var(--muted-text)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                cancel
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
