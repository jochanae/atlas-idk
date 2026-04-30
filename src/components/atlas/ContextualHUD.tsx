import { useState, useMemo, useCallback, useRef } from "react";

type Suggestion = {
  id: string;
  text: string;
  source: "atlas" | "recommendation" | "context";
};

export type { Suggestion as HUDSuggestion };

type ParkResult = {
  /** Entry IDs created in the database, used for undo */
  entryIds: string[];
};

type Props = {
  messages: Array<{ role: string; content: string }>;
  recommendations?: Array<{ id: string; content: string; status: string }>;
  onTap: (text: string) => void;
  /** Returns created entry IDs so we can undo them */
  onParkMultiple: (items: Suggestion[]) => Promise<ParkResult>;
  /** Called when user undoes a park operation */
  onUndoPark?: (entryIds: string[]) => Promise<void>;
};

type BatchState =
  | { phase: "idle" }
  | { phase: "parking"; total: number; done: number }
  | { phase: "done"; count: number; entryIds: string[] }
  | { phase: "undoing" }
  | { phase: "undone" };

/**
 * Contextual HUD — tappable suggestion chips generated from recent conversation.
 * Tap = insert into message field. Long-press/right-click = multi-select.
 * Multi-select → Park sends to parking lot with progress + undo.
 */
export function ContextualHUD({ messages, recommendations, onTap, onParkMultiple, onUndoPark }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [batch, setBatch] = useState<BatchState>({ phase: "idle" });
  const undoTimerRef = useRef<number | null>(null);

  const suggestions = useMemo<Suggestion[]>(() => {
    const result: Suggestion[] = [];

    const lastAtlas = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAtlas) {
      const sentences = lastAtlas.content
        .split(/[.!?]\s+/)
        .filter((s) => s.length > 15 && s.length < 100)
        .slice(0, 3);

      const questions = lastAtlas.content
        .split(/\n/)
        .filter((s) => s.trim().endsWith("?") && s.trim().length > 10)
        .slice(0, 2);

      for (const q of questions) {
        result.push({ id: `q-${result.length}`, text: q.trim(), source: "atlas" });
      }

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

  const clearUndoTimer = useCallback(() => {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, []);

  const handlePark = useCallback(async () => {
    const items = suggestions.filter((s) => selected.has(s.id));
    if (items.length === 0) return;

    const total = items.length;
    setBatch({ phase: "parking", total, done: 0 });
    setSelected(new Set());

    // Simulate per-item progress via timed steps, actual insert is batched
    const progressInterval = setInterval(() => {
      setBatch((prev) =>
        prev.phase === "parking" && prev.done < prev.total - 1
          ? { ...prev, done: prev.done + 1 }
          : prev,
      );
    }, 200);

    try {
      const result = await onParkMultiple(items);
      clearInterval(progressInterval);

      setBatch({ phase: "done", count: total, entryIds: result.entryIds });

      // Auto-dismiss after 5s
      clearUndoTimer();
      undoTimerRef.current = window.setTimeout(() => {
        setBatch({ phase: "idle" });
      }, 5000);
    } catch {
      clearInterval(progressInterval);
      setBatch({ phase: "idle" });
    }
  }, [suggestions, selected, onParkMultiple, clearUndoTimer]);

  const handleUndo = useCallback(async () => {
    if (batch.phase !== "done" || !onUndoPark) return;
    const { entryIds } = batch;
    clearUndoTimer();
    setBatch({ phase: "undoing" });

    try {
      await onUndoPark(entryIds);
      setBatch({ phase: "undone" });
      setTimeout(() => setBatch({ phase: "idle" }), 1800);
    } catch {
      setBatch({ phase: "idle" });
    }
  }, [batch, onUndoPark, clearUndoTimer]);

  if (suggestions.length === 0 && batch.phase === "idle") return null;

  const hasSelection = selected.size > 0;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isParking = batch.phase === "parking";

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
          opacity: isParking ? 0.4 : 1,
          pointerEvents: isParking ? "none" : "auto",
          transition: "opacity 200ms ease",
        }}
      >
        {suggestions.map((s) => {
          const isSelected = selected.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => {
                if (hasSelection) toggleSelect(s.id);
                else onTap(s.text);
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
                border: `0.5px solid ${isSelected ? "var(--accent-gold)" : "var(--border)"}`,
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

      {/* Multi-select action bar */}
      {hasSelection && batch.phase === "idle" && (
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

      {/* Parking progress bar */}
      {batch.phase === "parking" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "4px 0",
            animation: "atlas-bubble-in 200ms ease forwards",
          }}
        >
          <div
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: "color-mix(in oklab, var(--accent-gold) 12%, var(--surface))",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 2,
                background: "var(--accent-gold)",
                width: `${Math.round(((batch.done + 1) / batch.total) * 100)}%`,
                transition: "width 200ms ease",
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--accent-gold)",
              letterSpacing: "0.06em",
              whiteSpace: "nowrap",
            }}
          >
            {batch.done + 1}/{batch.total}
          </span>
        </div>
      )}

      {/* Done state with undo */}
      {batch.phase === "done" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 0",
            animation: "atlas-bubble-in 200ms ease forwards",
          }}
        >
          <svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="#22c55e" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8.5l3 3 7-7" />
          </svg>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "#22c55e",
              letterSpacing: "0.04em",
            }}
          >
            Parked {batch.count} item{batch.count > 1 ? "s" : ""}
          </span>
          {onUndoPark && (
            <button
              onClick={handleUndo}
              style={{
                padding: "3px 10px",
                borderRadius: 12,
                background: "transparent",
                border: "0.5px solid color-mix(in oklab, var(--ember) 40%, var(--border))",
                color: "var(--ember)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.06em",
                cursor: "pointer",
                transition: "all 160ms ease",
              }}
            >
              Undo
            </button>
          )}
          {/* Auto-dismiss progress */}
          <div
            style={{
              flex: 1,
              height: 2,
              borderRadius: 1,
              background: "color-mix(in oklab, var(--accent-gold) 10%, transparent)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                background: "color-mix(in oklab, var(--accent-gold) 30%, transparent)",
                animation: "atlas-undo-countdown 5s linear forwards",
              }}
            />
          </div>
        </div>
      )}

      {/* Undoing spinner */}
      {batch.phase === "undoing" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 0",
            animation: "atlas-bubble-in 200ms ease forwards",
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              border: "1.5px solid var(--ember)",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 600ms linear infinite",
            }}
          />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ember)", letterSpacing: "0.04em" }}>
            Undoing…
          </span>
        </div>
      )}

      {/* Undone confirmation */}
      {batch.phase === "undone" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 0",
            animation: "atlas-bubble-in 200ms ease forwards",
          }}
        >
          <svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="var(--ember)" strokeWidth={2} strokeLinecap="round">
            <path d="M4 8h8M6 5l-3 3 3 3" />
          </svg>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ember)", letterSpacing: "0.04em" }}>
            Restored — items removed from Parking Lot
          </span>
        </div>
      )}

      <style>{`
        @keyframes atlas-undo-countdown {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );
}
