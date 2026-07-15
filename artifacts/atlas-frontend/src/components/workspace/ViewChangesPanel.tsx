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

import {
  X, FileCode2, Eye, Search, Folder,
  Lightbulb, Trash2, CheckCircle2, ChevronDown,
  Dna, BookMarked, ListChecks, AlertOctagon, FileOutput, HelpCircle,
} from "lucide-react";
import type { TimelineMessage } from "@/components/workspace/SessionTimeline";
import { useProjectRuns, type ApiRun, type ApiRunStep } from "@/hooks/useProjectRuns";
import type { PushRecord, LinkedRepo } from "@/pages/workspace";
import { useWorkspaceEvent } from "@/lib/workspaceEventBus";


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

// (WorkspaceBlock removed — live git status does not belong in a historical run audit.)

// ── Changes lens: per-file rows from DB-backed execution_run_steps ─────────────

interface FileRow {
  path: string;
  summary: string;
  messageId: number | string;
  projectId: number;
  content?: string | null;
  beforeContent?: string | null;
  verb?: string;
}

// ── Outcome badge: state-machine outcome.code, never model prose ─────────────
//
// v1.4: reads outcome.code (RunOutcomeCode) from the verificationContract.
// Only renders for meaningful terminal/progress states.
// NOT_STARTED and INVESTIGATING are suppressed — no badge is better than noise.
const OUTCOME_CONFIG: Record<string, { label: string; color: string }> = {
  USER_FLOW_VERIFIED: { label: "✓ VERIFIED",       color: "rgba(74,222,128,0.9)" },
  RUNTIME_VERIFIED:   { label: "✓ RUNTIME OK",     color: "rgba(74,222,128,0.9)" },
  BUILD_VERIFIED:     { label: "✓ BUILD OK",        color: "rgba(74,222,128,0.9)" },
  CHANGE_APPLIED:     { label: "PATCH APPLIED",     color: "rgba(var(--atlas-gold-rgb), 0.9)" },
  CAUSE_CONFIRMED:    { label: "CAUSE CONFIRMED",   color: "rgba(var(--atlas-gold-rgb), 0.9)" },
  BLOCKED:            { label: "BLOCKED",           color: "rgba(220,80,80,0.9)" },
  FAILED:             { label: "FAILED",            color: "rgba(220,80,80,0.9)" },
};

function OutcomeBadge({
  contract,
}: {
  contract: { outcome?: { code: string } | null } | null | undefined;
}) {
  if (!contract) return null;
  const code = contract.outcome?.code;
  if (!code) return null;
  const cfg = OUTCOME_CONFIG[code];
  if (!cfg) return null;  // NOT_STARTED / INVESTIGATING — nothing to show
  return (
    <span title={`State machine outcome: ${code}`} style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px", borderRadius: 3,
      background: cfg.color.replace(/[\d.]+\)$/, "0.10)"),
      border: `1px solid ${cfg.color.replace(/[\d.]+\)$/, "0.28)")}`,
      color: cfg.color,
      fontWeight: 500,
    }}>
      {cfg.label}
    </span>
  );
}

// ── Compact receipt pill (replaces the old expandable RunCard on this surface) ─
function summarizeRun(run: ApiRun): { tag: string; line: string } {
  const filePaths = run.steps
    .filter((s) => s.verb === "FILE_EDIT" || s.verb === "FILE_DELETE" || s.verb === "LINE_PATCH")
    .map((s) => s.target)
    .filter((t): t is string => !!t);
  const readCount = run.steps.filter((s) => s.verb === "FILE_READ").length;
  const searchCount = run.steps.filter((s) => s.verb === "SEARCH" || s.verb === "INSPECT").length;
  const hasGithubPush = run.steps.some((s) => s.verb === "GITHUB_PUSH");
  const hasImageGen = run.steps.some((s) => s.verb === "IMAGE_GEN");
  const hasDecision = run.steps.some((s) => s.verb === "DECISION");
  const hasThought = run.steps.some((s) => s.verb === "THOUGHT");

  // Tag reflects what the run actually did — not everything is a BUILD.
  let tag: string;
  if (filePaths.length > 0) tag = "BUILD";
  else if (hasGithubPush) tag = "PUSH";
  else if (hasImageGen) tag = "IMAGE";
  else if (hasDecision) tag = "DECISION";
  else if (searchCount > 0) tag = "RESEARCH";
  else if (readCount > 0) tag = "READ";
  else if (hasThought) tag = "THINK";
  else tag = "CHAT";

  let line: string;
  if (filePaths.length > 0) {
    const uniq = Array.from(new Set(filePaths));
    const names = uniq.slice(0, 2).map((p) => p.split("/").pop() ?? p);
    const suffix = uniq.length > 2 ? `, +${uniq.length - 2} more` : "";
    line = `${uniq.length} file${uniq.length !== 1 ? "s" : ""} written — ${names.join(", ")}${suffix}`;
  } else if (hasGithubPush) line = "GitHub push";
  else if (hasImageGen) line = "Image generated";
  else if (readCount > 0) line = `Read ${readCount} file${readCount !== 1 ? "s" : ""}${run.summary ? ` · ${run.summary}` : ""}`;
  else if (searchCount > 0) line = `${searchCount} lookup${searchCount !== 1 ? "s" : ""}${run.summary ? ` · ${run.summary}` : ""}`;
  else line = run.summary ?? (hasThought ? "Reasoning" : "Conversation");

  return { tag, line };
}

// Distinct tint per tag so BUILD isn't the only visible category.
function tagTone(tag: string): { fg: string; bg: string; border: string } {
  switch (tag) {
    case "BUILD":
      return { fg: "var(--atlas-gold)", bg: "rgba(var(--atlas-gold-rgb), 0.10)", border: "rgba(var(--atlas-gold-rgb), 0.22)" };
    case "PUSH":
      return { fg: "rgba(140,160,220,0.95)", bg: "rgba(140,160,220,0.10)", border: "rgba(140,160,220,0.25)" };
    case "IMAGE":
      return { fg: "rgba(200,140,220,0.95)", bg: "rgba(200,140,220,0.10)", border: "rgba(200,140,220,0.25)" };
    case "DECISION":
      return { fg: "rgba(100,200,120,0.95)", bg: "rgba(100,200,120,0.10)", border: "rgba(100,200,120,0.25)" };
    case "RESEARCH":
    case "READ":
      return { fg: "rgba(180,200,220,0.85)", bg: "rgba(180,200,220,0.06)", border: "rgba(180,200,220,0.18)" };
    case "THINK":
      return { fg: "rgba(180,160,240,0.9)", bg: "rgba(180,160,240,0.08)", border: "rgba(180,160,240,0.22)" };
    case "CHAT":
    default:
      return { fg: "rgba(200,200,200,0.8)", bg: "rgba(200,200,200,0.06)", border: "rgba(200,200,200,0.18)" };
  }
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
      {(() => {
        const tone = tagTone(tag);
        return (
          <span
            style={{
              fontFamily: "var(--app-font-mono)", fontSize: 9.5,
              letterSpacing: "0.14em", textTransform: "uppercase",
              padding: "2px 6px", borderRadius: 3,
              background: tone.bg, color: tone.fg,
              border: `1px solid ${tone.border}`, flexShrink: 0,
            }}
          >{tag}</span>
        );
      })()}
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

// ── Inline diff engine ────────────────────────────────────────────────────────
// Pure LCS-based line diff; caps at 150 lines per side to stay fast.
const MAX_DIFF_LINES = 150;
const DIFF_CONTEXT = 3;

type DiffLine = { type: "add" | "remove" | "equal" | "hunk"; line: string; count?: number };

function computeLineDiff(before: string, after: string): DiffLine[] {
  const aLines = before.split("\n").slice(0, MAX_DIFF_LINES);
  const bLines = after.split("\n").slice(0, MAX_DIFF_LINES);
  const la = aLines.length, lb = bLines.length;

  const dp: number[][] = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = aLines[i - 1] === bLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const raw: Array<{ type: "add" | "remove" | "equal"; line: string }> = [];
  let i = la, j = lb;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
      raw.unshift({ type: "equal", line: aLines[i - 1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ type: "add", line: bLines[j - 1] }); j--;
    } else {
      raw.unshift({ type: "remove", line: aLines[i - 1] }); i--;
    }
  }

  // Collapse equal lines outside ±DIFF_CONTEXT of any change
  const nearChange = new Set<number>();
  for (let k = 0; k < raw.length; k++) {
    if (raw[k].type !== "equal") {
      for (let c = Math.max(0, k - DIFF_CONTEXT); c <= Math.min(raw.length - 1, k + DIFF_CONTEXT); c++) {
        nearChange.add(c);
      }
    }
  }

  const result: DiffLine[] = [];
  let equalRun = 0;
  for (let k = 0; k < raw.length; k++) {
    if (raw[k].type === "equal" && !nearChange.has(k)) {
      equalRun++;
    } else {
      if (equalRun > 0) { result.push({ type: "hunk", line: "", count: equalRun }); equalRun = 0; }
      result.push(raw[k] as DiffLine);
    }
  }
  if (equalRun > 0) result.push({ type: "hunk", line: "", count: equalRun });
  return result;
}

function InlineDiffBlock({ before, after }: { before: string | null; after: string | null }) {
  const isCreated  = !before && !!after;
  const isDeleted  = !!before && !after;
  const hasDiff    = !!before && !!after;

  if (isCreated) {
    return (
      <pre style={{
        margin: "4px 0 0", padding: "10px 12px", borderRadius: 4,
        background: "rgba(40,90,55,0.30)",
        border: "1px solid rgba(80,160,100,0.18)",
        fontFamily: "var(--app-font-mono)", fontSize: 10.5,
        color: "rgba(160,220,170,0.9)", lineHeight: 1.6,
        overflowX: "auto", overflowY: "auto", maxHeight: 320,
        whiteSpace: "pre", wordBreak: "normal",
      }}>{after}</pre>
    );
  }

  if (isDeleted) {
    return (
      <pre style={{
        margin: "4px 0 0", padding: "10px 12px", borderRadius: 4,
        background: "rgba(90,30,30,0.30)",
        border: "1px solid rgba(180,70,70,0.18)",
        fontFamily: "var(--app-font-mono)", fontSize: 10.5,
        color: "rgba(220,140,140,0.9)", lineHeight: 1.6,
        overflowX: "auto", overflowY: "auto", maxHeight: 320,
        whiteSpace: "pre", wordBreak: "normal",
        textDecoration: "line-through",
      }}>{before}</pre>
    );
  }

  if (!hasDiff) {
    return (
      <pre style={{
        margin: "4px 0 0", padding: "10px 12px", borderRadius: 4,
        background: "rgba(0,0,0,0.35)",
        border: "1px solid rgba(var(--atlas-gold-rgb), 0.1)",
        fontFamily: "var(--app-font-mono)", fontSize: 10.5,
        color: "rgba(220,220,200,0.82)", lineHeight: 1.6,
        overflowX: "auto", overflowY: "auto", maxHeight: 320,
        whiteSpace: "pre", wordBreak: "normal",
      }}>{after ?? before ?? ""}</pre>
    );
  }

  const diff = computeLineDiff(before, after);
  const hasChanges = diff.some((d) => d.type === "add" || d.type === "remove");

  if (!hasChanges) {
    return (
      <pre style={{
        margin: "4px 0 0", padding: "10px 12px", borderRadius: 4,
        background: "rgba(0,0,0,0.35)",
        border: "1px solid rgba(var(--atlas-gold-rgb), 0.1)",
        fontFamily: "var(--app-font-mono)", fontSize: 10.5,
        color: "rgba(220,220,200,0.82)", lineHeight: 1.6,
        overflowX: "auto", overflowY: "auto", maxHeight: 320,
        whiteSpace: "pre", wordBreak: "normal",
      }}>{after}</pre>
    );
  }

  return (
    <div style={{
      margin: "4px 0 0", borderRadius: 4, overflow: "hidden",
      border: "1px solid rgba(var(--atlas-gold-rgb), 0.12)",
      background: "rgba(0,0,0,0.28)",
      maxHeight: 320, overflowY: "auto",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 20 }} />
          <col />
        </colgroup>
        <tbody>
          {diff.map((d, idx) => {
            if (d.type === "hunk") {
              return (
                <tr key={idx}>
                  <td colSpan={2} style={{
                    padding: "1px 8px",
                    background: "rgba(100,120,160,0.1)",
                    color: "rgba(160,180,210,0.55)",
                    fontFamily: "var(--app-font-mono)", fontSize: 9.5,
                    userSelect: "none",
                  }}>⋯ {d.count} unchanged lines</td>
                </tr>
              );
            }
            const bg =
              d.type === "add"    ? "rgba(40,90,55,0.32)" :
              d.type === "remove" ? "rgba(90,30,30,0.32)" :
              "transparent";
            const prefix =
              d.type === "add"    ? "+" :
              d.type === "remove" ? "−" :
              " ";
            const prefixColor =
              d.type === "add"    ? "rgba(100,200,120,0.85)" :
              d.type === "remove" ? "rgba(220,100,100,0.85)" :
              "rgba(180,180,160,0.3)";
            const lineColor =
              d.type === "add"    ? "rgba(160,225,175,0.9)" :
              d.type === "remove" ? "rgba(225,145,145,0.9)" :
              "rgba(210,210,190,0.7)";
            return (
              <tr key={idx} style={{ background: bg }}>
                <td style={{
                  padding: "0 4px",
                  fontFamily: "var(--app-font-mono)", fontSize: 10.5,
                  color: prefixColor, textAlign: "center",
                  userSelect: "none", lineHeight: 1.6,
                  borderRight: "1px solid rgba(255,255,255,0.05)",
                  verticalAlign: "top",
                }}>{prefix}</td>
                <td style={{
                  padding: "0 8px",
                  fontFamily: "var(--app-font-mono)", fontSize: 10.5,
                  color: lineColor, lineHeight: 1.6,
                  whiteSpace: "pre", overflowX: "hidden",
                }}>{d.line}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Derive the human-facing change label + accent colour from FileRow fields.
function getChangeLabel(row: FileRow): { label: string; color: string } {
  const verb = row.verb ?? "";
  if (verb === "FILE_DELETE")                             return { label: "Deleted",  color: "rgba(220,100,100,0.85)" };
  if (verb === "LINE_PATCH")                             return { label: "Patched",  color: "rgba(var(--atlas-gold-rgb), 0.7)" };
  const hasAfter  = !!row.content;
  const hasBefore = row.beforeContent !== undefined && row.beforeContent !== null;
  if (hasAfter && !hasBefore)                            return { label: "Created",  color: "rgba(100,200,130,0.85)" };
  if (hasAfter  && hasBefore)                            return { label: "Modified", color: "rgba(var(--atlas-gold-rgb), 0.85)" };
  return { label: row.summary, color: "rgba(var(--atlas-muted), 0.55)" };
}

function ChangesLens({ rows, projectId, runStatus }: { rows: FileRow[]; projectId: number; runStatus?: string }) {
  // Auto-expand the first file when there are ≤3 files and viewable content exists.
  const firstKey = rows.length > 0 ? `${rows[0].messageId}-${rows[0].path}-0` : null;
  const autoExpand = rows.length <= 3 && (!!rows[0]?.content || !!rows[0]?.beforeContent);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => autoExpand && firstKey ? new Set([firstKey]) : new Set()
  );

  const isProposed = runStatus === "awaiting_approval";

  if (rows.length === 0) {
    return (
      <div style={{ padding: "18px 14px", fontSize: 11.5, color: "var(--atlas-muted)", opacity: 0.5 }}>
        No file changes recorded for this run yet.
      </div>
    );
  }
  return (
    <div style={{ padding: "10px 12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
      {isProposed && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 10px", borderRadius: 5, marginBottom: 4,
          background: "rgba(var(--atlas-gold-rgb), 0.07)",
          border: "1px solid rgba(var(--atlas-gold-rgb), 0.22)",
        }}>
          <span style={{
            fontFamily: "var(--app-font-mono)", fontSize: 9.5,
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--atlas-gold)", opacity: 0.9,
            padding: "2px 6px", borderRadius: 3,
            background: "rgba(var(--atlas-gold-rgb), 0.12)",
            border: "1px solid rgba(var(--atlas-gold-rgb), 0.3)",
            flexShrink: 0,
          }}>Proposed</span>
          <span style={{
            fontSize: 11.5, color: "var(--atlas-fg)", opacity: 0.65, lineHeight: 1.4,
          }}>Applied locally — approve in chat to push to GitHub</span>
        </div>
      )}
      {rows.map((r, i) => {
        const key = `${r.messageId}-${r.path}-${i}`;
        const isExpanded = expandedPaths.has(key);
        const hasViewable = !!r.content || !!r.beforeContent;
        const { label, color } = getChangeLabel(r);
        const toggle = () => {
          if (!hasViewable) return;
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
              cursor: hasViewable ? "pointer" : "default",
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
                fontSize: 10, color, fontFamily: "var(--app-font-sans)",
                flexShrink: 0, fontWeight: 500, letterSpacing: "0.03em",
              }}>{label}</span>
              {hasViewable && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggle(); }}
                  style={{
                    fontFamily: "var(--app-font-mono)", fontSize: 9.5, letterSpacing: "0.08em",
                    textTransform: "uppercase", flexShrink: 0,
                    background: isExpanded ? "rgba(var(--atlas-gold-rgb), 0.14)" : "transparent",
                    border: `1px solid rgba(var(--atlas-gold-rgb), ${isExpanded ? "0.35" : "0.2"})`,
                    color: `rgba(var(--atlas-gold-rgb), ${isExpanded ? "1" : "0.7"})`,
                    borderRadius: 3, padding: "2px 7px", cursor: "pointer",
                  }}
                >{isExpanded ? "▲ Hide" : "▼ Diff"}</button>
              )}
            </div>
            {isExpanded && (
              <div style={{ padding: "0 10px 10px" }}>
                <InlineDiffBlock
                  before={r.beforeContent ?? null}
                  after={r.content ?? null}
                />
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
  "FILE_EDIT", "LINE_PATCH", "FILE_DELETE", "Writing", "Written", "Patching", "SUMMARY",
  "DNA_UPDATED", "DECISION_RECORDED", "PLAN_RECORDED",
  // Placeholder support — rendered only if backend emits real steps.
  "ARTIFACT_CREATED", "ERROR", "QUESTION_ASKED",
  // Conversational milestones (2026-07-09 handoff).
  "MILESTONE_REQUIREMENTS", "MILESTONE_DECISION",
  "MILESTONE_DESIGN", "MILESTONE_PLAN", "ARTIFACT_GENERATED",
]);
const EXPANDABLE_VERBS = new Set([
  "THOUGHT", "FILE_EDIT", "Writing", "Written", "Patching", "SUMMARY", "ERROR", "QUESTION_ASKED",
  "MILESTONE_REQUIREMENTS", "MILESTONE_DECISION",
  "MILESTONE_DESIGN", "MILESTONE_PLAN", "ARTIFACT_GENERATED",
]);
const ALWAYS_OPEN_VERBS = new Set(["SUMMARY", "ERROR"]);

function stepColor(verb: string): string {
  const MAP: Record<string, string> = {
    THOUGHT:            "rgba(147,130,220,0.85)",
    FILE_READ:          "rgba(100,170,220,0.85)",
    SEARCH:             "rgba(100,200,180,0.85)",
    INSPECT:            "rgba(180,160,100,0.85)",
    FILE_EDIT:          "rgba(var(--atlas-gold-rgb), 0.95)",
    LINE_PATCH:         "rgba(var(--atlas-gold-rgb), 0.75)",
    Writing:            "rgba(var(--atlas-gold-rgb), 0.95)",
    Written:            "rgba(var(--atlas-gold-rgb), 0.95)",
    Patching:           "rgba(var(--atlas-gold-rgb), 0.75)",
    FILE_DELETE:        "rgba(220,80,80,0.85)",
    SUMMARY:            "rgba(100,200,120,0.95)",
    DNA_UPDATED:        "rgba(120,190,255,0.85)",
    DECISION_RECORDED:  "rgba(220,160,80,0.90)",
    PLAN_RECORDED:      "rgba(170,130,230,0.85)",
    ARTIFACT_CREATED:   "rgba(180,200,120,0.90)",
    ERROR:              "rgba(220,80,80,0.95)",
    QUESTION_ASKED:     "rgba(200,180,140,0.85)",
    MILESTONE_REQUIREMENTS: "rgba(140,200,220,0.90)",
    MILESTONE_DECISION:     "rgba(220,160,80,0.90)",
    MILESTONE_DESIGN:       "rgba(170,130,230,0.90)",
    MILESTONE_PLAN:         "rgba(200,180,140,0.90)",
    ARTIFACT_GENERATED:     "rgba(180,200,120,0.90)",
  };
  return MAP[verb] ?? "rgba(180,180,180,0.75)";
}

function stepLabel(verb: string, detail?: string | null): string {
  if (verb === "THOUGHT" && detail && /^\d+s$/.test(detail)) {
    return `Thought for ${detail}`;
  }
  if (verb === "DNA_UPDATED" && detail) return `DNA · ${detail.slice(0, 60)}`;
  if (verb === "PLAN_RECORDED" && detail) return `Plan · ${detail.slice(0, 60)}`;
  const MAP: Record<string, string> = {
    THOUGHT: "Thought", FILE_READ: "Read", SEARCH: "Search",
    INSPECT: "Inspect", FILE_EDIT: "Edited", LINE_PATCH: "Patched",
    Writing: "Edited", Written: "Edited", Patching: "Patched",
    FILE_DELETE: "Deleted", SUMMARY: "Summary",
    DNA_UPDATED: "DNA updated", DECISION_RECORDED: "Decision",
    PLAN_RECORDED: "Plan recorded",
    ARTIFACT_CREATED: "Output", ERROR: "Error", QUESTION_ASKED: "Question",
    MILESTONE_REQUIREMENTS: "Requirements clarified",
    MILESTONE_DECISION:     "Architecture decision",
    MILESTONE_DESIGN:       "Design milestone",
    MILESTONE_PLAN:         "Implementation plan",
    ARTIFACT_GENERATED:     "Artifact created",
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
  if (verb === "Writing")    return <FileCode2    {...p} />;
  if (verb === "Written")    return <FileCode2    {...p} />;
  if (verb === "Patching")   return <FileCode2    {...p} />;
  if (verb === "FILE_DELETE")       return <Trash2       {...p} />;
  if (verb === "SUMMARY")           return <CheckCircle2 {...p} />;
  if (verb === "DNA_UPDATED")       return <Dna          {...p} />;
  if (verb === "DECISION_RECORDED") return <BookMarked   {...p} />;
  if (verb === "PLAN_RECORDED")     return <ListChecks   {...p} />;
  if (verb === "ARTIFACT_CREATED")  return <FileOutput   {...p} />;
  if (verb === "ERROR")             return <AlertOctagon {...p} />;
  if (verb === "QUESTION_ASKED")    return <HelpCircle   {...p} />;
  if (verb === "MILESTONE_REQUIREMENTS") return <ListChecks {...p} />;
  if (verb === "MILESTONE_DECISION")     return <BookMarked {...p} />;
  if (verb === "MILESTONE_DESIGN")       return <Dna        {...p} />;
  if (verb === "MILESTONE_PLAN")         return <ListChecks {...p} />;
  if (verb === "ARTIFACT_GENERATED")     return <FileOutput {...p} />;
  return null;
}


function RunTimelineItem({ step, isLast }: { step: ApiRunStep; isLast: boolean }) {
  const color = stepColor(step.verb);
  const canExpand = EXPANDABLE_VERBS.has(step.verb) && !!step.content;
  const alwaysOpen = ALWAYS_OPEN_VERBS.has(step.verb);
  const [open, setOpen] = useState(alwaysOpen);

  const isTextVerb = step.verb === "THOUGHT" || step.verb === "SUMMARY"
    || step.verb === "ERROR" || step.verb === "QUESTION_ASKED"
    || step.verb === "DECISION_RECORDED";
  const showTarget = !isTextVerb && step.verb !== "INSPECT" && !!step.target;
  const isSummary = step.verb === "SUMMARY";
  const isError = step.verb === "ERROR";
  const isReceipt = isSummary || isError;

  // SUMMARY / ERROR render as a full receipt card, not a hairline row.
  if (isReceipt) {
    return (
      <div style={{
        marginTop: 14,
        padding: "12px 14px",
        borderRadius: 6,
        background: isError ? "rgba(220,80,80,0.06)" : "rgba(100,200,120,0.05)",
        border: `1px solid ${isError ? "rgba(220,80,80,0.28)" : "rgba(100,200,120,0.25)"}`,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 9.5, fontFamily: "var(--app-font-mono)",
          letterSpacing: "0.14em", textTransform: "uppercase",
          color, opacity: 0.95, marginBottom: 8,
        }}>
          <StepIcon verb={step.verb} />
          <span>{isError ? "Error" : "Outcome"}</span>
        </div>
        {step.content && (
          <div style={{
            fontFamily: "var(--app-font-sans)", fontSize: 12.5,
            color: "var(--atlas-fg)", opacity: 0.92, lineHeight: 1.6,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>{step.content}</div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      {/* Hairline trace + dot */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        flexShrink: 0, width: 18, paddingTop: 10,
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: color, boxShadow: `0 0 5px ${color}`,
        }} />
        {!isLast && (
          <div style={{
            width: 1, flex: 1, minHeight: 18,
            background: "rgba(var(--atlas-gold-rgb), 0.1)", marginTop: 4,
          }} />
        )}
      </div>

      {/* Step body — more breathing room */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 10 }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 6,
            cursor: canExpand && !alwaysOpen ? "pointer" : "default",
            paddingTop: 6,
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
          {(step.verb === "ARTIFACT_CREATED" || step.verb === "ARTIFACT_GENERATED") && step.artifactUrl && (
            <a
              href={step.artifactUrl.startsWith("workspace://")
                ? undefined
                : step.artifactUrl.startsWith("artifact://")
                  ? undefined
                : step.artifactUrl}
              onClick={(e) => {
                if (step.artifactUrl?.startsWith("workspace://")) {
                  e.preventDefault();
                  const path = step.artifactUrl.replace(/^workspace:\/\//, "");
                  window.dispatchEvent(new CustomEvent("axiom:open-file", { detail: { path } }));
                } else if (step.artifactUrl?.startsWith("artifact://")) {
                  e.preventDefault();
                  const artifactId = step.artifactUrl.replace(/^artifact:\/\//, "");
                  window.dispatchEvent(new CustomEvent("axiom:open-output", { detail: { artifactId } }));
                }
              }}
              style={{
                fontSize: 10, fontFamily: "var(--app-font-mono)",
                color: "rgba(var(--atlas-gold-rgb), 0.85)",
                textDecoration: "none", flexShrink: 0, marginLeft: "auto",
                letterSpacing: "0.04em",
              }}
            >
              Open Output →
            </a>
          )}
          {canExpand && !alwaysOpen && !((step.verb === "ARTIFACT_CREATED" || step.verb === "ARTIFACT_GENERATED") && step.artifactUrl) && (
            <span style={{
              fontSize: 9, color: "rgba(var(--atlas-gold-rgb), 0.45)",
              fontFamily: "var(--app-font-mono)", flexShrink: 0, marginLeft: "auto",
            }}>{open ? "▲" : "▼"}</span>
          )}
        </div>

        {(open || alwaysOpen) && step.content && (
          <pre style={{
            margin: "6px 0 2px", padding: "10px 12px", borderRadius: 4,
            background: "rgba(var(--atlas-fg-rgb), 0.05)",
            border: `1px solid ${color.replace(/[\d.]+\)$/, "0.12)")}`,
            fontFamily: isTextVerb ? "var(--app-font-sans)" : "var(--app-font-mono)",
            fontSize: isTextVerb ? 11.5 : 10.5,
            color: "var(--atlas-fg)", opacity: 0.85, lineHeight: 1.65,
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

// ── Run-level header: prompt · intent · status · timing · summary ─────────────
function formatDuration(ms: number | null | undefined, started: string, ended: string | null): string | null {
  const dur = ms ?? (ended ? new Date(ended).getTime() - new Date(started).getTime() : null);
  if (dur == null || !Number.isFinite(dur) || dur < 0) return null;
  if (dur < 1000) return `${dur}ms`;
  const s = dur / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

function RunHeader({ run }: { run: ApiRun }) {
  const prompt = run.prompt ?? null;
  const intent = run.intent ?? null;
  const status = run.status;
  const duration = formatDuration(run.elapsedMs, run.startedAt, run.completedAt);
  const started = new Date(run.startedAt);
  const startedLabel = started.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  const statusTone: Record<string, string> = {
    completed:          "rgba(100,200,120,0.9)",
    succeeded:          "rgba(100,200,120,0.9)",
    running:            "rgba(var(--atlas-gold-rgb), 0.9)",
    awaiting_approval:  "rgba(var(--atlas-gold-rgb), 0.85)",
    failed:             "rgba(220,80,80,0.9)",
  };
  const tone = statusTone[status] ?? "rgba(180,180,180,0.8)";

  return (
    <div style={{
      padding: "14px 16px 12px",
      borderBottom: "1px solid rgba(var(--atlas-gold-rgb), 0.1)",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      {/* Meta row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        fontSize: 9.5, fontFamily: "var(--app-font-mono)",
        letterSpacing: "0.12em", textTransform: "uppercase",
      }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "2px 7px", borderRadius: 3,
          background: `${tone.replace(/[\d.]+\)$/, "0.12)")}`,
          border: `1px solid ${tone.replace(/[\d.]+\)$/, "0.3)")}`,
          color: tone,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: tone, boxShadow: `0 0 4px ${tone}`,
          }} />
          {status}
        </span>
        {/* v1.3: outcome from the state machine — never derived from model prose */}
        <OutcomeBadge contract={run.verificationContract} />
        {intent && (
          <span style={{
            padding: "2px 7px", borderRadius: 3,
            background: "rgba(var(--atlas-gold-rgb), 0.08)",
            border: "1px solid rgba(var(--atlas-gold-rgb), 0.22)",
            color: "var(--atlas-gold)", opacity: 0.9,
          }}>{intent}</span>
        )}
        <span style={{ color: "var(--atlas-muted)", opacity: 0.55 }}>{startedLabel}</span>
        {duration && (
          <span style={{ color: "var(--atlas-muted)", opacity: 0.55 }}>· {duration}</span>
        )}
      </div>

      {/* Prompt */}
      {prompt && (
        <div style={{
          fontFamily: "var(--app-font-sans)", fontSize: 14,
          color: "var(--atlas-fg)", opacity: 0.95, lineHeight: 1.5,
          letterSpacing: "-0.005em",
        }}>{prompt}</div>
      )}

      {/* Summary preview (SUMMARY step still renders in-timeline as receipt) */}
      {!prompt && run.summary && (
        <div style={{
          fontFamily: "var(--app-font-sans)", fontSize: 13,
          color: "var(--atlas-muted)", opacity: 0.8, lineHeight: 1.55,
        }}>{run.summary}</div>
      )}
    </div>
  );
}

function RunTimeline({ run }: { run: ApiRun }) {
  const visible = run.steps.filter((s) => TIMELINE_VERBS.has(s.verb));

  return (
    <div>
      <RunHeader run={run} />
      {visible.length === 0 ? (
        <div style={{
          padding: "18px 16px", fontSize: 12,
          color: "var(--atlas-muted)", opacity: 0.55, lineHeight: 1.65,
        }}>
          {run.steps.some((s) => s.verb === "FILE_EDIT" || s.verb === "LINE_PATCH" || s.verb === "FILE_DELETE")
            ? "Execution trace not available — this run predates step capture. See Changes for what was written."
            : "No execution steps recorded for this run."}
        </div>
      ) : (
        <div style={{ padding: "16px 14px 18px", display: "flex", flexDirection: "column" }}>
          {visible.map((step, i) => (
            <RunTimelineItem key={`${step.id}-${i}`} step={step} isLast={i === visible.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}


// ── Run receipt list: collapsible section (collapsed by default) ──────────────

function WorkspaceRunReceipts({
  projectId,
  projectName,
  runId,
  onSelectRun,
  conversationId,
}: {
  projectId: number;
  projectName: string;
  runId?: string | null;
  onSelectRun?: (id: string) => void;
  conversationId?: string | null;
}) {
  const { runs: apiRuns, invalidate: invalidateApiRuns } = useProjectRuns(projectId, { conversationId });
  const [expanded, setExpanded] = useState(false);

  // Refresh run list immediately when a run completes — no more 30s stale window.
  useWorkspaceEvent("run-completed", ({ projectId: changedPid }) => {
    if (changedPid === projectId) invalidateApiRuns();
  }, [projectId, invalidateApiRuns]);

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
        }}>Activity</span>
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

// (DecisionsLens removed — DECISION_RECORDED steps render chronologically in the Timeline.)

// ── Root component ────────────────────────────────────────────────────────────

interface Props {
  projectId: number;
  linkedRepo: LinkedRepo | null;
  messages: TimelineMessage[];
  pushHistory: PushRecord[];
  onRollbackPush: (record: PushRecord) => Promise<void>;
  runId?: string | null;
  projectName?: string | null;
  /** Active conversation UUID — scopes Timeline/Changes to this thread. */
  conversationId?: string | null;
}

export function ViewChangesPanel({
  projectId,
  linkedRepo: _linkedRepo,
  messages,
  pushHistory: _pushHistory,
  onRollbackPush: _onRollbackPush,
  runId,
  projectName,
  conversationId,
}: Props) {
  const [lens, setLens] = useState<"timeline" | "changes">("timeline");
  const [lensAutoSet, setLensAutoSet] = useState(false);
  const { runs: dbRuns, invalidate: invalidateDbRuns } = useProjectRuns(projectId, { conversationId });

  // Refresh run list immediately when a run completes — eliminates the 30s lag
  // before the Timeline and Changes lenses reflect the finished run.
  //
  // Settle-race fix: "run-completed" fires the instant the SSE stream closes,
  // but conversational milestone classification (maybeEmitMilestones) is a
  // fire-and-forget background job on the server that can still be writing
  // its execution_runs row after the stream ends. The immediate invalidate
  // below often wins the race (chat.ts now awaits classification with a
  // bounded timeout before closing the stream), but when the classifier is
  // slower than that timeout this single invalidate would miss the new
  // milestone entirely with no future recheck. Mirrors the same bounded
  // delayed-recheck pattern used to fix project-title propagation delay.
  useWorkspaceEvent("run-completed", ({ projectId: changedPid }) => {
    if (changedPid !== projectId) return;
    invalidateDbRuns();
    // Note: workspaceEventBus doesn't honor a per-call cleanup return, but these
    // are cheap idempotent refetches — an extra invalidate if another run
    // completes in the meantime is harmless.
    setTimeout(() => invalidateDbRuns(), 3000);
    setTimeout(() => invalidateDbRuns(), 8000);
  }, [projectId, invalidateDbRuns]);
  // Refresh when the user navigates to the changes/diff tab so the view is never stale.
  useWorkspaceEvent("tab-change", ({ tab }) => {
    if ((tab === "diff" || tab === "changes") && projectId) invalidateDbRuns();
  }, [projectId, invalidateDbRuns]);

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
          (step.verb === "FILE_EDIT" || step.verb === "LINE_PATCH" || step.verb === "FILE_DELETE" || step.verb === "Writing" || step.verb === "Written" || step.verb === "Patching") &&
          step.target && !seenPaths.has(step.target)
        ) {
          const normalizedVerb = step.verb === "Writing" || step.verb === "Written"
            ? "FILE_EDIT"
            : step.verb === "Patching"
              ? "LINE_PATCH"
              : step.verb;
          seenPaths.add(step.target);
          dbRows.push({
            path: step.target,
            summary: normalizedVerb === "FILE_DELETE" ? "deleted"
              : normalizedVerb === "LINE_PATCH" ? "patched lines"
              : "rewrote file",
            messageId: run.id,
            projectId,
            content: step.content ?? null,
            beforeContent: step.beforeContent ?? null,
            verb: normalizedVerb,
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
          }}>Viewing activity</span>
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
        conversationId={conversationId}
      />

      {/* ── Centered segmented toggle: Timeline · Changes ── */}
      <div style={{
        display: "flex", justifyContent: "center",
        padding: "6px 14px 8px",
        borderBottom: "1px solid rgba(var(--atlas-gold-rgb), 0.08)",
      }}>
        <div style={{
          display: "inline-flex",
          padding: 2,
          borderRadius: 999,
          background: "rgba(0,0,0,0.32)",
          border: "1px solid rgba(var(--atlas-gold-rgb), 0.18)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
          gap: 2,
        }}>
          {(["timeline", "changes"] as const).map((k) => {
            const active = lens === k;
            return (
              <button
                key={k} type="button" onClick={() => setLens(k)}
                style={{
                  minWidth: 90,
                  fontFamily: "var(--app-font-sans)", fontSize: 11,
                  fontWeight: active ? 600 : 500,
                  letterSpacing: "0.02em",
                  padding: "5px 14px", borderRadius: 999,
                  background: active
                    ? "linear-gradient(180deg, rgba(var(--atlas-gold-rgb), 0.22), rgba(var(--atlas-gold-rgb), 0.14))"
                    : "transparent",
                  border: active
                    ? "1px solid rgba(var(--atlas-gold-rgb), 0.4)"
                    : "1px solid transparent",
                  color: active ? "var(--atlas-gold)" : "var(--atlas-muted)",
                  cursor: "pointer",
                  transition: "background 180ms ease, color 180ms ease, border-color 180ms ease",
                  textTransform: "capitalize",
                  WebkitTapHighlightColor: "transparent",
                }}
              >{k}</button>
            );
          })}
        </div>
      </div>

      {/* ── Body ── */}
      {lens === "timeline" ? (
        timelineRun ? (
          <RunTimeline run={timelineRun} />
        ) : (
          <div style={{
            padding: "18px 14px", fontSize: 12,
            color: "var(--atlas-muted)", opacity: 0.55, lineHeight: 1.65,
          }}>
            {runId ? "Activity not found — it may still be loading." : "No timeline activity yet for this project."}
          </div>
        )
      ) : (
        <ChangesLens rows={changeRows} projectId={projectId} runStatus={timelineRun?.status} />
      )}
    </div>
  );
}
