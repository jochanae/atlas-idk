import { useMemo, useRef } from "react";

/**
 * SuggestionChipRail — three next-step chips derived from the trailing
 * "Next steps" / "Next" / bullet list of the last assistant message.
 *
 * Tap: inject into composer.
 * Long-press: dispatch park event (workspace handles via onPark).
 *
 * Frontend-only stopgap until backend emits an explicit `nextSuggestions`
 * field; when it does, replace `extractSuggestions(text)` with a direct read.
 */

const MAX_CHIPS = 3;
const MAX_LEN = 64;

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
  onTap: (text: string) => void;
  onLongPress: (text: string) => void;
}

export function SuggestionChipRail({ lastAssistantText, onTap, onLongPress }: Props) {
  const chips = useMemo(() => extractSuggestions(lastAssistantText), [lastAssistantText]);
  const timerRef = useRef<number | null>(null);
  const firedLongRef = useRef(false);

  if (chips.length === 0) return null;

  const startPress = (text: string) => {
    firedLongRef.current = false;
    timerRef.current = window.setTimeout(() => {
      firedLongRef.current = true;
      onLongPress(text);
    }, 500);
  };
  const endPress = (text: string, cancelled: boolean) => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!cancelled && !firedLongRef.current) onTap(text);
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        overflowX: "auto",
        padding: "4px 2px 10px",
        margin: "8px 0 4px",
        scrollbarWidth: "none",
      }}
      className="scrollbar-none"
      role="group"
      aria-label="Suggested next steps"
    >
      {chips.map((c) => (
        <button
          key={c}
          type="button"
          onPointerDown={() => startPress(c)}
          onPointerUp={() => endPress(c, false)}
          onPointerLeave={() => endPress(c, true)}
          onPointerCancel={() => endPress(c, true)}
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
            maxWidth: 260,
            overflow: "hidden",
            textOverflow: "ellipsis",
            touchAction: "manipulation",
          }}
          title="Tap to use · long-press to park"
        >
          {c}
        </button>
      ))}
    </div>
  );
}
