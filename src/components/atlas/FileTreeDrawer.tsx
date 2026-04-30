import { useState, useMemo } from "react";

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
}: {
  node: TreeNode;
  depth: number;
  onFileSelect: (file: GeneratedFile) => void;
  selectedPath: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const isFolder = node.children.length > 0 && !node.file;
  const isSelected = node.path === selectedPath;

  return (
    <div>
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
          // Accept dropped snippet text
          const snippet = e.dataTransfer.getData("text/plain");
          if (snippet && node.file) {
            // Append snippet to file content (simple merge)
            node.file.content += "\n\n" + snippet;
            onFileSelect(node.file);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "5px 10px",
          paddingLeft: 10 + depth * 16,
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
      {isFolder && expanded && (
        <div>
          {node.children.map((child) => (
            <TreeNodeView
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTreeDrawer({ open, onClose, files, onFileSelect }: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const tree = useMemo(() => buildTree(files), [files]);

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

        {/* File count */}
        <div
          style={{
            padding: "8px 16px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--muted-text)",
            letterSpacing: "0.06em",
          }}
        >
          {files.length} file{files.length !== 1 ? "s" : ""} generated
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
              />
            ))
          )}
        </div>

        {/* Drop zone hint */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: "0.5px solid var(--glass-border)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--muted-text)",
            opacity: 0.6,
            letterSpacing: "0.06em",
            textAlign: "center",
          }}
        >
          Drag parked snippets onto files to merge
        </div>
      </div>
    </div>
  );
}
