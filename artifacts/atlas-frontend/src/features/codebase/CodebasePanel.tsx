/**
 * CodebasePanel — Source Intelligence (F2) surface.
 *
 * Tabs: Tree · Search · Symbols · Routes · File (contextual) · Diff (Phase 2 hookable)
 * Opens automatically when a CitationChip dispatches `codebase:open`.
 *
 * Mount once per project workspace and pass the project id.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Folder, FolderOpen, FileCode, Search, Hash, Route as RouteIcon, ArrowLeft } from "lucide-react";
import {
  useProjectPrimarySource,
  useSourceTree,
  useSourceFile,
  useSearchSource,
  useSourceSymbols,
  useSourceRoutes,
  useSourceImports,
} from "@/hooks/useProjectSource";
import type { Citation } from "./CitationChip";
import type {
  SourceTreeNode,
  SourceSearchHit,
  SourceRoute,
  SourceSymbol,
} from "@workspace/api-client-react";

type Tab = "tree" | "search" | "symbols" | "routes" | "file";

const MONO: React.CSSProperties = { fontFamily: "var(--app-font-mono, monospace)" };

export function CodebasePanel({
  projectId,
  open: openProp,
  onClose,
}: {
  projectId: number;
  open?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(!!openProp);
  const [tab, setTab] = useState<Tab>("tree");
  const [focus, setFocus] = useState<{ path: string; lineStart?: number; lineEnd?: number } | null>(null);

  const { primary, sourceId, status, isLoading: sourcesLoading } = useProjectPrimarySource(projectId);

  // Listen for citation-open events.
  useEffect(() => {
    const handler = (evt: Event) => {
      const c = (evt as CustomEvent<Citation>).detail;
      if (!c) return;
      setFocus({ path: c.path, lineStart: c.lineStart, lineEnd: c.lineEnd });
      setTab("file");
      setOpen(true);
    };
    window.addEventListener("codebase:open", handler as EventListener);
    return () => window.removeEventListener("codebase:open", handler as EventListener);
  }, []);

  useEffect(() => {
    if (openProp !== undefined) setOpen(openProp);
  }, [openProp]);

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  if (!open) return null;

  const body = (
    <div
      role="dialog"
      aria-label="Codebase panel"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(560px, 100vw)",
        background: "var(--atlas-bg, #0b0d10)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "-16px 0 40px rgba(0,0,0,0.5)",
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        color: "var(--atlas-text, #e6e6e6)",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FileCode size={14} style={{ color: "var(--atlas-gold, #d4af37)" }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Codebase</span>
          {primary && (
            <span style={{ ...MONO, fontSize: 10, opacity: 0.55 }}>
              {primary.sourceType} · {primary.fileCount} files · {status}
            </span>
          )}
        </div>
        <button onClick={close} aria-label="Close" style={iconBtn}>
          <X size={14} />
        </button>
      </header>

      <nav style={{ display: "flex", gap: 4, padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {(["tree", "search", "symbols", "routes"] as Tab[]).map((t) => (
          <TabBtn key={t} active={tab === t} onClick={() => setTab(t)}>{t}</TabBtn>
        ))}
        {focus && <TabBtn active={tab === "file"} onClick={() => setTab("file")}>file</TabBtn>}
      </nav>

      <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
        {sourcesLoading && <Empty label="Loading source…" />}
        {!sourcesLoading && !sourceId && (
          <Empty label="No source indexed for this project yet. Upload a ZIP or connect a repo to ingest." />
        )}
        {sourceId && status !== "ready" && (
          <div style={{ ...MONO, fontSize: 11, opacity: 0.7, marginBottom: 10 }}>
            Source status: <span style={{ color: "var(--atlas-gold, #d4af37)" }}>{status}</span>
          </div>
        )}
        {sourceId && tab === "tree" && <TreeTab sourceId={sourceId} onOpen={(p) => { setFocus({ path: p }); setTab("file"); }} />}
        {sourceId && tab === "search" && <SearchTab sourceId={sourceId} onOpen={(h) => { setFocus({ path: h.path, lineStart: Math.max(1, h.line - 5), lineEnd: h.line + 15 }); setTab("file"); }} />}
        {sourceId && tab === "symbols" && <SymbolsTab sourceId={sourceId} onOpen={(s) => { setFocus({ path: s.path, lineStart: Math.max(1, s.line - 3), lineEnd: s.line + 20 }); setTab("file"); }} />}
        {sourceId && tab === "routes" && <RoutesTab sourceId={sourceId} onOpen={(r) => { setFocus({ path: r.file, lineStart: Math.max(1, r.line - 3), lineEnd: r.line + 15 }); setTab("file"); }} />}
        {sourceId && tab === "file" && focus && <FileTab sourceId={sourceId} focus={focus} onBack={() => setTab("tree")} />}
      </div>
    </div>
  );

  return createPortal(body, document.body);
}

// ── Tabs ──────────────────────────────────────────────────────────────────

function TreeTab({ sourceId, onOpen }: { sourceId: string; onOpen: (path: string) => void }) {
  const { data, isLoading, error } = useSourceTree(sourceId);
  if (isLoading) return <Empty label="Loading tree…" />;
  if (error) return <Empty label={`Tree error: ${(error as Error).message}`} />;
  if (!data?.tree?.length) return <Empty label="Empty tree." />;
  return <TreeNodes nodes={data.tree} onOpen={onOpen} depth={0} />;
}

function TreeNodes({ nodes, onOpen, depth }: { nodes: SourceTreeNode[]; onOpen: (p: string) => void; depth: number }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {nodes.map((n) => (
        <TreeItem key={n.path} node={n} onOpen={onOpen} depth={depth} />
      ))}
    </ul>
  );
}

function TreeItem({ node, onOpen, depth }: { node: SourceTreeNode; onOpen: (p: string) => void; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const pad = { paddingLeft: 8 + depth * 12 };
  if (node.type === "dir") {
    return (
      <li>
        <button onClick={() => setExpanded((v) => !v)} style={{ ...treeRow, ...pad }}>
          {expanded ? <FolderOpen size={12} /> : <Folder size={12} />}
          <span>{node.name}</span>
        </button>
        {expanded && node.children && <TreeNodes nodes={node.children} onOpen={onOpen} depth={depth + 1} />}
      </li>
    );
  }
  return (
    <li>
      <button onClick={() => onOpen(node.path)} style={{ ...treeRow, ...pad, opacity: 0.85 }}>
        <FileCode size={11} />
        <span>{node.name}</span>
        {node.sizeBytes !== undefined && <span style={{ ...MONO, marginLeft: "auto", fontSize: 10, opacity: 0.4 }}>{fmtBytes(node.sizeBytes)}</span>}
      </button>
    </li>
  );
}

function SearchTab({ sourceId, onOpen }: { sourceId: string; onOpen: (h: SourceSearchHit) => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isFetching } = useSearchSource(sourceId, debounced);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, marginBottom: 10 }}>
        <Search size={12} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="literal or /regex/" style={inputStyle} />
      </div>
      {debounced.length < 2 && <Empty label="Type at least 2 characters." />}
      {debounced.length >= 2 && isFetching && <Empty label="Searching…" />}
      {data?.hits?.length === 0 && !isFetching && <Empty label="No matches." />}
      <ul style={listReset}>
        {data?.hits?.map((h, i) => (
          <li key={`${h.path}:${h.line}:${i}`}>
            <button onClick={() => onOpen(h)} style={hitRow}>
              <div style={{ ...MONO, fontSize: 11, color: "var(--atlas-gold, #d4af37)" }}>{h.path}:{h.line}</div>
              <div style={{ ...MONO, fontSize: 11, opacity: 0.75, whiteSpace: "pre-wrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.preview}</div>
            </button>
          </li>
        ))}
      </ul>
      {data?.capped && <div style={{ ...MONO, fontSize: 10, opacity: 0.5, marginTop: 8 }}>Results capped.</div>}
    </div>
  );
}

function SymbolsTab({ sourceId, onOpen }: { sourceId: string; onOpen: (s: SourceSymbol) => void }) {
  const [name, setName] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(name), 250);
    return () => clearTimeout(t);
  }, [name]);
  const { data, isFetching } = useSourceSymbols(sourceId, debounced);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, marginBottom: 10 }}>
        <Hash size={12} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="symbol name (e.g. useAuth)" style={inputStyle} />
      </div>
      {isFetching && <Empty label="Looking up…" />}
      {data?.symbols?.length === 0 && !isFetching && debounced && <Empty label="No symbols." />}
      <ul style={listReset}>
        {data?.symbols?.map((s, i) => (
          <li key={`${s.path}:${s.line}:${i}`}>
            <button onClick={() => onOpen(s)} style={hitRow}>
              <div style={{ ...MONO, fontSize: 11, color: "var(--atlas-gold, #d4af37)" }}>{s.name} <span style={{ opacity: 0.5 }}>({s.kind})</span></div>
              <div style={{ ...MONO, fontSize: 11, opacity: 0.65 }}>{s.path}:{s.line}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoutesTab({ sourceId, onOpen }: { sourceId: string; onOpen: (r: SourceRoute) => void }) {
  const { data, isLoading } = useSourceRoutes(sourceId);
  if (isLoading) return <Empty label="Scanning routes…" />;
  if (!data?.routes?.length) return <Empty label="No routes detected." />;
  return (
    <ul style={listReset}>
      {data.routes.map((r, i) => (
        <li key={`${r.file}:${r.line}:${i}`}>
          <button onClick={() => onOpen(r)} style={hitRow}>
            <div style={{ ...MONO, fontSize: 11, color: "var(--atlas-gold, #d4af37)" }}>
              {r.method && <span style={{ marginRight: 6, opacity: 0.75 }}>{r.method}</span>}
              {r.path}
            </div>
            <div style={{ ...MONO, fontSize: 11, opacity: 0.6 }}>{r.file}:{r.line}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FileTab({ sourceId, focus, onBack }: { sourceId: string; focus: { path: string; lineStart?: number; lineEnd?: number }; onBack: () => void }) {
  const { data, isLoading, error } = useSourceFile(sourceId, focus.path, focus.lineStart, focus.lineEnd);
  const importsQuery = useSourceImports(sourceId, focus.path, "in");
  const lines = useMemo(() => (data?.content ?? "").split("\n"), [data?.content]);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button onClick={onBack} style={iconBtn} aria-label="Back"><ArrowLeft size={12} /></button>
        <div style={{ ...MONO, fontSize: 11, color: "var(--atlas-gold, #d4af37)" }}>
          {focus.path}{focus.lineStart ? `:L${focus.lineStart}-L${focus.lineEnd ?? focus.lineStart}` : ""}
        </div>
      </div>
      {isLoading && <Empty label="Loading file…" />}
      {error ? <Empty label={`File error: ${(error as Error).message}`} /> : null}
      {data && (
        <>
          <pre style={{ ...MONO, fontSize: 11, background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 6, overflow: "auto", margin: 0 }}>
            {lines.map((ln, i) => {
              const num = (data.lineStart ?? 1) + i;
              return (
                <div key={i} style={{ display: "flex", gap: 10 }}>
                  <span style={{ opacity: 0.35, minWidth: 32, textAlign: "right" }}>{num}</span>
                  <span style={{ whiteSpace: "pre" }}>{ln}</span>
                </div>
              );
            })}
          </pre>
          {importsQuery.data?.edges?.length ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>Used by ({importsQuery.data.edges.length})</div>
              <ul style={listReset}>
                {importsQuery.data.edges.slice(0, 20).map((e, i) => (
                  <li key={`${e.path}:${e.line}:${i}`} style={{ ...MONO, fontSize: 11, opacity: 0.75, padding: "2px 0" }}>
                    {e.path}:{e.line} <span style={{ opacity: 0.5 }}>← {e.specifier}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ── UI atoms ──────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px",
        borderRadius: 5,
        border: "1px solid transparent",
        background: active ? "rgba(212,175,55,0.12)" : "transparent",
        color: active ? "var(--atlas-gold, #d4af37)" : "var(--atlas-text, #e6e6e6)",
        fontSize: 11,
        textTransform: "capitalize",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Empty({ label }: { label: string }) {
  return <div style={{ ...MONO, fontSize: 11, opacity: 0.55, padding: 12 }}>{label}</div>;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}

const iconBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  padding: 4, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4,
  background: "transparent", color: "var(--atlas-text, #e6e6e6)", cursor: "pointer",
};
const treeRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, width: "100%",
  padding: "3px 6px", border: "none", background: "transparent",
  color: "var(--atlas-text, #e6e6e6)", fontSize: 12, cursor: "pointer", textAlign: "left",
};
const hitRow: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left",
  padding: "6px 8px", border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 5, background: "rgba(255,255,255,0.02)", color: "var(--atlas-text, #e6e6e6)",
  cursor: "pointer", marginBottom: 6,
};
const listReset: React.CSSProperties = { listStyle: "none", padding: 0, margin: 0 };
const inputStyle: React.CSSProperties = {
  flex: 1, border: "none", outline: "none", background: "transparent",
  color: "var(--atlas-text, #e6e6e6)", fontSize: 12,
};
