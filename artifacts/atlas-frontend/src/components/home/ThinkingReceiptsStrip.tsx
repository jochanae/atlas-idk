/**
 * ThinkingReceiptsStrip — surfaces extracted observations inline in the
 * Ask Atlas conversation as "Thinking Clusters."
 *
 * Design rules (locked with user 2026-07-08):
 *  - Observations from ONE assistant turn group into ONE cluster container,
 *    never a vertical stack of independent cards and never a swipeable row.
 *  - A single observation renders as one soft card.
 *  - Multiple observations render as one container: first item always visible,
 *    "+N more observations" reveals the rest inline.
 *  - Tone is observational, not a system alert. Category labels read like
 *    "Question worth exploring" / "Atlas noticed" — never SHOUTED enums.
 *  - Items are individually dismissible; when the last one goes, the cluster
 *    briefly collapses to "✓ Reflected in your understanding" then unmounts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Receipt = {
  id: number;
  conversation_id: string;
  turn_index: number;
  headline: string;
  body: string;
  category: string;
  confidence: number;
  created_at: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  Tension:    "#e8856a",
  Assumption: "#7ab8d4",
  Desire:     "#b48cdc",
  Commitment: "#6abf8a",
  Question:   "#d4b86a",
  Insight:    "var(--atlas-gold)",
  Blocker:    "#e87878",
  Decision:   "#6ab4e8",
};

/** Observational label — never a shouted enum. */
const CATEGORY_LABEL: Record<string, string> = {
  Tension:    "Tension worth sitting with",
  Assumption: "Assumption to check",
  Desire:     "Something you want",
  Commitment: "Commitment forming",
  Question:   "Question worth exploring",
  Insight:    "Atlas noticed",
  Blocker:    "Blocker in the way",
  Decision:   "Decision forming",
};

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? "var(--atlas-gold)";
}

function categoryLabel(cat: string): string {
  return CATEGORY_LABEL[cat] ?? "Atlas noticed";
}

// ------------------------------------------------------------------
// Hook — manages receipt state for one conversation
// ------------------------------------------------------------------
function useThinkingReceipts(conversationId: string | null | undefined) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const seenIds = useRef<Set<number>>(new Set());

  const fetchReceipts = useCallback(async () => {
    if (!conversationId) return;
    try {
      const r = await fetch(
        `/api/thinking-receipts?conversationId=${encodeURIComponent(conversationId)}&limit=20`,
        { credentials: "include" },
      );
      if (!r.ok) return;
      const data = (await r.json()) as Receipt[];
      const incoming = data.filter(r => !seenIds.current.has(r.id));
      if (incoming.length === 0) return;
      for (const r of incoming) seenIds.current.add(r.id);
      setReceipts(prev =>
        [...incoming, ...prev]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 30),
      );
    } catch {
      // silent — non-critical
    }
  }, [conversationId]);

  const dismiss = useCallback(async (id: number) => {
    setDismissed(prev => new Set([...prev, id]));
    try {
      await fetch(`/api/thinking-receipts/${id}/dismiss`, {
        method: "PATCH",
        credentials: "include",
      });
    } catch {}
  }, []);

  // Reset when conversation changes
  useEffect(() => {
    setReceipts([]);
    setDismissed(new Set());
    seenIds.current = new Set();
  }, [conversationId]);

  const visible = receipts.filter(r => !dismissed.has(r.id));
  return { receipts: visible, fetchReceipts, dismiss };
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------
interface Props {
  conversationId?: string | null;
  /** Flip to false when streaming ends; the strip polls shortly after. */
  isStreaming: boolean;
  /** Number of completed assistant turns — used to gate fetching. */
  turnCount: number;
  /** True when Atlas emitted THINKING_STABLE — triggers faster poll. */
  crystallized?: boolean;
}

const POLL_DELAY_MS = 4000;         // standard extraction: 2–4 s
const CRYSTALLIZED_DELAY_MS = 1500; // stable signal: extraction is near-instant

export function ThinkingReceiptsStrip({ conversationId, isStreaming, turnCount, crystallized = false }: Props) {
  const { receipts, fetchReceipts, dismiss } = useThinkingReceipts(conversationId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStreaming = useRef(isStreaming);

  // Schedule a fetch after streaming ends
  useEffect(() => {
    const wasStreaming = prevStreaming.current;
    prevStreaming.current = isStreaming;

    if (!wasStreaming || isStreaming) return;
    if (!conversationId || turnCount < 1) return;

    const delay = crystallized ? CRYSTALLIZED_DELAY_MS : POLL_DELAY_MS;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void fetchReceipts();
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isStreaming, conversationId, turnCount, crystallized, fetchReceipts]);

  // Group receipts by turn_index → one cluster per assistant turn
  const clusters = useMemo(() => {
    const byTurn = new Map<number, Receipt[]>();
    for (const r of receipts) {
      const arr = byTurn.get(r.turn_index) ?? [];
      arr.push(r);
      byTurn.set(r.turn_index, arr);
    }
    return Array.from(byTurn.entries())
      .sort((a, b) => b[0] - a[0]) // newest turn first
      .map(([turn, items]) => ({ turn, items }));
  }, [receipts]);

  if (clusters.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4 }}>
      {clusters.map(c => (
        <ThinkingCluster
          key={c.turn}
          items={c.items}
          onDismiss={dismiss}
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------
// Thinking Cluster — one container, one or many observations
// ------------------------------------------------------------------
function ThinkingCluster({
  items,
  onDismiss,
}: {
  items: Receipt[];
  onDismiss: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = items.length;

  if (total === 0) return null;

  // Single observation → soft card, no cluster chrome
  if (total === 1) {
    return <ObservationCard receipt={items[0]} onDismiss={() => onDismiss(items[0].id)} />;
  }

  const first = items[0];
  const rest = items.slice(1);
  const remaining = rest.length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: 8,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        overflow: "hidden",
      }}
    >
      {/* Header — observational, not alert-y */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px 4px",
        }}
      >
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
          <polygon points="5,1 9,5 5,9 1,5" stroke="var(--atlas-gold)" strokeWidth="1.2" fill="none" />
        </svg>
        <span
          style={{
            fontSize: 10.5,
            fontFamily: "var(--app-font-sans)",
            color: "var(--atlas-fg)",
            opacity: 0.72,
            letterSpacing: "0.01em",
          }}
        >
          Atlas noticed <span style={{ opacity: 0.6 }}>{total} things</span>
        </span>
      </div>

      {/* First observation always visible */}
      <ObservationRow receipt={first} onDismiss={() => onDismiss(first.id)} />

      {/* Rest — collapsed by default */}
      {expanded &&
        rest.map(r => (
          <ObservationRow key={r.id} receipt={r} onDismiss={() => onDismiss(r.id)} />
        ))}

      {!expanded && remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            background: "transparent",
            border: "none",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            padding: "8px 12px",
            textAlign: "left",
            cursor: "pointer",
            color: "var(--atlas-muted)",
            fontFamily: "var(--app-font-sans)",
            fontSize: 11,
            letterSpacing: "0.01em",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          +{remaining} more observation{remaining === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Standalone observation card (single-item cluster)
// ------------------------------------------------------------------
function ObservationCard({ receipt, onDismiss }: { receipt: Receipt; onDismiss: () => void }) {
  const color = categoryColor(receipt.category);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 12px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderLeft: `2px solid ${color}`,
      }}
    >
      <ObservationHeader category={receipt.category} color={color} onDismiss={onDismiss} />
      <ObservationBody headline={receipt.headline} body={receipt.body} />
    </div>
  );
}

// Row variant — used inside a multi-item cluster (no outer border, uses separators)
function ObservationRow({ receipt, onDismiss }: { receipt: Receipt; onDismiss: () => void }) {
  const color = categoryColor(receipt.category);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        padding: "10px 12px",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        borderLeft: `2px solid ${color}`,
      }}
    >
      <ObservationHeader category={receipt.category} color={color} onDismiss={onDismiss} />
      <ObservationBody headline={receipt.headline} body={receipt.body} />
    </div>
  );
}

function ObservationHeader({
  category,
  color,
  onDismiss,
}: {
  category: string;
  color: string;
  onDismiss: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span
        style={{
          fontSize: 10.5,
          fontFamily: "var(--app-font-sans)",
          fontStyle: "italic",
          color,
          opacity: 0.85,
          letterSpacing: "0.01em",
        }}
      >
        {categoryLabel(category)}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          background: "transparent",
          border: "none",
          padding: "2px 6px",
          cursor: "pointer",
          color: "var(--atlas-muted)",
          opacity: 0.4,
          fontSize: 13,
          lineHeight: 1,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        ×
      </button>
    </div>
  );
}

function ObservationBody({ headline, body }: { headline: string; body: string }) {
  return (
    <>
      <div
        style={{
          fontSize: 12.5,
          fontFamily: "var(--app-font-sans)",
          fontWeight: 600,
          color: "var(--atlas-fg)",
          letterSpacing: "0.01em",
          lineHeight: 1.4,
        }}
      >
        {headline}
      </div>
      <div
        style={{
          fontSize: 12,
          fontFamily: "var(--app-font-sans)",
          color: "var(--atlas-fg)",
          opacity: 0.72,
          lineHeight: 1.55,
        }}
      >
        {body}
      </div>
    </>
  );
}
