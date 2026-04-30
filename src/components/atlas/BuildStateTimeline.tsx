import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import type { BuildState } from "./MobileSurfaceBar";

export type BuildStateEntry = {
  id: string;
  state: BuildState;
  label: string;
  timestamp: number;
  duration_ms?: number;
};

type Props = {
  entries: BuildStateEntry[];
};

const STATE_COLORS: Record<BuildState, string> = {
  idle: "var(--muted-text)",
  thinking: "var(--accent-gold)",
  building: "var(--ember)",
  verifying: "var(--phosphor)",
};

const STATE_ICONS: Record<BuildState, string> = {
  idle: "○",
  thinking: "◉",
  building: "⬢",
  verifying: "◈",
};

export function BuildStateTimeline({ entries }: Props) {
  if (entries.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        padding: "8px 0",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted-text)",
          padding: "0 12px 6px",
          opacity: 0.6,
        }}
      >
        Build Timeline
      </div>
      <div style={{ position: "relative", paddingLeft: 20 }}>
        {/* Vertical connector line */}
        <div
          style={{
            position: "absolute",
            left: 8,
            top: 4,
            bottom: 4,
            width: 1,
            background: "color-mix(in oklab, var(--accent-gold) 15%, transparent)",
          }}
        />
        {entries.map((entry, i) => {
          const color = STATE_COLORS[entry.state];
          const isLatest = i === entries.length - 1;
          const time = new Date(entry.timestamp);
          const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

          return (
            <div
              key={entry.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "4px 12px 4px 0",
                position: "relative",
                opacity: isLatest ? 1 : 0.6,
              }}
            >
              {/* Node dot */}
              <span
                style={{
                  position: "absolute",
                  left: -16,
                  top: 6,
                  width: 10,
                  height: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  color,
                  lineHeight: 1,
                  ...(isLatest && entry.state !== "idle"
                    ? { animation: "atlas-state-pulse 1.8s ease-in-out infinite" }
                    : {}),
                }}
              >
                {STATE_ICONS[entry.state]}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color,
                    fontWeight: isLatest ? 600 : 400,
                    textTransform: "capitalize",
                  }}
                >
                  {entry.label || entry.state}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--muted-text)",
                    opacity: 0.5,
                    display: "flex",
                    gap: 8,
                  }}
                >
                  <span>{timeStr}</span>
                  {entry.duration_ms != null && entry.duration_ms > 0 && (
                    <span>{(entry.duration_ms / 1000).toFixed(1)}s</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
