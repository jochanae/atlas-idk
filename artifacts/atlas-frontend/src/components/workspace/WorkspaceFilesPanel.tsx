import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Plus, Save, Trash2, RefreshCw } from "lucide-react";

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

interface Props {
  projectId: number;
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

export function WorkspaceFilesPanel({ projectId }: Props) {
  const qc = useQueryClient();
  const treeKey = ["ws-tree", projectId];

  const { data: tree, isLoading: treeLoading, error: treeError } = useQuery<TreeResponse>({
    queryKey: treeKey,
    queryFn: () => apiFetch(`${BASE}/${projectId}/tree`),
    staleTime: 10_000,
  });

  const [openFile, setOpenFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>("");
  const [savedContent, setSavedContent] = useState<string>("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [newNamePath, setNewNamePath] = useState<string | null>(null);
  const [newNameValue, setNewNameValue] = useState("");

  const isDirty = editContent !== savedContent;

  const openFileFn = useCallback(async (path: string) => {
    setFileError(null);
    setFileLoading(true);
    setOpenFile(path);
    try {
      const data = await apiFetch(`${BASE}/${projectId}/file?path=${encodeURIComponent(path)}`);
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
      qc.invalidateQueries({ queryKey: treeKey });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (path: string) => {
      await apiFetch(`${BASE}/${projectId}/file?path=${encodeURIComponent(path)}`, { method: "DELETE" });
      if (openFile === path) { setOpenFile(null); setEditContent(""); setSavedContent(""); }
      qc.invalidateQueries({ queryKey: treeKey });
    },
  });

  const mkdirMut = useMutation({
    mutationFn: async (dirPath: string) => {
      await apiFetch(`${BASE}/${projectId}/mkdir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dirPath }),
      });
      qc.invalidateQueries({ queryKey: treeKey });
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
      qc.invalidateQueries({ queryKey: treeKey });
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
    qc.invalidateQueries({ queryKey: treeKey });
    openFileFn(name.trim());
  };

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
        }}>
          <span style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-gold)", letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.8 }}>
            Workspace
          </span>
          <div style={{ display: "flex", gap: 2 }}>
            <IconBtn title="New file" onClick={createNewFile}><Plus size={12} strokeWidth={1.8} /></IconBtn>
            <IconBtn title="Refresh" onClick={() => qc.invalidateQueries({ queryKey: treeKey })}>
              <RefreshCw size={11} strokeWidth={1.8} />
            </IconBtn>
          </div>
        </div>

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
            <div style={{ padding: "14px", fontSize: 12, color: "var(--atlas-muted)", opacity: 0.55, lineHeight: 1.5 }}>
              Empty workspace.<br />Create a file to start.
            </div>
          )}
          {tree && tree.children.map(node => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              selected={openFile}
              onSelectFile={openFileFn}
              onDelete={(p) => deleteMut.mutate(p)}
              onRenameStart={(p) => { setNewNamePath(p); setNewNameValue(p.split("/").pop() ?? ""); }}
            />
          ))}
        </div>

        {/* Working dir label */}
        {tree?.workspaceDir && (
          <div style={{
            padding: "6px 12px",
            borderTop: "1px solid rgba(201,162,76,0.08)",
            fontSize: 9.5, fontFamily: "var(--app-font-mono)",
            color: "var(--atlas-muted)", opacity: 0.45,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {tree.workspaceDir}
          </div>
        )}
      </div>

      {/* Main — editor */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
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
  node, depth, selected, onSelectFile, onDelete, onRenameStart,
}: {
  node: FsNode;
  depth: number;
  selected: string | null;
  onSelectFile: (path: string) => void;
  onDelete: (path: string) => void;
  onRenameStart: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [hovered, setHovered] = useState(false);
  const isSelected = selected === node.path;

  const indent = 8 + depth * 14;

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
          <span style={{ fontSize: 12, color: "var(--atlas-fg)", opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {node.name}
          </span>
        </div>
        {expanded && node.children?.map(child => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selected={selected}
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
        fontSize: 12, color: isSelected ? "var(--atlas-fg)" : "var(--atlas-fg)",
        opacity: isSelected ? 1 : 0.8,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
      }}>
        {node.name}
      </span>
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
