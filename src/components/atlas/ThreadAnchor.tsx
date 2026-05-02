import { useMemo } from "react";

/**
 * ThreadAnchor — "Where were we." Persistent at the top of the conversation.
 *
 * Per POSITIONING.md §6: updates ONLY on real shifts, not every message.
 * "Real shift" heuristic: the most recent committed entry in this session,
 * OR the most recent decision-catch turn, OR the original session topic.
 *
 * Design: a single, quiet line. Never demands attention. Tappable when
 * there's a linked decision in the Ledger.
 */

export interface ThreadAnchorProps {
  /** What we're anchored on right now. Plain prose, ≤ 80 chars ideal. */
  text: string;
  /** Optional secondary line — e.g. "last commit · 2h ago". */
  meta?: string;
  /** Optional click handler — usually scrolls to / opens the linked decision. */
  onClick?: () => void;
}

export function ThreadAnchor({ text, meta, onClick }: ThreadAnchorProps) {
  const Wrapper: React.ElementType = onClick ? "button" : "div";
  const interactive = Boolean(onClick);

  const display = useMemo(() => {
    const trimmed = text.trim();
    if (trimmed.length <= 90) return trimmed;
    return trimmed.slice(0, 87) + "…";
  }, [text]);

  return (
    <Wrapper
      type={interactive ? "button" : undefined}
      onClick={onClick}
      aria-label={interactive ? `Where we were: ${display}` : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 14px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        cursor: interactive ? "pointer" : "default",
        textAlign: "left" as const,
        font: "inherit",
        color: "inherit",
        border: "none",
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase" as const,
          color: "var(--muted-text)",
          flexShrink: 0,
        }}
      >
        Where were we
      </span>
      <span
        style={{
          fontSize: 13,
          color: "var(--foreground)",
          letterSpacing: "-0.005em",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
          minWidth: 0,
          flex: 1,
        }}
      >
        {display}
      </span>
      {meta && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            letterSpacing: "0.06em",
            color: "var(--muted-text)",
            flexShrink: 0,
          }}
        >
          {meta}
        </span>
      )}
    </Wrapper>
  );
}
