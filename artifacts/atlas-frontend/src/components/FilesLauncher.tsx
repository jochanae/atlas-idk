// FilesLauncher — global mount that opens a Files surface in response to
// `axiom:launcher-files`. Lists projects, then shows the real workspace
// file tree (via /api/fs/:projectId/tree) for the selected project.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { LauncherOverlay } from "@/components/LauncherOverlay";

const LAST_PROJECT_KEY = "axiom:last-project-id";

interface FsNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: FsNode[];
}

interface TreeResponse {
  workspaceDir: string;
  children: FsNode[];
}

async function fetchTree(projectId: number): Promise<TreeResponse> {
  const res = await fetch(`/api/fs/${projectId}/tree`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export function FilesLauncher() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { data: projectsRaw } = useListProjects();
  const projects = useMemo(
    () => (Array.isArray(projectsRaw) ? projectsRaw : []),
    [projectsRaw],
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      try {
        const raw = localStorage.getItem(LAST_PROJECT_KEY);
        if (raw) setSelectedId(parseInt(raw, 10));
      } catch { /* noop */ }
    };
    window.addEventListener("axiom:launcher-files", onOpen);
    return () => window.removeEventListener("axiom:launcher-files", onOpen);
  }, []);

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  return (
    <LauncherOverlay
      open={open}
      onClose={() => setOpen(false)}
      eyebrow="Files"
      title={selected ? selected.name : "Choose a project"}
    >
      {!selected && (
        projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            body="Create a project to start attaching files."
          />
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    setSelectedId(p.id);
                    try { localStorage.setItem(LAST_PROJECT_KEY, String(p.id)); } catch { /* noop */ }
                  }}
                  style={{
                    width: "100%", textAlign: "left", cursor: "pointer",
                    padding: "12px 14px",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 10,
                    color: "var(--atlas-fg)", fontSize: 14,
                    fontFamily: "var(--app-font-sans)",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}
                >
                  <span>{p.name}</span>
                  <span style={{ color: "rgba(255,255,255,0.35)", fontFamily: "var(--app-font-mono)", fontSize: 10 }}>›</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {selected && (
        <>
          <button
            onClick={() => setSelectedId(null)}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontFamily: "var(--app-font-mono)", fontSize: 10,
              color: "rgba(255,255,255,0.5)", letterSpacing: "0.16em",
              padding: 0, marginBottom: 14, textTransform: "uppercase",
            }}
          >
            ← All projects
          </button>
          <FileTree
            projectId={selected.id}
            onOpenWorkspace={() => {
              setOpen(false);
              setLocation(`/project/${selected.id}`);
            }}
          />
        </>
      )}
    </LauncherOverlay>
  );
}

function FileTree({
  projectId, onOpenWorkspace,
}: {
  projectId: number;
  onOpenWorkspace: () => void;
}) {
  const { data, isLoading, error } = useQuery<TreeResponse>({
    queryKey: ["launcher-fs-tree", projectId],
    queryFn: () => fetchTree(projectId),
    staleTime: 10_000,
  });

  if (isLoading) {
    return (
      <div style={{ padding: "24px 8px", textAlign: "center", color: "rgba(255,255,255,0.45)", fontSize: 12, fontFamily: "var(--app-font-mono)", letterSpacing: "0.12em" }}>
        LOADING…
      </div>
    );
  }
  if (error) {
    return (
      <EmptyState
        title="Couldn't load files"
        body={error instanceof Error ? error.message : "Unknown error fetching the workspace tree."}
      />
    );
  }
  const children = data?.children ?? [];
  if (children.length === 0) {
    return (
      <EmptyState
        title="No files yet"
        body="Attach files from a conversation, drop them into the composer, or upload them from the project workspace."
        action={{ label: "Open project workspace", onClick: onOpenWorkspace }}
      />
    );
  }
  return (
    <>
      <div style={{
        fontFamily: "var(--app-font-mono)", fontSize: 9.5,
        letterSpacing: "0.22em", textTransform: "uppercase",
        color: "rgba(255,255,255,0.4)", padding: "0 2px 8px",
      }}>
        Workspace tree
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 2 }}>
        {children.map((node) => (
          <TreeNode key={node.path} node={node} depth={0} />
        ))}
      </ul>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={onOpenWorkspace}
          style={{
            padding: "8px 14px", borderRadius: 8, cursor: "pointer",
            background: "transparent",
            border: "1px solid rgba(212,175,55,0.4)", color: "var(--atlas-gold)",
            fontFamily: "var(--app-font-mono)", fontSize: 10,
            fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase",
          }}
        >
          Open in workspace →
        </button>
      </div>
    </>
  );
}

function TreeNode({ node, depth }: { node: FsNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === "dir";
  return (
    <li>
      <div
        onClick={() => isDir && setExpanded((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 8px",
          paddingLeft: 8 + depth * 14,
          borderRadius: 6,
          cursor: isDir ? "pointer" : "default",
          color: isDir ? "var(--atlas-fg)" : "rgba(255,255,255,0.7)",
          fontFamily: "var(--app-font-mono)", fontSize: 12,
          background: "transparent",
        }}
      >
        <span style={{ width: 12, color: "rgba(255,255,255,0.4)", fontSize: 10 }}>
          {isDir ? (expanded ? "▾" : "▸") : ""}
        </span>
        <span style={{ color: isDir ? "var(--atlas-gold)" : "rgba(59,130,246,0.85)", fontSize: 11 }}>
          {isDir ? "▣" : "·"}
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {node.name}
        </span>
      </div>
      {isDir && expanded && node.children && node.children.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {node.children.map((c) => (
            <TreeNode key={c.path} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function EmptyState({
  title, body, action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{
      padding: "32px 8px", textAlign: "center",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: "rgba(59,130,246,0.08)",
        border: "1px solid rgba(59,130,246,0.18)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#3B82F6",
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <div style={{ fontSize: 15, color: "var(--atlas-fg)", fontWeight: 500 }}>{title}</div>
      <p style={{
        margin: 0, fontSize: 13, color: "rgba(255,255,255,0.5)",
        maxWidth: 360, lineHeight: 1.55,
      }}>{body}</p>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 6,
            padding: "9px 18px", borderRadius: 8, cursor: "pointer",
            background: "linear-gradient(180deg, #D4AF37 0%, #B8942A 100%)",
            border: "1px solid rgba(212,175,55,0.4)", color: "#0C0A09",
            fontFamily: "var(--app-font-mono)", fontSize: 10,
            fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export default FilesLauncher;
