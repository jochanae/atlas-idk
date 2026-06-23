import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Plus, Save, Trash2, RefreshCw, GitCommit, GitMerge, History, FileCode } from "lucide-react";

interface FsNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: FsNode[];
}

interface TreeResponse extends FsNode {
  workspaceDir: string;
  children: FsNode[];
}

interface GitStatusResponse {
  files: Record<string, string>;
  hasRemote?: boolean;
}

interface GitLogEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}

interface GitLogResponse {
  commits: GitLogEntry[];
}

interface Props {
  projectId: number;
  onOpenTerminal?: () => void;
}

const BASE = `/api/fs`;

async function apiFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Map git status code → { label, color }
function gitBadge(code: string): { label: string; color: string } | null {
  if (!code) return null;
  const x = code[0] ?? " ";
  const y = code[1] ?? " ";
  if (x === "?" && y === "?") return { label: "?", color: "rgba(180,180,180,0.7)" };
  if (x === "A" || y === "A") return { label: "A", color: "rgba(100,200,120,0.85)" };
  if (x === "D" || y === "D") return { label: "D", color: "rgba(220,80,80,0.8)" };
  if (x === "M" || y === "M") return { label: "M", color: "rgba(201,162,76,0.9)" };
  if (x === "R" || y === "R") return { label: "R", color: "rgba(140,160,220,0.85)" };
  return { label: code.trim().slice(0, 1) || "~", color: "rgba(180,180,180,0.7)" };
}

export function WorkspaceFilesPanel({ projectId, onOpenTerminal }: Props) {
  const qc = useQueryClient();
  const treeKey = ["ws-tree", projectId];
  const gitKey = ["ws-gitstatus", projectId];
  const logKey = ["ws-gitlog", projectId];

  const { data: tree, isLoading: treeLoading, error: treeError } = useQuery<TreeResponse>({
    queryKey: treeKey,
    queryFn: () => apiFetch(`${BASE}/${projectId}/tree`),
    staleTime: 10_000,
  });

  const { data: gitStatus } = useQuery<GitStatusResponse>({
    queryKey: gitKey,
    queryFn: () => apiFetch(`${BASE}/${projectId}/gitstatus`),
    staleTime: 8_000,
  });

  const [logExpanded, setLogExpanded] = useState(false);
  const { data: gitLog } = useQuery<GitLogResponse>({
    queryKey: logKey,
    queryFn: () => apiFetch(`${BASE}/${projectId}/git/log`),
    staleTime: 30_000,
    enabled: logExpanded,
  });

  const gitFiles: Record<string, string> = gitStatus?.files ?? {};

  const hydrationKey = ["ws-hydration", projectId];
  const { data: hydrationInfo, refetch: refetchHydration } = useQuery<{
    linkedRepo: string | null;
    isEmpty: boolean;
    isGitInitialized: boolean;
  }>({
    queryKey: hydrationKey,
    queryFn: () => apiFetch(`${BASE}/${projectId}/hydration`),
    staleTime: 15_000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: treeKey });
    qc.invalidateQueries({ queryKey: gitKey });
    qc.invalidateQueries({ queryKey: logKey });
  };

  const [openFile, setOpenFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>("");
  const [savedContent, setSavedContent] = useState<string>("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [newNamePath, setNewNamePath] = useState<string | null>(null);
  const [newNameValue, setNewNameValue] = useState("");

  // Commit panel state
  const [commitMsg, setCommitMsg] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitOutput, setCommitOutput] = useState("");
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSuccess, setCommitSuccess] = useState(false);
  const [commitPanelOpen, setCommitPanelOpen] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  // Pull panel state
  const [isPulling, setIsPulling] = useState(false);
  const [pullOutput, setPullOutput] = useState("");
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullSuccess, setPullSuccess] = useState(false);
  const [pullPanelOpen, setPullPanelOpen] = useState(false);
  const pullOutputRef = useRef<HTMLDivElement>(null);

  // Hydration state (first-time clone from GitHub)
  const [isCloning, setIsCloning] = useState(false);
  const [cloneOutput, setCloneOutput] = useState("");
  const [cloneError, setCloneError] = useState<string | null>(null);
  const cloneOutputRef = useRef<HTMLDivElement>(null);

  // Diff state (in commit panel)
  const [showDiff, setShowDiff] = useState(false);
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const isDirty = editContent !== savedContent;

  const openFileFn = useCallback(async (filePath: string) => {
    setFileError(null);
    setFileLoading(true);
    setOpenFile(filePath);
    try {
      const data = await apiFetch(`${BASE}/${projectId}/file?path=${encodeURIComponent(filePath)}`);
      setEditContent(data.content);
      setSavedContent(data.content);
    } catch (err: unknown) {
      setFileError(err instanceof Error ? err.message : "Failed to open file");
      setEditContent("");
      setSavedContent("");
    } finally {
      setFileLoading(false);
    }
  }, [projectId]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!openFile) return;
      await apiFetch(`${BASE}/${projectId}/file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: openFile, content: editContent }),
      });
      setSavedContent(editContent);
      invalidateAll();
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (p: string) => {
      await apiFetch(`${BASE}/${projectId}/file?path=${encodeURIComponent(p)}`, { method: "DELETE" });
      if (openFile === p) { setOpenFile(null); setEditContent(""); setSavedContent(""); }
      invalidateAll();
    },
  });

  const renameMut = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      await apiFetch(`${BASE}/${projectId}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      if (openFile === from) setOpenFile(to);
      invalidateAll();
    },
    onSuccess: () => { setNewNamePath(null); setNewNameValue(""); },
  });

  const createNewFile = async () => {
    const name = prompt("File name (e.g. index.ts):");
    if (!name?.trim()) return;
    await apiFetch(`${BASE}/${projectId}/file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: name.trim(), content: "" }),
    });
    invalidateAll();
    openFileFn(name.trim());
  };

  const commitAndPush = async () => {
    if (!commitMsg.trim() || isCommitting) return;
    setIsCommitting(true);
    setCommitOutput("");
    setCommitError(null);
    setCommitSuccess(false);

    let res: Response;
    try {
      res = await fetch(`${BASE}/${projectId}/git/commit-push`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: commitMsg.trim() }),
      });
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : "Network error");
      setIsCommitting(false);
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setCommitError((body as { error?: string }).error ?? `HTTP ${res.status}`);
      setIsCommitting(false);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) { setCommitError("No response body"); setIsCommitting(false); return; }

    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          let type = "";
          let data = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event: ")) type = line.slice(7).trim();
            if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (!type || !data) continue;
          try {
            const parsed: string = JSON.parse(data);
            if (type === "output" || type === "status") {
              setCommitOutput(prev => {
                const next = prev + parsed;
                setTimeout(() => {
                  if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
                }, 0);
                return next;
              });
            } else if (type === "done") {
              const result: { ok: boolean; error: string | null } = JSON.parse(parsed);
              if (result.ok) {
                setCommitSuccess(true);
                setCommitMsg("");
                setShowDiff(false);
                setDiffContent(null);
                invalidateAll();
              } else {
                setCommitError(result.error ?? "Failed");
              }
            } else if (type === "error") {
              setCommitError(parsed);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : "Stream error");
    }
    setIsCommitting(false);
  };

  const doPull = async () => {
    if (isPulling) return;
    setIsPulling(true);
    setPullOutput("");
    setPullError(null);
    setPullSuccess(false);
    setPullPanelOpen(true);

    let res: Response;
    try {
      res = await fetch(`${BASE}/${projectId}/git/pull`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      setPullError(err instanceof Error ? err.message : "Network error");
      setIsPulling(false);
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setPullError((body as { error?: string }).error ?? `HTTP ${res.status}`);
      setIsPulling(false);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) { setPullError("No response body"); setIsPulling(false); return; }

    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          let type = "";
          let data = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event: ")) type = line.slice(7).trim();
            if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (!type || !data) continue;
          try {
            const parsed: string = JSON.parse(data);
            if (type === "output" || type === "status") {
              setPullOutput(prev => {
                const next = prev + parsed;
                setTimeout(() => { if (pullOutputRef.current) pullOutputRef.current.scrollTop = pullOutputRef.current.scrollHeight; }, 0);
                return next;
              });
            } else if (type === "done") {
              const result: { ok: boolean; error: string | null } = JSON.parse(parsed);
              if (result.ok) {
                setPullSuccess(true);
                invalidateAll();
              } else {
                setPullError(result.error ?? "Failed");
              }
            } else if (type === "error") {
              setPullError(parsed);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      setPullError(err instanceof Error ? err.message : "Stream error");
    }
    setIsPulling(false);
  };

  const doClone = async () => {
    if (isCloning) return;
    setIsCloning(true);
    setCloneOutput("");
    setCloneError(null);

    let res: Response;
    try {
      res = await fetch(`${BASE}/${projectId}/git/clone`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Network error");
      setIsCloning(false);
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setCloneError((body as { error?: string }).error ?? `HTTP ${res.status}`);
      setIsCloning(false);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) { setCloneError("No response body"); setIsCloning(false); return; }

    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          let type = "";
          let data = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event: ")) type = line.slice(7).trim();
            if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (!type || !data) continue;
          try {
            const parsed: string = JSON.parse(data);
            if (type === "output" || type === "status") {
              setCloneOutput(prev => {
                const next = prev + parsed;
                setTimeout(() => {
                  if (cloneOutputRef.current) cloneOutputRef.current.scrollTop = cloneOutputRef.current.scrollHeight;
                }, 0);
                return next;
              });
            } else if (type === "done") {
              const result: { ok: boolean; error: string | null } = JSON.parse(parsed);
              if (result.ok) {
                invalidateAll();
                void refetchHydration();
              } else {
                setCloneError(result.error ?? "Hydration failed");
              }
            } else if (type === "error") {
              setCloneError(parsed);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Stream error");
    }
    setIsCloning(false);
  };

  const toggleDiff = async () => {
    if (showDiff) { setShowDiff(false); return; }
    setShowDiff(true);
    setDiffContent(null);
    setDiffLoading(true);
    try {
      const data = await apiFetch(`${BASE}/${projectId}/git/diff`);
      setDiffContent((data as { diff: string }).diff || "(no diff — all changes are untracked files)");
    } catch (err) {
      setDiffContent(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setDiffLoading(false);
    }
  };

  const changedCount = Object.keys(gitFiles).length;
  const hasRemote = gitStatus?.hasRemote ?? false;
  const canCommit = changedCount > 0 && hasRemote;
  const canPull = hasRemote;

  return (
    <div style={{
      display: "flex", height: "100%", minHeight: 0,
      fontFamily: "var(--app-font-sans)",
      color: "var(--atlas-fg)",
      background: "var(--atlas-bg)",
    }}>
      {/* Sidebar — file tree */}
      <div style={{
        width: 220, minWidth: 160, maxWidth: 280, flexShrink: 0,
        borderRight: "1px solid rgba(201,162,76,0.12)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Tree header */}
        <div style={{
          padding: "10px 12px 8px",
          borderBottom: "1px solid rgba(201,162,76,0.08)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-gold)", letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.8 }}>
              Workspace
            </span>
            {changedCount > 0 && (
              <span style={{
                fontSize: 9, fontFamily: "var(--app-font-mono)",
                background: "rgba(201,162,76,0.15)",
                color: "rgba(201,162,76,0.9)",
                border: "1px solid rgba(201,162,76,0.25)",
                borderRadius: 3, padding: "1px 4px",
                letterSpacing: "0.04em",
              }}>
                {changedCount}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {canPull && (
              <IconBtn title={isPulling ? "Pulling…" : "Pull"} onClick={doPull}>
                <GitMerge size={12} strokeWidth={1.8} style={{ color: isPulling ? "var(--atlas-gold)" : pullSuccess ? "rgba(100,200,120,0.9)" : undefined }} />
              </IconBtn>
            )}
            {canCommit && (
              <IconBtn title="Commit & Push" onClick={() => setCommitPanelOpen(o => !o)}>
                <GitCommit size={12} strokeWidth={1.8} style={{ color: commitPanelOpen ? "var(--atlas-gold)" : undefined }} />
              </IconBtn>
            )}
            <IconBtn title="History" onClick={() => setLogExpanded(o => !o)}>
              <History size={12} strokeWidth={1.8} style={{ color: logExpanded ? "var(--atlas-gold)" : undefined }} />
            </IconBtn>
            <IconBtn title="New file" onClick={createNewFile}><Plus size={12} strokeWidth={1.8} /></IconBtn>
            <IconBtn title="Refresh" onClick={invalidateAll}>
              <RefreshCw size={11} strokeWidth={1.8} />
            </IconBtn>
          </div>
        </div>

        {/* Pull output panel */}
        {pullPanelOpen && (
          <div style={{
            borderTop: "1px solid rgba(100,180,255,0.15)",
            background: "rgba(100,180,255,0.03)",
            padding: "8px 12px 10px",
            flexShrink: 0,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{
                fontSize: 9.5, fontFamily: "var(--app-font-mono)",
                color: "rgba(100,180,255,0.8)", letterSpacing: "0.12em",
                textTransform: "uppercase", opacity: 0.9,
              }}>
                {isPulling ? "Pulling…" : "Pull"}
              </div>
              <IconBtn title="Dismiss" onClick={() => { setPullPanelOpen(false); setPullOutput(""); setPullError(null); setPullSuccess(false); }}>
                <span style={{ fontSize: 11, lineHeight: 1 }}>×</span>
              </IconBtn>
            </div>
            {pullOutput && (
              <div
                ref={pullOutputRef}
                style={{
                  maxHeight: 90, overflowY: "auto",
                  fontFamily: "var(--app-font-mono)", fontSize: 10,
                  color: "var(--atlas-fg)", opacity: 0.75,
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid rgba(100,180,255,0.1)",
                  borderRadius: 5, padding: "6px 8px",
                  whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.55,
                }}
              >
                {pullOutput}
              </div>
            )}
            {pullSuccess && (
              <div style={{ fontSize: 11, color: "rgba(100,200,120,0.9)", fontFamily: "var(--app-font-mono)" }}>
                ✓ Pulled successfully
              </div>
            )}
            {pullError && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 10.5, color: "rgba(220,80,80,0.85)", fontFamily: "var(--app-font-sans)", lineHeight: 1.4 }}>
                  {pullError}
                </div>
                {onOpenTerminal && (
                  <button type="button" onClick={onOpenTerminal} style={{
                    alignSelf: "flex-start", padding: "3px 8px", borderRadius: 5,
                    border: "1px solid rgba(255,255,255,0.12)", background: "transparent",
                    color: "var(--atlas-muted)", fontSize: 10, fontFamily: "var(--app-font-mono)",
                    cursor: "pointer", opacity: 0.75,
                  }}>
                    View in Terminal →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tree body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {treeLoading && (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--atlas-muted)", opacity: 0.6 }}>Loading…</div>
          )}
          {treeError && (
            <div style={{ padding: "12px 14px", fontSize: 11.5, color: "rgba(220,80,80,0.85)" }}>
              {treeError instanceof Error ? treeError.message : "Failed to load tree"}
            </div>
          )}
          {tree && tree.children.length === 0 && (
            hydrationInfo?.linkedRepo ? (
              <div style={{ padding: "16px 14px" }}>
                {isCloning ? (
                  <>
                    <div style={{ fontSize: 11.5, color: "var(--atlas-muted)", marginBottom: 8, opacity: 0.75 }}>
                      Hydrating workspace…
                    </div>
                    <div
                      ref={cloneOutputRef}
                      style={{
                        fontFamily: "monospace", fontSize: 10.5, color: "rgba(180,180,180,0.85)",
                        background: "rgba(0,0,0,0.25)", borderRadius: 4, padding: "8px 10px",
                        maxHeight: 140, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
                      }}
                    >
                      {cloneOutput || "Connecting…"}
                    </div>
                  </>
                ) : cloneError ? (
                  <>
                    <div style={{ fontSize: 11.5, color: "rgba(220,80,80,0.9)", marginBottom: 6 }}>
                      Workspace hydration failed
                    </div>
                    <div style={{
                      fontSize: 10.5, color: "rgba(220,80,80,0.7)", marginBottom: 10,
                      fontFamily: "monospace", whiteSpace: "pre-wrap", lineHeight: 1.5,
                    }}>
                      {cloneError}
                    </div>
                    <button
                      onClick={doClone}
                      style={{
                        fontSize: 11.5, padding: "5px 12px", borderRadius: 4,
                        border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer",
                        background: "rgba(255,255,255,0.06)", color: "var(--atlas-fg)",
                      }}
                    >
                      Retry
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: "var(--atlas-muted)", marginBottom: 3, opacity: 0.6 }}>
                      Linked to{" "}
                      <span style={{ color: "var(--atlas-fg)", opacity: 0.85 }}>
                        {hydrationInfo.linkedRepo}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 11.5, color: "var(--atlas-muted)", marginBottom: 12,
                      opacity: 0.5, lineHeight: 1.6,
                    }}>
                      Workspace is empty. Import files from the linked repository to get started.
                    </div>
                    <button
                      onClick={doClone}
                      style={{
                        fontSize: 12, padding: "6px 14px", borderRadius: 4,
                        border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer",
                        background: "rgba(255,255,255,0.07)", color: "var(--atlas-fg)",
                        transition: "background 120ms",
                      }}
                    >
                      Hydrate Workspace
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div style={{ padding: "14px", fontSize: 12, color: "var(--atlas-muted)", opacity: 0.55, lineHeight: 1.5 }}>
                Empty workspace.<br />Create a file to start.
              </div>
            )
          )}
          {tree && tree.children.map(node => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              selected={openFile}
              gitFiles={gitFiles}
              onSelectFile={openFileFn}
              onDelete={(p) => deleteMut.mutate(p)}
              onRenameStart={(p) => { setNewNamePath(p); setNewNameValue(p.split("/").pop() ?? ""); }}
            />
          ))}
        </div>

        {/* Git log — commit history */}
        {logExpanded && (
          <div style={{
            borderTop: "1px solid rgba(201,162,76,0.08)",
            flexShrink: 0, maxHeight: 160, overflowY: "auto",
          }}>
            <div style={{
              padding: "6px 12px 4px",
              fontSize: 9.5, fontFamily: "var(--app-font-mono)",
              color: "var(--atlas-gold)", letterSpacing: "0.12em",
              textTransform: "uppercase", opacity: 0.7,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <History size={9} strokeWidth={1.8} />
              History
            </div>
            {!gitLog && (
              <div style={{ padding: "6px 12px", fontSize: 11, color: "var(--atlas-muted)", opacity: 0.5 }}>
                Loading…
              </div>
            )}
            {gitLog && gitLog.commits.length === 0 && (
              <div style={{ padding: "6px 12px", fontSize: 11, color: "var(--atlas-muted)", opacity: 0.5 }}>
                No commits yet
              </div>
            )}
            {gitLog?.commits.map((c) => (
              <div key={c.hash} title={`${c.author}  ${c.date}`} style={{
                display: "flex", alignItems: "baseline", gap: 6,
                padding: "3px 12px",
                fontSize: 11, lineHeight: 1.5,
              }}>
                <span style={{
                  fontFamily: "var(--app-font-mono)", fontSize: 9.5,
                  color: "rgba(201,162,76,0.6)", flexShrink: 0, letterSpacing: "0.04em",
                }}>
                  {c.hash}
                </span>
                <span style={{
                  color: "var(--atlas-fg)", opacity: 0.75,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {c.message}
                </span>
                <span style={{
                  fontFamily: "var(--app-font-mono)", fontSize: 9, flexShrink: 0,
                  color: "var(--atlas-muted)", opacity: 0.45, marginLeft: "auto",
                }}>
                  {c.date}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Working dir label */}
        {tree?.workspaceDir && (
          <div style={{
            padding: "6px 12px",
            borderTop: "1px solid rgba(201,162,76,0.08)",
            fontSize: 9.5, fontFamily: "var(--app-font-mono)",
            color: "var(--atlas-muted)", opacity: 0.45,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            flexShrink: 0,
          }}>
            {tree.workspaceDir}
          </div>
        )}

        {/* Commit panel */}
        {canCommit && commitPanelOpen && (
          <div style={{
            borderTop: "1px solid rgba(201,162,76,0.15)",
            background: "rgba(201,162,76,0.03)",
            padding: "10px 12px 12px",
            flexShrink: 0,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{
                fontSize: 9.5, fontFamily: "var(--app-font-mono)",
                color: "var(--atlas-gold)", letterSpacing: "0.12em",
                textTransform: "uppercase", opacity: 0.8,
              }}>
                Commit & Push
              </div>
              <IconBtn title={showDiff ? "Hide diff" : "Show diff"} onClick={toggleDiff}>
                <FileCode size={11} strokeWidth={1.8} style={{ color: showDiff ? "var(--atlas-gold)" : undefined }} />
              </IconBtn>
            </div>

            {/* Diff view */}
            {showDiff && (
              <div style={{
                maxHeight: 120, overflowY: "auto",
                fontFamily: "var(--app-font-mono)", fontSize: 9.5,
                background: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(201,162,76,0.1)",
                borderRadius: 5, padding: "6px 8px",
                lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>
                {diffLoading ? (
                  <span style={{ color: "var(--atlas-muted)", opacity: 0.5 }}>Loading diff…</span>
                ) : diffContent ? (
                  diffContent.split("\n").map((line, i) => {
                    const color = line.startsWith("+") && !line.startsWith("+++")
                      ? "rgba(100,200,120,0.85)"
                      : line.startsWith("-") && !line.startsWith("---")
                        ? "rgba(220,80,80,0.85)"
                        : line.startsWith("@@")
                          ? "rgba(100,160,240,0.75)"
                          : "rgba(255,255,255,0.6)";
                    return <div key={i} style={{ color }}>{line || "\u00a0"}</div>;
                  })
                ) : null}
              </div>
            )}

            {/* Changed files — read-only list */}
            <div style={{
              maxHeight: 80, overflowY: "auto",
              display: "flex", flexDirection: "column", gap: 1,
            }}>
              {Object.entries(gitFiles).map(([filePath, code]) => {
                const b = gitBadge(code);
                return (
                  <div key={filePath} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    fontSize: 10, fontFamily: "var(--app-font-mono)",
                    color: "var(--atlas-fg)", opacity: 0.75,
                  }}>
                    {b && (
                      <span style={{ color: b.color, flexShrink: 0, width: 10, textAlign: "center", fontWeight: 700 }}>
                        {b.label}
                      </span>
                    )}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {filePath}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Commit message input */}
            <input
              type="text"
              placeholder="Commit message…"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitAndPush(); }}
              disabled={isCommitting}
              style={{
                width: "100%", padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid rgba(201,162,76,0.25)",
                background: "rgba(255,255,255,0.03)",
                color: "var(--atlas-fg)",
                fontSize: 11.5, fontFamily: "var(--app-font-sans)",
                outline: "none", boxSizing: "border-box",
                opacity: isCommitting ? 0.5 : 1,
              }}
            />

            {/* Commit & Push button */}
            <button
              type="button"
              onClick={commitAndPush}
              disabled={!commitMsg.trim() || isCommitting}
              style={{
                padding: "6px 10px", borderRadius: 6,
                border: "1px solid rgba(201,162,76,0.35)",
                background: commitMsg.trim() && !isCommitting ? "rgba(201,162,76,0.12)" : "transparent",
                color: commitMsg.trim() && !isCommitting ? "var(--atlas-gold)" : "var(--atlas-muted)",
                fontSize: 11.5, fontFamily: "var(--app-font-sans)", fontWeight: 600,
                cursor: commitMsg.trim() && !isCommitting ? "pointer" : "default",
                opacity: commitMsg.trim() && !isCommitting ? 1 : 0.4,
                transition: "all 150ms ease",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              }}
            >
              <GitCommit size={11} strokeWidth={1.8} />
              {isCommitting ? "Working…" : "Commit & Push"}
            </button>

            {/* Output area */}
            {(commitOutput || commitError || commitSuccess) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {commitOutput && (
                  <div
                    ref={outputRef}
                    style={{
                      maxHeight: 100, overflowY: "auto",
                      fontFamily: "var(--app-font-mono)", fontSize: 10,
                      color: "var(--atlas-fg)", opacity: 0.75,
                      background: "rgba(0,0,0,0.2)",
                      border: "1px solid rgba(201,162,76,0.1)",
                      borderRadius: 5,
                      padding: "6px 8px",
                      whiteSpace: "pre-wrap", wordBreak: "break-all",
                      lineHeight: 1.55,
                    }}
                  >
                    {commitOutput}
                  </div>
                )}
                {commitSuccess && (
                  <div style={{
                    fontSize: 11, color: "rgba(100,200,120,0.9)",
                    fontFamily: "var(--app-font-mono)",
                    padding: "4px 0",
                  }}>
                    ✓ Pushed successfully
                  </div>
                )}
                {commitError && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{
                      fontSize: 10.5, color: "rgba(220,80,80,0.85)",
                      fontFamily: "var(--app-font-sans)",
                      lineHeight: 1.4,
                    }}>
                      {commitError}
                    </div>
                    {onOpenTerminal && (
                      <button
                        type="button"
                        onClick={onOpenTerminal}
                        style={{
                          alignSelf: "flex-start",
                          padding: "3px 8px", borderRadius: 5,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "transparent",
                          color: "var(--atlas-muted)",
                          fontSize: 10, fontFamily: "var(--app-font-mono)",
                          cursor: "pointer", opacity: 0.75,
                        }}
                      >
                        View in Terminal →
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main — editor */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!openFile ? (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, color: "var(--atlas-muted)", opacity: 0.45,
          }}>
            Select a file to open it
          </div>
        ) : (
          <>
            {/* Editor header */}
            <div style={{
              padding: "8px 14px", borderBottom: "1px solid rgba(201,162,76,0.1)",
              display: "flex", alignItems: "center", gap: 10, minHeight: 38, flexShrink: 0,
            }}>
              <span style={{
                fontSize: 12, fontFamily: "var(--app-font-mono)",
                color: "var(--atlas-fg)", opacity: 0.85,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
              }}>
                {openFile}{isDirty && <span style={{ color: "var(--atlas-gold)", marginLeft: 4 }}>•</span>}
              </span>
              <button
                type="button"
                onClick={() => saveMut.mutate()}
                disabled={!isDirty || saveMut.isPending}
                style={{
                  flexShrink: 0,
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 10px", borderRadius: 6, cursor: isDirty ? "pointer" : "default",
                  border: `1px solid ${isDirty ? "rgba(201,162,76,0.45)" : "rgba(201,162,76,0.12)"}`,
                  background: isDirty ? "rgba(201,162,76,0.10)" : "transparent",
                  color: isDirty ? "var(--atlas-gold)" : "var(--atlas-muted)",
                  fontSize: 11.5, fontFamily: "var(--app-font-sans)", fontWeight: 600,
                  opacity: isDirty ? 1 : 0.4,
                  transition: "all 150ms ease",
                }}
              >
                <Save size={12} strokeWidth={1.8} />
                {saveMut.isPending ? "Saving…" : "Save"}
              </button>
            </div>

            {/* Editor body */}
            {fileLoading ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--atlas-muted)", opacity: 0.5 }}>
                Loading…
              </div>
            ) : fileError ? (
              <div style={{ flex: 1, padding: 20, fontSize: 12.5, color: "rgba(220,80,80,0.85)" }}>
                {fileError}
              </div>
            ) : (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                spellCheck={false}
                style={{
                  flex: 1, resize: "none", border: "none", outline: "none",
                  background: "transparent",
                  color: "var(--atlas-fg)",
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 12.5, lineHeight: 1.65,
                  padding: "14px 16px",
                  tabSize: 2,
                }}
              />
            )}

            {saveMut.isError && (
              <div style={{
                padding: "6px 14px", fontSize: 11.5, color: "rgba(220,80,80,0.85)",
                borderTop: "1px solid rgba(220,80,80,0.2)",
              }}>
                {saveMut.error instanceof Error ? saveMut.error.message : "Save failed"}
              </div>
            )}
          </>
        )}
      </div>

      {/* Rename modal */}
      {newNamePath && (
        <div
          onClick={() => { setNewNamePath(null); setNewNameValue(""); }}
          style={{
            position: "fixed", inset: 0, zIndex: 14000,
            background: "rgba(var(--atlas-bg-rgb), 0.6)",
            backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "rgba(var(--atlas-surface-rgb), 0.97)",
              border: "1px solid rgba(201,162,76,0.22)",
              borderRadius: 12, padding: 20, width: 320,
            }}
          >
            <div style={{ fontSize: 11.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.7, marginBottom: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Rename
            </div>
            <input
              autoFocus
              value={newNameValue}
              onChange={(e) => setNewNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newNameValue.trim()) {
                  const dir = newNamePath!.includes("/") ? newNamePath!.split("/").slice(0, -1).join("/") + "/" : "";
                  renameMut.mutate({ from: newNamePath!, to: dir + newNameValue.trim() });
                }
                if (e.key === "Escape") { setNewNamePath(null); setNewNameValue(""); }
              }}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 7,
                border: "1px solid rgba(201,162,76,0.28)",
                background: "rgba(255,255,255,0.03)",
                color: "var(--atlas-fg)", fontSize: 13, fontFamily: "var(--app-font-mono)",
                outline: "none", boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="button" onClick={() => { setNewNamePath(null); setNewNameValue(""); }} style={modalBtnSecondary}>Cancel</button>
              <button
                type="button"
                disabled={!newNameValue.trim() || renameMut.isPending}
                onClick={() => {
                  const dir = newNamePath!.includes("/") ? newNamePath!.split("/").slice(0, -1).join("/") + "/" : "";
                  renameMut.mutate({ from: newNamePath!, to: dir + newNameValue.trim() });
                }}
                style={modalBtnPrimary}
              >
                {renameMut.isPending ? "Renaming…" : "Rename"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TreeNode({
  node, depth, selected, gitFiles, onSelectFile, onDelete, onRenameStart,
}: {
  node: FsNode;
  depth: number;
  selected: string | null;
  gitFiles: Record<string, string>;
  onSelectFile: (path: string) => void;
  onDelete: (path: string) => void;
  onRenameStart: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [hovered, setHovered] = useState(false);
  const isSelected = selected === node.path;

  const indent = 8 + depth * 14;

  // For directories: bubble up badge if any child has a git status
  const dirHasChanges = node.type === "dir"
    ? Object.keys(gitFiles).some(p => p === node.path || p.startsWith(node.path + "/"))
    : false;

  const badge = node.type === "file" ? gitBadge(gitFiles[node.path] ?? "") : null;

  if (node.type === "dir") {
    return (
      <div>
        <div
          onClick={() => setExpanded(x => !x)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: `3px 8px 3px ${indent}px`,
            cursor: "pointer", userSelect: "none",
            background: hovered ? "rgba(201,162,76,0.06)" : "transparent",
            transition: "background 100ms ease",
          }}
        >
          <span style={{ color: "var(--atlas-muted)", opacity: 0.55, flexShrink: 0 }}>
            {expanded ? <ChevronDown size={11} strokeWidth={1.8} /> : <ChevronRight size={11} strokeWidth={1.8} />}
          </span>
          <span style={{ color: "rgba(201,162,76,0.65)", flexShrink: 0 }}>
            {expanded ? <FolderOpen size={12} strokeWidth={1.6} /> : <Folder size={12} strokeWidth={1.6} />}
          </span>
          <span style={{ fontSize: 12, color: "var(--atlas-fg)", opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {node.name}
          </span>
          {!expanded && dirHasChanges && (
            <span style={{ fontSize: 8.5, color: "rgba(201,162,76,0.7)", flexShrink: 0 }}>●</span>
          )}
        </div>
        {expanded && node.children?.map(child => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selected={selected}
            gitFiles={gitFiles}
            onSelectFile={onSelectFile}
            onDelete={onDelete}
            onRenameStart={onRenameStart}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelectFile(node.path)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: `3px 8px 3px ${indent}px`,
        cursor: "pointer", userSelect: "none",
        background: isSelected
          ? "rgba(201,162,76,0.12)"
          : hovered ? "rgba(201,162,76,0.05)" : "transparent",
        borderLeft: isSelected ? "2px solid rgba(201,162,76,0.5)" : "2px solid transparent",
        transition: "background 100ms ease",
      }}
    >
      <span style={{ color: "var(--atlas-muted)", opacity: 0.45, flexShrink: 0 }}>
        <File size={11} strokeWidth={1.6} />
      </span>
      <span style={{
        fontSize: 12, color: "var(--atlas-fg)",
        opacity: isSelected ? 1 : 0.8,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
      }}>
        {node.name}
      </span>
      {badge && !hovered && (
        <span style={{
          fontSize: 9, fontFamily: "var(--app-font-mono)", fontWeight: 700,
          color: badge.color, flexShrink: 0, lineHeight: 1,
          width: 12, textAlign: "center",
        }}>
          {badge.label}
        </span>
      )}
      {hovered && (
        <div style={{ display: "flex", gap: 1, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <IconBtn title="Rename" onClick={() => onRenameStart(node.path)} small>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M11 2l3 3-9 9H2v-3L11 2z" />
            </svg>
          </IconBtn>
          <IconBtn title="Delete" onClick={() => { if (confirm(`Delete ${node.name}?`)) onDelete(node.path); }} small>
            <Trash2 size={10} strokeWidth={1.6} />
          </IconBtn>
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, onClick, title, small }: { children: React.ReactNode; onClick: () => void; title?: string; small?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: small ? 18 : 22, height: small ? 18 : 22,
        border: "none", background: "transparent",
        color: "var(--atlas-muted)", cursor: "pointer", borderRadius: 4,
        padding: 0, opacity: 0.65,
        transition: "opacity 120ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.65"; }}
    >
      {children}
    </button>
  );
}

const modalBtnBase: React.CSSProperties = {
  flex: 1, padding: "7px 12px", borderRadius: 7, cursor: "pointer",
  fontSize: 12.5, fontWeight: 600, fontFamily: "var(--app-font-sans)",
  transition: "all 150ms ease",
};
const modalBtnPrimary: React.CSSProperties = {
  ...modalBtnBase,
  border: "1px solid rgba(201,162,76,0.4)",
  background: "rgba(201,162,76,0.12)",
  color: "var(--atlas-gold)",
};
const modalBtnSecondary: React.CSSProperties = {
  ...modalBtnBase,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "transparent",
  color: "var(--atlas-muted)",
};
