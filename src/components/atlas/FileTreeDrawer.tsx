import { useState, useMemo, useCallback } from "react";

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
  open: boolean;
  onClose: () => void;
  files: GeneratedFile[];
  onFileSelect: (file: GeneratedFile) => void;
  /** Called when a parked snippet is dropped onto a file */
  onDropSnippet?: (fileIndex: number, snippet: string) => void;
  /** Called when user locks selected files' architecture to the Ledger */
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
        node = {
          name: parts[i],
          path: pathSoFar,
          file: isFile ? file : undefined,
          children: [],
        };
        current.push(node);
      }
      if (isFile) node.file = file;
      current = node.children;
    }
  }
  return root;
}

/** Collect all file paths from a tree node recursively */
function collectFilePaths(node: TreeNode): string[] {
  const paths: string[] = [];
  if (node.file) paths.push(node.path);
  for (const child of node.children) paths.push(...collectFilePaths(child));
  return paths;
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
  checkedPaths,
  onToggleCheck,
  matchesSearch,
}: {
  node: TreeNode;
  depth: number;
  onFileSelect: (file: GeneratedFile) => void;
  selectedPath: string | null;
  checkedPaths: Set<string>;
  onToggleCheck: (path: string, isFolder: boolean, node: TreeNode) => void;
  matchesSearch: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const isFolder = node.children.length > 0 && !node.file;
  const isSelected = node.path === selectedPath;
  const isChecked = checkedPaths.has(node.path);

  if (!matchesSearch) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center" }}>
        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCheck(node.path, isFolder, node);
          }}
          style={{
            width: 18,
            height: 18,
            flexShrink: 0,
            marginLeft: 4 + depth * 16,
            borderRadius: 3,
            border: `1px solid ${isChecked ? "var(--accent-gold)" : "var(--border)"}`,
            background: isChecked ? "color-mix(in oklab, var(--accent-gold) 20%, transparent)" : "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 120ms ease",
          }}
        >
          {isChecked && (
            <svg viewBox="0 0 12 12" width={10} height={10} fill="none" stroke="var(--accent-gold)" strokeWidth={2}>
              <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <button
          onClick={() => {
            if (isFolder) setExpanded(!expanded);
            else if (node.file) onFileSelect(node.file);
          }}
          onDragOver={(e) => {
            if (node.file) {
              e.preventDefault();
              e.currentTarget.style.background = "color-mix(in oklab, var(--accent-gold) 15%, transparent)";
            }
          }}
          onDragLeave={(e) => {
            e.currentTarget.style.background = "";
          }}
          onDrop={(e) => {
            e.currentTarget.style.background = "";
            const snippet = e.dataTransfer.getData("text/plain");
            if (snippet && node.file) {
              node.file.content += "\n\n" + snippet;
              onFileSelect(node.file);
            }
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flex: 1,
            padding: "5px 10px",
            background: isSelected
              ? "color-mix(in oklab, var(--accent-gold) 10%, transparent)"
              : "transparent",
            border: "none",
            borderLeft: isSelected
              ? "2px solid var(--accent-gold)"
              : "2px solid transparent",
            color: isSelected ? "var(--foreground)" : "var(--muted-text)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            cursor: "pointer",
            transition: "all 120ms ease",
            textAlign: "left",
          }}
        >
          {isFolder ? (
            <>
              <span style={{ opacity: 0.5, fontSize: 8, width: 8, flexShrink: 0 }}>
                {expanded ? "▼" : "▶"}
              </span>
              <FolderIcon open={expanded} />
            </>
          ) : (
            <>
              <span style={{ width: 8, flexShrink: 0 }} />
              <FileIcon language={node.file?.language ?? "tsx"} />
            </>
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {node.name}
          </span>
          {node.file?.version && node.file.version > 1 && (
            <span
              style={{
                fontSize: 9,
                padding: "1px 5px",
                borderRadius: 8,
                background: "color-mix(in oklab, var(--phosphor) 15%, transparent)",
                color: "var(--phosphor)",
                marginLeft: "auto",
                flexShrink: 0,
              }}
            >
              v{node.file.version}
            </span>
          )}
        </button>
      </div>
      {isFolder && expanded && (
        <div>
          {node.children.map((child) => (
            <TreeNodeView
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
              checkedPaths={checkedPaths}
              onToggleCheck={onToggleCheck}
              matchesSearch={matchesSearch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Simple ZIP file generator — no external dependency required. */
function createZipBlob(files: Array<{ filename: string; content: string }>): Blob {
  const parts: string[] = [];
  for (const file of files) {
    parts.push(`\n${"═".repeat(60)}\n// FILE: ${file.filename}\n${"═".repeat(60)}\n\n`);
    parts.push(file.content);
    parts.push("\n");
  }
  return new Blob(parts, { type: "text/plain;charset=utf-8" });
}

export function FileTreeDrawer({ open, onClose, files, onFileSelect }: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(() => new Set());
  const tree = useMemo(() => buildTree(files), [files]);

  // Filter tree nodes by search
  const matchingPaths = useMemo(() => {
    if (!searchQuery.trim()) return null; // null = show all
    const q = searchQuery.toLowerCase();
    const matching = new Set<string>();
    for (const file of files) {
      if (file.filename.toLowerCase().includes(q)) {
        // Add the file and all parent paths
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
    (node: TreeNode): boolean => {
      if (!matchingPaths) return true;
      return matchingPaths.has(node.path);
    },
    [matchingPaths],
  );

  const handleToggleCheck = useCallback((path: string, isFolder: boolean, node: TreeNode) => {
    setCheckedPaths((prev) => {
      const next = new Set(prev);
      if (isFolder) {
        const childPaths = collectFilePaths(node);
        const allChecked = childPaths.every((p) => prev.has(p));
        if (allChecked) {
          for (const p of childPaths) next.delete(p);
        } else {
          for (const p of childPaths) next.add(p);
        }
      } else {
        if (next.has(path)) next.delete(path);
        else next.add(path);
      }
      return next;
    });
  }, []);

  const checkedFiles = useMemo(
    () => files.filter((f) => checkedPaths.has(f.filename)),
    [files, checkedPaths],
  );

  const handleDownloadSelected = () => {
    if (checkedFiles.length === 0) return;
    const blob = createZipBlob(checkedFiles);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `atlas-export-${checkedFiles.length}-files.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
          animation: "atlas-sys-backdrop-in 200ms ease forwards",
        }}
      />
      {/* Panel */}
      <div
        style={{
          position: "relative",
          width: "min(320px, 85vw)",
          height: "100%",
          background: "var(--glass-bg)",
          backdropFilter: `blur(${("var(--glass-blur)")})`,
          borderRight: "0.5px solid var(--glass-border)",
          display: "flex",
          flexDirection: "column",
          animation: "atlas-sys-menu-in 250ms cubic-bezier(0.4,0,0.2,1) forwards",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 16px 12px",
            borderBottom: "0.5px solid var(--glass-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="var(--accent-gold)" strokeWidth={1.4}>
              <path d="M2 13V3h4l2 2h6v8z" strokeLinejoin="round" />
            </svg>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--accent-gold)",
              }}
            >
              File Tree
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted-text)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <svg viewBox="0 0 16 16" width={14} height={14} stroke="currentColor" fill="none" strokeWidth={1.6}>
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Search bar */}
        <div style={{ padding: "8px 12px", borderBottom: "0.5px solid var(--glass-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
            <svg
              viewBox="0 0 16 16"
              width={12}
              height={12}
              fill="none"
              stroke="var(--muted-text)"
              strokeWidth={1.4}
              style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
            >
              <circle cx="7" cy="7" r="4" />
              <path d="M10 10l3 3" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search files…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px 6px 28px",
                borderRadius: 8,
                background: "var(--surface-alt)",
                border: "0.5px solid var(--border)",
                color: "var(--foreground)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                outline: "none",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: 6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "var(--muted-text)",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: 2,
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* File count + selected count */}
        <div
          style={{
            padding: "8px 16px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--muted-text)",
            letterSpacing: "0.06em",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{files.length} file{files.length !== 1 ? "s" : ""} generated</span>
          {checkedPaths.size > 0 && (
            <span style={{ color: "var(--accent-gold)" }}>
              {checkedFiles.length} selected
            </span>
          )}
        </div>

        {/* Tree */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {tree.length === 0 ? (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                color: "var(--muted-text)",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "color-mix(in oklab, var(--accent-gold) 8%, transparent)",
                  border: "0.5px solid color-mix(in oklab, var(--accent-gold) 15%, transparent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px",
                }}
              >
                <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke="var(--accent-gold)" strokeWidth={1.2}>
                  <path d="M2 13V3h4l2 2h6v8z" strokeLinejoin="round" />
                </svg>
              </div>
              No files yet. Use <span style={{ color: "var(--accent-gold)" }}>/build</span> to generate components.
            </div>
          ) : (
            tree.map((node) => (
              <TreeNodeView
                key={node.path}
                node={node}
                depth={0}
                onFileSelect={(file) => {
                  setSelectedPath(file.filename);
                  onFileSelect(file);
                }}
                selectedPath={selectedPath}
                checkedPaths={checkedPaths}
                onToggleCheck={handleToggleCheck}
                matchesSearch={nodeMatchesSearch(node)}
              />
            ))
          )}
        </div>

        {/* Footer: download selected or drag hint */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: "0.5px solid var(--glass-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {checkedFiles.length > 0 ? (
            <button
              onClick={handleDownloadSelected}
              style={{
                width: "100%",
                padding: "8px 16px",
                borderRadius: 8,
                background: "var(--accent-gold)",
                border: "none",
                color: "var(--background)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={1.6}>
                <path d="M8 2v9M5 8l3 3 3-3M3 13h10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Download {checkedFiles.length} file{checkedFiles.length > 1 ? "s" : ""}
            </button>
          ) : (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--muted-text)",
                opacity: 0.6,
                letterSpacing: "0.06em",
                textAlign: "center",
              }}
            >
              Drag parked snippets onto files to merge
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
