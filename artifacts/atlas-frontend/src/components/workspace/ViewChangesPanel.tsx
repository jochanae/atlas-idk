// ViewChangesPanel — unified "What changed?" surface.
//
// Layout:
//   [run pill]  (only when runId prop is set)
//   Toggle:  Timeline | Changes
//   Body:
//     • Timeline lens → SessionTimeline (filtered when runId tags match)
//     • Changes lens  → per-file rows built from message fileEdits/linePatches
//   GitHub / Workspace block (unchanged behavior)
//
// Frontend-only. No new transport. If runId is set but no messages carry it,
// we show the pill + an honest "No entries tagged for this run yet." hint
// above the unfiltered list rather than pretending the view is filtered.

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderGit2, X, FileCode2 } from "lucide-react";
import { SessionTimeline, type TimelineMessage } from "@/components/workspace/SessionTimeline";
import { RunCard, dismissActiveRun, patchActiveRun, useAllRuns, type ActiveRun } from "@/components/home/ActiveRuns";
import type { PushRecord, LinkedRepo } from "@/pages/workspace";

// ── Shared badge logic (mirrors WorkspaceFilesPanel) ─────────────────────────

function gitBadge(code: string): { label: string; color: string } | null {
  if (!code) return null;
  const x = code[0] ?? " ";
  const y = code[1] ?? " ";
  if (x === "?" && y === "?") return { label: "?", color: "rgba(180,180,180,0.65)" };
  if (x === "A" || y === "A") return { label: "A", color: "rgba(100,200,120,0.85)" };
  if (x === "D" || y === "D") return { label: "D", color: "rgba(220,80,80,0.8)" };
  if (x === "M" || y === "M") return { label: "M", color: "rgba(201,162,76,0.9)" };
  if (x === "R" || y === "R") return { label: "R", color: "rgba(140,160,220,0.85)" };
  return { label: code.trim().slice(0, 1) || "~", color: "rgba(180,180,180,0.7)" };
}

// ── Workspace (local git status) ─────────────────────────────────────────────

function WorkspaceBlock({ projectId }: { projectId: number }) {
  const { data, isLoading } = useQuery<{ files: Record<string, string>; hasRemote?: boolean }>({
    queryKey: ["vcp-gitstatus", projectId],
    queryFn: () =>
      fetch(`/api/fs/${projectId}/gitstatus`, { credentials: "include" }).then((r) => r.json()),
    staleTime: 10_000,
  });

  const files = data?.files ?? {};
  const entries = Object.entries(files);

  return (
    <div style={{ padding: "10px 14px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 9.5, fontFamily: "var(--app-font-mono)",
        color: "var(--atlas-gold)", letterSpacing: "0.14em",
        textTransform: "uppercase", opacity: 0.7, paddingBottom: 4,
      }}>
        <FolderGit2 size={11} strokeWidth={1.7} />
        <span>Workspace</span>
        {entries.length > 0 && (
          <span style={{
            fontSize: 9, background: "rgba(201,162,76,0.14)",
            color: "rgba(201,162,76,0.9)", border: "1px solid rgba(201,162,76,0.22)",
            borderRadius: 3, padding: "1px 5px",
          }}>{entries.length}</span>
        )}
      </div>
      {isLoading && (
        <div style={{ fontSize: 11.5, color: "var(--atlas-muted)", opacity: 0.5 }}>
          Checking workspace…
        </div>
      )}
      {!isLoading && entries.length === 0 && (
        <div style={{ fontSize: 11.5, color: "var(--atlas-muted)", opacity: 0.45, lineHeight: 1.55 }}>
          {data ? "Workspace is clean — no local changes." : "Not a git repo, or no workspace yet."}
        </div>
      )}
      {entries.length > 0 && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {entries.map(([filePath, code]) => {
              const badge = gitBadge(code);
              return (
                <div key={filePath} style={{
                  display: "flex", alignItems: "center", gap: 7,
                  fontSize: 11.5, fontFamily: "var(--app-font-mono)",
                  color: "var(--atlas-fg)", opacity: 0.8,
                }}>
                  {badge && (
                    <span style={{
                      color: badge.color, flexShrink: 0,
                      width: 10, textAlign: "center", fontWeight: 700, fontSize: 11,
                    }}>{badge.label}</span>
                  )}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {filePath}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{
            fontSize: 10.5, color: "var(--atlas-muted)", opacity: 0.45,
            fontFamily: "var(--app-font-sans)", lineHeight: 1.5, paddingTop: 2,
          }}>
            Commit & push from the Files tab → Workspace.
          </div>
        </>
      )}
    </div>
  );
}

// ── Changes lens: per-file rows from messages ────────────────────────────────

interface FileRow {
  path: string;
  summary: string;
  messageId: number | string;
  projectId: number;
}

function collectFileRows(messages: TimelineMessage[]): FileRow[] {
  const rows: FileRow[] = [];
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const mid = m.id ?? `${m.sentAt ?? Math.random()}`;
    if (m.fileEdit?.path) {
      rows.push({ path: m.fileEdit.path, summary: "rewrote file", messageId: mid, projectId: 0 });
    }
    if (m.fileEdits) {
      for (const fe of m.fileEdits) rows.push({ path: fe.path, summary: "rewrote file", messageId: mid, projectId: 0 });
    }
    if (m.linePatches) {
      for (const lp of m.linePatches) rows.push({ path: lp.path, summary: "patched lines", messageId: mid, projectId: 0 });
    }
  }
  return rows.reverse(); // newest first
}

function ChangesLens({ rows, projectId }: { rows: FileRow[]; projectId: number }) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: "18px 14px", fontSize: 11.5, color: "var(--atlas-muted)", opacity: 0.5 }}>
        No file changes recorded for this session yet.
      </div>
    );
  }
  return (
    <div style={{ padding: "10px 12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map((r, i) => (
        <div key={`${r.messageId}-${r.path}-${i}`} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 10px", borderRadius: 5,
          border: "1px solid rgba(201,162,76,0.08)",
          background: "rgba(255,255,255,0.015)",
        }}>
          <FileCode2 size={12} strokeWidth={1.6} style={{ color: "rgba(201,162,76,0.6)", flexShrink: 0 }} />
          <span style={{
            flex: 1, minWidth: 0,
            fontFamily: "var(--app-font-mono)", fontSize: 11.5,
            color: "var(--atlas-fg)", opacity: 0.9,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{r.path}</span>
          <span style={{
            fontSize: 10.5, color: "var(--atlas-muted)", opacity: 0.6,
            fontFamily: "var(--app-font-sans)", flexShrink: 0,
          }}>{r.summary}</span>
          <a
            href={`/api/fs/${projectId}/preview?path=${encodeURIComponent(r.path)}`}
            target="_blank" rel="noopener noreferrer"
            style={{
              fontFamily: "var(--app-font-mono)", fontSize: 9.5, letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "3px 7px", borderRadius: 3,
              border: "1px solid rgba(201,162,76,0.3)",
              color: "rgba(201,162,76,0.9)", textDecoration: "none",
              flexShrink: 0,
            }}
          >Open</a>
        </div>
      ))}
    </div>
  );
}

// ── Run receipt: existing RunCard mounted on the Changes surface ─────────────

function WorkspaceRunCards({ projectId, runId }: { projectId: number; runId?: string | null }) {
  const runs = useAllRuns();
  const [retryingFiles, setRetryingFiles] = useState<Set<string>>(new Set());
  const [retryErrors, setRetryErrors] = useState<Map<string, string>>(new Map());

  const visibleRuns = useMemo(() => {
    const projectRuns = runs.filter((r) => r.projectId === projectId);
    if (runId) return projectRuns.filter((r) => r.id === runId);
    return projectRuns.slice(0, 3);
  }, [projectId, runId, runs]);

  const handleForceApply = useCallback(async (run: ActiveRun, filePath: string) => {
    const fileEdit = run.fileEdits?.find((fe) => fe.path === filePath);
    if (!fileEdit) return;
    const key = `${run.id}:${filePath}`;

    setRetryingFiles((prev) => new Set(prev).add(key));
    setRetryErrors((prev) => { const m = new Map(prev); m.delete(key); return m; });

    try {
      const res = await fetch("/api/github/apply-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ files: [fileEdit], projectId: run.projectId }),
      });

      if (res.ok) {
        patchActiveRun(run.id, {
          applyErrors: (run.applyErrors ?? []).filter((ae) => ae.path !== filePath),
          appliedFiles: [...(run.appliedFiles ?? []), filePath],
        });
      } else {
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        setRetryErrors((prev) => new Map(prev).set(key, `Apply failed (${res.status}): ${errBody.error ?? "Server error"}`));
      }
    } catch (err) {
      setRetryErrors((prev) => new Map(prev).set(key, `Apply failed: ${err instanceof Error ? err.message : String(err)}`));
    } finally {
      setRetryingFiles((prev) => { const s = new Set(prev); s.delete(key); return s; });
    }
  }, []);

  if (visibleRuns.length === 0) return null;

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 6,
      padding: "10px 14px",
      borderBottom: "1px solid rgba(201,162,76,0.08)",
    }}>
      {visibleRuns.map((run) => (
        <RunCard
          key={run.id}
          run={run}
          onEnter={() => {}}
          onDismiss={() => dismissActiveRun(run.id)}
          retryingFiles={retryingFiles}
          retryErrors={retryErrors}
          onForceApply={handleForceApply}
        />
      ))}
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

interface Props {
  projectId: number;
  linkedRepo: LinkedRepo | null;
  messages: TimelineMessage[];
  pushHistory: PushRecord[];
  onRollbackPush: (record: PushRecord) => Promise<void>;
  runId?: string | null;
}

export function ViewChangesPanel({
  projectId,
  linkedRepo: _linkedRepo,
  messages,
  pushHistory,
  onRollbackPush,
  runId,
}: Props) {
  const [lens, setLens] = useState<"timeline" | "changes">("timeline");

  // Filter contract: if runId is set AND at least one message carries it,
  // filter honestly. Otherwise show the pill + hint and render unfiltered.
  const { filteredMessages, filteredActive, showEmptyHint } = useMemo(() => {
    if (!runId) return { filteredMessages: messages, filteredActive: false, showEmptyHint: false };
    const hits = messages.filter((m) => (m as { runId?: string }).runId === runId);
    if (hits.length > 0) return { filteredMessages: hits, filteredActive: true, showEmptyHint: false };
    return { filteredMessages: messages, filteredActive: false, showEmptyHint: true };
  }, [messages, runId]);

  const changeRows = useMemo(() => collectFileRows(filteredMessages), [filteredMessages]);

  const clearRunFilter = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("runId");
      window.history.replaceState({}, "", url.toString());
      // Nudge a re-render by forcing local state change; parent re-reads on next nav.
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {}
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      minHeight: "100%",
      fontFamily: "var(--app-font-sans)", color: "var(--atlas-fg)",
    }}>
      {/* ── Run pill ── */}
      {runId && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px",
          borderBottom: "1px solid rgba(201,162,76,0.1)",
          background: "rgba(201,162,76,0.04)",
        }}>
          <span style={{
            fontSize: 9.5, fontFamily: "var(--app-font-mono)",
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--atlas-gold)", opacity: 0.75,
          }}>Viewing run</span>
          <span style={{
            fontFamily: "var(--app-font-mono)", fontSize: 11,
            color: "var(--atlas-fg)", opacity: 0.85,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            flex: 1, minWidth: 0,
          }}>{runId}</span>
          <button
            type="button"
            onClick={clearRunFilter}
            aria-label="Clear run filter"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "transparent", border: "1px solid rgba(201,162,76,0.25)",
              color: "var(--atlas-muted)", cursor: "pointer",
              padding: "3px 7px", borderRadius: 3,
              fontFamily: "var(--app-font-mono)", fontSize: 9.5,
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}
          ><X size={10} strokeWidth={1.8} /> Clear</button>
        </div>
      )}

      <WorkspaceRunCards projectId={projectId} runId={runId} />

      {/* ── Toggle ── */}
      <div style={{
        display: "flex", padding: "10px 14px 8px", gap: 4,
        borderBottom: "1px solid rgba(201,162,76,0.08)",
      }}>
        {(["timeline", "changes"] as const).map((k) => {
          const active = lens === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setLens(k)}
              style={{
                fontFamily: "var(--app-font-mono)", fontSize: 10,
                letterSpacing: "0.12em", textTransform: "uppercase",
                padding: "5px 11px", borderRadius: 4,
                background: active ? "rgba(201,162,76,0.14)" : "transparent",
                border: `1px solid ${active ? "rgba(201,162,76,0.35)" : "rgba(201,162,76,0.12)"}`,
                color: active ? "var(--atlas-gold)" : "var(--atlas-muted)",
                cursor: "pointer",
              }}
            >{k}</button>
          );
        })}
      </div>

      {/* ── Honest fallback hint ── */}
      {showEmptyHint && (
        <div style={{
          padding: "8px 14px",
          fontSize: 11, color: "var(--atlas-muted)", opacity: 0.65,
          fontFamily: "var(--app-font-sans)", lineHeight: 1.5,
          borderBottom: "1px solid rgba(201,162,76,0.06)",
          background: "rgba(255,255,255,0.01)",
        }}>
          No entries tagged for this run yet. Showing all recent activity.
        </div>
      )}

      {/* ── Body ── */}
      {lens === "timeline" ? (
        <SessionTimeline
          messages={filteredMessages}
          pushHistory={filteredActive ? [] : pushHistory}
          onRollbackPush={onRollbackPush}
          projectId={projectId}
        />
      ) : (
        <ChangesLens rows={changeRows} projectId={projectId} />
      )}

      {/* ── Workspace / GitHub block ── */}
      <div style={{ borderTop: "1px solid rgba(201,162,76,0.08)", marginTop: "auto" }}>
        <WorkspaceBlock projectId={projectId} />
      </div>
    </div>
  );
}
