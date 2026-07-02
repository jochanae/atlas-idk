/**
 * WorkspaceRunCard — receipt-style Run Card for the workspace chat surface.
 *
 * Standalone. Does NOT import layout from ActiveRuns.tsx (only the exported
 * `useAllRuns` hook and `ActiveRun` type). Renders the most-recent run for
 * the given project. Visual reference: attached_assets/run-card-{dark,light}.html
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Loader2, CheckCircle2, XCircle, Bookmark, FileText, Image as ImageIcon, FileCode } from "lucide-react";
import { useAllRuns, type ActiveRun } from "@/components/home/ActiveRuns";

interface Props {
  projectId: number;
}

// Files considered user-facing "produced artifacts" (allowlist).
const PRODUCED_EXT = /\.(html?|pdf|md|png|jpe?g|gif|svg|webp)$/i;

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

function statusMeta(status: ActiveRun["status"], projectName: string) {
  switch (status) {
    case "running":
    case "queued":
      return { kicker: `Working · ${projectName}`, tone: "running" as const, Icon: Loader2, spin: true };
    case "completed":
      return { kicker: `Run Complete · ${projectName}`, tone: "success" as const, Icon: CheckCircle2, spin: false };
    case "failed":
      return { kicker: `Run Failed · ${projectName}`, tone: "failed" as const, Icon: XCircle, spin: false };
    default:
      return { kicker: projectName, tone: "running" as const, Icon: Loader2, spin: false };
  }
}

const TONE: Record<"running" | "success" | "failed", { border: string; ring: string; fg: string; iconBg: string }> = {
  running: {
    border: "var(--atlas-gold-border)",
    ring: "transparent",
    fg: "var(--atlas-gold)",
    iconBg: "var(--atlas-gold-dim)",
  },
  success: {
    border: "rgba(74,222,128,0.35)",
    ring: "rgba(74,222,128,0.08)",
    fg: "#4ade80",
    iconBg: "rgba(74,222,128,0.10)",
  },
  failed: {
    border: "rgba(248,113,113,0.35)",
    ring: "rgba(248,113,113,0.08)",
    fg: "#f87171",
    iconBg: "rgba(248,113,113,0.10)",
  },
};

function producedFrom(run: ActiveRun): string[] {
  const paths = new Set<string>();
  for (const p of run.appliedFiles ?? []) if (PRODUCED_EXT.test(p)) paths.add(p);
  for (const e of run.fileEdits ?? []) if (PRODUCED_EXT.test(e.path)) paths.add(e.path);
  return Array.from(paths);
}

function ProducedIcon({ path }: { path: string }) {
  if (/\.(png|jpe?g|gif|svg|webp)$/i.test(path)) return <ImageIcon size={12} />;
  if (/\.(html?|md)$/i.test(path)) return <FileText size={12} />;
  return <FileCode size={12} />;
}

export function WorkspaceRunCard({ projectId }: Props) {
  const runs = useAllRuns();
  const run = useMemo(
    () =>
      runs
        .filter((r) => r.projectId === projectId)
        .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null,
    [runs, projectId]
  );

  // Live elapsed clock for running/queued.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!run || (run.status !== "running" && run.status !== "queued")) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [run?.id, run?.status]);

  if (!run) return null;

  const meta = statusMeta(run.status, run.projectName);
  const tone = TONE[meta.tone];
  const produced = producedFrom(run);
  const fileCount = new Set([...(run.appliedFiles ?? []), ...(run.fileEdits ?? []).map((e) => e.path)]).size;
  const elapsedMs =
    run.status === "completed" || run.status === "failed"
      ? (run.completedAt ?? run.createdAt) - run.createdAt
      : now - run.createdAt;

  const title =
    run.summaryLine?.trim() ||
    run.prompt?.trim() ||
    (run.status === "running" ? "Working…" : "Run");

  const previewHref = produced[0]
    ? `/project/${run.projectId}?leftTab=diff&runId=${encodeURIComponent(run.id)}&file=${encodeURIComponent(produced[0])}`
    : null;
  const detailsHref = `/project/${run.projectId}?leftTab=diff&runId=${encodeURIComponent(run.id)}`;

  return (
    <div
      style={{
        position: "relative",
        background: "hsl(var(--card))",
        color: "hsl(var(--card-foreground))",
        border: `1px solid ${tone.border}`,
        boxShadow: tone.ring !== "transparent" ? `0 0 0 3px ${tone.ring}` : undefined,
        borderRadius: 10,
        padding: "14px 16px 12px",
        margin: "12px 0 6px",
        transition: "border-color 240ms ease",
      }}
      data-run-id={run.id}
      data-run-status={run.status}
    >
      {/* Bookmark placeholder */}
      <button
        type="button"
        aria-label="Bookmark run"
        title="Bookmark (coming soon)"
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: "transparent",
          border: "none",
          color: "hsl(var(--muted-foreground) / 0.55)",
          cursor: "pointer",
          padding: 4,
          borderRadius: 4,
          lineHeight: 0,
        }}
      >
        <Bookmark size={14} strokeWidth={1.75} />
      </button>

      {/* Head */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span
          style={{
            flex: "0 0 auto",
            width: 22,
            height: 22,
            borderRadius: 999,
            background: tone.iconBg,
            color: tone.fg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <meta.Icon size={14} strokeWidth={1.75} className={meta.spin ? "spin" : undefined} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: tone.fg,
              marginBottom: 4,
            }}
          >
            {meta.kicker}
          </div>
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 500,
              letterSpacing: "-0.005em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 11.5,
              color: "hsl(var(--muted-foreground))",
              marginTop: 3,
            }}
          >
            {fileCount} {fileCount === 1 ? "file" : "files"} · {fmtElapsed(elapsedMs)}
          </div>
          {run.status === "failed" && run.error ? (
            <div style={{ marginTop: 6, fontSize: 12, color: TONE.failed.fg }}>{run.error}</div>
          ) : null}
        </div>
      </div>

      {/* PRODUCED */}
      {produced.length > 0 && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: "1px dashed hsl(var(--border))",
            display: "grid",
            gap: 6,
          }}
        >
          <div
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "hsl(var(--muted-foreground) / 0.7)",
            }}
          >
            Produced
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 3 }}>
            {produced.map((p) => (
              <li
                key={p}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 11.5,
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                <ProducedIcon path={p} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 12,
          paddingTop: 10,
          borderTop: "1px solid hsl(var(--border))",
        }}
      >
        <Link
          to={detailsHref}
          style={{
            flex: 1,
            padding: "8px 12px",
            fontSize: 12.5,
            fontWeight: 500,
            textAlign: "center",
            background: "transparent",
            border: "1px solid hsl(var(--border))",
            color: "hsl(var(--card-foreground))",
            borderRadius: 6,
            textDecoration: "none",
            letterSpacing: "0.01em",
          }}
        >
          Details
        </Link>
        {previewHref ? (
          <Link
            to={previewHref}
            style={{
              flex: 1,
              padding: "8px 12px",
              fontSize: 12.5,
              fontWeight: 500,
              textAlign: "center",
              background: "var(--atlas-gold-dim)",
              border: "1px solid var(--atlas-gold-border)",
              color: "var(--atlas-gold)",
              borderRadius: 6,
              textDecoration: "none",
              letterSpacing: "0.01em",
            }}
          >
            Open Preview
          </Link>
        ) : (
          <button
            type="button"
            disabled
            style={{
              flex: 1,
              padding: "8px 12px",
              fontSize: 12.5,
              fontWeight: 500,
              background: "transparent",
              border: "1px solid hsl(var(--border))",
              color: "hsl(var(--muted-foreground) / 0.5)",
              borderRadius: 6,
              cursor: "not-allowed",
              fontFamily: "inherit",
            }}
          >
            Open Preview
          </button>
        )}
        {run.prUrl ? (
          <a
            href={run.prUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: "8px 10px",
              fontFamily: "var(--app-font-mono)",
              fontSize: 11,
              background: "var(--atlas-gold-dim)",
              border: "1px solid var(--atlas-gold-border)",
              color: "var(--atlas-gold)",
              borderRadius: 6,
              textDecoration: "none",
              alignSelf: "center",
            }}
          >
            PR ↗
          </a>
        ) : null}
      </div>

      <style>{`
        [data-run-id="${run.id}"] .spin { animation: wrc-spin 1s linear infinite; transform-origin: 50% 50%; }
        @keyframes wrc-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default WorkspaceRunCard;
