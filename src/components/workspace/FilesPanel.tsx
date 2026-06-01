import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGitHub } from "@/hooks/useGitHub";
import { Switch } from "@/components/ui/switch";
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
            Paste your project's Postgres connection string so Atlas can inspect its schema.
          </div>
          <DbUrlInput projectId={projectId} onSave={(url) => { onDbUrlChange(url); }} />
        </div>
      )}
    </div>
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
}) {
  const updateProject = useUpdateProject();
  const createProject = useCreateProject();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data: filesProject } = useGetProject(projectId, {
    query: { queryKey: getGetProjectQueryKey(projectId) },
  });
  const { data: allProjects } = useListProjects();

  const { isConnected, isLoading, error: githubConnectionError } = useGitHub();
  const token = isConnected ? "__account__" : null;
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
  const [view, setView] = useState<"repos" | "tree" | "file">("repos");
  const [filesSubTab, setFilesSubTab] = useState<"files" | "history">("files");
  const [commits, setCommits] = useState<GhCommitSummary[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const [commitsReason, setCommitsReason] = useState<string | null>(null);
  const [unlinkRepoError, setUnlinkRepoError] = useState<string | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const autoLoadedRef = useRef(false);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [fileSearch, setFileSearch] = useState("");

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

  // Reset auto-load gate when project switches
  useEffect(() => {
    autoLoadedRef.current = false;
    setSelectedRepo(null);
    setTree([]);
    setSelectedPath(null);
    setFileContent(null);
    setView("repos");
    setFilesSubTab("files");
    setCommits([]);
    setCommitsError(null);
    setCommitsReason(null);
    onFileContext(null);
  }, [projectId]);

  const loadCommits = useCallback(async () => {
    setCommitsLoading(true);
    setCommitsError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/commits`, { credentials: "include" });
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
  }, [projectId]);

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
          setView("repos");
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

  if (!isConnected) {
    if (isLoading) return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 10, color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)", opacity: 0.5 }}>connecting…</div>
      </div>
    );
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 18px", gap: 16 }}>
        {/* —— ZIP Upload —— */}
        <div style={{ width: "100%", marginBottom: 4 }}>
          <div style={{
            fontSize: 9.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--atlas-muted)", marginBottom: 8,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span>Upload ZIP</span>
            {zipLoaded && (
              <span style={{
                fontSize: 9, color: "rgba(134,239,172,0.8)",
                background: "rgba(134,239,172,0.08)",
                border: "1px solid rgba(134,239,172,0.2)",
                padding: "2px 7px", borderRadius: 10,
              }}>
                ACTIVE
              </span>
            )}
          </div>

          {zipLoaded ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 7,
              background: "rgba(201,162,76,0.05)",
              border: "1px solid rgba(201,162,76,0.2)",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(201,162,76,0.8)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
              </svg>
              <span style={{
                flex: 1, fontSize: 11, fontFamily: "var(--app-font-mono)",
                color: "rgba(201,162,76,0.85)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {zipFileName || "ZIP loaded"}
              </span>
              <button
                onClick={() => onZipTrigger?.()}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(201,162,76,0.2)",
                  borderRadius: 5, padding: "3px 9px",
                  fontSize: 9.5, fontFamily: "var(--app-font-mono)",
                  color: "rgba(201,162,76,0.6)",
                  cursor: "pointer", letterSpacing: "0.06em",
                }}
              >
                Replace
              </button>
            </div>
          ) : (
            <button
              onClick={() => onZipTrigger?.()}
              style={{
                width: "100%", padding: "11px 14px",
                background: "rgba(201,162,76,0.04)",
                border: "1px dashed rgba(201,162,76,0.25)",
                borderRadius: 7, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
                color: "rgba(201,162,76,0.7)",
                fontFamily: "var(--app-font-mono)",
                fontSize: 11, letterSpacing: "0.06em",
                textTransform: "uppercase",
                transition: "all 160ms ease",
                WebkitTapHighlightColor: "transparent",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(201,162,76,0.08)";
                e.currentTarget.style.borderColor = "rgba(201,162,76,0.4)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(201,162,76,0.04)";
                e.currentTarget.style.borderColor = "rgba(201,162,76,0.25)";
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload ZIP — no GitHub needed
            </button>
          )}

          <div style={{
            marginTop: 6, fontSize: 10, color: "rgba(120,113,108,0.5)",
            fontFamily: "var(--app-font-sans)", lineHeight: 1.5,
          }}>
            Drop a ZIP of your project and Atlas reads the code directly. No repo required.
          </div>
        </div>
        <div style={{
          padding: "12px 13px",
          borderRadius: 8,
          background: "rgba(239,68,68,0.06)",
          border: "1px solid rgba(239,68,68,0.18)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}>
          <div style={{ fontSize: 12, color: "rgba(252,165,165,0.9)", fontFamily: "var(--app-font-mono)", lineHeight: 1.5 }}>
            {githubConnectionError ?? GITHUB_RECONNECT_MESSAGE}
          </div>
          <button
            type="button"
            onClick={onOpenConnections}
            style={{
              alignSelf: "flex-start",
              padding: "7px 12px",
              borderRadius: 6,
              background: "rgba(201,162,76,0.12)",
              border: "1px solid rgba(201,162,76,0.3)",
              color: "var(--atlas-gold)",
              fontSize: 10,
              fontFamily: "var(--app-font-mono)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Open connections
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header breadcrumb */}
      <div style={{ padding: "7px 10px", borderBottom: "1px solid var(--atlas-border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <button
          onClick={() => { setFilesSubTab("files"); setView("repos"); setSelectedRepo(null); setSelectedPath(null); setFileContent(null); onFileContext(null); }}
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: view === "repos" ? "var(--atlas-fg)" : "var(--atlas-muted)", fontSize: 10, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", opacity: view === "repos" ? 0.8 : 0.45, flexShrink: 0 }}
        >
          repos
        </button>
        {selectedRepo && (
          <>
            <span style={{ color: "var(--atlas-border)", fontSize: 10, flexShrink: 0 }}>/</span>
            <button
              onClick={() => { setFilesSubTab("files"); setView("tree"); setSelectedPath(null); setFileContent(null); onFileContext(null); }}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: view === "tree" ? "var(--atlas-gold)" : "var(--atlas-muted)", fontSize: 10, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", opacity: view === "tree" ? 1 : 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 }}
            >
              {selectedRepo.name}
            </button>
            {/* Linked badge + unlink */}
            <span
              title="Linked to this project — auto-loads next time"
              style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                padding: "1px 5px", borderRadius: 3, flexShrink: 0,
                background: "rgba(52,211,153,0.07)",
                border: "0.5px solid rgba(52,211,153,0.2)",
              }}
            >
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
              <span title="Repo structure analyzed and injected into chat context" style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 5px", borderRadius: 3, flexShrink: 0, background: "rgba(201,162,76,0.07)", border: "0.5px solid rgba(201,162,76,0.2)" }}>
                <span style={{ fontSize: 7.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "var(--atlas-gold)" }}>◆ mapped</span>
              </span>
            )}
          </>
        )}
        {selectedPath && (
          <>
            <span style={{ color: "var(--atlas-border)", fontSize: 10, flexShrink: 0 }}>/</span>
            <span style={{ color: "var(--atlas-gold)", fontSize: 10, fontFamily: "var(--app-font-mono)", opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80 }}>
              {selectedPath.split("/").pop()}
            </span>
          </>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {selectedRepo && (
            <button
              onClick={unlinkRepo}
              disabled={isUnlinking}
              title="Unlink repo from this project"
              style={{ background: "transparent", border: "none", cursor: isUnlinking ? "default" : "pointer", color: "var(--atlas-muted)", fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em", opacity: isUnlinking ? 0.55 : 0.35, padding: "2px 4px" }}
              onMouseEnter={(e) => { if (!isUnlinking) e.currentTarget.style.opacity = "0.8"; }}
              onMouseLeave={(e) => { if (!isUnlinking) e.currentTarget.style.opacity = "0.35"; }}
            >
              {isUnlinking ? "unlinking…" : "unlink"}
            </button>
          )}
          <span style={{ fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", color: "#34d399", opacity: 0.75 }}>
            GitHub connected
          </span>
        </div>
      </div>

      {selectedRepo && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderBottom: "1px solid var(--atlas-border)", flexShrink: 0 }}>
          {(["files", "history"] as const).map((tab) => {
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
                {tab === "files" ? "Files" : "History"}
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

      {/* Repos list */}
      {filesSubTab === "files" && view === "repos" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }} className="scrollbar-none">

          {/* Auto-link all projects button — appears when repos are loaded */}
          {!reposLoading && repos.length > 0 && (allProjects ?? []).some(p => !p.linkedRepo) && (
            <div style={{ margin: "0 0 8px", padding: "8px 10px", borderRadius: 6, background: "rgba(201,162,76,0.04)", border: "1px solid rgba(201,162,76,0.14)" }}>
              {autoLinkStatus !== "done" && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 10.5, color: "var(--atlas-muted)", lineHeight: 1.4, opacity: 0.75 }}>
                    {(allProjects ?? []).filter(p => !p.linkedRepo).length} project{(allProjects ?? []).filter(p => !p.linkedRepo).length !== 1 ? "s" : ""} need a repo
                  </div>
                  <button
                    onClick={handleAutoLink}
                    disabled={autoLinkStatus === "running"}
                    style={{
                      flexShrink: 0, padding: "4px 10px", borderRadius: 4,
                      background: autoLinkStatus === "running" ? "rgba(201,162,76,0.08)" : "rgba(201,162,76,0.14)",
                      border: "1px solid rgba(201,162,76,0.3)",
                      color: "var(--atlas-gold)", fontSize: 10, fontFamily: "var(--app-font-mono)",
                      letterSpacing: "0.06em", cursor: autoLinkStatus === "running" ? "not-allowed" : "pointer",
                      opacity: autoLinkStatus === "running" ? 0.6 : 1, transition: "opacity 140ms ease",
                    }}
                  >
                    {autoLinkStatus === "running" ? "Linking…" : "Auto-link all →"}
                  </button>
                </div>
              )}
              {autoLinkStatus === "done" && autoLinkResult && (
                <div style={{ fontSize: 10, fontFamily: "var(--app-font-mono)", lineHeight: 1.7 }}>
                  {autoLinkResult.linked.length > 0 && (
                    <div style={{ color: "#34d399" }}>
                      ✓ Linked: {autoLinkResult.linked.map(l => l.projectName).join(", ")}
                    </div>
                  )}
                  {autoLinkResult.skipped.length > 0 && (
                    <div style={{ color: "var(--atlas-muted)", opacity: 0.65 }}>
                      — No match: {autoLinkResult.skipped.join(", ")}
                    </div>
                  )}
                  {autoLinkResult.linked.length === 0 && autoLinkResult.skipped.length === 0 && (
                    <div style={{ color: "var(--atlas-muted)" }}>All projects already linked.</div>
                  )}
                </div>
              )}
              {autoLinkStatus === "error" && autoLinkResult && (
                <div style={{ fontSize: 10, color: "rgba(252,165,165,0.85)", fontFamily: "var(--app-font-mono)" }}>
                  ✗ {autoLinkResult.skipped[0] ?? "Auto-link failed"}
                </div>
              )}
            </div>
          )}

          {reposLoading && (
            <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 10, ...sMuted, opacity: 0.4 }}>
              Loading repos…
            </div>
          )}
          {reposError && (
            <div style={{ padding: "16px 12px", textAlign: "center", fontSize: 11, color: "var(--atlas-ember)", fontFamily: "var(--app-font-mono)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <span>{reposError}</span>
              {reposError === GITHUB_RECONNECT_MESSAGE && (
                <button
                  type="button"
                  onClick={onOpenConnections}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 6,
                    background: "rgba(201,162,76,0.12)",
                    border: "1px solid rgba(201,162,76,0.3)",
                    color: "var(--atlas-gold)",
                    fontSize: 10,
                    fontFamily: "var(--app-font-mono)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  Open connections
                </button>
              )}
            </div>
          )}
          {linkRepoError && (
            <div style={{ margin: "4px 4px 2px", padding: "7px 10px", borderRadius: 5, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 10, color: "rgba(252,165,165,0.85)", fontFamily: "var(--app-font-mono)", lineHeight: 1.4 }}>
              {linkRepoError}
            </div>
          )}
          {!reposLoading && repos.map((repo) => {
            const linkedFullName = getLinkedRepoFullName(filesProject?.linkedRepo);
            const isLinked = linkedFullName === repo.fullName;
            return (
              <div
                key={repo.id}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 4,
                  marginBottom: 2,
                }}
              >
                {/* Main repo row — browse / link to current project */}
                <button
                  onClick={() => pickRepo(repo)}
                  style={{
                    flex: 1, display: "flex", flexDirection: "column", gap: 3,
                    padding: "8px 10px", borderRadius: 5,
                    background: isLinked ? "rgba(52,211,153,0.04)" : "transparent",
                    border: `1px solid ${isLinked ? "rgba(52,211,153,0.15)" : "transparent"}`,
                    cursor: "pointer", textAlign: "left",
                    transition: "all 120ms ease", minWidth: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (!isLinked) { e.currentTarget.style.background = "rgba(201,162,76,0.04)"; e.currentTarget.style.borderColor = "rgba(201,162,76,0.12)"; }
                  }}
                  onMouseLeave={(e) => {
                    if (!isLinked) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isLinked && (
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#34d399", flexShrink: 0 }} />
                    )}
                    <span style={{ fontSize: 12, color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)", fontWeight: isLinked ? 600 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{repo.name}</span>
                    {repo.private && (
                      <span style={{ fontSize: 8, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", padding: "1px 5px", borderRadius: 3, background: "rgba(var(--atlas-muted-rgb),0.12)", color: "var(--atlas-muted)", border: "0.5px solid rgba(var(--atlas-muted-rgb),0.2)", flexShrink: 0 }}>
                        private
                      </span>
                    )}
                    {repo.language && (
                      <span style={{ fontSize: 8.5, color: "var(--atlas-muted)", marginLeft: "auto", fontFamily: "var(--app-font-mono)", opacity: 0.55, flexShrink: 0 }}>{repo.language}</span>
                    )}
                  </div>
                  {repo.description && (
                    <div style={{ fontSize: 10.5, color: "var(--atlas-muted)", opacity: 0.55, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingLeft: isLinked ? 11 : 0 }}>
                      {repo.description}
                    </div>
                  )}
                </button>

                {/* Import → New project button */}
                <button
                  title={`Create a new Axiom project for ${repo.name}`}
                  onClick={() => {
                    createProject.mutate(
                      { data: { name: repo.name } },
                      {
                        onSuccess: (newProject) => {
                          const repoJson = serializeLinkedRepo(repo);
                          updateProject.mutate(
                            { id: newProject.id, data: { linkedRepo: repoJson } },
                            {
                              onSuccess: () => {
                                queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
                                navigate(`/project/${newProject.id}`);
                              },
                            }
                          );
                        },
                      }
                    );
                  }}
                  disabled={createProject.isPending}
                  style={{
                    flexShrink: 0, display: "flex", alignItems: "center", gap: 3,
                    padding: "5px 7px", borderRadius: 5,
                    background: "rgba(201,162,76,0.05)",
                    border: "1px solid rgba(201,162,76,0.15)",
                    cursor: createProject.isPending ? "not-allowed" : "pointer",
                    color: "rgba(201,162,76,0.55)",
                    transition: "all 140ms ease",
                    opacity: createProject.isPending ? 0.4 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!createProject.isPending) {
                      e.currentTarget.style.background = "rgba(201,162,76,0.12)";
                      e.currentTarget.style.borderColor = "rgba(201,162,76,0.35)";
                      e.currentTarget.style.color = "rgba(201,162,76,0.9)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(201,162,76,0.05)";
                    e.currentTarget.style.borderColor = "rgba(201,162,76,0.15)";
                    e.currentTarget.style.color = "rgba(201,162,76,0.55)";
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M6 1v10M1 6h10" />
                  </svg>
                  <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>project</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* File tree */}
      {filesSubTab === "files" && view === "tree" && (
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
          {/* Search input */}
          <div style={{ padding: "8px 12px 6px", borderBottom: "1px solid var(--atlas-border)" }}>
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
          </div>

          {/* File list — search results or tree */}
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
            ) : (
              // Normal tree view
              <div style={{ overflowY: "auto", flex: 1 }}>
                {tree.map((node) => (
                  <GhTreeNodeRow key={node.path} node={node} depth={0} selectedPath={selectedPath} onSelect={loadFile} />
                ))}
              </div>
            )
          )}
        </div>
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
                <div style={{
                  marginLeft: "auto", display: "flex", alignItems: "center", gap: 4,
                  padding: "2px 7px", borderRadius: 4,
                  background: "rgba(52,211,153,0.08)", border: "0.5px solid rgba(52,211,153,0.2)",
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px rgba(52,211,153,0.6)", flexShrink: 0 }} />
                  <span style={{ fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "#34d399" }}>
                    In context
                  </span>
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
      <div style={{ flexShrink: 0, padding: "0 10px 12px" }}>
        <DatabaseConnectionSection projectId={projectId} dbUrl={dbUrl} onDbUrlChange={onDbUrlChange} />
        {modelPickerToggleRow}
      </div>
    </div>
  );
}

