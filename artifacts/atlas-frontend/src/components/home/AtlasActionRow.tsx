// Presentational Atlas quick-action row.
// Renders a horizontal row of pill buttons. Actions fire immediately on tap —
// no confirm step. The entire row disables after the first action fires.

import { useState } from "react";
import type { AtlasActionBlock, AtlasActionItem } from "./AtlasActionParser";

interface RowProps {
  block: AtlasActionBlock;
  onAction: (id: string, payload?: Record<string, string | number>) => void;
  isParchment?: boolean;
}

export function AtlasActionRow({ block, onAction, isParchment }: RowProps) {
  const [firedId, setFiredId] = useState<string | null>(null);

  const gold = isParchment ? "rgba(146,64,14,0.9)" : "rgba(212,175,55,0.95)";
  const goldBorder = isParchment ? "rgba(146,64,14,0.25)" : "rgba(212,175,55,0.3)";
  const goldBg = isParchment ? "rgba(146,64,14,0.07)" : "rgba(212,175,55,0.08)";

  function handleClick(action: AtlasActionItem) {
    if (firedId !== null) return;
    setFiredId(action.id);
    onAction(action.id, action.payload);
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        margin: "0.6em 0 0.2em",
      }}
    >
      {block.actions.map((action) => {
        const isFired = firedId === action.id;
        const isDisabled = firedId !== null;

        return (
          <button
            key={action.id}
            type="button"
            disabled={isDisabled}
            onClick={() => handleClick(action)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 999,
              border: isFired ? `1.5px solid ${gold}` : `1px solid ${goldBorder}`,
              background: isFired ? goldBg : "transparent",
              color: isFired ? gold : "inherit",
              cursor: isDisabled ? "default" : "pointer",
              fontSize: "0.84em",
              fontWeight: isFired ? 600 : 400,
              letterSpacing: "0.02em",
              opacity: isDisabled && !isFired ? 0.3 : 1,
              transition: "opacity 0.15s, border-color 0.12s, background 0.12s, color 0.12s",
              WebkitTapHighlightColor: "transparent",
              whiteSpace: "nowrap",
            }}
          >
            {!isFired && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: gold,
                  flexShrink: 0,
                  opacity: 0.7,
                }}
              />
            )}
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
