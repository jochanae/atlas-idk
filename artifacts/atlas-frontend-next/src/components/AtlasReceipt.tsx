import { useState } from "react";
import type { Run, RunChange, RunArtifactSummary } from "@contract";
import { Drawer, LoadShell, Spinner } from "@/components/Drawer";
import type { LoadState } from "@/hooks/useRunHydration";

/**
 * AtlasReceipt — compact inline receipt for a terminal BUILD run.
 *
 * Renders ONLY from the canonical Run object plus hydrated content passed
 * in via `hydration`. Title is `run.summary` (never derived from user
 * prompt or response prefix). Actions appear based on what the run
 * actually produced AND the state of that data:
 *
 *   Details / Changes  — enabled when hydration.changes.status === "ready".
 *                        Loading state shows an inline spinner and disabled
 *                        button; error state shows Retry.
 *   Preview            — enabled when any hydrated artifact has previewUrl.
 *   Open / Download    — enabled per artifact when downloadUrl is set.
 *   Commit to GitHub   — enabled while status === "succeeded" and commit
 *                        is not_requested. Updates in place on commit_update
 *                        (running → succeeded | failed) with retry on failure.
 *
 * The receipt is the single source of the story for one terminal BUILD run;
 * repository events tied to run.id are filtered from the feed upstream.
 */
export interface AtlasReceiptProps {
  run: Run;
  hydration?: {
    changes: LoadState<RunChange[]>;
    outputs: LoadState<RunArtifactSummary[]>;
  };
  disconnected?: boolean;
  onCommit?: () => void;
}

export function AtlasReceipt({ run, hydration, disconnected, onCommit }: AtlasReceiptProps) {
  const [expandedError, setExpandedError] = useState(false);
  const [drawer, setDrawer] = useState<null | "changes" | "preview">(null);

  const succeeded = run.status === "succeeded";
  const failed = run.status === "failed";
  const showCommit =
    succeeded &&
    run.intent === "BUILD" &&
    (run.commit == null || run.commit.status === "not_requested");
  const committing = run.commit?.status === "running";
  const committed = run.commit?.status === "succeeded";
  const commitFailed = run.commit?.status === "failed";

  const ch = hydration?.changes ?? { status: "idle" } as LoadState<RunChange[]>;
  const outs = hydration?.outputs ?? { status: "idle" } as LoadState<RunArtifactSummary[]>;

  const changes = ch.status === "ready" ? ch.data : [];
  const artifacts = outs.status === "ready" ? outs.data : [];
  const previewArtifact = artifacts.find((a) => a.previewUrl && a.status === "ready");
  const downloadable = artifacts.filter((a) => a.downloadUrl && a.status === "ready");

  const statusDot = failed ? "var(--fail)" : succeeded ? "var(--ok)" : "var(--muted)";

  const dis = disconnected || ch.status === "disconnected" || outs.status === "disconnected";

  const showDetails = ch.status !== "idle";
  const detailsPending = ch.status === "loading";
  const detailsError = ch.status === "error";
  const detailsDisabled = detailsPending || dis || ch.status === "empty" || ch.status === "disconnected";

  const outputsPending = outs.status === "loading";
  const outputsError = outs.status === "error";

  return (
    <div
      style={{
        display: "flex", flexDirection: "column", gap: 8,
        padding: "10px 14px",
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderLeft: `2px solid ${statusDot}`,
        borderRadius: 10,
        maxWidth: 560,
        fontSize: 13,
        opacity: dis ? 0.85 : 1,
      }}
    >
      {/* Row 1: dot + title + timestamp */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: statusDot, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, color: "var(--text)" }}>
          {run.summary ?? (failed ? "Run failed" : "Run complete")}
        </span>
        {run.elapsedMs != null && (
          <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>
            {(run.elapsedMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* Row 2: actions */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {showDetails && (
          <ReceiptAction
            onClick={() => setDrawer("changes")}
            disabled={detailsDisabled}
            title={ch.status === "empty" ? "No file changes" : undefined}
          >
            {detailsPending && <Spinner />}
            <span>
              Changes
              {ch.status === "ready" && ` · ${changes.length}`}
              {ch.status === "empty" && " · 0"}
            </span>
          </ReceiptAction>
        )}
        {detailsError && ch.status === "error" && (
          <button
            onClick={ch.retry}
            style={errBtn}
          >Changes failed · Retry</button>
        )}

        {outputsPending && (
          <span style={{ fontSize: 11, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Spinner /> outputs…
          </span>
        )}
        {outputsError && outs.status === "error" && (
          <button onClick={outs.retry} style={errBtn}>Outputs failed · Retry</button>
        )}

        {previewArtifact && (
          <ReceiptAction onClick={() => setDrawer("preview")} disabled={dis}>
            Preview
          </ReceiptAction>
        )}
        {downloadable.map((a) => (
          <ReceiptAction
            key={a.id}
            as="a"
            href={dis ? undefined : (a.downloadUrl ?? undefined)}
            target="_blank"
            rel="noreferrer"
            title={a.name}
            aria-disabled={dis}
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
          <span style={{ color: "var(--muted)", fontSize: 12, padding: "4px 8px", display: "inline-flex", gap: 6, alignItems: "center" }}>
            <Spinner /> Committing…
          </span>
        )}
        {showCommit && onCommit && (
          <ReceiptAction onClick={onCommit} tone="accent" disabled={dis}>
            Commit to GitHub
          </ReceiptAction>
        )}
        {commitFailed && (
          <>
            <ReceiptAction onClick={onCommit} tone="fail" disabled={dis}>Commit failed · retry</ReceiptAction>
            {run.commit?.error && (
              <span style={{ fontSize: 11, color: "var(--fail)" }}>{run.commit.error}</span>
            )}
          </>
        )}
      </div>

      {dis && (
        <div style={{ fontSize: 11, color: "var(--warn)" }}>
          Disconnected — actions disabled until reconnected.
        </div>
      )}

      {/* Row 3: failure detail (expandable) */}
      {failed && run.error && (
        <div>
          <button
            onClick={() => setExpandedError((v) => !v)}
            style={{
              background: "transparent", border: "none", padding: 0,
              color: "var(--fail)", fontSize: 12, cursor: "pointer",
            }}
          >
            {expandedError ? "▾" : "▸"} {run.error.code}
          </button>
          {expandedError && (
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--text)" }}>
              {run.error.message}
              {run.error.partialWritesOccurred && (
                <div style={{ color: "var(--muted)", marginTop: 4, fontSize: 11 }}>
                  Some files may have been partially updated. Review the Changes drawer.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Drawer open={drawer === "changes"} onClose={() => setDrawer(null)} title={`Changes · ${run.summary ?? run.id.slice(0, 8)}`}>
        {ch.status === "loading" && <LoadShell label="changes" state="loading" />}
        {ch.status === "empty" && <LoadShell label="changes" state="empty" />}
        {ch.status === "error" && <LoadShell label="changes" state="error" onRetry={ch.retry} />}
        {ch.status === "disconnected" && <LoadShell label="changes" state="disconnected" />}
        {ch.status === "ready" && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {changes.map((c) => (
              <li key={`${c.stepId}-${c.filePath}`} style={{
                padding: "10px 0", borderBottom: "1px solid var(--border)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <code style={{ fontSize: 12, color: "var(--accent)", fontFamily: "ui-monospace, monospace" }}>
                    {c.filePath}
                  </code>
                  <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>
                    {c.verb} · {c.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      <Drawer open={drawer === "preview"} onClose={() => setDrawer(null)} title={`Preview · ${previewArtifact?.name ?? ""}`}>
        {previewArtifact ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {previewArtifact.mimeType}
              {previewArtifact.sizeBytes != null && ` · ${Math.round(previewArtifact.sizeBytes / 1024)} KB`}
            </div>
            <iframe
              src={previewArtifact.previewUrl ?? "about:blank"}
              title={previewArtifact.name}
              style={{ width: "100%", height: 480, border: "1px solid var(--border)", borderRadius: 6, background: "#fff" }}
            />
            {previewArtifact.downloadUrl && (
              <a href={previewArtifact.downloadUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: 13 }}>
                Open in new tab ↗
              </a>
            )}
          </div>
        ) : (
          <LoadShell label="preview" state="empty" />
        )}
      </Drawer>
    </div>
  );
}

const errBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--fail)",
  color: "var(--fail)",
  borderRadius: 6,
  padding: "3px 10px",
  fontSize: 12,
  cursor: "pointer",
};

function ReceiptAction({
  children, onClick, as = "button", tone, disabled, ...rest
}: {
  children: React.ReactNode;
  onClick?: () => void;
  as?: "button" | "a";
  tone?: "accent" | "fail";
  disabled?: boolean;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const color = tone === "accent" ? "var(--accent)" : tone === "fail" ? "var(--fail)" : "var(--text)";
  const style: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 4,
    background: "transparent",
    border: "1px solid var(--border)",
    color: disabled ? "var(--muted)" : color,
    borderRadius: 6,
    padding: "3px 10px",
    fontSize: 12,
    textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
  if (as === "a") {
    // eslint-disable-next-line jsx-a11y/anchor-is-valid
    return <a style={style} {...rest}>{children}</a>;
  }
  return <button type="button" onClick={onClick} disabled={disabled} style={style}>{children}</button>;
}
