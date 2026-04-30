import { useState, useMemo } from "react";

type Suggestion = {
  id: string;
  text: string;
  source: "atlas" | "recommendation" | "context";
};

type Props = {
  messages: Array<{ role: string; content: string }>;
  recommendations?: Array<{ id: string; content: string; status: string }>;
  onTap: (text: string) => void;
  onParkMultiple: (items: Suggestion[]) => void;
};

/**
 * Contextual HUD — tappable suggestion chips generated from recent conversation.
 * Tap = insert into message field. Multi-select + park = send to parking lot.
 */
export function ContextualHUD({ messages, recommendations, onTap, onParkMultiple }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  // Generate contextual suggestions from the last Atlas response + pending recs
  const suggestions = useMemo<Suggestion[]>(() => {
    const result: Suggestion[] = [];

    // Extract key phrases from last Atlas response
    const lastAtlas = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAtlas) {
      const sentences = lastAtlas.content
        .split(/[.!?]\s+/)
        .filter((s) => s.length > 15 && s.length < 100)
        .slice(0, 3);

      // Turn questions into followup prompts
      const questions = lastAtlas.content
        .split(/\n/)
        .filter((s) => s.trim().endsWith("?") && s.trim().length > 10)
        .slice(0, 2);

      for (const q of questions) {
        result.push({
          id: `q-${result.length}`,
          text: q.trim(),
          source: "atlas",
        });
      }

      // If no questions, extract actionable phrases
      if (result.length === 0) {
        const actionPhrases = sentences
          .filter((s) => /\b(could|should|try|consider|might|recommend|suggest)\b/i.test(s))
          .map((s) => s.trim());
        for (const phrase of actionPhrases.slice(0, 2)) {
          result.push({
            id: `a-${result.length}`,
            text: phrase.length > 80 ? phrase.slice(0, 77) + "…" : phrase,
            source: "atlas",
          });
        }
      }
    }

    // Add pending recommendations as chips
    if (recommendations) {
      for (const rec of recommendations.filter((r) => r.status === "pending").slice(0, 2)) {
        if (!result.some((s) => s.text === rec.content)) {
          result.push({
            id: `rec-${rec.id}`,
            text: rec.content.length > 80 ? rec.content.slice(0, 77) + "…" : rec.content,
            source: "recommendation",
          });
        }
      }
    }

    return result.slice(0, 4);
  }, [messages, recommendations]);

  if (suggestions.length === 0) return null;

  const hasSelection = selected.size > 0;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePark = () => {
    const items = suggestions.filter((s) => selected.has(s.id));
    onParkMultiple(items);
    setSelected(new Set());
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Chips row */}
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          paddingBottom: 2,
        }}
      >
        {suggestions.map((s) => {
          const isSelected = selected.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => {
                if (hasSelection) {
                  toggleSelect(s.id);
                } else {
                  onTap(s.text);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                toggleSelect(s.id);
              }}
              style={{
                flexShrink: 0,
                maxWidth: 260,
                padding: "6px 12px",
                borderRadius: 18,
                background: isSelected
                  ? "color-mix(in oklab, var(--accent-gold) 15%, var(--surface))"
                  : "var(--surface)",
                border: `0.5px solid ${
                  isSelected
                    ? "var(--accent-gold)"
                    : "var(--border)"
                }`,
                color: isSelected ? "var(--accent-gold)" : "var(--muted-text)",
                fontSize: 12,
                lineHeight: 1.4,
                cursor: "pointer",
                transition: "all 180ms ease",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontFamily: "var(--font-sans)",
              }}
            >
              {s.source === "recommendation" && (
                <span style={{ color: "var(--phosphor)", marginRight: 4, fontSize: 10 }}>◆</span>
              )}
              {s.text}
            </button>
          );
        })}
      </div>

      {/* Multi-select actions */}
      {hasSelection && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            animation: "atlas-bubble-in 200ms ease forwards",
          }}
        >
          <button
            onClick={handlePark}
            style={{
              padding: "4px 12px",
              borderRadius: 14,
              background: "color-mix(in oklab, var(--accent-gold) 12%, var(--surface))",
              border: "0.5px solid color-mix(in oklab, var(--accent-gold) 30%, transparent)",
              color: "var(--accent-gold)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.06em",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <svg viewBox="0 0 16 16" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="6" />
              <path d="M6 5h2.5a2 2 0 010 4H6V5zM6 9v3" />
            </svg>
            Park {selected.size}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted-text)",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              cursor: "pointer",
              opacity: 0.6,
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
