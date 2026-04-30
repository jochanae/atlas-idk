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

const TYPE_MS = 60;
const ERASE_MS = 28;
const HOLD_MS = 1800;
const PAUSE_MS = 380;

export function RotatingPlaceholder({ mode, paused }: { mode: ModeId; paused: boolean }) {
  const [text, setText] = useState("");

  // Refs hold the loop state so the effect never re-subscribes mid-animation.
  const modeRef = useRef(mode);
  const pausedRef = useRef(paused);
  const lineIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const phaseRef = useRef<"typing" | "holding" | "erasing" | "pausing">("typing");

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // When mode changes, reset cleanly to the first line of the new mode.
  useEffect(() => {
    modeRef.current = mode;
    lineIndexRef.current = 0;
    charIndexRef.current = 0;
    phaseRef.current = "typing";
    setText("");
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      if (cancelled) return;

      if (pausedRef.current) {
        timer = setTimeout(tick, 200);
        return;
      }

      const lines = LINES[modeRef.current];
      const line = lines[lineIndexRef.current % lines.length];
      const phase = phaseRef.current;

      let nextDelay = TYPE_MS;

      if (phase === "typing") {
        if (charIndexRef.current < line.length) {
          charIndexRef.current += 1;
          setText(line.slice(0, charIndexRef.current));
          nextDelay = TYPE_MS;
        } else {
          phaseRef.current = "holding";
          nextDelay = HOLD_MS;
        }
      } else if (phase === "holding") {
        phaseRef.current = "erasing";
        nextDelay = ERASE_MS;
      } else if (phase === "erasing") {
        if (charIndexRef.current > 0) {
          charIndexRef.current -= 1;
          setText(line.slice(0, charIndexRef.current));
          nextDelay = ERASE_MS;
        } else {
          lineIndexRef.current = (lineIndexRef.current + 1) % lines.length;
          phaseRef.current = "pausing";
          nextDelay = PAUSE_MS;
        }
      } else {
        // pausing → start typing the next line
        phaseRef.current = "typing";
        nextDelay = TYPE_MS;
      }

      timer = setTimeout(tick, nextDelay);
    };

    timer = setTimeout(tick, TYPE_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []); // mount-once loop; reads live values via refs

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
