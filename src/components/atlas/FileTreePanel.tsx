/**
 * FileTreePanel — inline file tree for embedding in the desktop layout.
 * Extracted from FileTreeDrawer to work as a persistent panel (no modal).
 */
import { useState, useMemo, useCallback, useEffect } from "react";

type GeneratedFile = {
  id?: string;
  filename: string;
  language: string;
  content: string;
  version?: number;
  parent_id?: string | null;
  created_at?: string;
};

type Props = {
  files: GeneratedFile[];
  onFileSelect: (file: GeneratedFile) => void;
  onLockToLedger?: (files: GeneratedFile[]) => void;
};

type TreeNode = {
  name: string;
  path: string;
  file?: GeneratedFile;
  children: TreeNode[];
};

function buildTree(files: GeneratedFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const file of files) {
    const parts = file.filename.split("/");
    let current = root;
    let pathSoFar = "";
    for (let i = 0; i < parts.length; i++) {
      pathSoFar += (pathSoFar ? "/" : "") + parts[i];
      const isFile = i === parts.length - 1;
      let node = current.find((n) => n.name === parts[i]);
      if (!node) {
        node = { name: parts[i], path: pathSoFar, file: isFile ? file : undefined, children: [] };
        current.push(node);
      }
      if (isFile) node.file = file;
      current = node.children;
    }
  }
  return root;
}

function FileIcon({ language }: { language: string }) {
  const color =
    language === "tsx" || language === "jsx"
      ? "var(--phosphor)"
      : language === "ts" || language === "js"
        ? "var(--accent-gold)"
        : "var(--muted-text)";
  return (
    <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke={color} strokeWidth={1.4}>
      <path d="M4 1h6l4 4v10H4z" strokeLinejoin="round" />
      <path d="M10 1v4h4" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="var(--accent-gold)" strokeWidth={1.4}>
      {open ? (
        <path d="M2 13V4h4l2 2h6v7z" strokeLinejoin="round" />
      ) : (
        <path d="M2 13V4h4l2 2h6v1H2m0 6h12V7" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function TreeNodeView({
  node,
  depth,
  onFileSelect,
  selectedPath,
  matchesSearch,
}: {
  node: TreeNode;
  depth: number;
  onFileSelect: (file: GeneratedFile) => void;
  selectedPath: string | null;
  matchesSearch: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const isFolder = node.children.length > 0 && !node.file;
  const isSelected = node.path === selectedPath;

  if (!matchesSearch) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isFolder) setExpanded(!expanded);
          else if (node.file) onFileSelect(node.file);
        }}
        className="flex items-center gap-1.5 w-full text-left transition-colors hover:bg-muted/30"
        style={{
          paddingLeft: 8 + depth * 14,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
          background: isSelected ? "color-mix(in oklab, var(--accent-gold) 10%, transparent)" : undefined,
          borderLeft: isSelected ? "2px solid var(--accent-gold)" : "2px solid transparent",
        }}
      >
        {isFolder ? (
          <>
            <span className="text-[8px] opacity-50 w-2 flex-shrink-0">{expanded ? "▼" : "▶"}</span>
            <FolderIcon open={expanded} />
          </>
        ) : (
          <>
            <span className="w-2 flex-shrink-0" />
            <FileIcon language={node.file?.language ?? "tsx"} />
          </>
        )}
        <span
          className="font-mono text-[11px] truncate"
          style={{ color: isSelected ? "var(--foreground)" : "var(--muted-text)" }}
        >
          {node.name}
        </span>
        {node.file?.version && node.file.version > 1 && (
          <span className="ml-auto text-[9px] font-mono px-1 rounded-full flex-shrink-0"
            style={{
              background: "color-mix(in oklab, var(--phosphor) 15%, transparent)",
              color: "var(--phosphor)",
            }}
          >
            v{node.file.version}
          </span>
        )}
      </button>
      {isFolder && expanded && node.children.map((child) => (
        <TreeNodeView
          key={child.path}
          node={child}
          depth={depth + 1}
          onFileSelect={onFileSelect}
          selectedPath={selectedPath}
          matchesSearch={matchesSearch}
        />
      ))}
    </div>
  );
}

export function FileTreePanel({ files, onFileSelect }: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("atlas-selected-file") ?? null;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const tree = useMemo(() => buildTree(files), [files]);

  // Auto-restore persisted selection when files load
  useEffect(() => {
    if (selectedPath && files.length > 0) {
      const match = files.find((f) => f.filename === selectedPath);
      if (match) onFileSelect(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length > 0]);

  const matchingPaths = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    const matching = new Set<string>();
    for (const file of files) {
      if (file.filename.toLowerCase().includes(q)) {
        const parts = file.filename.split("/");
        let path = "";
        for (const part of parts) {
          path += (path ? "/" : "") + part;
          matching.add(path);
        }
      }
    }
    return matching;
  }, [files, searchQuery]);

  const nodeMatchesSearch = useCallback(
    (node: TreeNode): boolean => !matchingPaths || matchingPaths.has(node.path),
    [matchingPaths],
  );

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="flex-shrink-0 px-2 py-2 border-b border-border/40">
        <div className="relative">
          <svg
            viewBox="0 0 16 16" width={12} height={12}
            fill="none" stroke="currentColor" strokeWidth={1.4}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          >
            <circle cx="7" cy="7" r="4" />
            <path d="M10 10l3 3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search files…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 rounded-md bg-card/50 border border-border/40 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent/50"
          />
        </div>
      </div>

      {/* File count */}
      <div className="flex-shrink-0 px-3 py-1.5 text-[9px] font-mono text-muted-foreground tracking-wider">
        {files.length} file{files.length !== 1 ? "s" : ""}
      </div>

      {/* Tree */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {tree.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11px] font-mono text-muted-foreground/60 leading-relaxed">
            No files yet. Use <span className="text-accent">/build</span> to generate components.
          </div>
        ) : (
          tree.map((node) => (
            <TreeNodeView
              key={node.path}
              node={node}
              depth={0}
              onFileSelect={(file) => { setSelectedPath(file.filename); onFileSelect(file); }}
              selectedPath={selectedPath}
              matchesSearch={nodeMatchesSearch(node)}
            />
          ))
        )}
      </div>
    </div>
  );
}
