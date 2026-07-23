/**
 * ThinkingReceiptsStrip — surfaces extracted thinking receipts below the
 * Ask Joy conversation. Receipts are extracted server-side after each
 * Joy response (fire-and-forget Haiku pass) and fetched here once
 * streaming has settled.
 */
import { useCallback, useEffect, useRef, useState } from "react";

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

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? "var(--atlas-gold)";
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
  /** True when Joy emitted THINKING_STABLE — triggers faster poll + crystallized header. */
  crystallized?: boolean;
}

const POLL_DELAY_MS = 4000;         // standard extraction: 2–4 s
const CRYSTALLIZED_DELAY_MS = 1500; // stable signal: extraction is near-instant

export function ThinkingReceiptsStrip({ conversationId, isStreaming, turnCount, crystallized = false }: Props) {
  const { receipts, fetchReceipts, dismiss } = useThinkingReceipts(conversationId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStreaming = useRef(isStreaming);

  // Schedule a fetch after streaming ends — faster when crystallized (THINKING_STABLE fired)
  useEffect(() => {
    const wasStreaming = prevStreaming.current;
    prevStreaming.current = isStreaming;

    if (!wasStreaming || isStreaming) return; // not a streaming→done transition
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

  if (receipts.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        paddingTop: 4,
      }}
    >
      {/* Section label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          opacity: crystallized ? 0.72 : 0.45,
        }}
      >
        {crystallized ? (
          /* Crystallization — filled diamond */
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <polygon
              points="5,1 9,5 5,9 1,5"
              fill="var(--atlas-gold)"
            />
          </svg>
        ) : (
          /* Standard — outline diamond */
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <polygon
              points="5,1 9,5 5,9 1,5"
              stroke="var(--atlas-gold)"
              strokeWidth="1.2"
              fill="none"
            />
          </svg>
        )}
        <span
          style={{
            fontSize: 9,
            fontFamily: "var(--app-font-mono)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--atlas-gold)",
            fontWeight: crystallized ? 600 : 400,
          }}
        >
          {crystallized ? "crystallized" : "captured"}
        </span>
      </div>

      {/* Receipt cards */}
      {receipts.map(receipt => (
        <ReceiptCard
          key={receipt.id}
          receipt={receipt}
          onDismiss={() => void dismiss(receipt.id)}
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------
// Individual receipt card
// ------------------------------------------------------------------
function ReceiptCard({ receipt, onDismiss }: { receipt: Receipt; onDismiss: () => void }) {
  const color = categoryColor(receipt.category);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "10px 12px",
        borderRadius: 6,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid rgba(255,255,255,0.07)`,
        borderLeft: `2px solid ${color}`,
      }}
    >
      {/* Category + dismiss row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: 9,
            fontFamily: "var(--app-font-mono)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color,
            opacity: 0.75,
          }}
        >
          {receipt.category}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: "transparent",
            border: "none",
            padding: "2px 4px",
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

      {/* Headline */}
      <div
        style={{
          fontSize: 12,
          fontFamily: "var(--app-font-sans)",
          fontWeight: 600,
          color: "var(--atlas-fg)",
          letterSpacing: "0.01em",
          lineHeight: 1.35,
        }}
      >
        {receipt.headline}
      </div>

      {/* Body */}
      <div
        style={{
          fontSize: 12,
          fontFamily: "var(--app-font-sans)",
          color: "var(--atlas-fg)",
          opacity: 0.72,
          lineHeight: 1.55,
        }}
      >
        {receipt.body}
      </div>
    </div>
  );
}
