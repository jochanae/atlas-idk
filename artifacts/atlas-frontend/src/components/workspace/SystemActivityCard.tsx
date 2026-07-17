import { useState } from "react";
import type { ActivityItem } from "@/hooks/useWorkspaceActivity";

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const ICON: Record<ActivityItem["type"], string> = {
  commit: "↗",
  decision: "◆",
  session: "·",
};

const COLOR: Record<ActivityItem["type"], string> = {
  commit: "rgba(74,222,128,0.85)",
  decision: "rgba(201,162,76,0.9)",
  session: "rgba(148,163,184,0.7)",
};

const LABEL: Record<ActivityItem["type"], string> = {
  commit: "PUSH",
  decision: "DECISION",
  session: "SESSION",
};

/** GitHub mark used in the commit card header. */
function GitHubMark({ size = 14, color }: { size?: number; color: string }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        fill={color}
        d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

/** Compact receipt for non-commit events (decisions, sessions). */
function InlineReceipt({ item }: { item: ActivityItem }) {
  const [open, setOpen] = useState(false);
  const dot = COLOR[item.type];
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", maxWidth: 540,
        margin: "6px 0 14px",
        padding: "8px 12px",
        background: "rgba(var(--atlas-surface-rgb,30,30,30),0.5)",
        border: "1px solid rgba(var(--atlas-border-rgb,80,80,80),0.4)",
        borderLeft: `2px solid ${dot}`,
        borderRadius: 8,
        textAlign: "left",
        cursor: "pointer",
        font: "inherit",
        color: "var(--atlas-fg)",
      }}
    >
      <span style={{ fontSize: 11, color: dot, flexShrink: 0, fontFamily: "var(--app-font-mono)" }}>
        {ICON[item.type]}
      </span>
      <span style={{
        fontSize: 9, fontFamily: "var(--app-font-mono)", color: dot,
        letterSpacing: "0.1em", flexShrink: 0, opacity: 0.85,
      }}>
        {LABEL[item.type]}
      </span>
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: 12, lineHeight: 1.4,
        overflow: "hidden",
        textOverflow: open ? "clip" : "ellipsis",
        whiteSpace: open ? "normal" : "nowrap",
      }}>
        {item.title}
        {open && item.subtitle && (
          <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--atlas-muted)", opacity: 0.7 }}>
            {item.subtitle}
          </span>
        )}
      </span>
      <span style={{
        fontSize: 10, fontFamily: "var(--app-font-mono)",
        color: "var(--atlas-muted)", opacity: 0.5, flexShrink: 0,
      }}>
        {relTime(item.timestamp)}
      </span>
    </button>
  );
}

/** Commit / push receipt card — headline + Details / Preview buttons. */
function CommitReceipt({ item, isLatest }: { item: ActivityItem; isLatest?: boolean }) {
  const commitUrl = item.url;
  // GitHub "files changed" view for the diff preview.
  const previewUrl = commitUrl ? `${commitUrl.replace(/\/$/, "")}` : undefined;
  const filesUrl = commitUrl && /\/commit\//.test(commitUrl)
    ? `${commitUrl}#files-bucket`
    : previewUrl;

  const accent = "var(--atlas-gold, rgba(201,162,76,0.9))";
  // Softer border so the card reads as a light timeline event, not a framed
  // notification panel. Latest still gets a subtle gold hint.
  const border = isLatest
    ? `1px solid ${accent}`
    : "1px solid hsl(var(--border) / 0.55)";
  const shadow = isLatest
    ? `0 0 0 1px rgba(201,162,76,0.14)`
    : "none";

  return (
    <div
      style={{
        display: "flex", flexDirection: "column",
        // Narrower card + horizontal inset so it sits as an object on the page
        // rather than edge-to-edge.
        width: "min(calc(100% - 24px), 380px)",
        alignSelf: "flex-start",
        margin: "20px 12px 24px",
        background: "hsl(var(--card))",
        border,
        boxShadow: shadow,
        // Softer, more editorial corner — premium but not pillowy.
        borderRadius: 18,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* Header row — title inset from card edges */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "18px 20px 0",
      }}>
        <GitHubMark size={13} color="hsl(var(--card-foreground))" />
        <span style={{
          flex: 1, minWidth: 0,
          fontSize: 13, lineHeight: 1.4, color: "hsl(var(--card-foreground))",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item.title}
        </span>
        <span style={{
          fontSize: 10, fontFamily: "var(--app-font-mono)",
          color: "hsl(var(--muted-foreground))", opacity: 0.65, flexShrink: 0,
        }}>
          {relTime(item.timestamp)}
        </span>
      </div>

      {/* Actions */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
        padding: "14px 20px 18px",
        marginTop: "auto",
      }}>
        <button
          type="button"
          onClick={openDetails}
          disabled={!canOpenDetails}
          title={canOpenDetails ? "Open changes for this commit" : "No commit reference"}
          style={{
            padding: "9px 12px",
            background: "transparent",
            border: "1px solid hsl(var(--border) / 0.6)",
            borderRadius: 10,
            color: canOpenDetails ? "hsl(var(--card-foreground))" : "hsl(var(--muted-foreground))",
            fontSize: 12, cursor: canOpenDetails ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          Details
        </button>
        <button
          type="button"
          onClick={openUrl(commitUrl)}
          disabled={!commitUrl}
          title={commitUrl ? "Open commit on GitHub" : ""}
          style={{
            padding: "9px 12px",
            background: "transparent",
            border: "1px solid hsl(var(--border) / 0.6)",
            borderRadius: 10,
            color: commitUrl ? "hsl(var(--card-foreground))" : "hsl(var(--muted-foreground))",
            fontSize: 11, cursor: commitUrl ? "pointer" : "not-allowed",
            fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          <GitHubMark size={11} color="currentColor" />
          GitHub
        </button>
      </div>
    </div>
  );
}


/** Single inline system event. Commit → full card, other → inline receipt. */
export function SystemActivityCard({ item, isLatest }: { item: ActivityItem; isLatest?: boolean }) {
  if (item.type === "commit") return <CommitReceipt item={item} isLatest={isLatest} />;
  return <InlineReceipt item={item} />;
}

/** Batched quiet events on mobile. Click to expand individual cards. */
export function BatchedActivityCard({ items }: { items: ActivityItem[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const newest = items[items.length - 1];

  return (
    <div style={{ margin: "6px 0 14px", maxWidth: 540 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "100%",
          padding: "7px 12px",
          background: "rgba(var(--atlas-surface-rgb,30,30,30),0.35)",
          border: "1px dashed rgba(var(--atlas-border-rgb,80,80,80),0.45)",
          borderRadius: 8,
          textAlign: "left",
          cursor: "pointer",
          color: "var(--atlas-muted)",
        }}
      >
        <span style={{ fontSize: 11, opacity: 0.5 }}>{open ? "▾" : "▸"}</span>
        <span style={{ flex: 1, fontSize: 11, fontFamily: "var(--app-font-mono)", letterSpacing: "0.04em" }}>
          {items.length} quiet update{items.length === 1 ? "" : "s"}
        </span>
        <span style={{ fontSize: 10, fontFamily: "var(--app-font-mono)", opacity: 0.55 }}>
          {relTime(newest.timestamp)}
        </span>
      </button>
      {open && (
        <div style={{ paddingLeft: 8, marginTop: 4 }}>
          {items.map((it, i) => (
            <SystemActivityCard key={`${it.type}-${it.timestamp}-${i}`} item={it} />
          ))}
        </div>
      )}
    </div>
  );
}
