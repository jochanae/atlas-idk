import { useEffect, useRef, useState } from "react";

/**
 * StreamingText — renders text with a typewriter animation that reveals
 * words progressively. Includes variable speed to feel more natural.
 *
 * Once fully revealed, the text stays static and never re-animates.
 */

interface StreamingTextProps {
  text: string;
  /** Average ms per word (default: 35) */
  speed?: number;
  /** Whether to animate. If false, renders full text immediately. */
  animate?: boolean;
  /** Called when the animation completes */
  onComplete?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function StreamingText({
  text,
  speed = 35,
  animate = true,
  onComplete,
  className,
  style,
}: StreamingTextProps) {
  const [visibleCount, setVisibleCount] = useState(animate ? 0 : Infinity);
  const words = useRef<string[]>([]);
  const completeCalled = useRef(false);

  // Split into words, preserving whitespace/newlines
  useEffect(() => {
    words.current = text.match(/\S+|\n/g) ?? [];
    if (!animate) {
      setVisibleCount(Infinity);
      return;
    }
    setVisibleCount(0);
    completeCalled.current = false;
  }, [text, animate]);

  useEffect(() => {
    if (!animate) return;
    const total = words.current.length;
    if (visibleCount >= total) {
      if (!completeCalled.current) {
        completeCalled.current = true;
        onComplete?.();
      }
      return;
    }

    // Variable speed: slightly randomize to feel organic
    const jitter = speed * (0.6 + Math.random() * 0.8);
    // Slow down at sentence boundaries
    const lastWord = words.current[visibleCount - 1] ?? "";
    const pause = /[.!?]$/.test(lastWord) ? speed * 4 : jitter;

    const timer = setTimeout(() => {
      // Reveal 1-3 words per tick for natural bursts
      const burst = Math.random() > 0.7 ? 2 : 1;
      setVisibleCount((c) => Math.min(c + burst, total));
    }, pause);

    return () => clearTimeout(timer);
  }, [visibleCount, animate, speed, onComplete]);

  if (!animate || visibleCount >= (words.current.length || Infinity)) {
    return (
      <div className={className} style={style}>
        {text}
      </div>
    );
  }

  const visible = words.current.slice(0, visibleCount).join(" ");

  return (
    <div className={className} style={style}>
      {visible}
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 14,
          marginLeft: 2,
          background: "var(--accent-gold)",
          borderRadius: 1,
          opacity: 0.7,
          animation: "atlas-cursor-blink 800ms steps(2) infinite",
          verticalAlign: "text-bottom",
        }}
      />
    </div>
  );
}

/**
 * ChunkedBubbles — splits a long text into multiple "bubbles" with
 * staggered reveal delays, mimicking how people send messages in bursts.
 *
 * Chunks at double-newlines (paragraph breaks). Falls back to single
 * bubble for short text.
 */

interface ChunkedBubblesProps {
  text: string;
  /** Whether this is a new message that should animate in */
  isNew?: boolean;
  renderBubble: (chunk: string, index: number, isNew: boolean) => React.ReactNode;
}

export function ChunkedBubbles({
  text,
  isNew = false,
  renderBubble,
}: ChunkedBubblesProps) {
  const chunks = splitIntoChunks(text);
  const [revealed, setRevealed] = useState(isNew ? 0 : chunks.length);

  useEffect(() => {
    if (!isNew || revealed >= chunks.length) return;
    const timer = setTimeout(
      () => setRevealed((r) => r + 1),
      revealed === 0 ? 100 : 600 + Math.random() * 400,
    );
    return () => clearTimeout(timer);
  }, [revealed, chunks.length, isNew]);

  return (
    <>
      {chunks.slice(0, isNew ? revealed + 1 : chunks.length).map((chunk, i) =>
        renderBubble(
          chunk,
          i,
          isNew && i === (isNew ? revealed : chunks.length - 1),
        ),
      )}
    </>
  );
}

function splitIntoChunks(text: string): string[] {
  // Split on double newlines (paragraph boundaries)
  const raw = text.split(/\n{2,}/);
  const chunks: string[] = [];

  for (const segment of raw) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    // If a segment is very long (>300 chars), split further at sentence boundaries
    if (trimmed.length > 300) {
      const sentences = trimmed.match(/[^.!?]+[.!?]+\s*/g);
      if (sentences && sentences.length > 1) {
        let current = "";
        for (const s of sentences) {
          if ((current + s).length > 250 && current) {
            chunks.push(current.trim());
            current = s;
          } else {
            current += s;
          }
        }
        if (current.trim()) chunks.push(current.trim());
        continue;
      }
    }
    chunks.push(trimmed);
  }

  return chunks.length > 0 ? chunks : [text];
}
