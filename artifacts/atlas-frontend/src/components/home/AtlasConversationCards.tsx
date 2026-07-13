// Presentational-only Atlas conversation card components.
// State is local to each card instance (selected option + submitted flag).
// The transport that delivers the card data is irrelevant here.

import { useState } from "react";
import type { AtlasCard } from "./AtlasCardParser";

interface CardProps {
  card: AtlasCard;
  /** Called with the chosen option text once the user confirms. */
  onSend: (text: string) => void;
  isParchment?: boolean;
}

export function AtlasConversationCard({ card, onSend, isParchment }: CardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const gold = isParchment ? "rgba(146,64,14,0.9)" : "rgba(212,175,55,0.95)";
  const borderSubtle = isParchment
    ? "rgba(146,64,14,0.15)"
    : "rgba(255,255,255,0.1)";
  const cardBorder = isParchment
    ? "rgba(146,64,14,0.2)"
    : "rgba(212,175,55,0.16)";
  const cardBg = isParchment
    ? "rgba(146,64,14,0.04)"
    : "rgba(212,175,55,0.03)";

  function handleSelect(idx: number) {
    if (submitted) return;
    // Toggle — tap the same option again to deselect.
    setSelected((prev) => (prev === idx ? null : idx));
  }

  function handleConfirm() {
    if (selected === null || submitted) return;
    setSubmitted(true);
    onSend(card.options[selected]);
  }

  return (
    <div
      style={{
        border: `1px solid ${cardBorder}`,
        borderRadius: 10,
        padding: "14px 16px",
        margin: "0.85em 0",
        background: cardBg,
      }}
    >
      {/* Question */}
      <p
        style={{
          margin: "0 0 12px",
          fontSize: "0.94em",
          lineHeight: 1.5,
          fontWeight: 500,
          opacity: 0.92,
        }}
      >
        {card.question}
      </p>

      {/* Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {card.options.map((option, i) => {
          const isSelected = selected === i;
          return (
            <button
              key={i}
              type="button"
              disabled={submitted}
              onClick={() => handleSelect(i)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                borderRadius: 7,
                border: isSelected
                  ? `1.5px solid ${gold}`
                  : `1px solid ${borderSubtle}`,
                background: isSelected
                  ? isParchment
                    ? "rgba(146,64,14,0.08)"
                    : "rgba(212,175,55,0.07)"
                  : "transparent",
                color: isSelected ? gold : "inherit",
                cursor: submitted ? "default" : "pointer",
                fontSize: "0.9em",
                lineHeight: 1.45,
                fontWeight: isSelected ? 500 : 400,
                opacity: submitted && !isSelected ? 0.35 : 1,
                transition: "border-color 0.12s, background 0.12s, color 0.12s, opacity 0.12s",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {option}
            </button>
          );
        })}
      </div>

      {/* Confirm row — only visible when something is selected and not yet sent */}
      {!submitted && selected !== null && (
        <div
          style={{
            marginTop: 11,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              padding: "8px 18px",
              borderRadius: 7,
              border: "none",
              background: gold,
              color: isParchment ? "#fff" : "#14100a",
              cursor: "pointer",
              fontSize: "0.86em",
              fontWeight: 600,
              letterSpacing: "0.04em",
              WebkitTapHighlightColor: "transparent",
              flexShrink: 0,
            }}
          >
            Send
          </button>
          <span
            style={{
              fontSize: "0.78em",
              opacity: 0.38,
              fontStyle: "italic",
            }}
          >
            or type your own response
          </span>
        </div>
      )}

      {/* Submitted receipt */}
      {submitted && selected !== null && (
        <p
          style={{
            margin: "9px 0 0",
            fontSize: "0.78em",
            opacity: 0.38,
            fontStyle: "italic",
          }}
        >
          Sent: {card.options[selected]}
        </p>
      )}
    </div>
  );
}
