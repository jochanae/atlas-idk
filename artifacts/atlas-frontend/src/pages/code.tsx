import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import JSZip from "jszip";
import { toast } from "sonner";
import { CodeEditor } from "@/components/code/CodeEditor";
import { ForgeSyncPanel } from "@/components/code/ForgeSyncPanel";
import { useCodegen, type CodegenFile } from "@/hooks/useCodegen";
import { useGithubPushToken } from "@/hooks/useGithubPushToken";
import { apiUrl } from "@/lib/api";
import { parseLinkedRepo } from "@/lib/githubRepo";
import {
  ArrowLeft,
  ArrowLeftCircle,
  Code2,
  ExternalLink,
  FileCode2,
  GitBranch,
  Github,
  Download,
  RefreshCw,
  Copy,
  Check,
  Clock,
  ChevronRight,
  ChevronDown,
  Layers,
  Hammer,
  Wand2,
  Activity,
  AlertTriangle,
  Search,
} from "lucide-react";

/* ──────────────────────────────────────────────────────────────────────────
   /code — Generation Workspace
   ──────────────────────────────────────────────────────────────────────────
   Widescreen code generation viewer. Atlas streams files here; the user
   reviews, diffs, pushes to GitHub, downloads a zip, or extracts to Forge.
   ────────────────────────────────────────────────────────────────────────── */

export interface GeneratedFile {
  id: string;
  runId: string;
  path: string;              // "src/components/Foo.tsx"
  language: string;
  bytes: number;
  lines: number;
  content: string;
  createdAt: string;         // ISO
  updatedAt: string;         // ISO
  status: string;
  previousContent?: string | null;
}

export type CodeRunStatus = string;

export interface GenerationRun {
  id: string;
  projectId: number;
  userId: number;
  prompt: string;
  intent: string;
  model: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  summary: string;
  commitSha: string | null;
  pushedToBranch: string | null;
}

export interface ProjectStub {
  id: number;
  name: string;
  repo?: string | null;       // "owner/repo"
  linkedRepo?: string | null;
  githubToken?: string | null;
  defaultBranch?: string;
}

type RunsResponse = GenerationRun[];

// ── API fetchers ─────────────────────────────────────────────────────────────
async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { credentials: "include" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  return res.json() as Promise<T>;
}

function getProjectIdFromUrl(): number | null {
  if (typeof window === "undefined") return null;
  const sp = new URLSearchParams(window.location.search);
  const raw = sp.get("projectId");
  if (raw && /^\d+$/.test(raw)) return Number(raw);
  const stored = window.localStorage.getItem("atlas:lastProjectId");
  if (stored && /^\d+$/.test(stored)) return Number(stored);
  return null;
}

function getRunIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("runId");
}



// ── Styling helpers ──────────────────────────────────────────────────────────
const PANEL: React.CSSProperties = {
  background: "color-mix(in oklab, var(--atlas-surface) 92%, transparent)",
  border: "1px solid color-mix(in oklab, var(--atlas-gold) 14%, transparent)",
  borderRadius: 14,
  backdropFilter: "blur(14px)",
};

const MONO: React.CSSProperties = {
  fontFamily: "var(--app-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
};

type MobilePane = "Changes" | "Code" | "Activity";

function normalizeFileStatus(status: string): "new" | "modified" | "unchanged" | "deleted" {
  if (status === "new" || status === "modified" || status === "unchanged" || status === "deleted") {
    return status;
  }
  return "modified";
}

function statusColor(s: GeneratedFile["status"]) {
  const status = normalizeFileStatus(s);
  if (status === "new") return "#7CE3A0";
  if (status === "modified") return "#E6C687";
  if (status === "deleted") return "#FF8A8A";
  return "rgba(255,255,255,0.45)";
}

function runStatusTint(s: CodeRunStatus) {
  if (s === "completed") return "#7CE3A0";
  if (s === "failed") return "#FF8A8A";
  return "rgba(255,255,255,0.55)";
}

function runStatusLabel(s: CodeRunStatus) {
  return s || "unknown";
}

function fileCountForRun(run: GenerationRun) {
  return run.filesChanged;
}

function fileCountLabel(count: number) {
  return `${count} ${count === 1 ? "file" : "files"}`;
}

function formatDuration(ms: number | null) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "0.0s";
  return `${(ms / 1000).toFixed(1)}s`;
}

function runUpdatedAt(run: GenerationRun) {
  return run.finishedAt ?? run.startedAt;
}

function runTitle(run: GenerationRun) {
  const summary = run.summary.trim();
  if (summary) return summary;

  const prompt = run.prompt.trim();
  if (!prompt) return "Generation run";
  if (prompt.length <= 60) return prompt;
  return `${prompt.slice(0, 57).trimEnd()}...`;
}

// ── Build Changes ─────────────────────────────────────────────────────────────
type ChangeGroup = {
  label: string;
  status: "new" | "modified" | "deleted" | "unchanged";
  color: string;
  files: GeneratedFile[];
};

function tokenizeLine(line: string): string[] {
  return line.split(/(\s+|[^\w])/g).filter(Boolean);
}
function lcsLengths(a: string[], b: string[]): number[][] {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp;
}
type TokenSpan = { text: string; changed: boolean };
function wordDiff(prev: string, curr: string): { prevSpans: TokenSpan[]; currSpans: TokenSpan[] } {
  const a = tokenizeLine(prev), b = tokenizeLine(curr);
  const dp = lcsLengths(a, b);
  const prevSpans: TokenSpan[] = [], currSpans: TokenSpan[] = [];
  let i = a.length, j = b.length;
  const pBuf: TokenSpan[] = [], cBuf: TokenSpan[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      pBuf.unshift({ text: a[i - 1], changed: false });
      cBuf.unshift({ text: b[j - 1], changed: false });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      cBuf.unshift({ text: b[j - 1], changed: true });
      j--;
    } else {
      pBuf.unshift({ text: a[i - 1], changed: true });
      i--;
    }
  }
  prevSpans.push(...pBuf);
  currSpans.push(...cBuf);
  return { prevSpans, currSpans };
}

function DiffView({ previous, current }: { previous: string; current: string }) {
  const prevLines = previous.split("\n");
  const currLines = current.split("\n");
  const maxLen = Math.max(prevLines.length, currLines.length);
  const lineDiffs = useMemo(() => Array.from({ length: maxLen }, (_, i) => {
    const p = prevLines[i] ?? "";
    const c = currLines[i] ?? "";
    if (p === c) return { lineChanged: false, prevSpans: [{ text: p || " ", changed: false }], currSpans: [{ text: c || " ", changed: false }] };
    const { prevSpans, currSpans } = wordDiff(p, c);
    return { lineChanged: true, prevSpans: prevSpans.length ? prevSpans : [{ text: " ", changed: false }], currSpans: currSpans.length ? currSpans : [{ text: " ", changed: false }] };
  }), [previous, current]);

  return (
    <div style={{ display: "flex", gap: 2, overflow: "auto", flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
        <div style={{ ...MONO, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#FF8A8A", padding: "4px 8px", borderBottom: "1px solid rgba(255,138,138,0.15)" }}>
          Previous
        </div>
        <div style={{ padding: "6px 0" }}>
          {lineDiffs.map(({ lineChanged, prevSpans }, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "1px 8px", background: lineChanged ? "rgba(255,138,138,0.07)" : "transparent" }}>
              <span style={{ ...MONO, fontSize: 9.5, color: "rgba(255,255,255,0.2)", minWidth: 28, textAlign: "right", userSelect: "none", flexShrink: 0 }}>{i + 1}</span>
              <span style={{ ...MONO, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.5 }}>
                {prevSpans.map((s, si) => (
                  <span key={si} style={{ background: s.changed ? "rgba(255,138,138,0.30)" : "transparent", color: s.changed ? "#FF8A8A" : "var(--atlas-fg)", borderRadius: 2 }}>{s.text}</span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ width: 1, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
        <div style={{ ...MONO, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#7CE3A0", padding: "4px 8px", borderBottom: "1px solid rgba(124,227,160,0.15)" }}>
          Current
        </div>
        <div style={{ padding: "6px 0" }}>
          {lineDiffs.map(({ lineChanged, currSpans }, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "1px 8px", background: lineChanged ? "rgba(124,227,160,0.07)" : "transparent" }}>
              <span style={{ ...MONO, fontSize: 9.5, color: "rgba(255,255,255,0.2)", minWidth: 28, textAlign: "right", userSelect: "none", flexShrink: 0 }}>{i + 1}</span>
              <span style={{ ...MONO, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.5 }}>
                {currSpans.map((s, si) => (
                  <span key={si} style={{ background: s.changed ? "rgba(124,227,160,0.30)" : "transparent", color: s.changed ? "#7CE3A0" : "var(--atlas-fg)", borderRadius: 2 }}>{s.text}</span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FileDetailPanel({
  file,
  onBack,
  showDiff,
  onToggleDiff,
  projectId,
  edits,
}: {
  file: GeneratedFile;
  onBack: () => void;
  showDiff: boolean;
  onToggleDiff: () => void;
  projectId: number | null;
  edits: Record<string, string>;
}) {
  const status = normalizeFileStatus(file.status);
  const color = statusColor(file.status);
  const fileName = file.path.split("/").pop() ?? file.path;
  const dirPath = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
  const currentContent = edits[file.id] ?? file.content;
  const currentLines = currentContent.split("\n").length;
  const prevLines = file.previousContent ? file.previousContent.split("\n").length : 0;
  const lineDelta = status === "new" ? currentLines : status === "deleted" ? -currentLines : currentLines - prevLines;
  const updatedTime = new Date(file.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const statusLabel = status === "new" ? "Created" : status === "modified" ? "Modified" : status === "deleted" ? "Deleted" : "Unchanged";
  const hasPrevious = !!file.previousContent;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 10px",
          background: "transparent", border: "none",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          color: "var(--atlas-muted)", cursor: "pointer", fontSize: 11, ...MONO,
          textAlign: "left",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--atlas-fg)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--atlas-muted)"; }}
      >
        <ArrowLeftCircle size={12} strokeWidth={1.6} />
        Back to changes
      </button>

      {/* File info */}
      <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <FileCode2 size={13} strokeWidth={1.6} style={{ color: "var(--atlas-gold)", flexShrink: 0 }} />
          <span style={{ ...MONO, fontSize: 12, color: "var(--atlas-fg)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {fileName}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{
            ...MONO, fontSize: 9, padding: "2px 6px", borderRadius: 4,
            background: `color-mix(in oklab, ${color} 14%, transparent)`,
            color, letterSpacing: "0.1em", textTransform: "uppercase",
            border: `1px solid color-mix(in oklab, ${color} 25%, transparent)`,
            flexShrink: 0,
          }}>
            {statusLabel}
          </span>
        </div>
        {dirPath && (
          <div style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {dirPath}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lineDelta !== 0 && (
            <span style={{ ...MONO, fontSize: 11, color: lineDelta > 0 ? "#7CE3A0" : "#FF8A8A", fontWeight: 500 }}>
              {lineDelta > 0 ? `+${lineDelta}` : lineDelta} lines
            </span>
          )}
          <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)" }}>
            <Clock size={9} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />
            {statusLabel} {updatedTime}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {hasPrevious && (
          <button
            type="button"
            onClick={onToggleDiff}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 9px", borderRadius: 7, fontSize: 11, cursor: "pointer", ...MONO,
              background: showDiff ? "color-mix(in oklab, var(--atlas-gold) 14%, transparent)" : "rgba(255,255,255,0.04)",
              border: showDiff
                ? "1px solid color-mix(in oklab, var(--atlas-gold) 30%, transparent)"
                : "1px solid rgba(255,255,255,0.08)",
              color: showDiff ? "var(--atlas-gold)" : "var(--atlas-muted)",
            }}
          >
            View Diff
          </button>
        )}
        {projectId != null && (
          <a
            href={`/project/${projectId}`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 9px", borderRadius: 7, fontSize: 11,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--atlas-muted)", textDecoration: "none", ...MONO,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--atlas-fg)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--atlas-muted)"; }}
          >
            <ExternalLink size={10} />
            Open in Workspace
          </a>
        )}
      </div>

      {/* Diff view */}
      {showDiff && hasPrevious && (
        <DiffView previous={file.previousContent!} current={currentContent} />
      )}
    </div>
  );
}

function BuildChanges({
  files,
  selectedFileId,
  onSelect,
  projectId,
  edits,
  loading,
}: {
  files: GeneratedFile[];
  selectedFileId: string | null;
  onSelect: (f: GeneratedFile) => void;
  projectId: number | null;
  edits: Record<string, string>;
  loading: boolean;
}) {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({ unchanged: true });
  const [panelView, setPanelView] = useState<"list" | "detail">("list");
  const [showDiff, setShowDiff] = useState(false);
  const [query, setQuery] = useState("");

  const selectedFile = useMemo(() => files.find((f) => f.id === selectedFileId) ?? null, [files, selectedFileId]);

  const prevSelectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedFileId && selectedFileId !== prevSelectedIdRef.current) {
      setPanelView("detail");
      setShowDiff(false);
    }
    prevSelectedIdRef.current = selectedFileId;
  }, [selectedFileId]);

  const filteredFiles = useMemo(() => {
    if (!query.trim()) return files;
    const q = query.toLowerCase();
    return files.filter((f) => f.path.toLowerCase().includes(q));
  }, [files, query]);

  const groups: ChangeGroup[] = useMemo(() => {
    const grouped: Record<string, GeneratedFile[]> = { new: [], modified: [], deleted: [], unchanged: [] };
    for (const f of filteredFiles) {
      const s = normalizeFileStatus(f.status);
      grouped[s].push(f);
    }
    return [
      { label: "Created", status: "new" as const, color: "#7CE3A0", files: grouped.new },
      { label: "Modified", status: "modified" as const, color: "#E6C687", files: grouped.modified },
      { label: "Deleted", status: "deleted" as const, color: "#FF8A8A", files: grouped.deleted },
      { label: "Unchanged", status: "unchanged" as const, color: "rgba(255,255,255,0.35)", files: grouped.unchanged },
    ].filter((g) => g.files.length > 0);
  }, [filteredFiles]);

  if (panelView === "detail" && selectedFile) {
    return (
      <FileDetailPanel
        file={selectedFile}
        onBack={() => setPanelView("list")}
        showDiff={showDiff}
        onToggleDiff={() => setShowDiff((v) => !v)}
        projectId={projectId}
        edits={edits}
      />
    );
  }

  if (files.length === 0) {
    return <EmptyHint label={loading ? "Loading files…" : "No files in this run yet."} />;
  }

  return (
    <div style={{ padding: "4px 4px 12px" }}>
      {/* Search */}
      <div style={{ padding: "4px 4px 6px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 7, padding: "5px 8px",
        }}>
          <Search size={11} strokeWidth={1.6} style={{ color: "var(--atlas-muted)", flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter files…"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              ...MONO, fontSize: 11, color: "var(--atlas-fg)",
            }}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--atlas-muted)", padding: 0, lineHeight: 1 }}>✕</button>
          )}
        </div>
        {query && filteredFiles.length === 0 && (
          <div style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)", textAlign: "center", paddingTop: 16 }}>No files match "{query}"</div>
        )}
      </div>
      {groups.map((group) => {
        const collapsed = collapsedSections[group.status] ?? false;
        const toggleSection = () => setCollapsedSections((m) => ({ ...m, [group.status]: !collapsed }));
        return (
          <div key={group.status} style={{ marginBottom: 6 }}>
            {/* Section header */}
            <button
              type="button"
              onClick={toggleSection}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 6,
                padding: "5px 8px", background: "transparent",
                border: "none", cursor: "pointer", textAlign: "left",
              }}
            >
              {collapsed
                ? <ChevronRight size={11} strokeWidth={1.8} style={{ opacity: 0.45, color: "var(--atlas-muted)", flexShrink: 0 }} />
                : <ChevronDown size={11} strokeWidth={1.8} style={{ opacity: 0.45, color: "var(--atlas-muted)", flexShrink: 0 }} />}
              <span style={{
                width: 6, height: 6, borderRadius: 99,
                background: group.color,
                boxShadow: group.status !== "unchanged" ? `0 0 6px ${group.color}` : "none",
                flexShrink: 0,
              }} />
              <span style={{
                ...MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase",
                color: group.color, flex: 1,
              }}>
                {group.label}
              </span>
              <span style={{ ...MONO, fontSize: 9.5, color: "var(--atlas-muted)" }}>{group.files.length}</span>
            </button>

            {/* File rows */}
            {!collapsed && group.files.map((f) => {
              const fileName = f.path.split("/").pop() ?? f.path;
              const selected = f.id === selectedFileId;
              const isEdited = Object.prototype.hasOwnProperty.call(edits, f.id);
              const currentContent = edits[f.id] ?? f.content;
              const currentLines = currentContent.split("\n").length;
              const prevLineCount = f.previousContent ? f.previousContent.split("\n").length : 0;
              const lineDelta = group.status === "new" ? currentLines
                : group.status === "deleted" ? -currentLines
                : currentLines - prevLineCount;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { onSelect(f); setPanelView("detail"); setShowDiff(false); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 7,
                    padding: "5px 8px 5px 26px",
                    background: selected ? "color-mix(in oklab, var(--atlas-gold) 10%, transparent)" : "transparent",
                    border: "none", borderLeft: selected ? "2px solid var(--atlas-gold)" : "2px solid transparent",
                    color: selected ? "var(--atlas-gold)" : "var(--atlas-fg)",
                    cursor: "pointer", textAlign: "left", ...MONO,
                    borderRadius: 6, marginBottom: 1,
                  }}
                  onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                  onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: 99, flexShrink: 0,
                    background: isEdited ? "var(--atlas-gold)" : group.color,
                    boxShadow: `0 0 5px ${isEdited ? "var(--atlas-gold)" : group.color}`,
                  }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
                    {fileName}
                  </span>
                  {lineDelta !== 0 && (
                    <span style={{ ...MONO, fontSize: 10, color: lineDelta > 0 ? "#7CE3A0" : "#FF8A8A", flexShrink: 0 }}>
                      {lineDelta > 0 ? `+${lineDelta}` : lineDelta}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Code Viewer ──────────────────────────────────────────────────────────────
function CodeViewer({
  file,
  value,
  isEdited,
  onChange,
}: {
  file: GeneratedFile;
  value: string;
  isEdited: boolean;
  onChange: (next: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const lineCount = value.split("\n").length;
  const byteCount = new Blob([value]).size;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
        borderBottom: "1px solid color-mix(in oklab, var(--atlas-gold) 10%, transparent)",
      }}>
        <FileCode2 size={14} style={{ color: "var(--atlas-gold)" }} />
        <span style={{ ...MONO, fontSize: 12.5, color: "var(--atlas-fg)" }}>{file.path}</span>
        <span style={{
          ...MONO, fontSize: 10, padding: "2px 7px", borderRadius: 5,
          background: `color-mix(in oklab, ${statusColor(file.status)} 14%, transparent)`,
          color: statusColor(file.status), letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {file.status}
        </span>
        {isEdited && (
          <span style={{
            ...MONO, fontSize: 10, padding: "2px 7px", borderRadius: 5,
            background: "rgba(230,198,135,0.08)",
            color: "var(--atlas-gold)", letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            unsaved
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ ...MONO, fontSize: 11, color: "var(--atlas-muted)" }}>
          {lineCount} lines · {(byteCount / 1024).toFixed(1)} kb
        </span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true); setTimeout(() => setCopied(false), 1500);
          }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "5px 9px", borderRadius: 7, fontSize: 11,
            background: "rgba(230,198,135,0.08)",
            border: "1px solid color-mix(in oklab, var(--atlas-gold) 22%, transparent)",
            color: "var(--atlas-gold)", cursor: "pointer", ...MONO, letterSpacing: "0.05em",
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Code body */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", background: "#0A0910" }}>
        <CodeEditor value={value} language={`${file.language} ${file.path}`} onChange={onChange} />
      </div>
    </div>
  );
}

// ── Activity feed helpers ────────────────────────────────────────────────────
function formatEventTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function eventVerb(status: string): string {
  const s = (status ?? "").toLowerCase();
  if (s === "new") return "Created";
  if (s === "deleted") return "Deleted";
  if (s === "unchanged") return "Reviewed";
  return "Modified";
}

function eventVerbColor(status: string): string {
  const s = (status ?? "").toLowerCase();
  if (s === "new") return "#7CE3A0";
  if (s === "deleted") return "#FF8A8A";
  return "#E6C687";
}

// Group events by HH:MM bucket
function groupByMinute(files: GeneratedFile[]): Array<{ minute: string; items: GeneratedFile[] }> {
  const map = new Map<string, GeneratedFile[]>();
  const sorted = [...files].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  for (const f of sorted) {
    const key = formatEventTime(f.createdAt);
    const bucket = map.get(key) ?? [];
    bucket.push(f);
    map.set(key, bucket);
  }
  return Array.from(map.entries()).map(([minute, items]) => ({ minute, items }));
}

// ── Activity Rail ─────────────────────────────────────────────────────────────
function ActivityRail({
  run,
  files,
  runs,
  onSelectRun,
}: {
  run: GenerationRun;
  files: GeneratedFile[];
  runs: GenerationRun[];
  onSelectRun: (id: string) => void;
}) {
  const groups = groupByMinute(files);

  return (
    <div style={{ display: "flex", flexDirection: "column", overflowY: "auto", height: "100%" }}>

      {/* Run header strip */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
      }}>
        <RunStatusBadge status={run.status} />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--atlas-fg)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {runTitle(run)}
        </span>
        <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)" }}>{formatDuration(run.durationMs)}</span>
      </div>

      {/* Event log */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
        {groups.length === 0 ? (
          <EmptyHint label="No file events yet." />
        ) : (
          groups.map(({ minute, items }) => (
            <div key={minute}>
              {/* Minute timestamp marker */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 14px 2px",
              }}>
                <span style={{ ...MONO, fontSize: 9.5, color: "var(--atlas-muted)", letterSpacing: "0.06em" }}>{minute}</span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.04)" }} />
              </div>

              {/* Events in this minute */}
              {items.map((f) => {
                const verb = eventVerb(f.status);
                const verbColor = eventVerbColor(f.status);
                const fileName = f.path.split("/").pop() ?? f.path;
                const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/") + 1) : "";
                return (
                  <div key={f.id} style={{
                    display: "flex", alignItems: "baseline", gap: 7,
                    padding: "4px 14px",
                  }}>
                    <span style={{ ...MONO, fontSize: 10, color: verbColor, minWidth: 52, flexShrink: 0 }}>{verb}</span>
                    <span style={{ ...MONO, fontSize: 11, color: "var(--atlas-fg)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {fileName}
                    </span>
                    {dir && (
                      <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1 }}>
                        {dir}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}

        {/* Build outcome */}
        {run.status !== "running" && (
          <div style={{
            margin: "10px 14px 0", padding: "8px 10px", borderRadius: 8,
            background: run.status === "completed"
              ? "rgba(124,227,160,0.06)"
              : "rgba(255,138,138,0.06)",
            border: `1px solid ${run.status === "completed" ? "rgba(124,227,160,0.18)" : "rgba(255,138,138,0.18)"}`,
            display: "flex", alignItems: "center", gap: 7,
          }}>
            <span style={{ fontSize: 11, color: run.status === "completed" ? "#7CE3A0" : "#FF8A8A" }}>
              {run.status === "completed" ? "✓" : "✗"}
            </span>
            <span style={{ ...MONO, fontSize: 10, color: run.status === "completed" ? "#7CE3A0" : "#FF8A8A" }}>
              {run.status === "completed" ? "Build completed" : "Build failed"}
            </span>
            {run.commitSha && (
              <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)", marginLeft: "auto" }}>
                {run.commitSha.slice(0, 7)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Run switcher */}
      {runs.length > 1 && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "8px 10px", flexShrink: 0 }}>
          <div style={{ ...MONO, fontSize: 9, letterSpacing: "0.16em", color: "var(--atlas-muted)", textTransform: "uppercase", marginBottom: 6 }}>
            All Runs
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {runs.map((r) => (
              <RunCard key={r.id} run={r} active={r.id === run.id} onSelect={() => onSelectRun(r.id)} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RunStatusBadge({ status }: { status: CodeRunStatus }) {
  const tint = runStatusTint(status);
  return (
    <span style={{
      ...MONO, fontSize: 9, padding: "2px 6px", borderRadius: 4,
      background: `color-mix(in oklab, ${tint} 16%, transparent)`,
      color: tint, letterSpacing: "0.1em", textTransform: "uppercase",
      border: `1px solid color-mix(in oklab, ${tint} 25%, transparent)`,
    }}>
      {runStatusLabel(status)}
    </span>
  );
}

function RunCard({
  run,
  active,
  onSelect,
  compact,
}: {
  run: GenerationRun;
  active: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        textAlign: "left", cursor: "pointer",
        padding: compact ? "8px 10px" : "12px 14px", borderRadius: 10,
        border: "1px solid color-mix(in oklab, var(--atlas-gold) 10%, transparent)",
        background: active ? "rgba(230,198,135,0.06)" : "rgba(255,255,255,0.015)",
        color: "var(--atlas-fg)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <RunStatusBadge status={run.status} />
        <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)" }}>
          {fileCountLabel(fileCountForRun(run))}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ ...MONO, fontSize: 9.5, color: "var(--atlas-muted)" }}>
          {formatDuration(run.durationMs)}
        </span>
      </div>
      <div style={{ fontSize: compact ? 12 : 14, fontWeight: 500, color: "var(--atlas-fg)", marginBottom: 4 }}>
        {runTitle(run)}
      </div>
      <p style={{ margin: 0, fontSize: compact ? 11.5 : 12.5, color: "var(--atlas-fg)", opacity: 0.8, lineHeight: 1.45 }}>
        {run.summary || "Build session"}
      </p>
    </button>
  );
}

// ── Tech stack detection ─────────────────────────────────────────────────────
type StackEntry = { label: string; detail?: string };

function detectStack(files: GeneratedFile[]): StackEntry[] {
  const paths = files.map((f) => f.path);
  const langs = files.map((f) => f.language.toLowerCase());
  const has = (re: RegExp) => paths.some((p) => re.test(p));
  const langCount = (l: string) => langs.filter((x) => x === l || x.startsWith(l)).length;

  const entries: StackEntry[] = [];

  const tsxCount = files.filter((f) => f.path.endsWith(".tsx") || f.path.endsWith(".jsx")).length;
  const tsCount = files.filter((f) => f.path.endsWith(".ts") || f.path.endsWith(".tsx")).length;

  if (tsxCount > 0) entries.push({ label: "React" });
  if (has(/next\.config\./)) entries.push({ label: "Next.js" });
  if (tsCount > 0) entries.push({ label: "TypeScript", detail: `${tsCount} files` });
  if (has(/tailwind\.config\./)) entries.push({ label: "Tailwind CSS" });
  if (has(/vite\.config\./)) entries.push({ label: "Vite" });
  if (has(/drizzle\.config\.|drizzle\//)) entries.push({ label: "Drizzle ORM" });
  if (has(/prisma\/schema|schema\.prisma/)) entries.push({ label: "Prisma" });
  if (has(/supabase\//)) entries.push({ label: "Supabase" });
  if (langCount("python") > 0) entries.push({ label: "Python" });
  if (has(/\.sql$/) || has(/migration/)) entries.push({ label: "SQL" });

  return entries;
}

// ── Pipeline step ────────────────────────────────────────────────────────────
type StepStatus = "done" | "failed" | "running" | "pending";

function PipelineStep({
  label, detail, status, last,
}: { label: string; detail?: string; status: StepStatus; last?: boolean }) {
  const color = status === "done"
    ? "#7CE3A0"
    : status === "failed"
      ? "#FF8A8A"
      : status === "running"
        ? "#E6C687"
        : "rgba(255,255,255,0.2)";
  const mark = status === "done" ? "✓" : status === "failed" ? "✗" : status === "running" ? "…" : "·";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "7px 10px",
      borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.03)",
    }}>
      <span style={{ ...MONO, fontSize: 11, fontWeight: 600, color, minWidth: 12, textAlign: "center" }}>{mark}</span>
      <span style={{ fontSize: 12.5, color: status === "pending" ? "var(--atlas-muted)" : "var(--atlas-fg)", flex: 1 }}>{label}</span>
      {detail && (
        <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)" }}>{detail}</span>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      ...MONO, fontSize: 9, letterSpacing: "0.18em", color: "var(--atlas-muted)",
      textTransform: "uppercase", padding: "10px 10px 4px",
    }}>
      {children}
    </div>
  );
}

// ── Generation Pipeline ───────────────────────────────────────────────────────
function GenerationPipeline({
  run, files, runs, onSelectRun,
}: {
  run: GenerationRun;
  files: GeneratedFile[];
  runs: GenerationRun[];
  onSelectRun: (id: string) => void;
}) {
  const stack = detectStack(files);
  const runIdx = runs.length - runs.findIndex((r) => r.id === run.id);
  const isPending = run.status === "running";
  const isFailed = run.status === "failed";
  const isDone = run.status === "completed";

  const builderStatus: StepStatus = isPending ? "running" : isFailed ? "failed" : "done";
  const pushStatus: StepStatus = run.commitSha ? "done" : isDone ? "pending" : "pending";

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Run header */}
      <div style={{
        padding: "10px 12px", borderRadius: 10,
        background: "color-mix(in oklab, var(--atlas-gold) 5%, transparent)",
        border: "1px solid color-mix(in oklab, var(--atlas-gold) 14%, transparent)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <RunStatusBadge status={run.status} />
          <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)" }}>Generation #{runIdx}</span>
          <span style={{ flex: 1 }} />
          <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)" }}>
            {formatDuration(run.durationMs)}
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--atlas-fg)", lineHeight: 1.4 }}>
          {runTitle(run)}
        </div>
      </div>

      {/* Stack section */}
      {stack.length > 0 && (
        <div style={{
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(255,255,255,0.015)",
          overflow: "hidden",
        }}>
          <SectionLabel>Stack</SectionLabel>
          {stack.map((s, i) => (
            <PipelineStep key={s.label} label={s.label} detail={s.detail} status="done" last={i === stack.length - 1} />
          ))}
        </div>
      )}

      {/* Build section */}
      <div style={{
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(255,255,255,0.015)",
        overflow: "hidden",
      }}>
        <SectionLabel>Build</SectionLabel>
        <PipelineStep label="Builder" status={builderStatus} />
        <PipelineStep
          label="Files written"
          detail={run.filesChanged > 0 ? `${run.filesChanged} file${run.filesChanged !== 1 ? "s" : ""}` : undefined}
          status={isDone || isFailed ? "done" : "pending"}
        />
        <PipelineStep
          label="Build verified"
          status={isFailed ? "failed" : isDone ? "done" : isPending ? "running" : "pending"}
          last={!run.commitSha}
        />
        {run.commitSha && (
          <PipelineStep
            label="Pushed to GitHub"
            detail={run.pushedToBranch ? run.pushedToBranch.split("/").pop() : undefined}
            status={pushStatus}
            last
          />
        )}
      </div>

      {/* Artifacts section */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <Stat label="Files" value={run.filesChanged.toString()} />
        <Stat
          label="Lines"
          value={run.linesAdded > 0 ? `+${run.linesAdded}` : "0"}
          tint="#7CE3A0"
        />
        <Stat label="Duration" value={formatDuration(run.durationMs)} />
      </div>

      {/* Run history */}
      {runs.length > 1 && (
        <div>
          <div style={{ ...MONO, fontSize: 9, letterSpacing: "0.18em", color: "var(--atlas-muted)", textTransform: "uppercase", marginBottom: 8 }}>
            History
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {runs.map((r) => (
              <RunCard key={r.id} run={r} active={r.id === run.id} onSelect={() => onSelectRun(r.id)} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div style={{
      padding: "8px 10px", borderRadius: 8,
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.04)",
      textAlign: "center",
    }}>
      <div style={{ ...MONO, fontSize: 14, fontWeight: 500, color: tint ?? "var(--atlas-gold)" }}>{value}</div>
      <div style={{ ...MONO, fontSize: 9, letterSpacing: "0.14em", color: "var(--atlas-muted)", textTransform: "uppercase", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CodePage() {
  const [, navigate] = useLocation();
  const [showRail, setShowRail] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isTiny, setIsTiny] = useState(() => typeof window !== "undefined" && window.innerWidth < 420);
  const [mobilePane, setMobilePane] = useState<MobilePane>("Code");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(getRunIdFromUrl());
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const runSelectionRef = useRef<Map<string, string>>(new Map());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [isPushingGithub, setIsPushingGithub] = useState(false);
  const [showForgeSync, setShowForgeSync] = useState(false);

  const projectId = useMemo(() => getProjectIdFromUrl(), []);
  const codegen = useCodegen({
    projectId: projectId ?? 0,
    onResult: (file: CodegenFile) => {
      // Add the generated file to local state as a preview
      const tempFile = {
        id: `codegen-${Date.now()}`,
        runId: "codegen",
        path: file.filename,
        language: file.language,
        bytes: new Blob([file.content]).size,
        lines: file.content.split("\n").length,
        content: file.content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "new" as const,
        previousContent: null,
      };
      setEdits((prev) => ({ ...prev, [tempFile.id]: file.content }));
      setSelectedFileId(tempFile.id);
      toast.success(`Generated ${file.filename}`);
    },
    onError: (msg: string) => {
      toast.error(msg);
    },
  });

  const handleBack = () => {
    if (projectId != null) {
      navigate(`/project/${projectId}`);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate("/");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const updateIsMobile = () => setIsMobile(mediaQuery.matches);

    const tinyQuery = window.matchMedia("(max-width: 420px)");
    const updateIsTiny = () => setIsTiny(tinyQuery.matches);

    updateIsMobile();
    updateIsTiny();
    mediaQuery.addEventListener("change", updateIsMobile);
    tinyQuery.addEventListener("change", updateIsTiny);

    return () => {
      mediaQuery.removeEventListener("change", updateIsMobile);
      tinyQuery.removeEventListener("change", updateIsTiny);
    };
  }, []);

  // Persist projectId for return visits
  useEffect(() => {
    if (projectId != null) window.localStorage.setItem("atlas:lastProjectId", String(projectId));
  }, [projectId]);

  // 1. Project
  const projectQ = useQuery<ProjectStub>({
    queryKey: ["code", "project", projectId],
    queryFn: () => fetchJson<ProjectStub>(`/api/projects/${projectId}`),
    enabled: projectId != null,
    staleTime: 60_000,
  });
  const githubPushToken = useGithubPushToken(projectQ.data?.githubToken);
  const linkedRepo = useMemo(
    () => parseLinkedRepo(projectQ.data?.linkedRepo ?? projectQ.data?.repo ?? null),
    [projectQ.data?.linkedRepo, projectQ.data?.repo],
  );

  // 2. Runs
  const runsQ = useQuery<RunsResponse>({
    queryKey: ["code", "runs", projectId],
    queryFn: () => fetchJson<RunsResponse>(`/api/projects/${projectId}/generation-runs`),
    enabled: projectId != null,
    refetchInterval: 10_000,
  });

  const runs = useMemo(() => {
    const rawRuns = runsQ.data ?? [];
    return [...rawRuns].sort((a, b) => {
      const aTime = new Date(runUpdatedAt(a)).getTime();
      const bTime = new Date(runUpdatedAt(b)).getTime();
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
  }, [runsQ.data]);

  const activeRun = useMemo(() => {
    if (!runs.length) return null;
    if (selectedRunId) return runs.find((r) => r.id === selectedRunId) ?? runs[0];
    return runs[0];
  }, [runs, selectedRunId]);

  // 3. Files for the selected run
  const filesQ = useQuery<GeneratedFile[]>({
    queryKey: ["code", "run-files", projectId, activeRun?.id],
    queryFn: () => {
      if (projectId == null || !activeRun) return Promise.resolve([] as GeneratedFile[]);
      return fetchJson<GeneratedFile[]>(`/api/projects/${projectId}/generation-runs/${activeRun.id}/files`);
    },
    enabled: projectId != null && !!activeRun?.id,
  });


  const files = useMemo(() => filesQ.data ?? [], [filesQ.data]);
  const forgeSyncFiles = useMemo(
    () => files.map((file) => (
      Object.prototype.hasOwnProperty.call(edits, file.id)
        ? { ...file, content: edits[file.id] ?? "" }
        : file
    )),
    [edits, files],
  );
  const selectedFile = useMemo(() => {
    if (!files.length) return null;
    return files.find((f) => f.id === selectedFileId) ?? files[0];
  }, [files, selectedFileId]);

  // Loading / error / empty states
  const loading = projectQ.isLoading || runsQ.isLoading || (!!activeRun && filesQ.isLoading);
  const error = projectQ.error || runsQ.error || filesQ.error;

  // Manual refresh tracking — shows "Refreshing…" on the button and toasts on completion
  const [refreshPending, setRefreshPending] = useState(false);
  const isRefreshing = refreshPending && (runsQ.isFetching || filesQ.isFetching);
  useEffect(() => {
    if (refreshPending && !runsQ.isFetching && !filesQ.isFetching) {
      setRefreshPending(false);
      toast.success("Updated just now", { duration: 2000 });
    }
  }, [refreshPending, runsQ.isFetching, filesQ.isFetching]);

  // Badge: derive from whether the active run is still in progress, or is older than latest
  const isLiveBuild = activeRun?.status === "running";
  const isHistory = activeRun != null && runs.length > 0 && activeRun.id !== runs[0]?.id;
  const badgeLabel = isLiveBuild ? "LIVE BUILD" : isHistory ? "HISTORY" : "FOLLOWING LATEST";
  const badgeGreen = isLiveBuild;
  const handleSelectRun = (id: string) => {
    setSelectedRunId(id);
    setSelectedFileId(runSelectionRef.current.get(id) ?? null);
    if (isMobile) setMobilePane("Changes");
  };

  const selectedFileValue = selectedFile
    ? edits[selectedFile.id] ?? selectedFile.content
    : "";

  const handleDownloadZip = async () => {
    if (!activeRun || files.length === 0) {
      toast.error("No files available to download.");
      return;
    }

    setIsDownloadingZip(true);
    try {
      const zip = new JSZip();
      for (const file of files) {
        zip.file(file.path, edits[file.id] ?? file.content ?? "");
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${projectQ.data?.name || "atlas"}-run-${activeRun.id.slice(0, 8)}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Downloaded ${files.length} file${files.length === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error(e instanceof Error ? `Download failed: ${e.message}` : "Download failed.");
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handlePushToGithub = async () => {
    if (!activeRun || files.length === 0) {
      toast.error("No files available to push.");
      return;
    }
    if (!linkedRepo) {
      toast.error("No GitHub repo linked — connect one in Project Settings to push this build.", { duration: 5000 });
      return;
    }
    if (!githubPushToken) {
      toast.error("GitHub token not found — connect GitHub in the Connections tab first.", { duration: 5000 });
      return;
    }

    setIsPushingGithub(true);
    const branch = `atlas/run-${activeRun.id.slice(0, 8)}-${Date.now().toString(36).slice(-4)}`;
    try {
      const branchRes = await fetch("/api/github/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-github-token": githubPushToken },
        credentials: "include",
        body: JSON.stringify({
          repo: linkedRepo.fullName,
          branch,
          baseBranch: linkedRepo.defaultBranch,
        }),
      });
      if (!branchRes.ok) {
        const body = await branchRes.json().catch(() => ({})) as { error?: string; detail?: string };
        throw new Error(body.error ?? body.detail ?? `Branch creation failed: HTTP ${branchRes.status}`);
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const commitRes = await fetch("/api/github/commit", {
          method: "PUT",
          headers: { "Content-Type": "application/json", "x-github-token": githubPushToken },
          credentials: "include",
          body: JSON.stringify({
            repo: linkedRepo.fullName,
            branch,
            path: file.path,
            content: edits[file.id] ?? file.content ?? "",
            message: files.length === 1
              ? `Atlas: update ${file.path.split("/").pop() ?? "generated file"}`
              : `Atlas: update generation run ${activeRun.id.slice(0, 8)} (${i + 1}/${files.length})`,
          }),
        });
        if (!commitRes.ok) {
          const body = await commitRes.json().catch(() => ({})) as { error?: string; detail?: string };
          throw new Error(body.error ?? body.detail ?? `Commit failed for ${file.path}: HTTP ${commitRes.status}`);
        }
      }

      toast.success(`Pushed ${files.length} file${files.length === 1 ? "" : "s"} to ${linkedRepo.fullName}:${branch}`);
    } catch (e) {
      toast.error(e instanceof Error ? `GitHub push failed: ${e.message}` : "GitHub push failed.");
    } finally {
      setIsPushingGithub(false);
    }
  };

  const [isCreatingRepo, setIsCreatingRepo] = useState(false);
  const handleCreateRepoForProject = async () => {
    if (projectId == null) return;
    if (!githubPushToken) {
      toast.error("Connect GitHub in Account Settings first.", { duration: 4000 });
      return;
    }
    setIsCreatingRepo(true);
    try {
      const res = await fetch("/api/github/bootstrap-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId,
          projectName: projectQ.data?.name ?? `atlas-project-${projectId}`,
        }),
      });
      const body = await res.json().catch(() => ({})) as { error?: string; htmlUrl?: string; repoName?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      toast.success(`Created ${body.repoName ?? "repo"} and linked it to this project.`);
      await projectQ.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? `Couldn't create repo: ${e.message}` : "Couldn't create repo.");
    } finally {
      setIsCreatingRepo(false);
    }
  };

  const handleOpenForgeSync = () => {
    if (projectId == null) {
      toast.error("Select a project before opening Forge Sync.");
      return;
    }
    if (!activeRun) {
      toast.error("No active generation run available for Forge Sync.");
      return;
    }

    setShowForgeSync(true);
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100dvh", maxHeight: "100dvh",
      // On mobile the UnifiedShell renders a fixed 64px bottom nav bar.
      // Without this offset the bottom of the content panels is hidden behind it.
      paddingBottom: isMobile
        ? "calc(64px + env(safe-area-inset-bottom, 0px))"
        : "env(safe-area-inset-bottom, 0px)",
      background: "var(--atlas-bg)", color: "var(--atlas-fg)", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: 800, height: 400, pointerEvents: "none",
        background: "radial-gradient(ellipse at center top, rgba(230,198,135,0.08), transparent 70%)",
      }} />

      {/* Top bar */}
      {/* ── Header — identity row only ──────────────────────────────────────── */}
      <header style={{
        position: "relative", zIndex: 10,
        display: "flex", alignItems: "center", gap: 12, padding: "12px 18px",
        borderBottom: "1px solid color-mix(in oklab, var(--atlas-gold) 12%, transparent)",
        background: "color-mix(in oklab, var(--atlas-surface) 70%, transparent)",
        backdropFilter: "blur(14px)",
      }}>
        <button
          onClick={handleBack}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: isTiny ? "6px 8px" : "6px 10px",
            background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8, color: "var(--atlas-muted)", cursor: "pointer", fontSize: 12,
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={13} />{!isTiny && " Back"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{
            width: isTiny ? 26 : 30, height: isTiny ? 26 : 30, borderRadius: 8, flexShrink: 0,
            background: "linear-gradient(135deg, rgba(230,198,135,0.22), rgba(230,198,135,0.06))",
            border: "1px solid rgba(230,198,135,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--atlas-gold)",
          }}>
            <Code2 size={isTiny ? 13 : 15} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 0 }}>
            {!isTiny && (
              <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: "-0.005em" }}>
                Generation Workspace
              </span>
            )}
            <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)", letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {projectQ.data
                ? `Project: ${projectQ.data.name}`
                : projectId == null
                  ? "No project selected"
                  : `Project #${projectId}`}
            </span>
          </div>
        </div>

        <span style={{ flex: 1 }} />

        {/* Status badge — shown on both mobile and desktop */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: isTiny ? 4 : 6,
          padding: isTiny ? "5px 7px" : "5px 10px", borderRadius: 99,
          background: badgeGreen ? "rgba(124,227,160,0.08)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${badgeGreen ? "rgba(124,227,160,0.25)" : "rgba(255,255,255,0.08)"}`,
          color: badgeGreen ? "#7CE3A0" : "var(--atlas-muted)",
          fontSize: 11, ...MONO, letterSpacing: "0.06em", flexShrink: 0,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: 99,
            background: badgeGreen ? "#7CE3A0" : "rgba(255,255,255,0.4)",
            boxShadow: badgeGreen ? "0 0 8px #7CE3A0" : "none",
          }} />
          {!isTiny && badgeLabel}
        </div>

        {/* Desktop-only action buttons */}
        {!isMobile && (
          <>
            <ToolButton
              icon={<RefreshCw size={13} style={isRefreshing ? { animation: "spin 0.8s linear infinite" } : undefined} />}
              label={isRefreshing ? "Refreshing…" : "Refresh"}
              disabled={isRefreshing}
              onClick={() => { setRefreshPending(true); runsQ.refetch(); filesQ.refetch(); }}
            />
            <ToolButton
              icon={<Wand2 size={13} />}
              label={codegen.running ? "Generating…" : "New Generation"}
              disabled={codegen.running || !activeRun}
              onClick={() => {
                if (!activeRun) return;
                void codegen.run(activeRun.prompt, activeRun.summary || undefined);
              }}
            />
            <ToolButton
              icon={<Hammer size={13} />}
              label="Update Project Map"
              onClick={handleOpenForgeSync}
            />
            <ToolButton
              icon={<Download size={13} />}
              label={isDownloadingZip ? "Downloading…" : "Download .zip"}
              onClick={() => { void handleDownloadZip(); }}
              disabled={isDownloadingZip}
            />
            {!linkedRepo && githubPushToken ? (
              <ToolButton
                icon={<Github size={13} />}
                label={isCreatingRepo ? "Creating repo…" : "Create repo"}
                onClick={() => { void handleCreateRepoForProject(); }}
                disabled={isCreatingRepo}
              />
            ) : (
              <ToolButton
                icon={<Github size={13} />}
                label={isPushingGithub ? "Pushing…" : "Push to GitHub"}
                onClick={() => { void handlePushToGithub(); }}
                disabled={isPushingGithub}
                primary={!!linkedRepo}
              />
            )}
            <button
              onClick={() => setShowRail((v) => !v)}
              title="Toggle activity rail"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 30, height: 30, borderRadius: 7,
                background: showRail ? "rgba(230,198,135,0.1)" : "transparent",
                border: "1px solid rgba(255,255,255,0.08)",
                color: showRail ? "var(--atlas-gold)" : "var(--atlas-muted)", cursor: "pointer",
              }}
            >
              <Activity size={13} />
            </button>
          </>
        )}
      </header>

      {/* ── Mobile action bar ─────────────────────────────────────────────────── */}
      {isMobile && (
        <div style={{
          position: "relative", zIndex: 9,
          padding: "10px 14px",
          borderBottom: "1px solid color-mix(in oklab, var(--atlas-gold) 12%, transparent)",
          background: "color-mix(in oklab, var(--atlas-surface) 80%, transparent)",
          backdropFilter: "blur(14px)",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          {/* GitHub repo state */}
          {linkedRepo ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 10px", borderRadius: 7,
              background: "rgba(124,227,160,0.05)",
              border: "1px solid rgba(124,227,160,0.15)",
            }}>
              <Github size={11} style={{ color: "#7CE3A0", flexShrink: 0 }} />
              <span style={{ ...MONO, fontSize: 10, color: "#7CE3A0" }}>
                {linkedRepo.fullName}
              </span>
              {activeRun?.pushedToBranch && (
                <span style={{ ...MONO, fontSize: 10, color: "rgba(124,227,160,0.65)", marginLeft: 2 }}>
                  · {activeRun.pushedToBranch}
                </span>
              )}
            </div>
          ) : githubPushToken ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 10px", borderRadius: 7,
              background: "rgba(230,198,135,0.06)",
              border: "1px solid rgba(230,198,135,0.20)",
            }}>
              <Github size={11} style={{ color: "var(--atlas-gold)", flexShrink: 0 }} />
              <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)", flex: 1 }}>
                No repo linked yet — your GitHub account is connected.
              </span>
              <button
                onClick={() => { void handleCreateRepoForProject(); }}
                disabled={isCreatingRepo}
                style={{
                  ...MONO, fontSize: 10, color: "var(--atlas-gold)",
                  background: "rgba(230,198,135,0.10)",
                  border: "1px solid rgba(230,198,135,0.35)",
                  borderRadius: 6, padding: "4px 8px",
                  cursor: isCreatingRepo ? "wait" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {isCreatingRepo ? "Creating…" : "Create repo"}
              </button>
            </div>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 10px", borderRadius: 7,
              background: "rgba(255,138,138,0.05)",
              border: "1px solid rgba(255,138,138,0.18)",
            }}>
              <AlertTriangle size={11} style={{ color: "rgba(255,138,138,0.7)", flexShrink: 0 }} />
              <span style={{ ...MONO, fontSize: 10, color: "rgba(255,138,138,0.7)" }}>
                Connect GitHub in Account Settings to enable Push to GitHub.
              </span>
            </div>
          )}

          {/* Button groups */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Generation group */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <ToolButton
                icon={<RefreshCw size={13} style={isRefreshing ? { animation: "spin 0.8s linear infinite" } : undefined} />}
                label={isRefreshing ? "Refreshing…" : "Refresh"}
                disabled={isRefreshing}
                onClick={() => { setRefreshPending(true); runsQ.refetch(); filesQ.refetch(); }}
              />
              <ToolButton
                icon={<Wand2 size={13} />}
                label={codegen.running ? "Generating…" : "New Generation"}
                disabled={codegen.running || !activeRun}
                onClick={() => {
                  if (!activeRun) return;
                  void codegen.run(activeRun.prompt, activeRun.summary || undefined);
                }}
              />
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

            {/* Project group */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <ToolButton
                icon={<Hammer size={13} />}
                label="Update Project Map"
                onClick={handleOpenForgeSync}
              />
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

            {/* Distribution group */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <ToolButton
                icon={<Download size={13} />}
                label={isDownloadingZip ? "Downloading…" : "Download .zip"}
                onClick={() => { void handleDownloadZip(); }}
                disabled={isDownloadingZip}
              />
              {!linkedRepo && githubPushToken ? (
                <ToolButton
                  icon={<Github size={13} />}
                  label={isCreatingRepo ? "Creating…" : "Create repo"}
                  onClick={() => { void handleCreateRepoForProject(); }}
                  disabled={isCreatingRepo}
                />
              ) : (
                <ToolButton
                  icon={<Github size={13} />}
                  label={isPushingGithub ? "Pushing…" : "Push to GitHub"}
                  onClick={() => { void handlePushToGithub(); }}
                  disabled={isPushingGithub || !linkedRepo}
                  primary={!!linkedRepo}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile tab switcher ───────────────────────────────────────────────── */}
      {isMobile && (
        <div style={{
          position: "relative", zIndex: 9,
          padding: "8px 14px 6px",
          borderBottom: "1px solid color-mix(in oklab, var(--atlas-gold) 12%, transparent)",
          background: "color-mix(in oklab, var(--atlas-surface) 70%, transparent)",
          backdropFilter: "blur(14px)",
        }}>
          <div style={{ ...MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--atlas-muted)", marginBottom: 7 }}>
            Build Run Details
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4,
            padding: 3, borderRadius: 10,
            background: "color-mix(in oklab, var(--atlas-surface) 92%, transparent)",
            border: "1px solid color-mix(in oklab, var(--atlas-gold) 14%, transparent)",
          }}>
            {(["Changes", "Code", "Activity"] as MobilePane[]).map((pane) => {
              const active = mobilePane === pane;
              return (
                <button
                  key={pane}
                  type="button"
                  onClick={() => setMobilePane(pane)}
                  style={{
                    padding: "7px 10px", borderRadius: 8,
                    background: active
                      ? "linear-gradient(135deg, rgba(230,198,135,0.9), rgba(230,198,135,0.7))"
                      : "transparent",
                    border: active
                      ? "1px solid rgba(230,198,135,0.9)"
                      : "1px solid transparent",
                    color: active ? "#0B0A0F" : "var(--atlas-muted)",
                    cursor: "pointer", fontSize: 11, letterSpacing: "0.08em",
                    textTransform: "uppercase", ...MONO,
                    boxShadow: active ? "0 4px 14px rgba(230,198,135,0.18)" : "none",
                  }}
                >
                  {pane}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{
        flex: 1, minHeight: 0, display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : showRail ? "260px 1fr 340px" : "260px 1fr",
        gap: 12, padding: 12, position: "relative", zIndex: 1,
      }}>
        {/* LEFT — changes panel */}
        {(!isMobile || mobilePane === "Changes") && (
        <aside style={{ ...PANEL, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{
            padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)",
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            <Layers size={13} style={{ color: "var(--atlas-gold)" }} />
            <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.14em", color: "var(--atlas-muted)", textTransform: "uppercase" }}>
              Changes
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)" }}>{files.length}</span>
          </div>
          <div style={{ flex: 1, overflow: "auto", paddingBottom: "env(safe-area-inset-bottom, 12px)" }}>
            <BuildChanges
              files={files}
              selectedFileId={selectedFileId}
              onSelect={(f) => {
                setSelectedFileId(f.id);
                if (activeRun) runSelectionRef.current.set(activeRun.id, f.id);
              }}
              projectId={projectId}
              edits={edits}
              loading={loading}
            />
          </div>
          {activeRun && (
            <div style={{
              padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.05)",
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
              ...MONO, fontSize: 10, color: "var(--atlas-muted)",
            }}>
              <Clock size={10} /> Updated {new Date(runUpdatedAt(activeRun)).toLocaleTimeString()}
            </div>
          )}
        </aside>
        )}

        {/* CENTER — viewer */}
        {(!isMobile || mobilePane === "Code") && (
        <main style={{ ...PANEL, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {error ? (
            <ErrorState message={(error as Error).message} onRetry={() => { runsQ.refetch(); filesQ.refetch(); }} />
          ) : projectId == null ? (
            <EmptyState
              title="No project selected"
              hint="Open this page with ?projectId=<id> or select a project from the workspace."
            />
          ) : !loading && runs.length === 0 ? (
            <EmptyState
              title="No generation runs yet"
              hint="This project hasn't been generated yet. Start a generation from the Workspace or send a build intent in chat."
            />
          ) : selectedFile ? (

            <CodeViewer
              file={selectedFile}
              value={selectedFileValue}
              isEdited={Object.prototype.hasOwnProperty.call(edits, selectedFile.id)}
              onChange={(next) => setEdits((current) => ({ ...current, [selectedFile.id]: next }))}
            />
          ) : activeRun ? (
            <GenerationPipeline
              run={activeRun}
              files={files}
              runs={runs}
              onSelectRun={handleSelectRun}
            />
          ) : null}
        </main>
        )}

        {/* RIGHT — activity */}
        {((isMobile && mobilePane === "Activity") || (!isMobile && showRail)) && (
          <aside style={{ ...PANEL, overflow: "hidden" }}>
            {activeRun ? (
              <ActivityRail
                run={activeRun}
                files={files}
                runs={runs}
                onSelectRun={handleSelectRun}
              />
            ) : (
              <EmptyHint label={loading ? "Loading runs…" : "No build runs yet."} hint={loading ? undefined : "Start a generation from Workspace Chat or tap New Generation above."} />
            )}
          </aside>
        )}
      </div>

      {showForgeSync && projectId != null && activeRun && (
        <ForgeSyncPanel
          projectId={projectId}
          runId={activeRun.id}
          files={forgeSyncFiles}
          runSummary={activeRun.summary}
          onClose={() => setShowForgeSync(false)}
        />
      )}
    </div>
  );
}

function EmptyHint({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={{
      padding: 20, ...MONO, fontSize: 11, color: "var(--atlas-muted)",
      textAlign: "center", display: "flex", flexDirection: "column", gap: 5,
    }}>
      <span>{label}</span>
      {hint && <span style={{ fontSize: 10, opacity: 0.7 }}>{hint}</span>}
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 8, padding: 24, textAlign: "center",
    }}>
      <Code2 size={28} style={{ color: "var(--atlas-gold)", opacity: 0.6 }} />
      <div style={{ fontSize: 14, color: "var(--atlas-fg)" }}>{title}</div>
      <div style={{ ...MONO, fontSize: 11, color: "var(--atlas-muted)", maxWidth: 360 }}>{hint}</div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 10, padding: 24, textAlign: "center",
    }}>
      <AlertTriangle size={26} style={{ color: "#FF8A8A" }} />
      <div style={{ fontSize: 14, color: "var(--atlas-fg)" }}>Couldn't load this run</div>
      <div style={{ ...MONO, fontSize: 11, color: "var(--atlas-muted)", maxWidth: 420 }}>{message}</div>
      <button
        onClick={onRetry}
        style={{
          marginTop: 6, padding: "6px 12px", borderRadius: 8,
          background: "rgba(230,198,135,0.08)",
          border: "1px solid color-mix(in oklab, var(--atlas-gold) 22%, transparent)",
          color: "var(--atlas-gold)", cursor: "pointer", fontSize: 12,
          display: "inline-flex", alignItems: "center", gap: 6,
        }}
      >
        <RefreshCw size={12} /> Retry
      </button>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  primary,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500,
        background: primary
          ? "linear-gradient(135deg, rgba(230,198,135,0.9), rgba(230,198,135,0.7))"
          : "rgba(230,198,135,0.06)",
        border: primary
          ? "1px solid rgba(230,198,135,0.9)"
          : "1px solid color-mix(in oklab, var(--atlas-gold) 20%, transparent)",
        color: primary ? "#0B0A0F" : "var(--atlas-gold)",
        cursor: disabled ? "not-allowed" : "pointer", letterSpacing: "-0.005em",
        opacity: disabled ? 0.58 : 1,
        boxShadow: primary ? "0 4px 14px rgba(230,198,135,0.25)" : "none",
      }}
    >
      {icon} {label}
    </button>
  );
}
