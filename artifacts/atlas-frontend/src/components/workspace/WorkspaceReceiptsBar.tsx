/**
 * WorkspaceReceiptsBar — surfaces thinking receipts from the Ask Atlas
 * conversation that spawned this project. Anchored at the bottom-left of the
 * conversation column (above the composer / mobile footer), collapsed by
 * default after first view.
 *
 * Phase 6: each card has a "→ Ledger" action that promotes the receipt to
 * a committed Decision entry via POST /api/projects/:id/entries.
 *
 * Self-contained: fetches GET /api/projects/:id/thinking-receipts internally.
 * No prop threading through workspace.tsx required.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Receipt = {
  id: number;
  conversation_id: string;
  headline: string;
  body: string;
  category: string;
  confidence: number;
  is_stable: boolean;
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

function storageKey(projectId: number) {
  return `atlas-workspace-receipts-collapsed-${projectId}`;
}

// ------------------------------------------------------------------
// Single receipt card
// ------------------------------------------------------------------
type PromoteState = "idle" | "loading" | "done" | "error";

function ReceiptCard({
  receipt,
  projectId,
  onDismiss,
}: {
  receipt: Receipt;
  projectId: number;
  onDismiss: (id: number) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [promoteState, setPromoteState] = useState<PromoteState>("idle");

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    onDismiss(receipt.id);
  }, [receipt.id, onDismiss]);

  const handlePromote = useCallback(async () => {
    if (promoteState !== "idle") return;
    setPromoteState("loading");
    try {
      const r = await fetch(`/api/projects/${projectId}/entries`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: receipt.headline,
          summary: receipt.body,
          type: "Decision",
          status: "committed",
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setPromoteState("done");
      // Auto-dismiss after brief confirmation
      setTimeout(() => {
        setDismissed(true);
        onDismiss(receipt.id);
      }, 1200);
    } catch {
      setPromoteState("error");
      // Reset to idle after a moment
      setTimeout(() => setPromoteState("idle"), 2000);
    }
  }, [promoteState, projectId, receipt.headline, receipt.body, receipt.id, onDismiss]);

  if (dismissed) return null;

  const isPromoting = promoteState === "loading";
  const isDone = promoteState === "done";
  const isError = promoteState === "error";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "7px 9px 8px",
        borderRadius: 6,
        background: isDone
          ? "rgba(106, 191, 138, 0.07)"
          : "rgba(255,255,255,0.03)",
        border: isDone
          ? "1px solid rgba(106, 191, 138, 0.25)"
          : "1px solid rgba(255,255,255,0.07)",
        position: "relative",
        flexShrink: 0,
        minWidth: 190,
        maxWidth: 270,
        transition: "background 0.2s ease, border-color 0.2s ease",
      }}
    >
      {/* category chip */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, paddingRight: 18 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: categoryColor(receipt.category),
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 9,
            fontFamily: "var(--app-font-mono)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: categoryColor(receipt.category),
            opacity: 0.8,
          }}
        >
          {receipt.category}
        </span>
        {receipt.is_stable && (
          <svg width="7" height="7" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.6 }}>
            <polygon points="5,1 9,5 5,9 1,5" fill="var(--atlas-gold)" />
          </svg>
        )}
      </div>

      {/* headline */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--atlas-text-primary)",
          lineHeight: 1.3,
          paddingRight: 18,
        }}
      >
        {receipt.headline}
      </div>

      {/* body */}
      <div
        style={{
          fontSize: 10,
          color: "var(--atlas-text-secondary)",
          lineHeight: 1.45,
          opacity: 0.75,
        }}
      >
        {receipt.body}
      </div>

      {/* Promote action */}
      <button
        onClick={handlePromote}
        disabled={isPromoting || isDone}
        title={isDone ? "Added to Ledger" : "Promote to Ledger Decision"}
        style={{
          marginTop: 3,
          alignSelf: "flex-start",
          background: "none",
          border: `1px solid ${isDone ? "rgba(106,191,138,0.4)" : isError ? "rgba(232,120,120,0.4)" : "rgba(255,255,255,0.12)"}`,
          borderRadius: 4,
          cursor: isDone || isPromoting ? "default" : "pointer",
          padding: "2px 7px",
          display: "flex",
          alignItems: "center",
          gap: 4,
          transition: "border-color 0.15s, opacity 0.15s",
          opacity: isPromoting ? 0.6 : 1,
        }}
        onMouseEnter={e => {
          if (!isDone && !isPromoting) {
            (e.currentTarget.style.borderColor = "rgba(106,180,232,0.5)");
          }
        }}
        onMouseLeave={e => {
          if (!isDone && !isPromoting && !isError) {
            (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)");
          }
        }}
      >
        {isDone ? (
          <>
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
              <path d="M2 5.5L4.2 7.5L8 3" stroke="#6abf8a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "#6abf8a" }}>
              in ledger
            </span>
          </>
        ) : isError ? (
          <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "#e87878" }}>
            failed — retry
          </span>
        ) : isPromoting ? (
          <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "var(--atlas-muted)" }}>
            adding…
          </span>
        ) : (
          <>
            <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "rgba(255,255,255,0.45)" }}>
              → ledger
            </span>
          </>
        )}
      </button>

      {/* dismiss ✕ */}
      <button
        onClick={handleDismiss}
        title="Dismiss"
        style={{
          position: "absolute",
          top: 5,
          right: 5,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 2,
          color: "var(--atlas-muted)",
          opacity: 0.35,
          lineHeight: 1,
          fontSize: 10,
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "0.35")}
      >
        ✕
      </button>
    </div>
  );
}

// ------------------------------------------------------------------
// Main component
// ------------------------------------------------------------------
interface Props {
  projectId: number;
}

export function WorkspaceReceiptsBar({ projectId }: Props) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = sessionStorage.getItem(storageKey(projectId));
      return stored === null ? true : stored === "1";
    } catch { return true; }
  });
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  const knownIdsRef = useRef<Set<number>>(new Set());

  const fetchReceipts = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/thinking-receipts`, {
        credentials: "include",
      });
      if (!r.ok) return;
      const data = (await r.json()) as Receipt[];
      if (data.length === 0) return;
      // Merge: add any receipts we haven't seen yet
      const incoming = data.filter(d => !knownIdsRef.current.has(d.id));
      if (incoming.length === 0) return;
      incoming.forEach(d => knownIdsRef.current.add(d.id));
      setReceipts(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const brand = incoming.filter(d => !existingIds.has(d.id));
        return brand.length > 0 ? [...prev, ...brand] : prev;
      });
    } catch {
      // non-critical
    }
  }, [projectId]);

  // Fetch on mount, then poll every 25 s to surface receipts from new workspace turns.
  useEffect(() => {
    void fetchReceipts();
    const id = setInterval(() => void fetchReceipts(), 25_000);
    return () => clearInterval(id);
  }, [fetchReceipts]);

  const dismiss = useCallback(async (id: number) => {
    setDismissedIds(prev => new Set([...prev, id]));
    try {
      await fetch(`/api/thinking-receipts/${id}/dismiss`, {
        method: "PATCH",
        credentials: "include",
      });
    } catch {}
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try { sessionStorage.setItem(storageKey(projectId), next ? "1" : "0"); } catch {}
      return next;
    });
  }, [projectId]);

  // Only show if there are visible receipts
  const visible = receipts.filter(r => !dismissedIds.has(r.id));
  if (visible.length === 0) return null;

  const hasStable = visible.some(r => r.is_stable);

  return (
    <div
      style={{
        padding: "6px 16px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        flexShrink: 0,
        alignItems: "stretch",
      }}
    >
      {/* Divider — separates stream/content above from the bottom-anchored thread */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginBottom: 2 }} />

      {/* Header row — bottom-left, above composer / mobile footer */}
      <button
        onClick={toggleCollapsed}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          display: "flex",
          alignItems: "center",
          gap: 7,
          color: "inherit",
          alignSelf: "flex-start",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: hasStable ? 0.9 : 0.55 }}>
          {hasStable ? (
            <polygon points="5,1 9,5 5,9 1,5" fill="var(--atlas-gold)" />
          ) : (
            <polygon points="5,1 9,5 5,9 1,5" stroke="var(--atlas-gold)" strokeWidth="1.2" fill="none" />
          )}
        </svg>
        <span
          style={{
            fontSize: 9,
            fontFamily: "var(--app-font-mono)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--atlas-gold)",
            fontWeight: hasStable ? 600 : 400,
            opacity: hasStable ? 0.85 : 0.5,
          }}
        >
          thinking thread · {visible.length}
        </span>
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          style={{
            opacity: 0.35,
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}
        >
          <path d="M1.5 3L4 5.5L6.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Receipt cards — horizontal scroll row, expands upward from the footer rail */}
      {!collapsed && (
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 2,
          }}
          className="scrollbar-none"
        >
          {visible.map(receipt => (
            <ReceiptCard
              key={receipt.id}
              receipt={receipt}
              projectId={projectId}
              onDismiss={dismiss}
            />
          ))}
        </div>
      )}
    </div>
  );
}
