import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { updateProject, useUpdateProject, createProject, useCreateProject, useGetProject, getGetProjectQueryKey, useListProjects, getListProjectsQueryKey } from "@workspace/api-client-react";
import { useWorkspaceEvent } from "@/lib/workspaceEventBus";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGitHub } from "@/hooks/useGitHub";
import { Switch } from "@/components/ui/switch";
import type { WorkspaceLens } from "@/hooks/useChatLens";
import {
  type LinkedRepo,
  type GhRepo,
  type GhTreeItem,
  type GhTreeNode,
  type GhFileContent,
  type GhCommitSummary,
  CommitHistoryCard,
} from "../../pages/workspace";
import {
  CommitHistorySkeleton,
  GhTreeNodeRow,
  buildTree,
} from "@/components/workspace/CommitHistory";
import { getLinkedRepoFullName, parseLinkedRepo, serializeLinkedRepo } from "@/lib/githubRepo";
import { getAuthHeaders } from "@/lib/api";

// ── Lens-aware file bucket helpers ─────────────────────────────────
const IMAGE_EXT = new Set(["png","jpg","jpeg","gif","webp","svg","ico","avif","bmp","heic"]);
const DOC_EXT   = new Set(["md","mdx","txt","pdf","doc","docx","rtf","csv","xlsx","xls"]);
const ARCH_EXT  = new Set(["zip","tar","gz","tgz","rar","7z"]);
function extOf(p: string) { const i = p.lastIndexOf("."); return i >= 0 ? p.slice(i+1).toLowerCase() : ""; }
function bucketOf(p: string): "images"|"docs"|"archives"|"code" {
  const e = extOf(p);
  if (IMAGE_EXT.has(e)) return "images";
  if (DOC_EXT.has(e))   return "docs";
  if (ARCH_EXT.has(e))  return "archives";
  return "code";
}

const RECENTS_CAP = 20;
function readRecents(projectId: number): string[] {
  try { return JSON.parse(localStorage.getItem(`atlas-recents-${projectId}`) ?? "[]") as string[]; } catch { return []; }
}
function pushRecent(projectId: number, path: string) {
  try {
    const cur = readRecents(projectId).filter(p => p !== path);
    cur.unshift(path);
    localStorage.setItem(`atlas-recents-${projectId}`, JSON.stringify(cur.slice(0, RECENTS_CAP)));
  } catch {}
}

const GITHUB_RECONNECT_MESSAGE = "GitHub token needs to be reconnected.";

function DbUrlInput({ projectId, onSave }: { projectId: number; onSave: (url: string) => void }) {
  const [value, setValue] = useState("");

  const save = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    try { localStorage.setItem(`atlas-db-url-${projectId}`, trimmed); } catch {}
    onSave(trimmed);
    setValue("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        placeholder="postgres://user:pass@host/db"
        autoComplete="off"
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 6,
          background: "var(--atlas-surface)",
          border: "1px solid var(--atlas-border)",
          color: "var(--atlas-fg)",
          fontSize: 11,
          fontFamily: "var(--app-font-mono)",
          outline: "none",
          boxSizing: "border-box",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(201,162,76,0.4)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--atlas-border)")}
      />
      <button
        type="button"
        disabled={!value.trim()}
        onClick={save}
        style={{
          padding: "7px",
          borderRadius: 6,
          background: value.trim() ? "var(--atlas-gold)" : "var(--atlas-surface)",
          border: "none",
          color: value.trim() ? "#0D0B09" : "var(--atlas-muted)",
          fontSize: 10,
          fontFamily: "var(--app-font-mono)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          cursor: value.trim() ? "pointer" : "not-allowed",
        }}
      >
        Connect
      </button>
    </div>
  );
}

function githubHeaders(token: string | null): HeadersInit {
  return token ? { "x-github-token": token } : {};
}

function DatabaseConnectionSection({
  projectId,
  dbUrl,
  onDbUrlChange,
}: {
  projectId: number;
  dbUrl: string | null;
  onDbUrlChange: (url: string | null) => void;
}) {
  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--atlas-border)" }}>
      <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.13em", color: "var(--atlas-muted)", opacity: 0.65, textTransform: "uppercase", marginBottom: 8 }}>
        Database Connection
      </div>
      {dbUrl ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", flexShrink: 0, display: "inline-block" }} />
            <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, color: "var(--atlas-fg)", opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {dbUrl.replace(/:[^:@]*@/, ":***@")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const newUrl = prompt("Paste new PostgreSQL connection string (or leave blank to remove):");
              if (newUrl === null) return;
              if (!newUrl.trim()) {
                try { localStorage.removeItem(`atlas-db-url-${projectId}`); } catch {}
                onDbUrlChange(null);
              } else {
                try { localStorage.setItem(`atlas-db-url-${projectId}`, newUrl.trim()); } catch {}
                onDbUrlChange(newUrl.trim());
              }
            }}
            style={{ fontSize: 10, color: "var(--atlas-muted)", background: "transparent", border: "1px solid var(--atlas-border)", borderRadius: 5, padding: "3px 8px", cursor: "pointer", alignSelf: "flex-start", fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em" }}
          >
            Change
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, color: "var(--atlas-muted)", opacity: 0.6, lineHeight: 1.6 }}>
            Paste your project's Postgres connection string so Joy can inspect its schema.
          </div>
          <DbUrlInput projectId={projectId} onSave={(url) => { onDbUrlChange(url); }} />
        </div>
      )}
    </div>
  );
}

function RepoControlBar({
  repoFullName,
  scanStatus,
  importStatus,
  importResult,
  permissionStatus,
  statusLabel,
  onRunImport,
  onHydrate,
  onUnlink,
  onConnectGitHub,
  isUnlinking,
}: {
  repoFullName: string;
  scanStatus: "idle" | "scanning" | "done" | "error";
  importStatus: "idle" | "importing" | "done" | "error";
  importResult: { ledgerEntriesCreated: number; summary: string | null } | null;
  permissionStatus: "connected" | "read-only" | "not-connected";
  statusLabel: string;
  onRunImport: () => void;
  onHydrate: () => void;
  onUnlink: () => void;
  onConnectGitHub: () => void;
  isUnlinking: boolean;
}) {
  const repoShort = repoFullName.includes("/") ? repoFullName.split("/")[1] : repoFullName;

  const importBtn = (() => {
    if (importStatus === "importing") {
      return (
        <button disabled style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "4px 10px", borderRadius: 5,
          border: "1px solid var(--atlas-border)", background: "transparent",
          color: "var(--atlas-muted)", fontSize: 9.5, fontFamily: "var(--app-font-mono)",
          letterSpacing: "0.07em", cursor: "default", opacity: 0.65,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--atlas-gold)", flexShrink: 0, animation: "pulse 1.2s ease-in-out infinite" }} />
          Importing…
        </button>
      );
    }
    if (importStatus === "done") {
      return (
        <button onClick={onRunImport} title={importResult ? `${importResult.ledgerEntriesCreated} decisions added · click to re-run` : "Re-run deep import"} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "4px 10px", borderRadius: 5,
          border: "1px solid rgba(52,211,153,0.2)", background: "rgba(52,211,153,0.05)",
          color: "#34d399", fontSize: 9.5, fontFamily: "var(--app-font-mono)",
          letterSpacing: "0.07em", cursor: "pointer",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(52,211,153,0.4)"; e.currentTarget.style.background = "rgba(52,211,153,0.1)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(52,211,153,0.2)"; e.currentTarget.style.background = "rgba(52,211,153,0.05)"; }}
        >
          ✓ Imported · Re-run
        </button>
      );
    }
    if (importStatus === "error") {
      return (
        <button onClick={onRunImport} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "4px 10px", borderRadius: 5,
          border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.06)",
          color: "rgba(252,165,165,0.85)", fontSize: 9.5, fontFamily: "var(--app-font-mono)",
          letterSpacing: "0.07em", cursor: "pointer",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(239,68,68,0.45)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(239,68,68,0.25)"; }}
        >
          ↺ Retry Import
        </button>
      );
    }
    return (
      <button onClick={onRunImport} style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "4px 10px", borderRadius: 5,
        border: "1px solid rgba(201,162,76,0.3)", background: "rgba(201,162,76,0.07)",
        color: "var(--atlas-gold)", fontSize: 9.5, fontFamily: "var(--app-font-mono)",
        letterSpacing: "0.07em", cursor: "pointer", fontWeight: 600,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(201,162,76,0.55)"; e.currentTarget.style.background = "rgba(201,162,76,0.13)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(201,162,76,0.3)"; e.currentTarget.style.background = "rgba(201,162,76,0.07)"; }}
      >
        Deep Import
      </button>
    );
  })();

  const permBadge = (() => {
    if (permissionStatus === "connected") {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 3, background: "rgba(52,211,153,0.07)", border: "0.5px solid rgba(52,211,153,0.2)" }}>
          <span style={{ fontSize: 8, color: "#34d399" }}>✓</span>
          <span style={{ fontSize: 7.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "#34d399" }}>GitHub connected</span>
        </span>
      );
    }
    if (permissionStatus === "read-only") {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 3, background: "rgba(201,162,76,0.06)", border: "0.5px solid rgba(201,162,76,0.2)" }}>
          <span style={{ fontSize: 8, color: "var(--atlas-gold)" }}>🔒</span>
          <span style={{ fontSize: 7.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "var(--atlas-gold)" }}>Read-only</span>
        </span>
      );
    }
    return null;
  })();

  return (
    <div style={{
      padding: "8px 10px 6px",
      borderBottom: "1px solid var(--atlas-border)",
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      {/* Row 1: repo name + status badges */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 11, fontFamily: "var(--app-font-mono)", fontWeight: 600,
          color: "var(--atlas-fg)", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap", maxWidth: 120, flexShrink: 0,
        }} title={repoFullName}>
          {repoShort}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 5px", borderRadius: 3, flexShrink: 0, background: "rgba(52,211,153,0.07)", border: "0.5px solid rgba(52,211,153,0.2)" }}>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#34d399", flexShrink: 0 }} />
          <span style={{ fontSize: 7.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "#34d399" }}>linked</span>
        </span>
        {scanStatus === "scanning" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 5px", borderRadius: 3, flexShrink: 0, background: "rgba(201,162,76,0.07)", border: "0.5px solid rgba(201,162,76,0.2)" }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--atlas-gold)", flexShrink: 0, opacity: 0.7, animation: "pulse 1.2s ease-in-out infinite" }} />
            <span style={{ fontSize: 7.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "var(--atlas-gold)", opacity: 0.8 }}>analyzing…</span>
          </span>
        )}
        {scanStatus === "done" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 5px", borderRadius: 3, flexShrink: 0, background: "rgba(201,162,76,0.07)", border: "0.5px solid rgba(201,162,76,0.2)" }}>
            <span style={{ fontSize: 7.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "var(--atlas-gold)" }}>◆ mapped</span>
          </span>
        )}
        {permBadge}
      </div>

      {/* Row 2: action buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        {importBtn}
        <button
          onClick={onHydrate}
          disabled={scanStatus === "scanning"}
          title="Re-sync repo structure into chat context"
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 5,
            border: "1px solid var(--atlas-border)", background: "transparent",
            color: "var(--atlas-muted)", fontSize: 9.5, fontFamily: "var(--app-font-mono)",
            letterSpacing: "0.07em", cursor: scanStatus === "scanning" ? "default" : "pointer",
            opacity: scanStatus === "scanning" ? 0.5 : 1,
            transition: "opacity 160ms, border-color 160ms",
          }}
          onMouseEnter={e => { if (scanStatus !== "scanning") { e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; e.currentTarget.style.color = "var(--atlas-fg)"; } }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--atlas-border)"; e.currentTarget.style.color = "var(--atlas-muted)"; }}
        >
          ↺ Hydrate
        </button>
        <button
          onClick={onUnlink}
          disabled={isUnlinking}
          title="Unlink repo from this project"
          style={{
            display: "inline-flex", alignItems: "center",
            padding: "4px 8px", borderRadius: 5,
            border: "1px solid var(--atlas-border)", background: "transparent",
            color: "var(--atlas-muted)", fontSize: 9.5, fontFamily: "var(--app-font-mono)",
            letterSpacing: "0.07em", cursor: isUnlinking ? "default" : "pointer",
            opacity: isUnlinking ? 0.45 : 0.6,
            marginLeft: "auto",
          }}
          onMouseEnter={e => { if (!isUnlinking) { e.currentTarget.style.opacity = "1"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; e.currentTarget.style.color = "rgba(252,165,165,0.8)"; } }}
          onMouseLeave={e => { e.currentTarget.style.opacity = isUnlinking ? "0.45" : "0.6"; e.currentTarget.style.borderColor = "var(--atlas-border)"; e.currentTarget.style.color = "var(--atlas-muted)"; }}
        >
          {isUnlinking ? "unlinking…" : "Unlink"}
        </button>
      </div>

      {/* Row 3: read-only upgrade prompt */}
      {permissionStatus === "read-only" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 8px", borderRadius: 5,
          background: "rgba(201,162,76,0.04)", border: "0.5px solid rgba(201,162,76,0.15)",
          marginTop: 1,
        }}>
          <span style={{ fontSize: 10, color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)", opacity: 0.7, flex: 1 }}>
            Add a personal token to enable write access
          </span>
          <button
            onClick={onConnectGitHub}
            style={{
              flexShrink: 0, padding: "3px 8px", borderRadius: 4,
              border: "none", background: "rgba(201,162,76,0.12)",
              color: "var(--atlas-gold)", fontSize: 9.5, fontFamily: "var(--app-font-mono)",
              fontWeight: 600, letterSpacing: "0.07em", cursor: "pointer",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(201,162,76,0.22)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(201,162,76,0.12)"; }}
          >
            Connect GitHub →
          </button>
        </div>
      )}
    </div>
  );
}

function PullToWorkspaceButton({ projectId, path, content }: { projectId: number; path: string; content: string }) {
  const [status, setStatus] = useState<"idle" | "pulling" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  const handlePull = async () => {
    setStatus("pulling");
    setErr(null);
    try {
      const r = await fetch("/api/github/apply-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId, files: [{ path, content }] }),
      });
      if (!r.ok) { const d = await r.json() as { error?: string }; throw new Error(d.error ?? "Pull failed"); }
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2200);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Pull failed");
      setStatus("error");
      setTimeout(() => { setStatus("idle"); setErr(null); }, 3500);
    }
  };

  const label = status === "pulling" ? "Pulling…" : status === "done" ? "✓ Pulled" : status === "error" ? (err ?? "Error") : "↓ Pull";
  const isActive = status === "done";
  const isError = status === "error";

  return (
    <button
      type="button"
      disabled={status === "pulling" || status === "done"}
      onClick={() => void handlePull()}
      title="Copy this file into the local workspace"
      style={{
        padding: "2px 8px", borderRadius: 4, fontSize: 8.5,
        fontFamily: "var(--app-font-mono)", letterSpacing: "0.07em",
        background: isActive ? "rgba(52,211,153,0.08)" : isError ? "rgba(239,68,68,0.08)" : "transparent",
        border: `0.5px solid ${isActive ? "rgba(52,211,153,0.25)" : isError ? "rgba(239,68,68,0.3)" : "var(--atlas-border)"}`,
        color: isActive ? "#34d399" : isError ? "rgba(252,165,165,0.85)" : "var(--atlas-muted)",
        cursor: status === "pulling" || status === "done" ? "default" : "pointer",
        opacity: status === "pulling" ? 0.65 : 1,
        transition: "all 160ms ease",
        whiteSpace: "nowrap" as const,
      }}
    >
      {label}
    </button>
  );
}

export function FilesPanel({
  projectId,
  onFileContext,
  onLinkedRepoChange,
  dbUrl,
  onDbUrlChange,
  onZipTrigger,
  zipLoaded,
  zipFileName,
  onOpenConnections,
  onSwitchToSource,
  wsLens: wsLensProp,
}: {
  projectId: number;
  onFileContext: (ctx: string | null) => void;
  onLinkedRepoChange: (repo: LinkedRepo | null) => void;
  dbUrl: string | null;
  onDbUrlChange: (url: string | null) => void;
  onZipTrigger?: () => void;
  zipLoaded?: boolean;
  zipFileName?: string;
  onOpenConnections?: () => void;
  onSwitchToSource?: () => void;
  wsLens?: WorkspaceLens;
}) {
  // Live-subscribed lens: prefer prop, else read localStorage + listen for changes
  const [lensLocal, setLensLocal] = useState<WorkspaceLens>(() => {
    try { return (localStorage.getItem(`atlas-ws-lens-v2-${projectId}`) as WorkspaceLens) || "flow"; } catch { return "flow"; }
  });
  useEffect(() => {
    const key = `atlas-ws-lens-v2-${projectId}`;
    const onStorage = (e: StorageEvent) => { if (e.key === key && e.newValue) setLensLocal(e.newValue as WorkspaceLens); };
    const onCustom = () => { try { const v = localStorage.getItem(key) as WorkspaceLens | null; if (v) setLensLocal(v); } catch {} };
    window.addEventListener("storage", onStorage);
    window.addEventListener("atlas-lens-changed", onCustom);
    onCustom();
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("atlas-lens-changed", onCustom); };
  }, [projectId]);
  // Also subscribe via the event bus so same-tab lens changes propagate immediately.
  useWorkspaceEvent("lens-change", ({ lens }) => { setLensLocal(lens as WorkspaceLens); }, []);
  const wsLens: WorkspaceLens = wsLensProp ?? lensLocal;
  const updateProject = useUpdateProject();
  const createProject = useCreateProject();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data: filesProject } = useGetProject(projectId, {
    query: { queryKey: getGetProjectQueryKey(projectId) },
  });
  const { data: allProjects } = useListProjects();

  const {
    canRead,
    canWrite,
    isLoading,
    error: githubConnectionError,
    statusLabel: githubStatusLabelFromHook,
    status: githubPermissionStatus,
    tokenHeader,
    connect,
  } = useGitHub(projectId);
  const [showModelPicker, setShowModelPicker] =
    useState(() =>
      localStorage.getItem("atlas-power-model-picker")
      === "1"
    );
  const [autoLinkStatus, setAutoLinkStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [autoLinkResult, setAutoLinkResult] = useState<{ linked: Array<{ projectName: string; repoFullName: string }>; skipped: string[] } | null>(null);
  const [repos, setRepos] = useState<GhRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [linkRepoError, setLinkRepoError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<GhRepo | null>(null);
  const [tree, setTree] = useState<GhTreeNode[]>([]);
  const [flatFiles, setFlatFiles] = useState<Array<{ path: string; name: string }>>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [repoBranch, setRepoBranch] = useState("main");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<GhFileContent | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const isConnected = !!filesProject?.linkedRepo || !!zipLoaded || !!dbUrl;
  const [view, setView] = useState<"tree" | "file">("tree");
  const [filesSubTab, setFilesSubTabState] = useState<"files" | "history" | "github">(() => {
    try { return (localStorage.getItem(`atlas-files-subtab-${projectId}`) as "files" | "history" | "github") || "files"; } catch { return "files"; }
  });
  const setFilesSubTab = (tab: "files" | "history" | "github") => {
    try { localStorage.setItem(`atlas-files-subtab-${projectId}`, tab); } catch {}
    setFilesSubTabState(tab);
  };
  const [commits, setCommits] = useState<GhCommitSummary[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const [commitsReason, setCommitsReason] = useState<string | null>(null);
  const [unlinkRepoError, setUnlinkRepoError] = useState<string | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const autoLoadedRef = useRef(false);
  const [oauthConnected, setOauthConnected] = useState(false);

  useEffect(() => {
    fetch("/api/github/status", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data?.hasUserToken || data?.hasAccountToken) {
          setOauthConnected(true);
        }
      })
      .catch(() => {});
  }, []);

  const token = tokenHeader ?? (oauthConnected ? "__oauth__" : null);
  const canBrowseGitHub = canRead || oauthConnected;
  const githubStatusLabel = oauthConnected ? "GitHub connected" : githubStatusLabelFromHook;
  const [tokenInput, setTokenInput] = useState("");
  const [tokenSaveError, setTokenSaveError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const importKey = `atlas-full-import-${projectId}`;
  const [importStatus, setImportStatus] = useState<"idle" | "importing" | "done" | "error">(() => {
    try { return localStorage.getItem(importKey) ? "done" : "idle"; } catch { return "idle"; }
  });
  const [importResult, setImportResult] = useState<{
    decisions: string[];
    tables: string[];
    stack: string[];
    ledgerEntriesCreated: number;
    summary: string | null;
  } | null>(() => {
    try {
      const raw = localStorage.getItem(importKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [fileSearch, setFileSearch] = useState("");
  const [treeViewMode, setTreeViewMode] = useState<"tree" | "buckets">(() => (wsLens === "build" ? "tree" : "buckets"));
  const lastLensRef = useRef<WorkspaceLens>(wsLens);
  useEffect(() => {
    if (lastLensRef.current !== wsLens) {
      lastLensRef.current = wsLens;
      setTreeViewMode(wsLens === "build" ? "tree" : "buckets");
    }
  }, [wsLens]);
  const [recents, setRecents] = useState<string[]>(() => readRecents(projectId));
  useEffect(() => { setRecents(readRecents(projectId)); }, [projectId]);


  const runAutoScan = (repo: GhRepo, token: string) => {
    const scanKey = `atlas-scan-${projectId}`;
    setScanStatus("scanning");
    fetch("/api/github/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...githubHeaders(token) },
      body: JSON.stringify({ repo: repo.fullName, branch: repo.defaultBranch }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) { setScanStatus("error"); return; }
        try { localStorage.setItem(scanKey, JSON.stringify(data)); } catch {}
        setScanStatus("done");
        const lines = [
          `[Repo overview — ${data.repo}]`,
          `Stack: ${(data.stack as string[] || []).join(", ")}`,
          `Routes: ${(data.routes as string[] || []).slice(0, 12).join(", ")}`,
          `Pages: ${(data.pages as string[] || []).slice(0, 12).join(", ")}`,
          data.tables?.length ? `Tables: ${(data.tables as string[]).join(", ")}` : "",
          `Summary: ${data.summary}`,
        ].filter(Boolean);
        onFileContext(lines.join("\n"));
      })
      .catch(() => setScanStatus("error"));
  };

  const runFullImport = () => {
    if (importStatus === "importing") return;
    const token = tokenHeader ?? "__server__";
    setImportStatus("importing");
    fetch("/api/github/full-import", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders(), "x-github-token": token },
      body: JSON.stringify({ projectId }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        const result = {
          decisions: data.decisions ?? [],
          tables: data.tables ?? [],
          stack: data.stack ?? [],
          ledgerEntriesCreated: data.ledgerEntriesCreated ?? 0,
          summary: data.summary ?? null,
        };
        try { localStorage.setItem(importKey, JSON.stringify(result)); } catch {}
        setImportResult(result);
        setImportStatus("done");
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      })
      .catch(() => setImportStatus("error"));
  };

  // Reset auto-load gate when project switches
  useEffect(() => {
    autoLoadedRef.current = false;
    setSelectedRepo(null);
    setTree([]);
    setSelectedPath(null);
    setFileContent(null);
    setView("tree");
    const restoredTab = (() => { try { return (localStorage.getItem(`atlas-files-subtab-${projectId}`) as "files" | "history" | "github") || "files"; } catch { return "files" as const; } })();
    setFilesSubTabState(restoredTab);
    setCommits([]);
    setCommitsError(null);
    setCommitsReason(null);
    setImportStatus(localStorage.getItem(`atlas-full-import-${projectId}`) ? "done" : "idle");
    setImportResult(null);
    onFileContext(null);
  }, [projectId]);

  // Active branch — driven by axiom:branch-changed events from ShellBranchChip
  const [activeBranch, setActiveBranch] = useState<string | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const { projectId: epid, branch } = (e as CustomEvent<{ projectId: number; branch: string }>).detail;
      if (epid === projectId) setActiveBranch(branch === "default" ? null : branch);
    };
    window.addEventListener("axiom:branch-changed", handler);
    return () => window.removeEventListener("axiom:branch-changed", handler);
  }, [projectId]);
  // Reset when project switches
  useEffect(() => { setActiveBranch(null); }, [projectId]);

  const loadCommits = useCallback(async () => {
    setCommitsLoading(true);
    setCommitsError(null);
    try {
      const branchQuery = activeBranch ? `?branch=${encodeURIComponent(activeBranch)}` : "";
      const res = await fetch(`/api/projects/${projectId}/commits${branchQuery}`, { credentials: "include" });
      const data = await res.json().catch(() => ({})) as { commits?: GhCommitSummary[]; reason?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCommits(data.commits ?? []);
      setCommitsReason(data.reason ?? null);
    } catch (e) {
      setCommits([]);
      setCommitsReason(null);
      setCommitsError(e instanceof Error ? e.message : "Could not load commits");
    } finally {
      setCommitsLoading(false);
    }
  }, [projectId, activeBranch]);

  useEffect(() => {
    if (filesSubTab !== "history") return;
    void loadCommits();
  }, [filesSubTab, loadCommits]);

  const handleAutoLink = async () => {
    if (!token || autoLinkStatus === "running") return;
    setAutoLinkStatus("running");
    setAutoLinkResult(null);
    try {
      const res = await fetch("/api/github/auto-link", {
        method: "POST",
        headers: githubHeaders(token),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setAutoLinkResult({ linked: data.linked ?? [], skipped: data.skipped ?? [] });
      setAutoLinkStatus("done");
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    } catch (e: any) {
      setAutoLinkStatus("error");
      setAutoLinkResult({ linked: [], skipped: [e.message ?? "Unknown error"] });
    }
  };

  const ghFetch = useCallback(async (path: string) => {
    const res = await fetch(path, { headers: githubHeaders(token) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error(GITHUB_RECONNECT_MESSAGE);
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    return res.json();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setReposLoading(true);
    setReposError(null);
    ghFetch("/api/github/repos")
      .then((data) => setRepos(data as GhRepo[]))
      .catch((e) => setReposError(e.message))
      .finally(() => setReposLoading(false));
  }, [token, ghFetch]);

  const loadTree = useCallback(async (repo: GhRepo) => {
    setSelectedRepo(repo);
    setFilesSubTab("files");
    setView("tree");
    setTree([]);
    setTreeLoading(true);
    setTreeError(null);
    setSelectedPath(null);
    setFileContent(null);
    onFileContext(null);
    try {
      const data = await ghFetch(`/api/github/tree?repo=${encodeURIComponent(repo.fullName)}&branch=${repo.defaultBranch}`) as any;
      setRepoBranch(data.branch);
      const items = (data.tree as GhTreeItem[]).filter(i => i.type === "blob" || i.type === "tree");
      const nodes = buildTree(items);
      setTree(nodes);
      setFlatFiles(items.filter(i => i.type === "blob").map(i => ({
        path: i.path,
        name: i.path.split("/").pop() ?? i.path,
      })));
    } catch (e: any) {
      setTreeError(e.message);
    } finally {
      setTreeLoading(false);
    }
  }, [ghFetch, onFileContext]);

  // Auto-load linked repo once repos are available (from DB)
  useEffect(() => {
    if (autoLoadedRef.current || repos.length === 0 || !filesProject?.linkedRepo) return;
    const savedRepo = parseLinkedRepo(filesProject.linkedRepo);
    if (!savedRepo?.fullName) return;

    const match = repos.find(r => r.fullName.toLowerCase() === savedRepo.fullName.toLowerCase());
    if (!match) return;

    autoLoadedRef.current = true;
    loadTree(match);
    const scanKey = `atlas-scan-${projectId}`;
    try {
      const cached = localStorage.getItem(scanKey);
      if (cached) {
        const data = JSON.parse(cached) as { repo: string; stack: string[]; routes: string[]; pages: string[]; tables?: string[]; summary: string };
        const lines = [
          `[Repo overview — ${data.repo}]`,
          `Stack: ${(data.stack || []).join(", ")}`,
          `Routes: ${(data.routes || []).slice(0, 12).join(", ")}`,
          `Pages: ${(data.pages || []).slice(0, 12).join(", ")}`,
          data.tables?.length ? `Tables: ${data.tables.join(", ")}` : "",
          `Summary: ${data.summary}`,
        ].filter(Boolean);
        setScanStatus("done");
        onFileContext(lines.join("\n"));
      } else if (token) {
        runAutoScan(match, token);
      }
    } catch {
      if (token) runAutoScan(match, token);
    }
  }, [repos, filesProject?.linkedRepo, loadTree, onFileContext, projectId, token]);

  // Link a repo to this project and load its tree
  const pickRepo = useCallback((repo: GhRepo) => {
    setLinkRepoError(null);
    updateProject.mutate(
      { id: projectId, data: { linkedRepo: serializeLinkedRepo(repo) } },
      {
        onSuccess: () => {
          onLinkedRepoChange(repo);
          loadTree(repo);
          if (token) runAutoScan(repo, token);
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? err?.message ?? "Failed to link repo";
          setLinkRepoError(msg);
        },
      }
    );
  }, [projectId, updateProject, onLinkedRepoChange, loadTree, token]);

  // Unlink the repo from this project
  const unlinkRepo = useCallback(() => {
    setUnlinkRepoError(null);
    setIsUnlinking(true);
    updateProject.mutate(
      { id: projectId, data: { linkedRepo: null } },
      {
        onSuccess: () => {
          setIsUnlinking(false);
          onLinkedRepoChange(null);
          autoLoadedRef.current = false;
          setSelectedRepo(null);
          setTree([]);
          setSelectedPath(null);
          setFileContent(null);
          setView("tree");
          onFileContext(null);
        },
        onError: (err: any) => {
          setIsUnlinking(false);
          const msg = err?.response?.data?.error ?? err?.message ?? "Failed to unlink repo";
          setUnlinkRepoError(msg);
        },
      }
    );
  }, [projectId, updateProject, onLinkedRepoChange, onFileContext]);

  const loadFile = useCallback(async (path: string) => {
    if (!selectedRepo) return;
    setFilesSubTab("files");
    setSelectedPath(path);
    pushRecent(projectId, path);
    setRecents(readRecents(projectId));
    setView("file");
    setFileContent(null);
    setFileLoading(true);
    setFileError(null);
    onFileContext(null);
    try {
      const data = await ghFetch(
        `/api/github/file?repo=${encodeURIComponent(selectedRepo.fullName)}&path=${encodeURIComponent(path)}&branch=${repoBranch}`
      ) as GhFileContent;
      setFileContent(data);
      const ctx = `File: ${data.path} (${selectedRepo.fullName}, branch: ${repoBranch})\n\`\`\`\n${data.content}\n\`\`\``;
      onFileContext(ctx);
    } catch (e: any) {
      setFileError(e.message);
    } finally {
      setFileLoading(false);
    }
  }, [selectedRepo, repoBranch, ghFetch, onFileContext]);

  const sMono: React.CSSProperties = { fontFamily: "var(--app-font-mono)" };
  const sMuted = { color: "var(--atlas-muted)", ...sMono };
  const onShowModelPickerChange = (checked: boolean) => {
    if (checked) {
      localStorage.setItem("atlas-power-model-picker", "1");
      setShowModelPicker(true);
    } else {
      localStorage.removeItem("atlas-power-model-picker");
      setShowModelPicker(false);
    }
  };
  const saveToken = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setTokenSaveError(null);
    const connected = await connect(trimmed);
    if (connected) {
      setTokenInput("");
      return;
    }
    setTokenSaveError(githubConnectionError ?? "Failed to save token");
  }, [connect, githubConnectionError]);
  const modelPickerToggleRow = (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--atlas-border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--atlas-fg)", opacity: 0.75 }}>
            Manual model selection
          </div>
          <div style={{ fontSize: 11, color: "var(--atlas-muted)", opacity: 0.55, marginTop: 2 }}>
            Show model picker in message bar
          </div>
        </div>
        <Switch
          checked={showModelPicker}
          onCheckedChange={onShowModelPickerChange}
        />
      </div>
    </div>
  );

  if (!canBrowseGitHub) {
    if (isLoading) return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 10, color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)", opacity: 0.5 }}>connecting…</div>
      </div>
    );
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 18px", gap: 14 }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" opacity={0.25}>
          <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48v-1.69c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0112 6.8c.85.004 1.71.11 2.51.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10.01 10.01 0 0022 12c0-5.52-4.48-10-10-10z" fill="var(--atlas-fg)" /></svg>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12.5, color: "var(--atlas-fg)", opacity: 0.7, fontWeight: 500, marginBottom: 5 }}>Connect GitHub</div>
          <div style={{ fontSize: 11, color: "var(--atlas-muted)", lineHeight: 1.6, opacity: 0.6 }}>
            Connect your GitHub account to link repos<br />and enable AI write-back across all projects.
          </div>
        </div>
        <button
          onClick={async () => {
            try {
              const { stashOauthReturn } = await import("@/lib/oauthReturn");
              stashOauthReturn();
              const res = await fetch("/api/github/oauth/start", {
                method: "GET",
                credentials: "include",
                headers: { Accept: "application/json" },
              });
              if (res.status === 401) {
                // Not logged in — send to login
                window.location.href = "/login?reason=session_expired";
                return;
              }
              const data = await res.json();
              if (data.url) {
                window.location.href = data.url;
              } else {
                alert("Failed to start GitHub connection");
              }
            } catch (err) {
              alert("Network error. Try again.");
            }
          }}
          style={{
            display: "block",
            padding: "8px 14px",
            borderRadius: 6,
            background: "rgba(201,162,76,0.12)",
            color: "#C9A24C",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            border: "none",
            fontFamily: "var(--app-font-mono)",
          }}
        >
          Connect via GitHub →
        </button>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 10, color: "var(--atlas-muted)", opacity: 0.5, textAlign: "center", fontFamily: "var(--app-font-mono)" }}>or paste a personal access token</div>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => { setTokenInput(e.target.value); setTokenSaveError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && tokenInput.trim()) saveToken(tokenInput.trim()); }}
            placeholder="ghp_…"
            autoComplete="off"
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6,
              background: "var(--atlas-surface)",
              border: `1px solid ${tokenSaveError ? "rgba(239,68,68,0.5)" : "var(--atlas-border)"}`,
              color: "var(--atlas-fg)", fontSize: 11, fontFamily: "var(--app-font-mono)",
              outline: "none", boxSizing: "border-box", transition: "border-color 160ms ease",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = tokenSaveError ? "rgba(239,68,68,0.5)" : "rgba(201,162,76,0.4)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = tokenSaveError ? "rgba(239,68,68,0.5)" : "var(--atlas-border)")}
          />
          {tokenSaveError && (
            <div style={{ fontSize: 10, color: "rgba(252,165,165,0.85)", fontFamily: "var(--app-font-mono)", lineHeight: 1.4, marginTop: -2 }}>{tokenSaveError}</div>
          )}
          <button
            type="button"
            onClick={() => tokenInput.trim() && saveToken(tokenInput.trim())}
            disabled={!tokenInput.trim()}
            style={{
              padding: "7px", borderRadius: 6, width: "100%",
              background: tokenInput.trim() ? "var(--atlas-ember)" : "var(--atlas-surface)",
              border: "none", color: "var(--atlas-fg)", fontSize: 10,
              fontFamily: "var(--app-font-mono)",
              letterSpacing: "0.1em",
              textTransform: "uppercase", cursor: tokenInput.trim() ? "pointer" : "not-allowed",
              transition: "background 160ms ease",
            }}
          >
            Connect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {canBrowseGitHub && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderBottom: "1px solid var(--atlas-border)", flexShrink: 0 }}>
          {(["files", "history", "github"] as const).map((tab) => {
            const active = filesSubTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setFilesSubTab(tab)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: `1px solid ${active ? "var(--atlas-gold)" : "var(--atlas-border)"}`,
                  background: active ? "rgba(var(--atlas-gold-rgb),0.10)" : "transparent",
                  color: active ? "var(--atlas-gold)" : "var(--atlas-muted)",
                  cursor: "pointer",
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 9.5,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {tab === "files" ? "Files" : tab === "history" ? "Commits" : "GitHub"}
              </button>
            );
          })}
          {filesSubTab === "history" && (
            <button
              type="button"
              onClick={() => void loadCommits()}
              aria-label="Refresh commit history"
              disabled={commitsLoading}
              style={{
                marginLeft: "auto",
                width: 28,
                height: 28,
                borderRadius: 7,
                border: "1px solid var(--atlas-border)",
                background: "transparent",
                color: "var(--atlas-muted)",
                cursor: commitsLoading ? "default" : "pointer",
                opacity: commitsLoading ? 0.45 : 0.8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ↻
            </button>
          )}
        </div>
      )}

      {/* Source-of-truth label — shown whenever a sub-tab is active so users
          always know whether they're looking at live workspace files or GitHub. */}
      {canBrowseGitHub && (filesSubTab === "files" || filesSubTab === "github" || filesSubTab === "history") && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 12px",
            borderBottom: "1px solid var(--atlas-border)",
            flexShrink: 0,
            background: filesSubTab === "files"
              ? "rgba(201,162,76,0.04)"
              : "transparent",
          }}
        >
          {filesSubTab === "files" && (
            <>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: "rgba(201,162,76,0.7)", flexShrink: 0 }} />
              <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "var(--atlas-gold)", opacity: 0.85, textTransform: "uppercase" }}>
                GitHub · remote sync view
              </span>
              <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45, marginLeft: 2 }}>
                — Joy reads from workspace disk
              </span>
            </>
          )}
          {filesSubTab === "github" && (
            <>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: "rgba(148,163,184,0.5)", flexShrink: 0 }} />
              <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "var(--atlas-muted)", opacity: 0.7, textTransform: "uppercase" }}>
                GitHub · linked repository
              </span>
            </>
          )}
          {filesSubTab === "history" && (
            <>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: "rgba(148,163,184,0.5)", flexShrink: 0 }} />
              <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "var(--atlas-muted)", opacity: 0.7, textTransform: "uppercase" }}>
                GitHub · commit history
              </span>
            </>
          )}
        </div>
      )}

      {/* Inline errors for unlink */}
      {unlinkRepoError && (
        <div style={{ margin: "4px 6px 0", padding: "6px 10px", borderRadius: 5, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 10, color: "rgba(252,165,165,0.85)", fontFamily: "var(--app-font-mono)", lineHeight: 1.4, display: "flex", alignItems: "flex-start", gap: 6 }}>
          <span style={{ flexShrink: 0, opacity: 0.7 }}>✕</span>
          <span>{unlinkRepoError}</span>
        </div>
      )}

      {filesSubTab === "history" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px 14px" }} className="scrollbar-none">
          {commitsLoading ? (
            <CommitHistorySkeleton />
          ) : commitsError ? (
            <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--atlas-ember)", fontSize: 11, fontFamily: "var(--app-font-mono)", lineHeight: 1.5 }}>
              {commitsError}
            </div>
          ) : commits.length === 0 ? (
            <div style={{ padding: "34px 12px", textAlign: "center", color: "var(--atlas-muted)", fontSize: 12, lineHeight: 1.6 }}>
              {commitsReason === "no_repo" ? "No commits yet. Link a GitHub repo to see history." : "No commits yet."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {commits.map((commit, i) => <CommitHistoryCard key={commit.sha} commit={commit} projectId={projectId} canRevert={i !== commits.length - 1} />)}
            </div>
          )}
        </div>
      )}

      {filesSubTab === "github" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px 14px" }} className="scrollbar-none">
          {!selectedRepo && !filesProject?.linkedRepo ? (
            <div>
              <div style={{ padding: "0 2px 10px", fontFamily: "var(--app-font-mono)", fontSize: 10, color: "var(--atlas-muted)", opacity: 0.65 }}>
                Link a repository to this project:
              </div>

              {reposLoading && (
                <div style={{ padding: "20px 12px", textAlign: "center", color: "var(--atlas-muted)", fontSize: 11, opacity: 0.45 }}>Loading…</div>
              )}
              {reposError && (
                <div style={{ padding: "10px 12px", borderRadius: 5, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 10, color: "rgba(252,165,165,0.85)", fontFamily: "var(--app-font-mono)" }}>{reposError}</div>
              )}
              {!reposLoading && repos.length === 0 && !reposError && (
                <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--atlas-muted)", fontSize: 11, opacity: 0.5 }}>No repositories found</div>
              )}
              {repos.map((repo) => (
                <button
                  key={repo.fullName}
                  type="button"
                  onClick={() => void pickRepo(repo)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--atlas-border)", background: "transparent", color: "var(--atlas-fg)", cursor: "pointer", marginBottom: 4, textAlign: "left" as const, fontFamily: "var(--app-font-mono)", fontSize: 11 }}
                >
                  {repo.fullName}
                </button>
              ))}
            </div>
          ) : (() => {
            const effectiveRepo = selectedRepo ?? parseLinkedRepo(filesProject?.linkedRepo ?? null);
            if (!effectiveRepo) return <div style={{ padding: "20px 12px", textAlign: "center", color: "var(--atlas-muted)", fontSize: 11, opacity: 0.45 }}>Loading…</div>;
            return (
              <RepoControlBar
                repoFullName={effectiveRepo.fullName}
                scanStatus={scanStatus}
                importStatus={importStatus}
                importResult={importResult}
                permissionStatus={githubPermissionStatus}
                statusLabel={githubStatusLabel}
                onRunImport={runFullImport}
                onHydrate={() => { if (effectiveRepo && token) runAutoScan(effectiveRepo as GhRepo, token); }}
                onUnlink={unlinkRepo}
                onConnectGitHub={() => { void connect(tokenInput || ""); }}
                isUnlinking={isUnlinking}
              />
            );
          })()}
        </div>
      )}

      {/* File tree */}
      {filesSubTab === "files" && view === "tree" && (
        <>

          <div style={{ flex: 1, overflowY: "auto", padding: "6px 2px" }} className="scrollbar-none">
            {treeLoading && (
              <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 10, ...sMuted, opacity: 0.4 }}>
                Loading tree…
              </div>
            )}
            {treeError && (
              <div style={{ padding: "16px 12px", textAlign: "center", fontSize: 11, color: "var(--atlas-ember)", fontFamily: "var(--app-font-mono)" }}>
                {treeError}
              </div>
            )}
            {/* Search input + Tree/Type toggle */}
            <div style={{ padding: "8px 12px 6px", borderBottom: "1px solid var(--atlas-border)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: "var(--atlas-bg)", border: "1px solid var(--atlas-border)" }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--atlas-muted)" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="6.5" cy="6.5" r="4.5"/><path d="M11 11l2.5 2.5"/>
              </svg>
              <input
                value={fileSearch}
                onChange={e => setFileSearch(e.target.value)}
                placeholder="Search files..."
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: "var(--atlas-fg)", fontSize: 12,
                  fontFamily: "var(--app-font-sans)",
                }}
              />
              {fileSearch && (
                <button
                  onClick={() => setFileSearch("")}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--atlas-muted)", fontSize: 14, lineHeight: 1, padding: 0 }}
                >
                  ×
                </button>
              )}
            </div>
            {!fileSearch.trim() && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {(["tree", "buckets"] as const).map((m) => {
                  const active = treeViewMode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTreeViewMode(m)}
                      style={{
                        padding: "3px 10px",
                        borderRadius: 999,
                        border: `1px solid ${active ? "var(--atlas-gold)" : "var(--atlas-border)"}`,
                        background: active ? "rgba(201,162,76,0.10)" : "transparent",
                        color: active ? "var(--atlas-gold)" : "var(--atlas-muted)",
                        cursor: "pointer",
                        fontFamily: "var(--app-font-mono)",
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      {m === "tree" ? "Tree" : "By Type"}
                    </button>
                  );
                })}
                <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.5, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {wsLens} lens
                </span>
              </div>
            )}
          </div>

          {/* Recents strip (when not searching) */}
          {!fileSearch.trim() && recents.length > 0 && (
            <div style={{ padding: "10px 12px 6px", borderBottom: "1px solid var(--atlas-border)" }}>
              <div style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.6, marginBottom: 6 }}>
                Recent
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {recents.slice(0, 6).map((p) => {
                  const name = p.split("/").pop() ?? p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => loadFile(p)}
                      title={p}
                      style={{
                        maxWidth: 160,
                        padding: "3px 9px",
                        borderRadius: 999,
                        background: "rgba(201,162,76,0.05)",
                        border: "1px solid rgba(201,162,76,0.18)",
                        color: "var(--atlas-fg)",
                        fontSize: 10,
                        fontFamily: "var(--app-font-mono)",
                        cursor: "pointer",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* File list — search results / tree / buckets */}
          {!treeLoading && (
            fileSearch.trim() ? (
              // Flat search results
              <div style={{ overflowY: "auto", flex: 1 }}>
                {flatFiles
                  .filter(f => f.path.toLowerCase().includes(fileSearch.toLowerCase()))
                  .slice(0, 50)
                  .map(f => (
                    <button
                      key={f.path}
                      onClick={() => { loadFile(f.path); setFileSearch(""); }}
                      style={{
                        width: "100%", textAlign: "left", padding: "8px 14px",
                        background: selectedPath === f.path ? "rgba(201,162,76,0.06)" : "transparent",
                        border: "none", cursor: "pointer", display: "flex", flexDirection: "column", gap: 2,
                        borderBottom: "1px solid var(--atlas-border)",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(201,162,76,0.04)")}
                      onMouseLeave={e => (e.currentTarget.style.background = selectedPath === f.path ? "rgba(201,162,76,0.06)" : "transparent")}
                    >
                      <span style={{ fontSize: 12, color: "var(--atlas-fg)", fontFamily: "var(--app-font-mono)" }}>
                        {f.name}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--atlas-muted)", opacity: 0.6, fontFamily: "var(--app-font-mono)" }}>
                        {f.path}
                      </span>
                    </button>
                  ))
                }
                {flatFiles.filter(f => f.path.toLowerCase().includes(fileSearch.toLowerCase())).length === 0 && (
                  <div style={{ padding: "24px 14px", textAlign: "center", color: "var(--atlas-muted)", fontSize: 11, fontFamily: "var(--app-font-mono)" }}>
                    No files matching "{fileSearch}"
                  </div>
                )}
              </div>
            ) : treeViewMode === "tree" ? (
              // Native folder tree (Build lens default)
              <div style={{ overflowY: "auto", flex: 1 }}>
                {tree.map((node) => (
                  <GhTreeNodeRow key={node.path} node={node} depth={0} selectedPath={selectedPath} onSelect={loadFile} />
                ))}
              </div>
            ) : (
              // By-Type buckets (Flow / Look / Scenario default)
              <BucketsView
                files={flatFiles}
                linkedRepo={selectedRepo}
                branch={repoBranch}
                selectedPath={selectedPath}
                onSelect={loadFile}
                lensIsVisual={wsLens === "look"}
              />
            )
          )}
          </div>
        </>
      )}

      {/* File content */}
      {filesSubTab === "files" && view === "file" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {fileLoading && (
            <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 10, ...sMuted, opacity: 0.4 }}>
              Loading file…
            </div>
          )}
          {fileError && (
            <div style={{ padding: "16px 12px", textAlign: "center", fontSize: 11, color: "var(--atlas-ember)", fontFamily: "var(--app-font-mono)" }}>
              {fileError}
            </div>
          )}
          {fileContent && (
            <>
              <div style={{ padding: "6px 10px 5px", borderBottom: "1px solid var(--atlas-border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-gold)", opacity: 0.75, letterSpacing: "0.04em" }}>
                  {fileContent.lines} lines{fileContent.truncated ? " (truncated)" : ""}
                </span>
                <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.4, letterSpacing: "0.04em" }}>
                  {Math.round(fileContent.size / 1024 * 10) / 10} KB
                </span>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                  <PullToWorkspaceButton
                    projectId={projectId}
                    path={selectedPath ?? ""}
                    content={fileContent.content}
                  />
                  <div style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "2px 7px", borderRadius: 4,
                    background: "rgba(52,211,153,0.08)", border: "0.5px solid rgba(52,211,153,0.2)",
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px rgba(52,211,153,0.6)", flexShrink: 0 }} />
                    <span style={{ fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "#34d399" }}>
                      In context
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }} className="scrollbar-none">
                <pre style={{
                  margin: 0, fontSize: 10.5, lineHeight: 1.7,
                  color: "var(--atlas-fg)",
                  fontFamily: "var(--app-font-mono)",
                  whiteSpace: "pre-wrap", wordBreak: "break-all",
                }}>
                  {fileContent.content}
                </pre>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// BucketsView — lens-aware "By Type" presentation
// Images bucket leads, then Documents, then Archives, then collapsible Code.
// In Look lens, Images render as a visual grid; otherwise as a compact list.
// ─────────────────────────────────────────────────────────────────────
function BucketsView({
  files,
  linkedRepo,
  branch,
  selectedPath,
  onSelect,
  lensIsVisual,
}: {
  files: Array<{ path: string; name: string }>;
  linkedRepo: GhRepo | null;
  branch: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  lensIsVisual: boolean;
}) {
  const [codeOpen, setCodeOpen] = useState(false);
  const buckets = useMemo(() => {
    const out: Record<"images"|"docs"|"archives"|"code", typeof files> = { images: [], docs: [], archives: [], code: [] };
    for (const f of files) out[bucketOf(f.path)].push(f);
    return out;
  }, [files]);

  const sectionLabel: React.CSSProperties = {
    fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.16em",
    textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.7,
    margin: "0 0 8px",
  };
  const fileRow = (f: { path: string; name: string }) => {
    const active = selectedPath === f.path;
    return (
      <button
        key={f.path}
        type="button"
        onClick={() => onSelect(f.path)}
        style={{
          width: "100%", display: "flex", flexDirection: "column", gap: 2,
          padding: "7px 12px", textAlign: "left",
          background: active ? "rgba(201,162,76,0.08)" : "transparent",
          border: "none", borderBottom: "1px solid rgba(38,38,38,0.6)",
          cursor: "pointer", color: "var(--atlas-fg)",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(201,162,76,0.04)")}
        onMouseLeave={e => (e.currentTarget.style.background = active ? "rgba(201,162,76,0.08)" : "transparent")}
      >
        <span style={{ fontSize: 12, fontFamily: "var(--app-font-mono)" }}>{f.name}</span>
        <span style={{ fontSize: 10, color: "var(--atlas-muted)", opacity: 0.55, fontFamily: "var(--app-font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.path}</span>
      </button>
    );
  };

  return (
    <div style={{ overflowY: "auto", flex: 1, padding: "12px 12px 20px" }} className="scrollbar-none">
      {/* IMAGES */}
      {buckets.images.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h3 style={sectionLabel}>Images · {buckets.images.length}</h3>
          {lensIsVisual && linkedRepo ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
              {buckets.images.slice(0, 60).map((f) => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => onSelect(f.path)}
                  title={f.path}
                  style={{
                    aspectRatio: "1 / 1", padding: 0, border: "1px solid rgba(38,38,38,0.85)",
                    borderRadius: 10, overflow: "hidden", background: "rgba(10,10,10,0.6)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <img
                    src={`https://raw.githubusercontent.com/${linkedRepo.fullName}/${branch}/${f.path}`}
                    alt={f.name}
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </button>
              ))}
            </div>
          ) : (
            <div>{buckets.images.slice(0, 40).map(fileRow)}</div>
          )}
        </section>
      )}

      {/* DOCUMENTS */}
      {buckets.docs.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h3 style={sectionLabel}>Documents · {buckets.docs.length}</h3>
          <div>{buckets.docs.slice(0, 50).map(fileRow)}</div>
        </section>
      )}

      {/* ARCHIVES */}
      {buckets.archives.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h3 style={sectionLabel}>Archives · {buckets.archives.length}</h3>
          <div>{buckets.archives.map(fileRow)}</div>
        </section>
      )}

      {/* CODE (collapsed by default in non-Build lenses) */}
      {buckets.code.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setCodeOpen((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "transparent", border: "none", padding: 0,
              color: "var(--atlas-muted)", cursor: "pointer", marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 11, color: "var(--atlas-gold)", opacity: 0.7 }}>{codeOpen ? "▾" : "▸"}</span>
            <h3 style={{ ...sectionLabel, margin: 0 }}>Code · {buckets.code.length}</h3>
          </button>
          {codeOpen && <div>{buckets.code.slice(0, 200).map(fileRow)}</div>}
        </section>
      )}

      {files.length === 0 && (
        <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--atlas-muted)", fontSize: 11, fontFamily: "var(--app-font-mono)", opacity: 0.6 }}>
          No files yet.
        </div>
      )}
    </div>
  );
}


