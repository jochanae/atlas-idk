// ViewChangesPanel — unified "What changed?" surface.
//
// Layout:
//   [run pill]  (only when runId prop is set)
//   Toggle:  Timeline | Changes
//   Body:
//     • Timeline lens → RunTimeline (reads from execution_run_steps via useProjectRuns)
//     • Changes lens  → per-file rows from DB-backed execution_run_steps
//   GitHub / Workspace block
//
// One run = one durable record. Both lenses read from the same execution_run_steps
// rows — Timeline shows process steps (THOUGHT/READ/SEARCH/INSPECT/SUMMARY),
// Changes shows outcome steps (FILE_EDIT/LINE_PATCH/FILE_DELETE).

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FolderGit2, X, FileCode2, Eye, Search, Folder,
  Lightbulb, Trash2, CheckCircle2, ChevronDown, Scale, AlertTriangle,
} from "lucide-react";
import type { TimelineMessage } from "@/components/workspace/SessionTimeline";
import { useProjectRuns, type ApiRun, type ApiRunStep } from "@/hooks/useProjectRuns";
import type { PushRecord, LinkedRepo } from "@/pages/workspace";

// ── Decision entry (subset of Entry schema we need for the Decisions lens) ────
interface DecisionEntry {
  id: number;
  title: string;
  summary?: string | null;
  mode?: string | null;
  verb?: string | null;
  severity: string;
  status: string;
  sourceMessageId?: number | null;
  createdAt: string;
}

// ── Relative time (seconds → minutes → hours → days → date) ───────────────────
function formatAgo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(Date.now() - ms).toLocaleDateString();
}

// ── Shared badge logic ────────────────────────────────────────────────────────

function gitBadge(code: string): { label: string; color: string } | null {
  if (!code) return null;
  const x = code[0] ?? " ";
  const y = code[1] ?? " ";
  if (x === "?" && y === "?") return { label: "?", color: "rgba(180,180,180,0.65)" };
  if (x === "A" || y === "A") return { label: "A", color: "rgba(100,200,120,0.85)" };
  if (x === "D" || y === "D") return { label: "D", color: "rgba(220,80,80,0.8)" };
  if (x === "M" || y === "M") return { label: "M", color: "rgba(var(--atlas-gold-rgb), 0.9)" };
  if (x === "R" || y === "R") return { label: "R", color: "rgba(140,160,220,0.85)" };
  return { label: code.trim().slice(0, 1) || "~", color: "rgba(180,180,180,0.7)" };
}

// ── Workspace (local git status) ─────────────────────────────────────────────

function WorkspaceBlock({ projectId }: { projectId: number }) {
  const { data, isLoading } = useQuery<{ files: Record<string, string>; hasRemote?: boolean }>({
    queryKey: ["vcp-gitstatus", projectId],
    queryFn: () =>
      fetch(`/api/fs/${projectId}/gitstatus`, { credentials: "include" }).then((r) => r.json()),
    // Phase 3: stretched from 10 s → 30 s to match the rest of the run-data
    // refresh budget; window-focus refetches removed since git status changes
    // are captured when Atlas actually writes files, not on tab-switch.
    staleTime: 30_000,
    refetchOnWindowFocus: false,
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
            fontSize: 9, background: "rgba(var(--atlas-gold-rgb), 0.14)",
            color: "rgba(var(--atlas-gold-rgb), 0.9)", border: "1px solid rgba(var(--atlas-gold-rgb), 0.22)",
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

// ── Changes lens: per-file rows from DB-backed execution_run_steps ─────────────

interface FileRow {
  path: string;
  summary: string;
  messageId: number | string;
  projectId: number;
  content?: string | null;
}

// ── Compact receipt pill (replaces the old expandable RunCard on this surface) ─
function summarizeRun(run: ApiRun): { tag: string; line: string } {
  const filePaths = run.steps
    .filter((s) => s.verb === "FILE_EDIT" || s.verb === "FILE_DELETE" || s.verb === "LINE_PATCH")
    .map((s) => s.target)
    .filter((t): t is string => !!t);
  const hasGithubPush = run.steps.some((s) => s.verb === "GITHUB_PUSH");
  const hasImageGen = run.steps.some((s) => s.verb === "IMAGE_GEN");

  let tag = "BUILD";
  if (hasImageGen && filePaths.length === 0 && !hasGithubPush) tag = "THINK";
  else if (hasGithubPush && filePaths.length === 0) tag = "PUSH";

  let line: string;
  if (filePaths.length > 0) {
    const uniq = Array.from(new Set(filePaths));
    const names = uniq.slice(0, 2).map((p) => p.split("/").pop() ?? p);
    const suffix = uniq.length > 2 ? `, +${uniq.length - 2} more` : "";
    line = `${uniq.length} file${uniq.length !== 1 ? "s" : ""} written — ${names.join(", ")}${suffix}`;
  } else if (hasGithubPush) line = "GitHub push";
  else if (hasImageGen) line = "Image generated";
  else line = run.summary ?? "Build run";

  return { tag, line };
}

function RunReceiptPill({
  run, projectName, onClick, selected,
}: {
  run: ApiRun; projectName: string; onClick?: () => void; selected?: boolean;
}) {
  const { tag, line } = summarizeRun(run);
  const failed = run.status === "failed";
  const running = run.status === "running";
  const dotColor = failed
    ? "rgba(220,80,80,0.9)"
    : running
    ? "rgba(var(--atlas-gold-rgb), 0.9)"
    : "rgba(100,200,120,0.9)";
  const started = new Date(run.startedAt).getTime();
  const anchor = run.completedAt ? new Date(run.completedAt).getTime() : started;
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px",
        borderRadius: 6,
        background: selected ? "rgba(var(--atlas-gold-rgb), 0.07)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${selected ? "rgba(var(--atlas-gold-rgb), 0.3)" : "rgba(var(--atlas-gold-rgb), 0.12)"}`,
        borderLeft: `2px solid ${dotColor}`,
        cursor: onClick ? "pointer" : "default",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span
        aria-hidden
        style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, boxShadow: `0 0 6px ${dotColor}`, flexShrink: 0 }}
      />
      <span
        style={{
          fontFamily: "var(--app-font-mono)", fontSize: 9.5,
          letterSpacing: "0.14em", textTransform: "uppercase",
          padding: "2px 6px", borderRadius: 3,
          background: "rgba(var(--atlas-gold-rgb), 0.1)", color: "var(--atlas-gold)",
          border: "1px solid rgba(var(--atlas-gold-rgb), 0.22)", flexShrink: 0,
        }}
      >{tag}</span>
      <span style={{
        fontSize: 12, color: "var(--atlas-fg)", opacity: 0.9,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        flex: 1, minWidth: 0,
      }}>
        <span style={{ opacity: 0.65 }}>{projectName}</span>
        <span style={{ opacity: 0.4, margin: "0 6px" }}>·</span>
        <span>{line}</span>
      </span>
      <span style={{
        fontSize: 10.5, fontFamily: "var(--app-font-mono)",
        color: "var(--atlas-muted)", opacity: 0.6, flexShrink: 0,
      }}>{formatAgo(Date.now() - anchor)}</span>
      {onClick && (
        <span style={{ fontSize: 9, color: "var(--atlas-muted)", opacity: 0.4, flexShrink: 0, fontFamily: "var(--app-font-mono)" }}>›</span>
      )}
    </div>
  );
}

function collectFileRows(messages: TimelineMessage[]): FileRow[] {
  const rows: FileRow[] = [];
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const mid = m.id ?? `${m.sentAt ?? Math.random()}`;
    if (m.fileEdit?.path) {
      rows.push({ path: m.fileEdit.path, summary: "rewrote file", messageId: mid, projectId: 0, content: (m.fileEdit as { content?: string }).content ?? null });
    }
    if (m.fileEdits) {
      for (const fe of m.fileEdits) rows.push({ path: fe.path, summary: "rewrote file", messageId: mid, projectId: 0, content: (fe as { content?: string }).content ?? null });
    }
    if (m.linePatches) {
      for (const lp of m.linePatches) rows.push({ path: lp.path, summary: "patched lines", messageId: mid, projectId: 0, content: null });
    }
  }
  return rows.reverse();
}

function FileContentBlock({ content }: { content: string }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [content]);
  return (
    <pre ref={ref} style={{
      margin: "6px 0 0", padding: "10px 12px",
      borderRadius: 4,
      background: "rgba(0,0,0,0.35)",
      border: "1px solid rgba(var(--atlas-gold-rgb), 0.1)",
      fontFamily: "var(--app-font-mono)", fontSize: 10.5,
      color: "rgba(220,220,200,0.82)", lineHeight: 1.6,
      overflowX: "auto", overflowY: "auto",
      maxHeight: 320, whiteSpace: "pre", wordBreak: "normal",
    }}>{content}</pre>
  );
}

function ChangesLens({ rows, projectId }: { rows: FileRow[]; projectId: number }) {
  // Auto-expand the first file when there are ≤3 files and content exists.
  const firstKey = rows.length > 0 ? `${rows[0].messageId}-${rows[0].path}-0` : null;
  const autoExpand = rows.length <= 3 && !!rows[0]?.content;
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => autoExpand && firstKey ? new Set([firstKey]) : new Set()
  );

  if (rows.length === 0) {
    return (
      <div style={{ padding: "18px 14px", fontSize: 11.5, color: "var(--atlas-muted)", opacity: 0.5 }}>
        No file changes recorded for this run yet.
      </div>
    );
  }
  return (
    <div style={{ padding: "10px 12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map((r, i) => {
        const key = `${r.messageId}-${r.path}-${i}`;
        const isExpanded = expandedPaths.has(key);
        const hasContent = !!r.content;
        const toggle = () => {
          if (!hasContent) return;
          setExpandedPaths((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
          });
        };
        return (
          <div key={key} style={{
            borderRadius: 5,
            border: `1px solid ${isExpanded ? "rgba(var(--atlas-gold-rgb), 0.22)" : "rgba(var(--atlas-gold-rgb), 0.08)"}`,
            background: isExpanded ? "rgba(var(--atlas-gold-rgb), 0.04)" : "rgba(255,255,255,0.015)",
            overflow: "hidden",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 10px",
              cursor: hasContent ? "pointer" : "default",
            }}
              onClick={toggle}
            >
              <FileCode2 size={12} strokeWidth={1.6} style={{ color: "rgba(var(--atlas-gold-rgb), 0.6)", flexShrink: 0 }} />
              <span style={{
                flex: 1, minWidth: 0,
                fontFamily: "var(--app-font-mono)", fontSize: 11.5,
                color: "var(--atlas-fg)", opacity: 0.9,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{r.path}</span>
              <span style={{
                fontSize: 10, color: "var(--atlas-muted)", opacity: 0.55,
                fontFamily: "var(--app-font-sans)", flexShrink: 0,
                fontStyle: "italic",
              }}>{r.summary}</span>
              {hasContent && (
                <button
                  type="button"
                  onClick={toggle}
                  style={{
                    fontFamily: "var(--app-font-mono)", fontSize: 9.5, letterSpacing: "0.08em",
                    textTransform: "uppercase", flexShrink: 0,
                    background: isExpanded ? "rgba(var(--atlas-gold-rgb), 0.14)" : "transparent",
                    border: `1px solid rgba(var(--atlas-gold-rgb), ${isExpanded ? "0.35" : "0.2"})`,
                    color: `rgba(var(--atlas-gold-rgb), ${isExpanded ? "1" : "0.7"})`,
                    borderRadius: 3, padding: "2px 7px", cursor: "pointer",
                  }}
                >{isExpanded ? "▲ Hide" : "▼ View"}</button>
              )}
            </div>
            {isExpanded && r.content && (
              <div style={{ padding: "0 10px 10px" }}>
                <FileContentBlock content={r.content} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── RunTimeline: durable execution trace from execution_run_steps ─────────────

const TIMELINE_VERBS = new Set([
  "THOUGHT", "FILE_READ", "SEARCH", "INSPECT",
  "FILE_EDIT", "LINE_PATCH", "FILE_DELETE", "SUMMARY",
]);
const EXPANDABLE_VERBS = new Set(["THOUGHT", "FILE_EDIT", "SUMMARY"]);
const ALWAYS_OPEN_VERBS = new Set(["SUMMARY"]);

function stepColor(verb: string): string {
  const MAP: Record<string, string> = {
    THOUGHT:    "rgba(147,130,220,0.85)",
    FILE_READ:  "rgba(100,170,220,0.85)",
    SEARCH:     "rgba(100,200,180,0.85)",
    INSPECT:    "rgba(180,160,100,0.85)",
    FILE_EDIT:  "rgba(var(--atlas-gold-rgb), 0.95)",
    LINE_PATCH: "rgba(var(--atlas-gold-rgb), 0.75)",
    FILE_DELETE:"rgba(220,80,80,0.85)",
    SUMMARY:    "rgba(100,200,120,0.85)",
  };
  return MAP[verb] ?? "rgba(180,180,180,0.75)";
}

function stepLabel(verb: string, detail?: string | null): string {
  if (verb === "THOUGHT" && detail && /^\d+s$/.test(detail)) {
    return `Thought for ${detail}`;
  }
  const MAP: Record<string, string> = {
    THOUGHT: "Thought", FILE_READ: "Read", SEARCH: "Search",
    INSPECT: "Inspect", FILE_EDIT: "Edited", LINE_PATCH: "Patched",
    FILE_DELETE: "Deleted", SUMMARY: "Summary",
  };
  return MAP[verb] ?? verb;
}

function StepIcon({ verb }: { verb: string }) {
  const p = { size: 11, strokeWidth: 1.6 } as const;
  if (verb === "THOUGHT")    return <Lightbulb    {...p} />;
  if (verb === "FILE_READ")  return <Eye          {...p} />;
  if (verb === "SEARCH")     return <Search       {...p} />;
  if (verb === "INSPECT")    return <Folder       {...p} />;
  if (verb === "FILE_EDIT")  return <FileCode2    {...p} />;
  if (verb === "LINE_PATCH") return <FileCode2    {...p} />;
  if (verb === "FILE_DELETE")return <Trash2       {...p} />;
  if (verb === "SUMMARY")    return <CheckCircle2 {...p} />;
  return null;
}

function RunTimelineItem({ step, isLast }: { step: ApiRunStep; isLast: boolean }) {
  const color = stepColor(step.verb);
  const canExpand = EXPANDABLE_VERBS.has(step.verb) && !!step.content;
  const alwaysOpen = ALWAYS_OPEN_VERBS.has(step.verb);
  const [open, setOpen] = useState(alwaysOpen);

  const isTextVerb = step.verb === "THOUGHT" || step.verb === "SUMMARY";
  const showTarget = !isTextVerb && step.verb !== "INSPECT" && !!step.target;

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      {/* Hairline trace + dot */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        flexShrink: 0, width: 18, paddingTop: 8,
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: color, boxShadow: `0 0 5px ${color}`,
        }} />
        {!isLast && (
          <div style={{
            width: 1, flex: 1, minHeight: 10,
            background: "rgba(var(--atlas-gold-rgb), 0.1)", marginTop: 3,
          }} />
        )}
      </div>

      {/* Step body */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 4 }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 5,
            cursor: canExpand && !alwaysOpen ? "pointer" : "default",
            paddingTop: 4,
          }}
          onClick={() => canExpand && !alwaysOpen && setOpen((o) => !o)}
        >
          <span style={{ color, flexShrink: 0 }}>
            <StepIcon verb={step.verb} />
          </span>
          <span style={{
            fontSize: 9.5, fontFamily: "var(--app-font-mono)",
            letterSpacing: "0.11em", textTransform: "uppercase",
            color, flexShrink: 0, opacity: 0.9,
          }}>
            {stepLabel(step.verb, step.detail)}
          </span>
          {showTarget && (
            <span style={{
              fontFamily: "var(--app-font-mono)", fontSize: 11,
              color: "var(--atlas-fg)", opacity: 0.8,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              flex: 1, minWidth: 0,
            }}>{step.target}</span>
          )}
          {canExpand && !alwaysOpen && (
            <span style={{
              fontSize: 9, color: "rgba(var(--atlas-gold-rgb), 0.45)",
              fontFamily: "var(--app-font-mono)", flexShrink: 0, marginLeft: "auto",
            }}>{open ? "▲" : "▼"}</span>
          )}
        </div>

        {(open || alwaysOpen) && step.content && (
          <pre style={{
            margin: "4px 0 2px", padding: "8px 10px", borderRadius: 4,
            background: "rgba(0,0,0,0.22)",
            border: `1px solid ${color.replace(/[\d.]+\)$/, "0.12)")}`,
            fontFamily: isTextVerb ? "var(--app-font-sans)" : "var(--app-font-mono)",
            fontSize: isTextVerb ? 11.5 : 10.5,
            color: "rgba(220,220,200,0.82)", lineHeight: 1.65,
            overflowX: "auto", overflowY: "auto",
            maxHeight: step.verb === "THOUGHT" ? 200 : 320,
            whiteSpace: isTextVerb ? "pre-wrap" : "pre",
            wordBreak: isTextVerb ? "break-word" : "normal",
          }}>{step.content}</pre>
        )}
      </div>
    </div>
  );
}

function RunTimeline({ steps }: { steps: ApiRunStep[] }) {
  const visible = steps.filter((s) => TIMELINE_VERBS.has(s.verb));

  if (visible.length === 0) {
    const hasLegacy = steps.some((s) =>
      s.verb === "FILE_EDIT" || s.verb === "LINE_PATCH" || s.verb === "FILE_DELETE"
    );
    return (
      <div style={{
        padding: "18px 14px", fontSize: 11.5,
        color: "var(--atlas-muted)", opacity: 0.5, lineHeight: 1.65,
      }}>
        {hasLegacy
          ? "Execution trace not available — this run predates step capture. See Changes tab for what was written."
          : "No execution steps recorded for this run."}
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 10px 14px", display: "flex", flexDirection: "column" }}>
      {visible.map((step, i) => (
        <RunTimelineItem key={`${step.id}-${i}`} step={step} isLast={i === visible.length - 1} />
      ))}
    </div>
  );
}

// ── Run receipt list: collapsible section (collapsed by default) ──────────────

function WorkspaceRunReceipts({
  projectId,
  projectName,
  runId,
  onSelectRun,
}: {
  projectId: number;
  projectName: string;
  runId?: string | null;
  onSelectRun?: (id: string) => void;
}) {
  const { runs: apiRuns } = useProjectRuns(projectId);
  const [expanded, setExpanded] = useState(false);

  const visibleRuns = useMemo((): ApiRun[] => {
    if (runId) return apiRuns.filter((r) => r.id === runId);
    return apiRuns.slice(0, 5);
  }, [apiRuns, runId]);

  if (visibleRuns.length === 0) return null;

  return (
    <div style={{ borderBottom: "1px solid rgba(var(--atlas-gold-rgb), 0.08)" }}>
      {/* Section header — tap to expand/collapse */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          width: "100%", padding: "8px 14px",
          background: "transparent", border: "none", cursor: "pointer",
          textAlign: "left", WebkitTapHighlightColor: "transparent",
        }}
      >
        <span style={{
          fontSize: 9.5, fontFamily: "var(--app-font-mono)",
          letterSpacing: "0.14em", textTransform: "uppercase",
          color: "var(--atlas-gold)", opacity: 0.7,
        }}>Builds</span>
        <span style={{
          fontSize: 9, background: "rgba(var(--atlas-gold-rgb), 0.12)",
          color: "rgba(var(--atlas-gold-rgb), 0.8)", border: "1px solid rgba(var(--atlas-gold-rgb), 0.2)",
          borderRadius: 3, padding: "1px 5px",
          fontFamily: "var(--app-font-mono)",
        }}>{visibleRuns.length}</span>
        <ChevronDown
          size={11} strokeWidth={1.6}
          style={{
            color: "var(--atlas-muted)", opacity: 0.45, marginLeft: "auto",
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 150ms ease",
          }}
          aria-hidden
        />
      </button>

      {expanded && (
        <div style={{ padding: "0 14px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
          {visibleRuns.map((run) => (
            <RunReceiptPill
              key={run.id}
              run={run}
              projectName={projectName}
              selected={!!runId && run.id === runId}
              onClick={onSelectRun ? () => onSelectRun(run.id) : undefined}
            />
          ))}
        </div>
      )}
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
  projectName?: string | null;
}

export function ViewChangesPanel({
  projectId,
  linkedRepo: _linkedRepo,
  messages,
  pushHistory: _pushHistory,
  onRollbackPush: _onRollbackPush,
  runId,
  projectName,
}: Props) {
  const [lens, setLens] = useState<"timeline" | "changes">("timeline");
  const [lensAutoSet, setLensAutoSet] = useState(false);
  const { runs: dbRuns } = useProjectRuns(projectId);

  // Timeline lens: find the target run (specific runId, or most recent).
  const timelineRun = useMemo<ApiRun | null>(() => {
    if (runId) return dbRuns.find((r) => r.id === runId) ?? null;
    return dbRuns[0] ?? null;
  }, [dbRuns, runId]);

  // Auto-select "changes" only when there are truly no timeline-able steps at all.
  // FILE_EDIT, LINE_PATCH, etc. all render in the timeline — don't force "changes" just
  // because THOUGHT is absent (THOUGHT steps are not always written).
  useEffect(() => {
    if (!timelineRun || lensAutoSet) return;
    const hasAnyTimelineStep = timelineRun.steps.some((s) => TIMELINE_VERBS.has(s.verb));
    if (!hasAnyTimelineStep) setLens("changes");
    setLensAutoSet(true);
  }, [timelineRun, lensAutoSet]);

  // Reset auto-set when the viewed run changes.
  useEffect(() => {
    setLensAutoSet(false);
    setLens("timeline");
  }, [runId]);

  // Changes lens: in-memory message fallback for paths not yet in the DB.
  const filteredMessages = useMemo(() => {
    if (!runId) return messages;
    const hits = messages.filter((m) => {
      const tagged = (m as { runId?: string; run_id?: string }).runId
        ?? (m as { runId?: string; run_id?: string }).run_id;
      return tagged === runId;
    });
    return hits.length > 0 ? hits : messages;
  }, [messages, runId]);

  // Changes lens: DB-backed file rows, supplemented by in-memory fallback.
  const changeRows = useMemo(() => {
    const dbRows: FileRow[] = [];
    const seenPaths = new Set<string>();
    for (const run of dbRuns) {
      if (runId && run.id !== runId) continue;
      for (const step of run.steps) {
        if (
          (step.verb === "FILE_EDIT" || step.verb === "LINE_PATCH" || step.verb === "FILE_DELETE") &&
          step.target && !seenPaths.has(step.target)
        ) {
          seenPaths.add(step.target);
          dbRows.push({
            path: step.target,
            summary: step.verb === "FILE_DELETE" ? "deleted"
              : step.verb === "LINE_PATCH" ? "patched lines"
              : "rewrote file",
            messageId: run.id,
            projectId,
            content: step.content ?? null,
          });
        }
      }
    }
    const msgRows = collectFileRows(filteredMessages).filter((r) => !seenPaths.has(r.path));
    return [...dbRows, ...msgRows];
  }, [dbRuns, filteredMessages, runId, projectId]);

  const clearRunFilter = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("runId");
      window.history.replaceState({}, "", url.toString());
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {}
  };

  const setRunFilter = (id: string) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("runId", id);
      window.history.replaceState({}, "", url.toString());
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {}
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", minHeight: "100%",
      fontFamily: "var(--app-font-sans)", color: "var(--atlas-fg)",
    }}>
      {/* ── Run pill ── */}
      {runId && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px",
          borderBottom: "1px solid rgba(var(--atlas-gold-rgb), 0.1)",
          background: "rgba(var(--atlas-gold-rgb), 0.04)",
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
            type="button" onClick={clearRunFilter} aria-label="Clear run filter"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "transparent", border: "1px solid rgba(var(--atlas-gold-rgb), 0.25)",
              color: "var(--atlas-muted)", cursor: "pointer",
              padding: "3px 7px", borderRadius: 3,
              fontFamily: "var(--app-font-mono)", fontSize: 9.5,
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}
          ><X size={10} strokeWidth={1.8} /> Clear</button>
        </div>
      )}

      <WorkspaceRunReceipts
        projectId={projectId}
        projectName={projectName?.trim() || "Workspace"}
        runId={runId}
        onSelectRun={setRunFilter}
      />

      {/* ── Toggle ── */}
      <div style={{
        display: "flex", padding: "10px 14px 8px", gap: 4,
        borderBottom: "1px solid rgba(var(--atlas-gold-rgb), 0.08)",
      }}>
        {(["timeline", "changes"] as const).map((k) => {
          const active = lens === k;
          return (
            <button
              key={k} type="button" onClick={() => setLens(k)}
              style={{
                fontFamily: "var(--app-font-mono)", fontSize: 10,
                letterSpacing: "0.12em", textTransform: "uppercase",
                padding: "5px 11px", borderRadius: 4,
                background: active ? "rgba(var(--atlas-gold-rgb), 0.14)" : "transparent",
                border: `1px solid ${active ? "rgba(var(--atlas-gold-rgb), 0.35)" : "rgba(var(--atlas-gold-rgb), 0.12)"}`,
                color: active ? "var(--atlas-gold)" : "var(--atlas-muted)",
                cursor: "pointer",
              }}
            >{k}</button>
          );
        })}
      </div>

      {/* ── Body ── */}
      {lens === "timeline" ? (
        timelineRun ? (
          <RunTimeline steps={timelineRun.steps} />
        ) : (
          <div style={{
            padding: "18px 14px", fontSize: 11.5,
            color: "var(--atlas-muted)", opacity: 0.5, lineHeight: 1.65,
          }}>
            {runId ? "Run not found — it may still be loading." : "No runs yet for this project."}
          </div>
        )
      ) : (
        <ChangesLens rows={changeRows} projectId={projectId} />
      )}

      {/* ── Workspace block ── */}
      <div style={{ borderTop: "1px solid rgba(var(--atlas-gold-rgb), 0.08)", marginTop: "auto" }}>
        <WorkspaceBlock projectId={projectId} />
      </div>
    </div>
  );
}
