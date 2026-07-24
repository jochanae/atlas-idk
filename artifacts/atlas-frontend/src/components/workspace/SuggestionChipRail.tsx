import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";

/**
 * SuggestionChipRail — tappable next-step chips.
 *
 * Priority: explicit `nextSuggestions` from backend → regex scraper fallback.
 *
 * Tap: inject into composer.
 * Long-press: dispatch park event (workspace handles via onPark).
 */

const MAX_CHIPS = 3;
const MAX_LEN = 64;
const LONG_PRESS_MS = 500;
/** Ignore tiny finger jitter so long-press isn't cancelled mid-hold. */
const MOVE_CANCEL_PX = 12;

function cleanLine(s: string): string {
  return s
    .replace(/^[-*•●▸▶➤]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^[*_`]+|[*_`]+$/g, "")
    .replace(/^["'"]|["'"]$/g, "")
    .trim();
}

export function extractSuggestions(text: string): string[] {
  if (!text) return [];
  const lines = text.split("\n").map((l) => l.trim());

  // Look for a "Next steps" / "Next:" / "Suggestions" header.
  const headerIdx = lines.findIndex((l) =>
    /^#{0,3}\s*(next steps?|next|suggestions?|try|you could)\s*:?\s*$/i.test(l)
  );

  let candidates: string[] = [];
  if (headerIdx >= 0) {
    for (let i = headerIdx + 1; i < lines.length && candidates.length < MAX_CHIPS; i++) {
      const l = lines[i];
      if (!l) { if (candidates.length > 0) break; continue; }
      if (/^[-*•●▸▶➤]\s+/.test(l) || /^\d+[.)]\s+/.test(l)) {
        candidates.push(cleanLine(l));
      } else if (candidates.length > 0) {
        break;
      }
    }
  }

  // Fallback: trailing run of bullets at end of message.
  if (candidates.length === 0) {
    const tail: string[] = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (!l) { if (tail.length > 0) break; continue; }
      if (/^[-*•●▸▶➤]\s+/.test(l) || /^\d+[.)]\s+/.test(l)) {
        tail.unshift(cleanLine(l));
      } else if (tail.length > 0) {
        break;
      } else {
        break;
      }
    }
    if (tail.length >= 2) candidates = tail.slice(0, MAX_CHIPS);
  }

  return candidates
    .filter((c) => c.length > 0 && c.length <= MAX_LEN)
    .slice(0, MAX_CHIPS);
}

interface Props {
  lastAssistantText: string;
  /** Explicit chips from backend NEXT_SUGGESTIONS token — preferred over regex. */
  nextSuggestions?: string[];
  onTap: (text: string) => void;
  onLongPress: (text: string) => void;
}

export function SuggestionChipRail({ lastAssistantText, nextSuggestions, onTap, onLongPress }: Props) {
  // Use explicit backend chips if present; fall back to regex scraper.
  const chips = useMemo(
    () =>
      nextSuggestions && nextSuggestions.length > 0
        ? nextSuggestions.slice(0, MAX_CHIPS)
        : extractSuggestions(lastAssistantText),
    [lastAssistantText, nextSuggestions]
  );
  const timerRef = useRef<number | null>(null);
  const firedLongRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  if (chips.length === 0) return null;

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startPress = (text: string, e: ReactPointerEvent<HTMLButtonElement>) => {
    // Keep the gesture on this chip; small drifts shouldn't cancel via leave.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    firedLongRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      firedLongRef.current = true;
      onLongPress(text);
    }, LONG_PRESS_MS);
  };

  const endPress = (text: string, cancelled: boolean) => {
    clearTimer();
    startPosRef.current = null;
    if (!cancelled && !firedLongRef.current) onTap(text);
  };

  const onMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const start = startPosRef.current;
    if (!start || timerRef.current == null) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
      // Treat as scroll/drag — cancel without tapping.
      endPress("", true);
    }
  };

  return (
    <div
      style={{
        position: "relative",
        // Tight rhythm: belong to the assistant turn above, sit close to
        // Thinking Thread / composer below.
        margin: "2px 0 0",
        // Right-edge fade signals horizontal overflow so users know to scroll.
        WebkitMaskImage:
          chips.length > 1
            ? "linear-gradient(to right, #000 calc(100% - 24px), transparent)"
            : undefined,
        maskImage:
          chips.length > 1
            ? "linear-gradient(to right, #000 calc(100% - 24px), transparent)"
            : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          padding: "2px 20px 6px 2px",
          scrollbarWidth: "none",
          scrollSnapType: "x proximity",
        }}
        className="scrollbar-none"
        role="group"
        aria-label="Suggested next steps"
      >
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onPointerDown={(e) => {
              // Avoid text-selection / native callout fighting the long-press.
              if (e.pointerType !== "mouse") e.preventDefault();
              startPress(c, e);
            }}
            onPointerMove={onMove}
            onPointerUp={() => endPress(c, false)}
            onPointerCancel={() => endPress(c, true)}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              flexShrink: 0,
              padding: "7px 12px",
              background: "rgba(var(--atlas-surface-rgb,30,30,30),0.6)",
              border: "1px solid rgba(var(--atlas-border-rgb,80,80,80),0.5)",
              borderRadius: 999,
              fontSize: 12,
              color: "var(--atlas-fg)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              maxWidth: "min(260px, 72vw)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              touchAction: "manipulation",
              userSelect: "none",
              WebkitUserSelect: "none",
              scrollSnapAlign: "start",
            }}
            title="Tap to use · long-press to park"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
