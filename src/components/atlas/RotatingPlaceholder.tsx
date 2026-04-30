import { useEffect, useState } from "react";
import type { ModeId } from "./AtlasFrontDoor";

const LINES: Record<ModeId, string[]> = {
  think: [
    "what are you turning over",
    "name the thing you keep circling",
    "what doesn't have a shape yet",
    "what's the question under the question",
    "what would you say if no one was listening",
  ],
  build: [
    "what are you putting together",
    "what's the next move",
    "what's blocking the build",
    "what piece is missing",
    "what would ship today if nothing else mattered",
  ],
  explore: [
    "what are you curious about",
    "what's the unknown here",
    "what would you try if it was free",
    "what's the version no one's tried",
    "what would a stranger ask",
  ],
  decide: [
    "what are you choosing between",
    "what did you decide and why",
    "what's reversible, what isn't",
    "what's the cost of being wrong",
    "what does past-you need from present-you",
  ],
  audit: [
    "what broke",
    "what cost more than it should have",
    "what would past-you warn present-you about",
    "what's the lesson worth keeping",
    "what's still bleeding",
  ],
};

const TYPE_MS = 55;
const ERASE_MS = 24;
const HOLD_MS = 3000;
const PAUSE_MS = 320;

type Phase = "typing" | "holding" | "erasing" | "pausing";

type PlaceholderState = {
  text: string;
  lineIndex: number;
  phase: Phase;
};

const INITIAL_STATE: PlaceholderState = {
  text: "",
  lineIndex: 0,
  phase: "typing",
};

export function RotatingPlaceholder({ mode, paused }: { mode: ModeId; paused: boolean }) {
  const [state, setState] = useState<PlaceholderState>(INITIAL_STATE);

  useEffect(() => {
    setState(INITIAL_STATE);
  }, [mode]);

  useEffect(() => {
    if (paused) return;

    const lines = LINES[mode];
    const delay =
      state.phase === "holding"
        ? HOLD_MS
        : state.phase === "erasing"
          ? ERASE_MS
          : state.phase === "pausing"
            ? PAUSE_MS
            : TYPE_MS;

    const timeout = window.setTimeout(() => {
      setState((current) => {
        const target = lines[current.lineIndex % lines.length];

        if (current.phase === "typing") {
          if (current.text.length < target.length) {
            return {
              ...current,
              text: target.slice(0, current.text.length + 1),
            };
          }

          return {
            ...current,
            phase: "holding",
          };
        }

        if (current.phase === "holding") {
          return {
            ...current,
            phase: "erasing",
          };
        }

        if (current.phase === "erasing") {
          if (current.text.length > 0) {
            return {
              ...current,
              text: current.text.slice(0, -1),
            };
          }

          return {
            text: "",
            lineIndex: (current.lineIndex + 1) % lines.length,
            phase: "pausing",
          };
        }

        return {
          ...current,
          phase: "typing",
        };
      });
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [mode, paused, state]);

  return (
    <span aria-hidden style={{ pointerEvents: "none" }}>
      {state.text}
      <span
        style={{
          display: "inline-block",
          width: 1,
          height: "1em",
          marginLeft: 2,
          verticalAlign: "-2px",
          background: "var(--ember)",
          opacity: 0.7,
          animation: "atlas-cursor-blink 1s steps(2, start) infinite",
        }}
      />
      <style>{`
        @keyframes atlas-cursor-blink { to { visibility: hidden; } }
      `}</style>
    </span>
  );
}
