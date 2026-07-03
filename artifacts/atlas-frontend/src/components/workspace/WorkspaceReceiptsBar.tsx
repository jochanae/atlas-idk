/**
 * WorkspaceReceiptsBar — surfaces thinking receipts from the Ask Atlas
 * conversation that spawned this project. Shown at the top of the workspace
 * chat, collapsed by default after first view.
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
function ReceiptCard({
  receipt,
  onDismiss,
}: {
  receipt: Receipt;
  onDismiss: (id: number) => void;
}) {
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    onDismiss(receipt.id);
  }, [receipt.id, onDismiss]);

  if (dismissed) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        padding: "7px 9px",
        borderRadius: 6,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        position: "relative",
        flexShrink: 0,
        minWidth: 180,
        maxWidth: 260,
      }}
    >
      {/* category chip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
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
      {/* dismiss */}
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
          opacity: 0.4,
          lineHeight: 1,
          fontSize: 10,
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "0.4")}
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
    try { return sessionStorage.getItem(storageKey(projectId)) === "1"; } catch { return false; }
  });
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  const hasFetched = useRef(false);

  // Fetch once per mount (project won't change within a workspace session)
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    void (async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/thinking-receipts`, {
          credentials: "include",
        });
        if (!r.ok) return;
        const data = (await r.json()) as Receipt[];
        if (data.length > 0) setReceipts(data);
      } catch {
        // non-critical
      }
    })();
  }, [projectId]);

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
        padding: "10px 16px 0",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Header row */}
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
        }}
      >
        {/* Diamond icon */}
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
          thought carry-in · {visible.length}
        </span>
        {/* chevron */}
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

      {/* Receipt cards — horizontal scroll row */}
      {!collapsed && (
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 6,
          }}
          className="scrollbar-none"
        >
          {visible.map(receipt => (
            <ReceiptCard
              key={receipt.id}
              receipt={receipt}
              onDismiss={dismiss}
            />
          ))}
        </div>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginTop: 2 }} />
    </div>
  );
}
