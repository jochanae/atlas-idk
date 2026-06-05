import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";
import {
  ArrowLeft,
  Code2,
  FileCode2,
  Folder,
  FolderOpen,
  GitBranch,
  Github,
  Download,
  RefreshCw,
  Search,
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
} from "lucide-react";

/* ──────────────────────────────────────────────────────────────────────────
   /code — Generation Workspace (UI Shell with Mock Data)
   ──────────────────────────────────────────────────────────────────────────
   This page is the widescreen mirror of the inline chat code generation
   engine. Atlas streams files here; the user reviews, diffs, pushes to
   GitHub, downloads a zip, or extracts to Forge.

   Backend contracts live at the bottom of this file (Developer Handoff
   Blueprint). All data here is MOCK and conforms to those types.
   ────────────────────────────────────────────────────────────────────────── */

// ── Types (exported for backend wiring) ──────────────────────────────────────
export type GeneratedFileLanguage =
  | "typescript" | "tsx" | "javascript" | "jsx"
  | "css" | "scss" | "html" | "json" | "md" | "sql" | "sh" | "yaml" | "other";

export interface GeneratedFile {
  id: string;
  runId: string;
  path: string;              // "src/components/Foo.tsx"
  language: GeneratedFileLanguage;
  bytes: number;
  lines: number;
  content: string;
  createdAt: string;         // ISO
  updatedAt: string;         // ISO
  status: "new" | "modified" | "unchanged" | "deleted";
  previousContent?: string | null;
}

export interface GenerationRun {
  id: string;
  projectId: number;
  userId: number;
  prompt: string;
  intent: "BUILD" | "REFACTOR" | "FIX" | "SKETCH";
  model: string;
  status: "streaming" | "complete" | "error" | "cancelled";
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  summary: string;
  commitSha?: string | null;
  pushedToBranch?: string | null;
}

export interface ProjectStub {
  id: number;
  name: string;
  repo?: string | null;       // "owner/repo"
  defaultBranch?: string;
}

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


// ── Tree builder ─────────────────────────────────────────────────────────────
type TreeNode = {
  name: string;
  path: string;
  file?: GeneratedFile;
  children?: Record<string, TreeNode>;
};

function buildTree(files: GeneratedFile[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: {} };
  for (const f of files) {
    const parts = f.path.split("/");
    let cur = root;
    parts.forEach((part, i) => {
      cur.children = cur.children || {};
      if (!cur.children[part]) {
        cur.children[part] = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          children: i < parts.length - 1 ? {} : undefined,
        };
      }
      if (i === parts.length - 1) cur.children[part].file = f;
      cur = cur.children[part];
    });
  }
  return root;
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

function statusColor(s: GeneratedFile["status"]) {
  if (s === "new") return "#7CE3A0";
  if (s === "modified") return "#E6C687";
  if (s === "deleted") return "#FF8A8A";
  return "rgba(255,255,255,0.45)";
}

function intentTint(i: GenerationRun["intent"]) {
  if (i === "BUILD") return "#7CE3A0";
  if (i === "REFACTOR") return "#A0C8FF";
  if (i === "FIX") return "#FFB37C";
  return "#E6A8FF";
}

// ── File Tree ────────────────────────────────────────────────────────────────
function FileTree({
  node, depth, selectedPath, onSelect, openMap, toggleOpen, query,
}: {
  node: TreeNode; depth: number; selectedPath: string;
  onSelect: (f: GeneratedFile) => void;
  openMap: Record<string, boolean>; toggleOpen: (p: string) => void;
  query: string;
}) {
  if (!node.children) return null;
  const entries = Object.values(node.children).sort((a, b) => {
    const aDir = !!a.children, bDir = !!b.children;
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      {entries.map((child) => {
        const isFile = !!child.file;
        const matches = !query || child.path.toLowerCase().includes(query.toLowerCase());
        if (!matches && isFile) return null;
        const isOpen = openMap[child.path] ?? depth < 2;
        const selected = isFile && selectedPath === child.path;

        return (
          <div key={child.path}>
            <button
              type="button"
              onClick={() => isFile ? onSelect(child.file!) : toggleOpen(child.path)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 6,
                padding: `5px 8px 5px ${8 + depth * 14}px`,
                background: selected ? "color-mix(in oklab, var(--atlas-gold) 14%, transparent)" : "transparent",
                border: "none", borderLeft: selected ? "2px solid var(--atlas-gold)" : "2px solid transparent",
                color: selected ? "var(--atlas-gold)" : "var(--atlas-fg)",
                cursor: "pointer", textAlign: "left", fontSize: 12.5, ...MONO,
                borderRadius: 6, marginBottom: 1,
              }}
              onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
              onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
            >
              {isFile ? (
                <>
                  <FileCode2 size={13} strokeWidth={1.6} style={{ opacity: 0.7, flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {child.name}
                  </span>
                  <span style={{
                    width: 6, height: 6, borderRadius: 99,
                    background: statusColor(child.file!.status),
                    boxShadow: `0 0 8px ${statusColor(child.file!.status)}`,
                  }} />
                </>
              ) : (
                <>
                  {isOpen
                    ? <ChevronDown size={12} strokeWidth={1.8} style={{ opacity: 0.6 }} />
                    : <ChevronRight size={12} strokeWidth={1.8} style={{ opacity: 0.6 }} />}
                  {isOpen
                    ? <FolderOpen size={13} strokeWidth={1.6} style={{ opacity: 0.7, color: "var(--atlas-gold)" }} />
                    : <Folder size={13} strokeWidth={1.6} style={{ opacity: 0.7 }} />}
                  <span style={{ flex: 1 }}>{child.name}</span>
                </>
              )}
            </button>
            {!isFile && isOpen && (
              <FileTree
                node={child} depth={depth + 1}
                selectedPath={selectedPath} onSelect={onSelect}
                openMap={openMap} toggleOpen={toggleOpen} query={query}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Code Viewer ──────────────────────────────────────────────────────────────
function CodeViewer({ file }: { file: GeneratedFile }) {
  const [copied, setCopied] = useState(false);
  const lines = file.content.split("\n");

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
        <span style={{ flex: 1 }} />
        <span style={{ ...MONO, fontSize: 11, color: "var(--atlas-muted)" }}>
          {file.lines} lines · {(file.bytes / 1024).toFixed(1)} kb
        </span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(file.content);
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
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", background: "#0A0910" }}>
        <pre style={{
          margin: 0, padding: "14px 0", ...MONO,
          fontSize: 12.5, lineHeight: 1.65, color: "rgba(240,238,232,0.9)",
        }}>
          {lines.map((line, i) => (
            <div key={i} style={{ display: "flex", paddingLeft: 0 }}>
              <span style={{
                display: "inline-block", width: 48, textAlign: "right", paddingRight: 14,
                color: "rgba(255,255,255,0.22)", userSelect: "none", flexShrink: 0,
              }}>{i + 1}</span>
              <span style={{ flex: 1, paddingRight: 16, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {line || " "}
              </span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

// ── Activity rail (right) ────────────────────────────────────────────────────
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
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", height: "100%" }}>
      <div>
        <div style={{ ...MONO, fontSize: 10, letterSpacing: "0.16em", color: "var(--atlas-muted)", textTransform: "uppercase", marginBottom: 8 }}>
          Active Run
        </div>
        <div style={{
          padding: 12, borderRadius: 10,
          background: "color-mix(in oklab, var(--atlas-gold) 6%, transparent)",
          border: "1px solid color-mix(in oklab, var(--atlas-gold) 16%, transparent)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={{
              ...MONO, fontSize: 9.5, padding: "2px 6px", borderRadius: 4,
              background: `color-mix(in oklab, ${intentTint(run.intent)} 16%, transparent)`,
              color: intentTint(run.intent), letterSpacing: "0.1em",
            }}>{run.intent}</span>
            <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)" }}>{run.model}</span>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--atlas-fg)", lineHeight: 1.55 }}>
            {run.prompt}
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <Stat label="Files" value={run.filesChanged.toString()} />
        <Stat label="+Lines" value={`+${run.linesAdded}`} tint="#7CE3A0" />
        <Stat label="−Lines" value={`-${run.linesRemoved}`} tint="#FF8A8A" />
      </div>

      <div>
        <div style={{ ...MONO, fontSize: 10, letterSpacing: "0.16em", color: "var(--atlas-muted)", textTransform: "uppercase", marginBottom: 8 }}>
          Summary
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--atlas-fg)", lineHeight: 1.55, opacity: 0.85 }}>
          {run.summary}
        </p>
      </div>

      <div>
        <div style={{ ...MONO, fontSize: 10, letterSpacing: "0.16em", color: "var(--atlas-muted)", textTransform: "uppercase", marginBottom: 8 }}>
          Files in this run
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {files.map((f) => (
            <div key={f.id} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
              borderRadius: 6, background: "rgba(255,255,255,0.02)",
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: 99, background: statusColor(f.status),
                boxShadow: `0 0 6px ${statusColor(f.status)}`, flexShrink: 0,
              }} />
              <span style={{ ...MONO, fontSize: 11, color: "var(--atlas-fg)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.path}
              </span>
              <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)" }}>{f.lines}L</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ ...MONO, fontSize: 10, letterSpacing: "0.16em", color: "var(--atlas-muted)", textTransform: "uppercase", marginBottom: 8 }}>
          Run History
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {runs.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelectRun(r.id)}
              style={{
                textAlign: "left", cursor: "pointer",
                padding: "8px 10px", borderRadius: 8,
                border: "1px solid color-mix(in oklab, var(--atlas-gold) 10%, transparent)",
                background: r.id === run.id ? "rgba(230,198,135,0.04)" : "transparent",
                color: "var(--atlas-fg)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{
                  ...MONO, fontSize: 9, padding: "1px 5px", borderRadius: 3,
                  background: `color-mix(in oklab, ${intentTint(r.intent)} 14%, transparent)`,
                  color: intentTint(r.intent),
                }}>{r.intent}</span>
                {r.commitSha && (
                  <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)" }}>
                    <GitBranch size={9} style={{ display: "inline", marginRight: 3 }} />
                    {r.commitSha}
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <span style={{ ...MONO, fontSize: 9.5, color: "var(--atlas-muted)" }}>
                  {((r.durationMs ?? 0) / 1000).toFixed(1)}s
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--atlas-fg)", opacity: 0.8, lineHeight: 1.4 }}>
                {r.prompt.slice(0, 84)}{r.prompt.length > 84 ? "…" : ""}
              </p>
            </button>
          ))}
        </div>
      </div>
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
  const [selectedId, setSelectedId] = useState(MOCK_FILES[0].id);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [showRail, setShowRail] = useState(true);

  const file = useMemo(
    () => MOCK_FILES.find((f) => f.id === selectedId) ?? MOCK_FILES[0],
    [selectedId]
  );
  const tree = useMemo(() => buildTree(MOCK_FILES), []);

  const toggleOpen = (p: string) => setOpenMap((m) => ({ ...m, [p]: !(m[p] ?? true) }));

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh",
      background: "var(--atlas-bg)", color: "var(--atlas-fg)", overflow: "hidden",
    }}>
      {/* Ambient gold curtain */}
      <div style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: 800, height: 400, pointerEvents: "none",
        background: "radial-gradient(ellipse at center top, rgba(230,198,135,0.08), transparent 70%)",
      }} />

      {/* Top bar */}
      <header style={{
        position: "relative", zIndex: 10,
        display: "flex", alignItems: "center", gap: 12, padding: "12px 18px",
        borderBottom: "1px solid color-mix(in oklab, var(--atlas-gold) 12%, transparent)",
        background: "color-mix(in oklab, var(--atlas-surface) 70%, transparent)",
        backdropFilter: "blur(14px)",
      }}>
        <button
          onClick={() => navigate("/workspace")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px",
            background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8, color: "var(--atlas-muted)", cursor: "pointer", fontSize: 12,
          }}
        >
          <ArrowLeft size={13} /> Workspace
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: "linear-gradient(135deg, rgba(230,198,135,0.22), rgba(230,198,135,0.06))",
            border: "1px solid rgba(230,198,135,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--atlas-gold)",
          }}>
            <Code2 size={15} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
            <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: "-0.005em" }}>Generation Workspace</span>
            <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)", letterSpacing: "0.04em" }}>
              {MOCK_PROJECT.name} · {MOCK_PROJECT.repo}
            </span>
          </div>
        </div>

        <span style={{ flex: 1 }} />

        {/* Live status pill */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 10px", borderRadius: 99,
          background: "rgba(124,227,160,0.08)",
          border: "1px solid rgba(124,227,160,0.25)",
          color: "#7CE3A0", fontSize: 11, ...MONO, letterSpacing: "0.06em",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: 99, background: "#7CE3A0",
            boxShadow: "0 0 8px #7CE3A0",
          }} />
          MIRRORING CHAT
        </div>

        <ToolButton icon={<Wand2 size={13} />} label="Regenerate" />
        <ToolButton icon={<Hammer size={13} />} label="Extract to Forge" />
        <ToolButton icon={<Download size={13} />} label="Download .zip" />
        <ToolButton icon={<Github size={13} />} label="Push to GitHub" primary />
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
      </header>

      {/* Body */}
      <div style={{
        flex: 1, minHeight: 0, display: "grid",
        gridTemplateColumns: showRail ? "260px 1fr 340px" : "260px 1fr",
        gap: 12, padding: 12, position: "relative", zIndex: 1,
      }}>
        {/* LEFT — file tree */}
        <aside style={{ ...PANEL, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{
            padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <Layers size={13} style={{ color: "var(--atlas-gold)" }} />
            <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.14em", color: "var(--atlas-muted)", textTransform: "uppercase" }}>
              Files
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)" }}>{MOCK_FILES.length}</span>
          </div>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6, padding: "5px 8px",
              background: "rgba(255,255,255,0.03)", borderRadius: 7,
              border: "1px solid rgba(255,255,255,0.04)",
            }}>
              <Search size={11} style={{ color: "var(--atlas-muted)" }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find file…"
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: "var(--atlas-fg)", fontSize: 12, ...MONO,
                }}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "6px 6px 14px" }}>
            <FileTree
              node={tree} depth={0}
              selectedPath={file.path}
              onSelect={(f) => setSelectedId(f.id)}
              openMap={openMap} toggleOpen={toggleOpen} query={query}
            />
          </div>
          <div style={{
            padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.05)",
            display: "flex", alignItems: "center", gap: 6,
            ...MONO, fontSize: 10, color: "var(--atlas-muted)",
          }}>
            <Clock size={10} /> Updated {new Date(ACTIVE_RUN.finishedAt!).toLocaleTimeString()}
          </div>
        </aside>

        {/* CENTER — viewer */}
        <main style={{ ...PANEL, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          <CodeViewer file={file} />
        </main>

        {/* RIGHT — activity */}
        {showRail && (
          <aside style={{ ...PANEL, overflow: "hidden" }}>
            <ActivityRail run={ACTIVE_RUN} files={MOCK_FILES} />
          </aside>
        )}
      </div>
    </div>
  );
}

function ToolButton({ icon, label, primary }: { icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <button
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
        cursor: "pointer", letterSpacing: "-0.005em",
        boxShadow: primary ? "0 4px 14px rgba(230,198,135,0.25)" : "none",
      }}
    >
      {icon} {label}
    </button>
  );
}
