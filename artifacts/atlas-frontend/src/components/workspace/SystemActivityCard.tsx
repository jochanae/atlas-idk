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

/** Single inline system event. Tap to expand subtitle / open link. */
export function SystemActivityCard({ item }: { item: ActivityItem }) {
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
        {open && item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
             style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontFamily: "var(--app-font-mono)", color: "var(--atlas-gold)" }}>
            open ↗
          </a>
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
