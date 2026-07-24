import { useState } from "react";
import type { StructuredDecisionGate } from "@/lib/plan";

interface DecisionGateCardProps {
  gate: StructuredDecisionGate;
  resolved?: boolean;
  selectedValue?: string;
  onSelect?: (value: string, label: string) => void;
}

export function DecisionGateCard({ gate, resolved, selectedValue, onSelect }: DecisionGateCardProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const selectedLabel = gate.options.find((o) => o.value === selectedValue)?.label;

  if (resolved && selectedValue) {
    return (
      <div
        style={{
          marginTop: 10,
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid var(--atlas-border, rgba(255,255,255,0.08))",
          background: "rgba(255,255,255,0.03)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "var(--atlas-gold, #C9A84C)",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "var(--app-font-mono)",
            fontSize: 11,
            letterSpacing: "0.04em",
            color: "var(--atlas-muted, rgba(255,255,255,0.45))",
          }}
        >
          You chose:&nbsp;
          <span style={{ color: "var(--atlas-fg, rgba(255,255,255,0.85))", fontWeight: 500 }}>
            {selectedLabel}
          </span>
          &nbsp;·&nbsp;{gate.reason}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 12,
        padding: "14px 16px",
        borderRadius: 10,
        border: "1px solid rgba(201,168,76,0.25)",
        background: "rgba(201,168,76,0.04)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span
          style={{
            marginTop: 2,
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "var(--atlas-gold, #C9A84C)",
            flexShrink: 0,
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--atlas-gold, #C9A84C)",
              opacity: 0.85,
            }}
          >
            One choice to unlock the next move
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--atlas-fg, rgba(255,255,255,0.9))",
              lineHeight: 1.35,
            }}
          >
            {gate.question}
          </span>
          <span
            style={{
              fontSize: 12,
              color: "var(--atlas-muted, rgba(255,255,255,0.45))",
              lineHeight: 1.45,
            }}
          >
            {gate.reason}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 17 }}>
        {gate.options.map((option) => {
          const isHovered = hovered === option.value;
          return (
            <button
              key={option.value}
              onClick={() => onSelect?.(option.value, option.label)}
              onMouseEnter={() => setHovered(option.value)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 7,
                border: isHovered
                  ? "1px solid rgba(201,168,76,0.45)"
                  : "1px solid rgba(255,255,255,0.08)",
                background: isHovered ? "rgba(201,168,76,0.08)" : "rgba(255,255,255,0.03)",
                cursor: "pointer",
                textAlign: "left",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: isHovered
                    ? "1.5px solid rgba(201,168,76,0.7)"
                    : "1.5px solid rgba(255,255,255,0.25)",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "border-color 0.15s",
                }}
              >
                {isHovered && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--atlas-gold, #C9A84C)",
                    }}
                  />
                )}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: isHovered
                    ? "var(--atlas-fg, rgba(255,255,255,0.9))"
                    : "var(--atlas-fg-soft, rgba(255,255,255,0.7))",
                  lineHeight: 1.35,
                  transition: "color 0.15s",
                }}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>

      <span
        style={{
          paddingLeft: 17,
          fontFamily: "var(--app-font-mono)",
          fontSize: 10,
          letterSpacing: "0.06em",
          color: "var(--atlas-muted, rgba(255,255,255,0.3))",
        }}
      >
        Pick one to continue
      </span>
    </div>
  );
}
