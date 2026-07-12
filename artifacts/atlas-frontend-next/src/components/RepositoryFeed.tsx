import { useState } from "react";

/**
 * RepositoryEvent — external-facing repository activity (commits, merges,
 * syncs from Replit / Lovable / manual GitHub pushes).
 *
 * This mirrors the legacy `ActivityItem` shape from
 * artifacts/atlas-frontend/src/hooks/useWorkspaceActivity.ts so the same
 * `/api/nexus/activity` payload can hydrate it in Phase 2.
 *
 * Identity rule:
 *   - `runId` is set when the event corresponds to an Atlas BUILD run. The
 *     feed filters these out — the Atlas receipt owns that story.
 *   - Events without `runId` are external (Replit, manual push, merge, sync)
 *     and are rendered here.
 */
export type RepositoryEventOrigin = "replit" | "lovable" | "atlas" | "manual" | "merge";

export type RepositoryEvent = {
  id: string;
  origin: RepositoryEventOrigin;
  title: string;
  subtitle?: string;
  sha?: string;
  url?: string;
  timestamp: string;
  /** If present, this event was produced by an Atlas run and MUST NOT be shown here. */
  runId?: string;
};

const ORIGIN_LABEL: Record<RepositoryEventOrigin, string> = {
  replit: "REPLIT",
  lovable: "LOVABLE",
  atlas: "ATLAS",
  manual: "PUSH",
  merge: "MERGE",
};

const ORIGIN_COLOR: Record<RepositoryEventOrigin, string> = {
  replit: "rgba(148,163,184,0.85)",
  lovable: "rgba(201,162,76,0.9)",
  atlas: "rgba(120,180,255,0.9)",
  manual: "rgba(74,222,128,0.85)",
  merge: "rgba(200,120,255,0.85)",
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function RepositoryRow({ event }: { event: RepositoryEvent }) {
  const color = ORIGIN_COLOR[event.origin];
  return (
    <a
      href={event.url ?? "#"}
      target={event.url ? "_blank" : undefined}
      rel="noreferrer"
      onClick={(e) => { if (!event.url) e.preventDefault(); }}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "6px 10px",
        borderLeft: `2px solid ${color}`,
        background: "rgba(255,255,255,0.02)",
        borderRadius: 6,
        textDecoration: "none",
        color: "var(--text)",
        fontSize: 12,
      }}
    >
      <span style={{
        fontSize: 9, fontFamily: "ui-monospace, monospace", color,
        letterSpacing: "0.1em", flexShrink: 0, opacity: 0.85, minWidth: 52,
      }}>
        {ORIGIN_LABEL[event.origin]}
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {event.title}
        {event.subtitle && (
          <span style={{ color: "var(--muted)", marginLeft: 6, fontSize: 11 }}>
            · {event.subtitle}
          </span>
        )}
      </span>
      {event.sha && (
        <code style={{ fontSize: 10, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>
          {event.sha.slice(0, 7)}
        </code>
      )}
      <span style={{ fontSize: 10, color: "var(--muted)", opacity: 0.6 }}>
        {relTime(event.timestamp)}
      </span>
    </a>
  );
}

/**
 * RepositoryFeed — grouped, collapsible "quiet updates" of repository activity.
 *
 * Ported from legacy `BatchedActivityCard`. Filters out events tied to
 * known Atlas run IDs (those are rendered inline as receipts instead).
 */
export function RepositoryFeed({
  events,
  ownedRunIds,
}: {
  events: RepositoryEvent[];
  /** Atlas run IDs whose commits should not be duplicated in the feed. */
  ownedRunIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const ownedSet = new Set(ownedRunIds ?? []);
  const filtered = events
    .filter((e) => !(e.runId && ownedSet.has(e.runId)))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (filtered.length === 0) return null;
  const newest = filtered[0];

  return (
    <div style={{ margin: "6px 0", maxWidth: 560 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "100%",
          padding: "7px 12px",
          background: "rgba(255,255,255,0.02)",
          border: "1px dashed var(--border)",
          borderRadius: 8,
          textAlign: "left",
          cursor: "pointer",
          color: "var(--muted)",
          fontSize: 12,
        }}
      >
        <span style={{ fontSize: 11, opacity: 0.6 }}>{open ? "▾" : "▸"}</span>
        <span style={{ flex: 1, fontFamily: "ui-monospace, monospace", letterSpacing: "0.04em" }}>
          {filtered.length} quiet update{filtered.length === 1 ? "" : "s"}
        </span>
        <span style={{ fontSize: 10, fontFamily: "ui-monospace, monospace", opacity: 0.6 }}>
          {relTime(newest.timestamp)}
        </span>
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 0 0 8px" }}>
          {filtered.map((e) => <RepositoryRow key={e.id} event={e} />)}
        </div>
      )}
    </div>
  );
}
