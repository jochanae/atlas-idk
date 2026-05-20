import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProject,
  useListProjects,
  useUpdateProject,
  useCreateProject,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import {
  type LinkedRepo,
  type GhRepo,
  type GhTreeItem,
  type GhTreeNode,
  type GhFileContent,
  type GhCommitSummary,
  CommitHistoryCard,
  CommitHistorySkeleton,
  GhTreeNodeRow,
  buildTree,
} from "../../pages/workspace";

export
function FilesTab({
  projectId,
  onFileContext,
  onLinkedRepoChange,
}: {
  projectId: number;
  onFileContext: (ctx: string | null) => void;
  onLinkedRepoChange: (repo: LinkedRepo | null) => void;
}) {
  const updateProject = useUpdateProject();
  const createProject = useCreateProject();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data: filesProject } = useGetProject(projectId, {
    query: { queryKey: getGetProjectQueryKey(projectId) },
  });
  const { data: allProjects } = useListProjects();

  const getGlobalToken = () => { try { return localStorage.getItem("atlas-github-token") || null; } catch { return null; } };
  const setGlobalToken = (t: string | null) => { try { if (t) localStorage.setItem("atlas-github-token", t); else localStorage.removeItem("atlas-github-token"); } catch {} };

  const [tokenState, setTokenState] = useState<string | null>(() => getGlobalToken());
  const [serverTokenAvailable, setServerTokenAvailable] = useState(false);
  const [serverTokenChecked, setServerTokenChecked] = useState(false);
  const tokenSynced = useRef(false);
  const [autoLinkStatus, setAutoLinkStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [autoLinkResult, setAutoLinkResult] = useState<{ linked: Array<{ projectName: string; repoFullName: string }>; skipped: string[] } | null>(null);

  // Check if server has a GITHUB_TOKEN configured — auto-connect if no manual token exists
  useEffect(() => {
    fetch("/api/github/server-token")
      .then(r => r.ok ? r.json() : { available: false })
      .then((d: any) => {
        const avail = !!d.available;
        setServerTokenAvailable(avail);
        setServerTokenChecked(true);
        if (avail && !getGlobalToken()) {
          setTokenState("__server__");
        }
      })
      .catch(() => setServerTokenChecked(true));
  }, []);

  useEffect(() => {
    if (!filesProject) return;
    const globalToken = getGlobalToken();
    const dbToken = filesProject.githubToken ?? null;

    if (globalToken || dbToken) {
      if (tokenSynced.current) return;
      tokenSynced.current = true;
      const t = globalToken ?? dbToken!;
      setTokenState(t);
      setGlobalToken(t);
      // Back-fill this project if it only had the token in localStorage
      // Never write the __server__ sentinel to the DB — it's not a real token
      if (!dbToken && t !== "__server__") updateProject.mutate({ id: projectId, data: { githubToken: t } });
      return;
    }

    // No token in localStorage or this project's DB — check sibling projects
    if (!allProjects) return;
    if (tokenSynced.current) return;
    tokenSynced.current = true;
    const sibling = allProjects.find((p) => p.id !== projectId && p.githubToken);
    if (sibling?.githubToken) {
      const t = sibling.githubToken;
      setTokenState(t);
      setGlobalToken(t);
      if (t !== "__server__") updateProject.mutate({ id: projectId, data: { githubToken: t } });
    }
  }, [filesProject, allProjects]);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenSaveError, setTokenSaveError] = useState<string | null>(null);
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
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);
  const [clearTokenError, setClearTokenError] = useState<string | null>(null);
  const [unlinkRepoError, setUnlinkRepoError] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const autoLoadedRef = useRef(false);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [fileSearch, setFileSearch] = useState("");

  const runAutoScan = (repo: GhRepo, token: string) => {
    const scanKey = `atlas-scan-${projectId}`;
    setScanStatus("scanning");
    fetch("/api/github/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-github-token": token },
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
    tokenSynced.current = false;
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
    if (!tokenState || autoLinkStatus === "running") return;
    setAutoLinkStatus("running");
    setAutoLinkResult(null);
    try {
      const res = await fetch("/api/github/auto-link", {
        method: "POST",
        headers: { "x-github-token": tokenState },
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

  const saveToken = (t: string) => {
    setTokenSaveError(null);
    setGlobalToken(t);
    updateProject.mutate(
      { id: projectId, data: { githubToken: t } },
      {
        onSuccess: () => {
          setTokenState(t);
          // Propagate token to every other project that doesn't have one yet
          (allProjects ?? [])
            .filter((p) => p.id !== projectId && !p.githubToken)
            .forEach((p) => {
              fetch(`/api/projects/${p.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ githubToken: t }),
              }).catch(() => {});
            });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? err?.message ?? "Failed to save token";
          setTokenSaveError(msg);
        },
      }
    );
  };

  const clearToken = () => {
    setClearTokenError(null);
    setIsDisconnecting(true);
    setGlobalToken(null); // clear globally
    updateProject.mutate(
      { id: projectId, data: { githubToken: null } },
      {
        onSuccess: () => {
          setIsDisconnecting(false);
          setDisconnectConfirm(false);
          setTokenState(null);
          setRepos([]); setSelectedRepo(null); setTree([]);
          setSelectedPath(null); setFileContent(null);
          setView("repos");
          onFileContext(null);
        },
        onError: (err: any) => {
          setIsDisconnecting(false);
          const msg = err?.response?.data?.error ?? err?.message ?? "Failed to disconnect GitHub";
          setClearTokenError(msg);
          setDisconnectConfirm(false);
        },
      }
    );
  };

  const ghFetch = useCallback(async (path: string) => {
    const res = await fetch(path, { headers: { "x-github-token": tokenState! } });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    return res.json();
  }, [tokenState]);

  useEffect(() => {
    if (!tokenState) return;
    setReposLoading(true);
    setReposError(null);
    ghFetch("/api/github/repos")
      .then((data) => setRepos(data as GhRepo[]))
      .catch((e) => setReposError(e.message))
      .finally(() => setReposLoading(false));
  }, [tokenState, ghFetch]);

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
    try {
      const savedRepo = JSON.parse(filesProject.linkedRepo) as GhRepo;
      const match = repos.find(r => r.fullName.toLowerCase() === savedRepo.fullName.toLowerCase());
      if (match) {
        autoLoadedRef.current = true;
        loadTree(match);
        // Re-inject cached scan context so AI always knows the repo structure
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
          } else if (tokenState) {
            runAutoScan(match, tokenState);
          }
        } catch {
          if (tokenState) runAutoScan(match, tokenState);
        }
      }
    } catch {}
  }, [repos, filesProject?.linkedRepo, loadTree]);

  // Link a repo to this project and load its tree
  const pickRepo = useCallback((repo: GhRepo) => {
    setLinkRepoError(null);
    updateProject.mutate(
      { id: projectId, data: { linkedRepo: JSON.stringify(repo) } },
      {
        onSuccess: () => {
          onLinkedRepoChange(repo);
          loadTree(repo);
          if (tokenState) runAutoScan(repo, tokenState);
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? err?.message ?? "Failed to link repo";
          setLinkRepoError(msg);
        },
      }
    );
  }, [projectId, updateProject, onLinkedRepoChange, loadTree, tokenState]);

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

  // Token setup screen — only show after server check, and only if no token at all
  if (!tokenState) {
    if (!serverTokenChecked) {
      // Still checking — show a brief loading state to avoid flash
      return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 10, color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)", opacity: 0.5 }}>connecting…</div>
        </div>
      );
    }
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 18px", gap: 14 }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" opacity={0.25}>
          <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48v-1.69c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0112 6.8c.85.004 1.71.11 2.51.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10.01 10.01 0 0022 12c0-5.52-4.48-10-10-10z" fill="var(--atlas-fg)" />
        </svg>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12.5, color: "var(--atlas-fg)", opacity: 0.7, fontWeight: 500, marginBottom: 5 }}>Connect GitHub</div>
          <div style={{ fontSize: 11, color: "var(--atlas-muted)", lineHeight: 1.6, opacity: 0.6 }}>
            Paste your GitHub token once — it works<br />across all your projects automatically.
          </div>
        </div>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 7 }}>
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
              outline: "none", boxSizing: "border-box",
              transition: "border-color 160ms ease",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = tokenSaveError ? "rgba(239,68,68,0.5)" : "rgba(201,162,76,0.4)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = tokenSaveError ? "rgba(239,68,68,0.5)" : "var(--atlas-border)")}
          />
          {tokenSaveError && (
            <div style={{ fontSize: 10, color: "rgba(252,165,165,0.85)", fontFamily: "var(--app-font-mono)", lineHeight: 1.4, marginTop: -2 }}>
              {tokenSaveError}
            </div>
          )}
          <button
            onClick={() => tokenInput.trim() && saveToken(tokenInput.trim())}
            disabled={!tokenInput.trim()}
            style={{
              padding: "7px", borderRadius: 6, width: "100%",
              background: tokenInput.trim() ? "var(--atlas-ember)" : "var(--atlas-surface)",
              border: "none", color: "var(--atlas-fg)", fontSize: 10,
              fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em",
              textTransform: "uppercase", cursor: tokenInput.trim() ? "pointer" : "not-allowed",
              transition: "background 160ms ease",
            }}
          >
            Connect
          </button>
        </div>
        <a
          href="https://github.com/settings/tokens/new?description=Atlas+Dev+Env&scopes=repo"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 9.5, color: "var(--atlas-gold)", opacity: 0.6, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em" }}
        >
          Create token on GitHub →
        </a>
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
          {tokenState === "__server__" ? (
            <span
              title="Connected automatically via Replit GitHub integration"
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 8px", borderRadius: 6,
                background: "rgba(52,211,153,0.07)",
                border: "1px solid rgba(52,211,153,0.18)",
                fontSize: 9.5, fontFamily: "var(--app-font-mono)",
                letterSpacing: "0.05em", color: "rgba(52,211,153,0.75)",
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#34d399", flexShrink: 0 }} />
              via Replit
            </span>
          ) : disconnectConfirm ? (
            <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 6, padding: "4px 8px" }}>
              <span style={{ fontSize: 10, fontFamily: "var(--app-font-mono)", color: "rgba(252,165,165,0.85)", letterSpacing: "0.04em" }}>Remove token?</span>
              <button
                onClick={() => setDisconnectConfirm(false)}
                disabled={isDisconnecting}
                style={{ background: "transparent", border: "1px solid var(--atlas-border)", borderRadius: 5, cursor: isDisconnecting ? "default" : "pointer", color: "var(--atlas-muted)", fontSize: 10, fontFamily: "var(--app-font-mono)", padding: "3px 8px", opacity: isDisconnecting ? 0.35 : 0.8, minHeight: 28 }}
              >Cancel</button>
              <button
                onClick={clearToken}
                disabled={isDisconnecting}
                style={{ background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.4)", borderRadius: 5, cursor: isDisconnecting ? "default" : "pointer", color: "rgba(252,165,165,0.95)", fontSize: 10, fontFamily: "var(--app-font-mono)", padding: "3px 8px", opacity: isDisconnecting ? 0.55 : 1, minHeight: 28 }}
              >{isDisconnecting ? "removing…" : "Remove"}</button>
            </div>
          ) : (
            <button
              onClick={() => setDisconnectConfirm(true)}
              title="Change GitHub token"
              style={{
                display: "flex", alignItems: "center", gap: 4,
                background: "rgba(var(--atlas-gold-rgb),0.06)",
                border: "1px solid rgba(var(--atlas-gold-rgb),0.18)",
                borderRadius: 6, cursor: "pointer",
                color: "rgba(var(--atlas-gold-rgb),0.65)", fontSize: 9.5,
                fontFamily: "var(--app-font-mono)", letterSpacing: "0.05em",
                padding: "4px 8px", minHeight: 28,
                transition: "all 140ms ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(var(--atlas-gold-rgb),0.12)"; e.currentTarget.style.color = "rgba(var(--atlas-gold-rgb),0.9)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(var(--atlas-gold-rgb),0.06)"; e.currentTarget.style.color = "rgba(var(--atlas-gold-rgb),0.65)"; }}
            >
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="5" cy="8" r="2.5" /><path d="M7.5 8h4M10 6v4" />
                <path d="M3 5.5L5.5 3 8 5.5" />
              </svg>
              token
            </button>
          )}
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

      {/* Inline errors for disconnect / unlink */}
      {clearTokenError && (
        <div style={{ margin: "4px 6px 0", padding: "6px 10px", borderRadius: 5, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 10, color: "rgba(252,165,165,0.85)", fontFamily: "var(--app-font-mono)", lineHeight: 1.4, display: "flex", alignItems: "flex-start", gap: 6 }}>
          <span style={{ flexShrink: 0, opacity: 0.7 }}>✕</span>
          <span>{clearTokenError}</span>
        </div>
      )}
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
              {commits.map((commit) => <CommitHistoryCard key={commit.sha} commit={commit} />)}
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
            <div style={{ padding: "16px 12px", textAlign: "center", fontSize: 11, color: "var(--atlas-ember)", fontFamily: "var(--app-font-mono)" }}>
              {reposError}
            </div>
          )}
          {linkRepoError && (
            <div style={{ margin: "4px 4px 2px", padding: "7px 10px", borderRadius: 5, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 10, color: "rgba(252,165,165,0.85)", fontFamily: "var(--app-font-mono)", lineHeight: 1.4 }}>
              {linkRepoError}
            </div>
          )}
          {!reposLoading && repos.map((repo) => {
            let linkedFullName: string | null = null;
            try {
              linkedFullName = filesProject?.linkedRepo ? JSON.parse(filesProject.linkedRepo).fullName : null;
            } catch {}
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
                          const token = localStorage.getItem("atlas-github-token") || null;
                          const repoJson = JSON.stringify(repo);
                          updateProject.mutate(
                            { id: newProject.id, data: { linkedRepo: repoJson, ...(token ? { githubToken: token } : {}) } },
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
    </div>
  );
}

export { FilesPanel };
