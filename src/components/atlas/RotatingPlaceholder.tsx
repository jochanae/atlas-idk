import { useEffect, useRef, useState } from "react";
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

export function RotatingPlaceholder({ mode, paused }: { mode: ModeId; paused: boolean }) {
  const [text, setText] = useState("");
  const [lineIndex, setLineIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const timerRef = useRef<number | null>(null);

  // Reset on mode change
  useEffect(() => {
    setText("");
    setLineIndex(0);
    setPhase("typing");
  }, [mode]);

  useEffect(() => {
    if (paused) return;
    const lines = LINES[mode];
    const target = lines[lineIndex % lines.length];

    const clear = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    if (phase === "typing") {
      if (text.length < target.length) {
        timerRef.current = window.setTimeout(() => {
          setText(target.slice(0, text.length + 1));
        }, TYPE_MS);
      } else {
        timerRef.current = window.setTimeout(() => setPhase("holding"), 0);
      }
    } else if (phase === "holding") {
      timerRef.current = window.setTimeout(() => setPhase("erasing"), HOLD_MS);
    } else if (phase === "erasing") {
      if (text.length > 0) {
        timerRef.current = window.setTimeout(() => {
          setText((t) => t.slice(0, -1));
        }, ERASE_MS);
      } else {
        timerRef.current = window.setTimeout(() => setPhase("pausing"), 0);
      }
    } else if (phase === "pausing") {
      timerRef.current = window.setTimeout(() => {
        setLineIndex((i) => (i + 1) % lines.length);
        setPhase("typing");
      }, PAUSE_MS);
    }

    return clear;
  }, [text, phase, lineIndex, mode, paused]);

  return (
    <span aria-hidden style={{ pointerEvents: "none" }}>
      {text}
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
