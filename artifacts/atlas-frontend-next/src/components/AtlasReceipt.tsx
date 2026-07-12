import { useState } from "react";
import type { Run, RunArtifactSummary } from "@contract";

/**
 * AtlasReceipt — compact inline receipt for a terminal BUILD run.
 *
 * Renders ONLY from the canonical Run object. Title is `run.summary` (never
 * derived from the user prompt or response prefix). Action buttons appear
 * based on what the run actually produced:
 *
 *   - Details / Changes: shown when the run touched files (changesCount > 0)
 *   - Preview:           shown when any artifact has a previewUrl
 *   - Open / Download:   shown per-artifact when downloadUrl is set
 *   - Commit to GitHub:  shown when status === "succeeded" and commit is
 *                        not_requested. Updates in place on `commit_update`.
 *
 * One terminal BUILD run = one receipt. External repo commits belong in
 * RepositoryFeed, not here.
 */
export interface AtlasReceiptProps {
  run: Run;
  /** Number of RunChange entries — hydrate via RunProvider.fetchChanges */
  changesCount?: number;
  /** Hydrated via RunProvider.fetchOutputs */
  artifacts?: RunArtifactSummary[];
  onDetails?: () => void;
  onPreview?: () => void;
  onCommit?: () => void;
}

export function AtlasReceipt({
  run,
  changesCount = 0,
  artifacts = [],
  onDetails,
  onPreview,
  onCommit,
}: AtlasReceiptProps) {
  const [expanded, setExpanded] = useState(false);

  const succeeded = run.status === "succeeded";
  const failed = run.status === "failed";
  const showCommit =
    succeeded &&
    run.intent === "BUILD" &&
    (run.commit == null || run.commit.status === "not_requested");
  const committing = run.commit?.status === "running";
  const committed = run.commit?.status === "succeeded";
  const commitFailed = run.commit?.status === "failed";

  const previewArtifact = artifacts.find((a) => a.previewUrl && a.status === "ready");
  const downloadable = artifacts.filter((a) => a.downloadUrl && a.status === "ready");
  const hasChanges = changesCount > 0;

  const statusDot = failed ? "var(--fail)" : succeeded ? "var(--ok)" : "var(--muted)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 14px",
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderLeft: `2px solid ${statusDot}`,
        borderRadius: 10,
        maxWidth: 560,
        fontSize: 13,
      }}
    >
      {/* Row 1: dot + title + timestamp */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{ width: 6, height: 6, borderRadius: 999, background: statusDot, flexShrink: 0 }}
        />
        <span style={{ flex: 1, minWidth: 0, color: "var(--text)" }}>
          {run.summary ?? (failed ? "Run failed" : "Run complete")}
        </span>
        {run.elapsedMs != null && (
          <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>
            {(run.elapsedMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* Row 2: actions — only render buttons that map to real data */}
      {(hasChanges || previewArtifact || downloadable.length > 0 || showCommit || committing || committed || commitFailed) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {hasChanges && (
            <ReceiptAction onClick={onDetails}>
              Details{changesCount > 0 ? ` · ${changesCount}` : ""}
            </ReceiptAction>
          )}
          {previewArtifact && (
            <ReceiptAction onClick={onPreview}>Preview</ReceiptAction>
          )}
          {downloadable.map((a) => (
            <ReceiptAction
              key={a.id}
              as="a"
              href={a.downloadUrl!}
              target="_blank"
              rel="noreferrer"
              title={a.name}
            >
              {a.type === "pdf" || a.type === "pptx" ? "Download" : "Open"} · {a.name}
            </ReceiptAction>
          ))}
          {committed && run.commit && (
            <ReceiptAction as="a" href={run.commit.url ?? "#"} target="_blank" rel="noreferrer" tone="accent">
              Commit {run.commit.sha?.slice(0, 7)} ↗
            </ReceiptAction>
          )}
          {committing && (
            <span style={{ color: "var(--muted)", fontSize: 12, padding: "4px 8px" }}>Committing…</span>
          )}
          {showCommit && onCommit && (
            <ReceiptAction onClick={onCommit} tone="accent">Commit to GitHub</ReceiptAction>
          )}
          {commitFailed && (
            <ReceiptAction onClick={onCommit} tone="fail">Commit failed · retry</ReceiptAction>
          )}
        </div>
      )}

      {/* Row 3: failure detail (expandable) */}
      {failed && run.error && (
        <div>
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              background: "transparent", border: "none", padding: 0,
              color: "var(--fail)", fontSize: 12, cursor: "pointer",
            }}
          >
            {expanded ? "▾" : "▸"} {run.error.code}
          </button>
          {expanded && (
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--text)" }}>
              {run.error.message}
              {run.error.partialWritesOccurred && (
                <div style={{ color: "var(--muted)", marginTop: 4, fontSize: 11 }}>
                  Some files may have been partially updated. Review the Changes tab.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReceiptAction({
  children,
  onClick,
  as = "button",
  tone,
  ...rest
}: {
  children: React.ReactNode;
  onClick?: () => void;
  as?: "button" | "a";
  tone?: "accent" | "fail";
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const color = tone === "accent" ? "var(--accent)" : tone === "fail" ? "var(--fail)" : "var(--text)";
  const style: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 4,
    background: "transparent",
    border: "1px solid var(--border)",
    color,
    borderRadius: 6,
    padding: "3px 10px",
    fontSize: 12,
    textDecoration: "none",
    cursor: "pointer",
  };
  if (as === "a") {
    return <a style={style} {...rest}>{children}</a>;
  }
  return <button type="button" onClick={onClick} style={style}>{children}</button>;
}
