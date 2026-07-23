/**
 * AttachmentDiagnosticsPanel — admin-only diagnostic view for the attachment lifecycle.
 *
 * Shows a chronological timeline of every attachment attempt captured by
 * attachDebugLog. No network calls, no side effects — purely reads localStorage.
 *
 * Enabled by default. Disable by setting VITE_ATTACH_DIAG=0.
 */

import { useState, useEffect, useCallback } from "react";
import {
  getLog,
  clearLog,
  groupAttempts,
  exportRedacted,
  type AttachmentAttempt,
} from "@/lib/attachDebugLog";

export const ATTACH_DIAG_ENABLED = import.meta.env.VITE_ATTACH_DIAG !== "0";

const mono: React.CSSProperties = { fontFamily: "var(--app-font-mono, monospace)" };

function fmtBytes(n?: number): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

function fmtDuration(ms?: number): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTs(ts?: string): string {
  if (!ts) return "—";
  return ts.slice(11, 23);
}

type Phase = {
  label: string;
  result?: "ok" | "error" | "pending" | "skip";
  detail?: string;
  durationMs?: number;
};

function statusColor(status: AttachmentAttempt["status"]): string {
  switch (status) {
    case "uploaded": return "#86efac";
    case "failed": return "#f87171";
    case "aborted": return "#94a3b8";
    case "stale": return "#fbbf24";
    default: return "#e8d9b0";
  }
}

function phaseColor(result?: Phase["result"]): string {
  switch (result) {
    case "ok": return "#86efac";
    case "error": return "#f87171";
    case "pending": return "#fbbf24";
    default: return "#555";
  }
}

function phaseIcon(result?: Phase["result"]): string {
  switch (result) {
    case "ok": return "✓";
    case "error": return "✗";
    case "pending": return "…";
    default: return "–";
  }
}

function buildPhases(a: AttachmentAttempt): Phase[] {
  const phases: Phase[] = [];

  phases.push({
    label: "Stage",
    result: "ok",
    detail: `${a.filename ?? "?"} · ${fmtBytes(a.sizeBytes)} · ${a.mimeType ?? "?"}`,
  });

  phases.push({
    label: "Request upload",
    result: a.requestUploadStart
      ? (a.requestUploadResult ?? "pending")
      : "skip",
    detail: a.requestUploadResult === "error" ? (a.failureMessage ?? undefined) : undefined,
  });

  phases.push({
    label: "Signed PUT",
    result: a.putStart
      ? (a.putResult ?? "pending")
      : a.requestUploadResult === "error" ? "skip" : undefined,
    detail: a.putResult === "error" ? (a.putError ?? undefined)
      : a.putProgressLast != null ? `${Math.round(a.putProgressLast * 100)}%` : undefined,
  });

  phases.push({
    label: "Finalize",
    result: a.finalizeStart
      ? (a.finalizeResult ?? "pending")
      : a.putResult === "ok" ? "pending" : (a.putResult === "error" ? "skip" : undefined),
    detail: a.finalizeResult === "error" ? (a.finalizeError ?? undefined) : undefined,
  });

  phases.push({
    label: "Message submit",
    result: a.messageSubmitTs ? "ok"
      : a.status === "uploaded" ? undefined : "skip",
    detail: a.attachmentIdsCount != null ? `${a.attachmentIdsCount} attachmentId(s)` : undefined,
  });

  phases.push({
    label: "Model resolved",
    result: a.modelResolutionCount != null ? "ok" : undefined,
    detail: a.modelResolutionCount != null ? `×${a.modelResolutionCount}` : undefined,
  });

  return phases;
}

function AttemptCard({ attempt }: { attempt: AttachmentAttempt }) {
  const [expanded, setExpanded] = useState(false);
  const phases = buildPhases(attempt);

  return (
    <div style={{
      border: `1px solid color-mix(in oklab, ${statusColor(attempt.status)} 25%, transparent)`,
      borderRadius: 10,
      marginBottom: 10,
      background: "rgba(255,255,255,0.02)",
      overflow: "hidden",
    }}>
      {/* Header row */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(e => !e)}
        onKeyDown={e => e.key === "Enter" && setExpanded(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
          cursor: "pointer", userSelect: "none",
        }}
      >
        <span style={{
          display: "inline-block", width: 8, height: 8, borderRadius: "50%",
          background: statusColor(attempt.status), flexShrink: 0,
        }} />
        <span style={{ ...mono, fontSize: 11, color: "var(--atlas-fg)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {attempt.filename ?? attempt.stagedId}
        </span>
        <span style={{ ...mono, fontSize: 10, color: statusColor(attempt.status), flexShrink: 0 }}>
          {attempt.status.toUpperCase()}
        </span>
        <span style={{ ...mono, fontSize: 10, color: "var(--atlas-muted)", flexShrink: 0 }}>
          {fmtDuration(attempt.durationMs)}
        </span>
        <span style={{ ...mono, fontSize: 10, color: "var(--atlas-muted)", marginLeft: 4 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* Meta row */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: "4px 12px",
        padding: "0 12px 8px", borderBottom: "1px solid var(--atlas-border)",
      }}>
        {[
          ["Surface", attempt.surface],
          ["Project", attempt.projectId],
          ["Conversation", attempt.conversationId],
          ["Staged ID", attempt.stagedId],
          ["MIME", attempt.mimeType],
          ["Size", fmtBytes(attempt.sizeBytes)],
          ["Support", attempt.supportCapability],
        ].map(([label, value]) => (
          <span key={label as string} style={{ ...mono, fontSize: 10, color: "var(--atlas-muted)" }}>
            <span style={{ color: "var(--atlas-fg)", opacity: 0.5 }}>{label}: </span>
            <span style={{ color: value ? "var(--atlas-fg)" : "#444" }}>{value ?? "—"}</span>
          </span>
        ))}
        {attempt.failureCode && (
          <span style={{ ...mono, fontSize: 10, color: "#f87171" }}>
            Error: {attempt.failureCode} — {attempt.failureMessage ?? "unknown"}
          </span>
        )}
      </div>

      {/* Phase timeline */}
      <div style={{ display: "flex", padding: "10px 12px", gap: 6, flexWrap: "wrap" }}>
        {phases.map((phase, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 2, minWidth: 72,
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: "50%",
                background: `color-mix(in oklab, ${phaseColor(phase.result)} 15%, transparent)`,
                border: `1px solid ${phaseColor(phase.result)}55`,
                display: "flex", alignItems: "center", justifyContent: "center",
                ...mono, fontSize: 11, color: phaseColor(phase.result),
              }}>
                {phaseIcon(phase.result)}
              </span>
              <span style={{ ...mono, fontSize: 9, color: "var(--atlas-muted)", textAlign: "center" }}>
                {phase.label}
              </span>
              {phase.detail && (
                <span style={{ ...mono, fontSize: 8, color: "#666", textAlign: "center", maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {phase.detail}
                </span>
              )}
            </div>
            {i < phases.length - 1 && (
              <div style={{ width: 12, height: 1, background: "#333", marginBottom: 18 }} />
            )}
          </div>
        ))}
      </div>

      {/* Expanded raw events */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--atlas-border)", padding: "8px 12px", maxHeight: 240, overflowY: "auto" }}>
          <div style={{ ...mono, fontSize: 9.5, color: "var(--atlas-muted)", marginBottom: 4 }}>
            Raw events ({attempt.events.length})
          </div>
          {attempt.events.map((evt, i) => {
            const extra: Record<string, unknown> = {};
            for (const k of Object.keys(evt)) {
              if (k !== "t" && k !== "ts" && k !== "event") extra[k] = evt[k];
            }
            const extraStr = Object.keys(extra).length
              ? " " + JSON.stringify(extra).slice(0, 200)
              : "";
            const isErr = evt.event.includes("error") || evt.event.includes("fail");
            return (
              <div key={i} style={{
                padding: "3px 0", borderBottom: "1px solid #1a1a1a",
                ...mono, fontSize: 9.5, wordBreak: "break-all",
              }}>
                <span style={{ color: "#555", marginRight: 6 }}>{fmtTs(evt.ts)}</span>
                <span style={{ color: isErr ? "#f87171" : "#e8d9b0", fontWeight: 700 }}>{evt.event}</span>
                <span style={{ color: "#888" }}>{extraStr}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AttachmentDiagnosticsPanel() {
  const [attempts, setAttempts] = useState<AttachmentAttempt[]>([]);
  const [lastRefresh, setLastRefresh] = useState(0);
  const [copyLabel, setCopyLabel] = useState("Export JSON");

  const refresh = useCallback(() => {
    const log = getLog();
    setAttempts(groupAttempts(log));
    setLastRefresh(Date.now());
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleExport = useCallback(() => {
    const json = exportRedacted(attempts);
    void navigator.clipboard.writeText(json).then(() => {
      setCopyLabel("Copied!");
      setTimeout(() => setCopyLabel("Export JSON"), 2500);
    }).catch(() => {
      window.prompt("Copy this report:", json);
    });
  }, [attempts]);

  const handleClear = useCallback(() => {
    clearLog();
    refresh();
  }, [refresh]);

  if (!ATTACH_DIAG_ENABLED) {
    return (
      <div style={{ ...mono, fontSize: 12, color: "var(--atlas-muted)", padding: 20 }}>
        Attachment diagnostics disabled. Set <code>VITE_ATTACH_DIAG=1</code> to enable.
      </div>
    );
  }

  const totalRaw = getLog().length;

  return (
    <div>
      {/* Header row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--atlas-fg)" }}>
            Attachment Diagnostics
          </div>
          <div style={{ ...mono, fontSize: 10, color: "var(--atlas-muted)", marginTop: 2 }}>
            {attempts.length} attempt(s) · {totalRaw} raw event(s) · last refresh {lastRefresh ? new Date(lastRefresh).toLocaleTimeString() : "—"} · auto-refreshes every 3s
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          style={btnStyle("secondary")}
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={attempts.length === 0}
          style={btnStyle("primary")}
        >
          {copyLabel}
        </button>
        <button
          type="button"
          onClick={handleClear}
          style={btnStyle("danger")}
        >
          Clear Log
        </button>
      </div>

      {/* Legend */}
      <div style={{
        display: "flex", gap: 12, flexWrap: "wrap",
        padding: "8px 12px", borderRadius: 8,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid var(--atlas-border)",
        marginBottom: 14,
      }}>
        {([
          ["uploaded", "Uploaded"],
          ["uploading", "In progress"],
          ["failed", "Failed"],
          ["aborted", "Aborted"],
          ["stale", "Stale (gen mismatch)"],
        ] as [AttachmentAttempt["status"], string][]).map(([s, label]) => (
          <span key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor(s), display: "inline-block" }} />
            <span style={{ ...mono, fontSize: 10, color: "var(--atlas-muted)" }}>{label}</span>
          </span>
        ))}
      </div>

      {/* Attempt list */}
      {attempts.length === 0 ? (
        <div style={{
          padding: "32px 16px", textAlign: "center",
          ...mono, fontSize: 12, color: "#444",
          border: "1px dashed #222", borderRadius: 10,
        }}>
          No attachment attempts recorded yet. Try attaching a file in the workspace or Ask Joy.
        </div>
      ) : (
        <div>
          {attempts.map((a) => (
            <AttemptCard key={a.stagedId} attempt={a} />
          ))}
        </div>
      )}

      <div style={{ ...mono, fontSize: 9, color: "#333", marginTop: 16, lineHeight: 1.6 }}>
        Data is read from localStorage key <code>atlas_adbg</code> (max 300 events). Auth tokens, signed URLs,
        and file contents are never stored. Exported JSON redacts attachment IDs.
        Access from browser console: <code>window.atlasDebugLog()</code>
      </div>
    </div>
  );
}

function btnStyle(variant: "primary" | "secondary" | "danger"): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "7px 14px", borderRadius: 7, cursor: "pointer",
    fontSize: 11, fontWeight: 600, ...mono,
    letterSpacing: "0.05em", border: "1px solid",
    transition: "opacity 150ms ease",
  };
  if (variant === "primary") {
    return { ...base, background: "rgba(201,162,76,0.12)", borderColor: "rgba(201,162,76,0.4)", color: "var(--atlas-gold)" };
  }
  if (variant === "danger") {
    return { ...base, background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)", color: "rgba(252,165,165,0.8)" };
  }
  return { ...base, background: "rgba(255,255,255,0.04)", borderColor: "var(--atlas-border)", color: "var(--atlas-muted)" };
}
