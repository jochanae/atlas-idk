// CodebasePanel — project-scoped repo intelligence surface.
// Mounted inside the Workspace shell (Files tab, "Codebase" sub-tab).
// Deep-linked by CitationChip via the `codebase:open` window event.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useProjectSource,
  useSourceTree,
  useSourceFile,
  searchSource,
  type TreeNode,
  type SearchHit,
  type CodebaseOpenDetail,
} from "../../hooks/useProjectSource";

interface Props {
  projectId: number;
}

type SubView = "tree" | "search" | "file";

const GOLD = "var(--atlas-gold, #c9a24c)";
const MUTED = "var(--atlas-muted, #8a8a8a)";
const BORDER = "1px solid rgba(201,162,76,0.10)";

function StatusPill({ status }: { status: string }) {
  const color =
    status === "ready" ? "#4ade80" :
    status === "indexing" ? "#fbbf24" :
    status === "failed" ? "#f87171" : MUTED;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontFamily: "var(--app-font-mono)", fontSize: 9.5,
      letterSpacing: "0.09em", textTransform: "uppercase",
      color, padding: "1px 6px",
      border: `1px solid ${color}`, borderRadius: 3, opacity: 0.85,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
      {status}
    </span>
  );
}

function TreeItem({ node, depth, onOpen }: { node: TreeNode; depth: number; onOpen: (p: string) => void }) {
  const [open, setOpen] = useState(depth < 1);
  const isDir = node.type === "dir";
  const name = node.path.split("/").pop() || node.path;
  return (
    <div>
      <div
        onClick={() => (isDir ? setOpen((o) => !o) : onOpen(node.path))}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: `2px 4px 2px ${8 + depth * 12}px`,
          fontFamily: "var(--app-font-mono)", fontSize: 11,
          color: isDir ? MUTED : "var(--atlas-fg, #d4d4d4)",
          cursor: "pointer", userSelect: "none",
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = "rgba(201,162,76,0.05)")}
        onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <span style={{ opacity: 0.5, width: 10 }}>{isDir ? (open ? "▾" : "▸") : ""}</span>
        <span>{isDir ? "📁" : "📄"}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      </div>
      {isDir && open && node.children?.map((c) => (
        <TreeItem key={c.path} node={c} depth={depth + 1} onOpen={onOpen} />
      ))}
    </div>
  );
}

export const CodebasePanel: React.FC<Props> = ({ projectId }) => {
  const { source, loading, error, refresh } = useProjectSource(projectId);
  const sourceId = source?.id ?? null;
  const { tree } = useSourceTree(source?.lastIngestStatus === "ready" ? sourceId : null);

  const [view, setView] = useState<SubView>("tree");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [lineRange, setLineRange] = useState<{ start?: number; end?: number }>({});
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const fileScrollRef = useRef<HTMLDivElement | null>(null);

  const { file, loading: fileLoading } = useSourceFile(sourceId, activePath);

  // Deep-link listener.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<CodebaseOpenDetail>).detail;
      if (!detail?.path) return;
      setActivePath(detail.path);
      setLineRange({ start: detail.lineStart, end: detail.lineEnd });
      setView("file");
    };
    window.addEventListener("codebase:open", onOpen);
    return () => window.removeEventListener("codebase:open", onOpen);
  }, []);

  // Scroll to line on file load.
  useEffect(() => {
    if (!file || !lineRange.start || !fileScrollRef.current) return;
    const el = fileScrollRef.current.querySelector<HTMLDivElement>(
      `[data-line="${lineRange.start}"]`,
    );
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [file, lineRange.start]);

  const openFile = useCallback((path: string) => {
    setActivePath(path);
    setLineRange({});
    setView("file");
  }, []);

  const runSearch = useCallback(async () => {
    if (!sourceId || !query.trim()) return;
    setSearching(true);
    try { setHits(await searchSource(sourceId, query)); }
    finally { setSearching(false); }
  }, [sourceId, query]);

  const highlightedLines = useMemo(() => {
    if (!file) return null;
    return file.content.split("\n").map((text, i) => {
      const n = i + 1;
      const inRange = lineRange.start && n >= lineRange.start && n <= (lineRange.end ?? lineRange.start);
      return { n, text, inRange };
    });
  }, [file, lineRange]);

  // Empty / status states -----------------------------------------------------
  if (!source && loading) {
    return <EmptyState label="Loading project source…" />;
  }
  if (!source) {
    return (
      <EmptyState
        label="No indexed source for this project yet"
        hint="Upload a ZIP, connect a repo, or generate files from the Workspace to begin indexing."
        onRetry={refresh}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header: source meta + status */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 10px", borderBottom: BORDER, flexShrink: 0, gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{
            fontFamily: "var(--app-font-mono)", fontSize: 10,
            letterSpacing: "0.09em", textTransform: "uppercase", color: MUTED,
          }}>{source.sourceType}</span>
          <span style={{ fontSize: 10.5, color: MUTED }}>
            {source.fileCount} files · {(source.totalBytes / 1024).toFixed(1)} KB
          </span>
        </div>
        <StatusPill status={source.lastIngestStatus} />
      </div>

      {error && (
        <div style={{ padding: "6px 10px", fontSize: 10.5, color: "#f87171", borderBottom: BORDER }}>
          {error}
        </div>
      )}
      {source.lastIngestError && (
        <div style={{ padding: "6px 10px", fontSize: 10.5, color: "#f87171", borderBottom: BORDER }}>
          {source.lastIngestError}
        </div>
      )}

      {/* Sub-view tabs */}
      <div style={{ display: "flex", borderBottom: BORDER, flexShrink: 0, height: 28 }}>
        {(["tree", "search", "file"] as const).map((v) => {
          const active = view === v;
          return (
            <button key={v} type="button" onClick={() => setView(v)} style={{
              padding: "0 12px", height: "100%", border: "none",
              borderBottom: active ? `2px solid ${GOLD}` : "2px solid transparent",
              background: "transparent", cursor: "pointer",
              fontFamily: "var(--app-font-mono)", fontSize: 10,
              letterSpacing: "0.09em", textTransform: "uppercase",
              color: active ? GOLD : MUTED, opacity: active ? 1 : 0.55,
              fontWeight: active ? 600 : 400,
            }}>
              {v}{v === "file" && activePath ? ` · ${activePath.split("/").pop()}` : ""}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {view === "tree" && (
          tree
            ? <TreeItem node={tree} depth={0} onOpen={openFile} />
            : <EmptyState label={source.lastIngestStatus === "ready" ? "Empty tree" : "Indexing…"} />
        )}

        {view === "search" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ padding: 8, borderBottom: BORDER, display: "flex", gap: 6 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
                placeholder="Search symbols, imports, text…"
                style={{
                  flex: 1, padding: "4px 8px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(201,162,76,0.15)",
                  borderRadius: 3, color: "var(--atlas-fg, #d4d4d4)",
                  fontFamily: "var(--app-font-mono)", fontSize: 11, outline: "none",
                }}
              />
              <button type="button" onClick={runSearch} disabled={searching || !query.trim()} style={{
                padding: "4px 10px", background: "rgba(201,162,76,0.12)",
                border: "1px solid rgba(201,162,76,0.30)", color: GOLD,
                fontFamily: "var(--app-font-mono)", fontSize: 10,
                letterSpacing: "0.09em", textTransform: "uppercase",
                borderRadius: 3, cursor: searching ? "wait" : "pointer",
              }}>{searching ? "…" : "Go"}</button>
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              {hits.length === 0 && !searching && (
                <div style={{ padding: 12, fontSize: 11, color: MUTED }}>
                  {query ? "No hits" : "Enter a term and hit Enter"}
                </div>
              )}
              {hits.map((h, i) => (
                <div key={i} onClick={() => {
                  setActivePath(h.path);
                  setLineRange({ start: h.line, end: h.line });
                  setView("file");
                }} style={{
                  padding: "6px 10px", borderBottom: BORDER, cursor: "pointer",
                  fontFamily: "var(--app-font-mono)", fontSize: 10.5,
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "rgba(201,162,76,0.05)")}
                onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ color: GOLD }}>{h.path}<span style={{ color: MUTED }}>:L{h.line}</span></div>
                  <div style={{ color: "var(--atlas-fg, #d4d4d4)", opacity: 0.75, whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" }}>{h.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "file" && (
          <div ref={fileScrollRef} style={{ height: "100%", overflow: "auto" }}>
            {!activePath && <EmptyState label="Select a file from Tree or Search" />}
            {activePath && fileLoading && <EmptyState label={`Loading ${activePath}…`} />}
            {file && highlightedLines && (
              <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 11, lineHeight: 1.5 }}>
                {highlightedLines.map((l) => (
                  <div key={l.n} data-line={l.n} style={{
                    display: "flex", gap: 10, padding: "0 10px",
                    background: l.inRange ? "rgba(201,162,76,0.12)" : "transparent",
                    borderLeft: l.inRange ? `2px solid ${GOLD}` : "2px solid transparent",
                  }}>
                    <span style={{ color: MUTED, opacity: 0.5, userSelect: "none", minWidth: 32, textAlign: "right" }}>{l.n}</span>
                    <span style={{ whiteSpace: "pre", color: "var(--atlas-fg, #d4d4d4)" }}>{l.text || " "}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function EmptyState({ label, hint, onRetry }: { label: string; hint?: string; onRetry?: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100%", padding: 20, gap: 8, textAlign: "center",
    }}>
      <div style={{
        fontFamily: "var(--app-font-mono)", fontSize: 11, color: MUTED,
        letterSpacing: "0.06em",
      }}>{label}</div>
      {hint && <div style={{ fontSize: 10.5, color: MUTED, opacity: 0.7, maxWidth: 320 }}>{hint}</div>}
      {onRetry && (
        <button type="button" onClick={onRetry} style={{
          marginTop: 6, padding: "4px 10px", background: "transparent",
          border: `1px solid ${GOLD}`, color: GOLD,
          fontFamily: "var(--app-font-mono)", fontSize: 10,
          letterSpacing: "0.09em", textTransform: "uppercase",
          borderRadius: 3, cursor: "pointer",
        }}>Retry</button>
      )}
    </div>
  );
}
