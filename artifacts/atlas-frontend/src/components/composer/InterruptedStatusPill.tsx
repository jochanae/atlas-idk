/**
 * Status pill for an assistant turn that was stopped mid-generation.
 * Makes the timeline unambiguous: the previous task is no longer active.
 */
export type InterruptReason = "newer_request" | "user_stop";

export function InterruptedStatusPill({
  reason = "newer_request",
}: {
  reason?: InterruptReason | null;
}) {
  const label =
    reason === "user_stop"
      ? "Stopped"
      : "Interrupted · New request started";

  return (
    <div
      role="status"
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginTop: 10,
        padding: "5px 10px",
        borderRadius: 999,
        border: "1px solid color-mix(in oklab, var(--atlas-muted) 28%, transparent)",
        background: "color-mix(in oklab, var(--atlas-muted) 8%, transparent)",
        color: "var(--atlas-muted)",
        fontFamily: "var(--app-font-mono)",
        fontSize: 11,
        letterSpacing: "0.04em",
        lineHeight: 1.2,
      }}
    >
      <span aria-hidden style={{ fontSize: 12, lineHeight: 1, opacity: 0.9 }}>
        ⏹
      </span>
      <span>{label}</span>
    </div>
  );
}

/** Progressive-only claims that look still-active if left as final prose. */
export function softenInterruptedContent(content: string): string {
  const t = content.trim();
  if (!t) return "";
  // Short progressive / readiness claims — drop them; the pill carries the truth.
  if (
    t.length < 160 &&
    /^(generating\b|i(?:'m| am) generating|creating\b|working on\b|one moment|hang tight|just a (?:sec|second|moment)|building\b|writing\b|preparing\b)/i.test(
      t,
    )
  ) {
    return "";
  }
  return content;
}

export default InterruptedStatusPill;
