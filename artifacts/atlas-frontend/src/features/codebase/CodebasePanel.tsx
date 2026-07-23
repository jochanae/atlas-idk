// Intelligence Panel — Joy's indexed understanding of the project.
// NOT a file browser. Workspace tab already owns files/tree/edit.
// This surface answers: where is X used, who imports Y, what routes exist,
// what components live here, what does this depend on, ask a question.
//
// Deep-linked from anywhere via `codebase:open` (CitationChip).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useProjectSource,
  useSourceFile,
  searchSource,
  peekOtherProjectFile,
  type SearchHit,
  type CodebaseOpenDetail,
  type CrossProjectFile,
} from "../../hooks/useProjectSource";
import { ArchitectureDiffView } from "./ArchitectureDiffView";

interface Props {
  projectId: number;
}

type SubView = "search" | "symbols" | "routes" | "components" | "imports" | "questions" | "compare" | "file";

const GOLD = "var(--atlas-gold, #c9a24c)";
const MUTED = "var(--atlas-muted, #8a8a8a)";
const FG = "var(--atlas-fg, #d4d4d4)";
const BORDER = "1px solid rgba(201,162,76,0.10)";

const TAB_LABELS: Record<Exclude<SubView, "file">, string> = {
  search: "Search",
  symbols: "Symbols",
  routes: "Routes",
  components: "Components",
  imports: "Imports",
  questions: "Ask",
  compare: "Compare",
};

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

function StubView({
  title, blurb, examples,
}: { title: string; blurb: string; examples?: string[] }) {
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{
        fontFamily: "var(--app-font-mono)", fontSize: 10.5,
        letterSpacing: "0.09em", textTransform: "uppercase",
        color: GOLD, opacity: 0.85,
      }}>{title}</div>
      <div style={{ fontSize: 12, color: FG, opacity: 0.85, lineHeight: 1.55 }}>{blurb}</div>
      {examples && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
          <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>Will surface</div>
          {examples.map((ex, i) => (
            <div key={i} style={{
              fontFamily: "var(--app-font-mono)", fontSize: 11, color: MUTED,
              paddingLeft: 10, borderLeft: `2px solid rgba(201,162,76,0.15)`,
            }}>
              {ex}
            </div>
          ))}
        </div>
      )}
      <div style={{
        marginTop: 8, padding: "6px 8px",
        border: "1px dashed rgba(201,162,76,0.25)", borderRadius: 4,
        fontSize: 10.5, color: MUTED, fontFamily: "var(--app-font-mono)",
      }}>
        Awaiting backend endpoint
      </div>
    </div>
  );
}

export const CodebasePanel: React.FC<Props> = ({ projectId }) => {
  const { source, loading, error, refresh } = useProjectSource(projectId);
  const sourceId = source?.id ?? null;

  const [view, setView] = useState<SubView>("search");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [lineRange, setLineRange] = useState<{ start?: number; end?: number }>({});
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const fileScrollRef = useRef<HTMLDivElement | null>(null);

  const { file, loading: fileLoading } = useSourceFile(sourceId, activePath);

  // Cross-project peek overlay (Phase 3A step 2). This panel is bound to a
  // single projectId, so a citation pointing at ANOTHER project can't just
  // switch activePath/sourceId — it opens as a read-only overlay on top
  // instead, fetched via peekOtherProjectFile.
  const [crossProject, setCrossProject] = useState<{
    projectId: number;
    projectName: string;
    path: string;
    lineStart?: number;
    lineEnd?: number;
  } | null>(null);
  const [crossFile, setCrossFile] = useState<CrossProjectFile | null>(null);
  const [crossLoading, setCrossLoading] = useState(false);
  const [crossError, setCrossError] = useState<string | null>(null);

  useEffect(() => {
    if (!crossProject) { setCrossFile(null); setCrossError(null); return; }
    let alive = true;
    setCrossLoading(true);
    setCrossError(null);
    peekOtherProjectFile(crossProject.projectId, crossProject.path)
      .then((f) => { if (alive) setCrossFile(f); })
      .catch((e) => { if (alive) setCrossError(String(e)); })
      .finally(() => { if (alive) setCrossLoading(false); });
    return () => { alive = false; };
  }, [crossProject]);

  // Deep-link listener → file viewer (same project) or cross-project overlay.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<CodebaseOpenDetail>).detail;
      if (!detail?.path) return;
      if (detail.crossProjectId && detail.crossProjectId !== projectId) {
        setCrossProject({
          projectId: detail.crossProjectId,
          projectName: detail.crossProjectName ?? `Project #${detail.crossProjectId}`,
          path: detail.path,
          lineStart: detail.lineStart,
          lineEnd: detail.lineEnd,
        });
        return;
      }
      setActivePath(detail.path);
      setLineRange({ start: detail.lineStart, end: detail.lineEnd });
      setView("file");
    };
    window.addEventListener("codebase:open", onOpen);
    return () => window.removeEventListener("codebase:open", onOpen);
  }, [projectId]);

  useEffect(() => {
    if (!file || !lineRange.start || !fileScrollRef.current) return;
    const el = fileScrollRef.current.querySelector<HTMLDivElement>(
      `[data-line="${lineRange.start}"]`,
    );
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [file, lineRange.start]);

  const runSearch = useCallback(async () => {
    if (!sourceId || !query.trim()) return;
    setSearching(true);
    setSearched(true);
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

  // ── Empty / unindexed states ────────────────────────────────────────────────
  if (!source && loading) return <EmptyState label="Loading project intelligence…" />;

  if (!source) {
    return (
      <EmptyState
        label="Joy hasn't indexed this project yet"
        hint="Once you upload a ZIP, connect a repo, or generate files in Workspace, Joy will build a searchable index — symbols, routes, components, imports — and you'll be able to interrogate the project from here."
        onRetry={refresh}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, position: "relative" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 10px", borderBottom: BORDER, flexShrink: 0, gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{
            fontFamily: "var(--app-font-mono)", fontSize: 10,
            letterSpacing: "0.09em", textTransform: "uppercase", color: MUTED,
          }}>{source.sourceType} · indexed</span>
          <span style={{ fontSize: 10.5, color: MUTED }}>
            {source.fileCount} files · {(source.totalBytes / 1024).toFixed(1)} KB
          </span>
        </div>
        <StatusPill status={source.lastIngestStatus} />
      </div>

      {error && (
        <div style={{ padding: "6px 10px", fontSize: 10.5, color: "#f87171", borderBottom: BORDER }}>{error}</div>
      )}
      {source.lastIngestError && (
        <div style={{ padding: "6px 10px", fontSize: 10.5, color: "#f87171", borderBottom: BORDER }}>{source.lastIngestError}</div>
      )}

      {/* Sub-view tabs (Search is home; File appears only when a citation opens it) */}
      <div style={{ display: "flex", borderBottom: BORDER, flexShrink: 0, height: 28, overflowX: "auto" }} className="scrollbar-none">
        {(Object.keys(TAB_LABELS) as Array<keyof typeof TAB_LABELS>).map((v) => {
          const active = view === v;
          return (
            <button key={v} type="button" onClick={() => setView(v)} style={{
              padding: "0 12px", height: "100%", border: "none",
              borderBottom: active ? `2px solid ${GOLD}` : "2px solid transparent",
              background: "transparent", cursor: "pointer",
              fontFamily: "var(--app-font-mono)", fontSize: 10,
              letterSpacing: "0.09em", textTransform: "uppercase",
              color: active ? GOLD : MUTED, opacity: active ? 1 : 0.55,
              fontWeight: active ? 600 : 400, whiteSpace: "nowrap", flexShrink: 0,
            }}>
              {TAB_LABELS[v]}
            </button>
          );
        })}
        {view === "file" && activePath && (
          <button type="button" onClick={() => setView("file")} style={{
            padding: "0 12px", height: "100%", border: "none",
            borderBottom: `2px solid ${GOLD}`, background: "transparent",
            fontFamily: "var(--app-font-mono)", fontSize: 10,
            letterSpacing: "0.09em", textTransform: "uppercase",
            color: GOLD, fontWeight: 600, cursor: "default", whiteSpace: "nowrap",
          }}>
            {activePath.split("/").pop()}
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {view === "search" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ padding: 8, borderBottom: BORDER, display: "flex", gap: 6 }}>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
                placeholder="Search useAuth, /login, Dashboard…"
                style={{
                  flex: 1, padding: "4px 8px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(201,162,76,0.15)",
                  borderRadius: 3, color: FG,
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
              {!searched && (
                <div style={{ padding: 16, fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
                  Search Joy's index of this project.
                  <div style={{ marginTop: 8, fontSize: 10.5 }}>
                    Try: <code style={{ color: GOLD }}>useAuth</code>, <code style={{ color: GOLD }}>createProject</code>, <code style={{ color: GOLD }}>/api/sources</code>
                  </div>
                </div>
              )}
              {searched && hits.length === 0 && !searching && (
                <div style={{ padding: 12, fontSize: 11, color: MUTED }}>No hits for "{query}"</div>
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
                  <div style={{ color: FG, opacity: 0.75, whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" }}>{h.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "symbols" && (
          <StubView
            title="Symbols"
            blurb="Every exported function, class, hook, and type across the project — with the file and line they live in."
            examples={[
              "useAuth  ·  src/hooks/useAuth.ts:L12",
              "Dashboard  ·  src/pages/Dashboard.tsx:L34",
              "type ProjectSource  ·  lib/db/src/schema/project_sources.ts:L38",
            ]}
          />
        )}

        {view === "routes" && (
          <StubView
            title="Routes"
            blurb="Client routes (TanStack/React Router) and API endpoints (/api/*) discovered by walking the project."
            examples={[
              "/login  →  src/routes/login.tsx",
              "/workspace/$projectId  →  src/routes/workspace.$projectId.tsx",
              "GET /api/sources/tree  →  server route handler",
            ]}
          />
        )}

        {view === "components" && (
          <StubView
            title="Components"
            blurb="React components in the project, where each is defined, and every file that renders it."
            examples={[
              "CitationChip  ·  defined 1×  ·  used 4×",
              "CodebasePanel  ·  defined 1×  ·  used 1× (workspace.tsx)",
            ]}
          />
        )}

        {view === "imports" && (
          <StubView
            title="Imports & Dependencies"
            blurb="Reverse-import graph: pick a file to see who depends on it, and impact-analyze an edit before you make it."
            examples={[
              "src/hooks/useAuth.ts  →  12 downstream importers",
              "@workspace/api-client-react  →  47 call sites",
              "duplicate: two implementations of formatDate() detected",
            ]}
          />
        )}

        {view === "questions" && (
          <StubView
            title="Ask Joy about this project"
            blurb="Free-form Q&A grounded in the indexed source. Every answer cites file:line so you can jump straight to the code."
            examples={[
              '"Where does auth state get initialized?"',
              '"What guards the /workspace route?"',
              '"Which components would break if I rename ProjectSource?"',
            ]}
          />
        )}

        {view === "compare" && (
          <ArchitectureDiffView projectId={projectId} />
        )}

        {view === "file" && (
          <div ref={fileScrollRef} style={{ height: "100%", overflow: "auto" }}>
            {!activePath && <EmptyState label="Open a file from Search or a citation chip" />}
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
                    <span style={{ whiteSpace: "pre", color: FG }}>{l.text || " "}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {crossProject && (
        <CrossProjectOverlay
          projectName={crossProject.projectName}
          path={crossProject.path}
          lineStart={crossProject.lineStart}
          lineEnd={crossProject.lineEnd}
          file={crossFile}
          loading={crossLoading}
          error={crossError}
          onClose={() => setCrossProject(null)}
        />
      )}
    </div>
  );
};

function CrossProjectOverlay({
  projectName, path, lineStart, lineEnd, file, loading, error, onClose,
}: {
  projectName: string;
  path: string;
  lineStart?: number;
  lineEnd?: number;
  file: CrossProjectFile | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const lines = file
    ? file.content.split("\n").map((text, i) => {
        const n = i + 1;
        const inRange = lineStart && n >= lineStart && n <= (lineEnd ?? lineStart);
        return { n, text, inRange };
      })
    : null;
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      background: "rgba(10,10,10,0.97)", zIndex: 20,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: BORDER, flexShrink: 0, gap: 8,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{
            fontFamily: "var(--app-font-mono)", fontSize: 9.5,
            letterSpacing: "0.09em", textTransform: "uppercase", color: GOLD, opacity: 0.85,
          }}>Read-only · from {projectName}</span>
          <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 11, color: FG }}>
            {path}{lineStart ? `:L${lineStart}${lineEnd && lineEnd !== lineStart ? `-${lineEnd}` : ""}` : ""}
          </span>
        </div>
        <button type="button" onClick={onClose} style={{
          padding: "4px 10px", background: "transparent",
          border: `1px solid ${MUTED}`, color: MUTED,
          fontFamily: "var(--app-font-mono)", fontSize: 10,
          letterSpacing: "0.09em", textTransform: "uppercase",
          borderRadius: 3, cursor: "pointer", flexShrink: 0,
        }}>Close</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {loading && <EmptyState label={`Loading ${path} from ${projectName}…`} />}
        {error && <EmptyState label="Couldn't load that file" hint={error} />}
        {lines && (
          <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 11, lineHeight: 1.5 }}>
            {lines.map((l) => (
              <div key={l.n} data-line={l.n} style={{
                display: "flex", gap: 10, padding: "0 10px",
                background: l.inRange ? "rgba(201,162,76,0.12)" : "transparent",
                borderLeft: l.inRange ? `2px solid ${GOLD}` : "2px solid transparent",
              }}>
                <span style={{ color: MUTED, opacity: 0.5, userSelect: "none", minWidth: 32, textAlign: "right" }}>{l.n}</span>
                <span style={{ whiteSpace: "pre", color: FG }}>{l.text || " "}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ label, hint, onRetry }: { label: string; hint?: string; onRetry?: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100%", padding: 24, gap: 10, textAlign: "center",
    }}>
      <div style={{
        fontFamily: "var(--app-font-mono)", fontSize: 11, color: GOLD,
        letterSpacing: "0.09em", textTransform: "uppercase", opacity: 0.85,
      }}>{label}</div>
      {hint && <div style={{ fontSize: 11.5, color: MUTED, opacity: 0.75, maxWidth: 360, lineHeight: 1.55 }}>{hint}</div>}
      {onRetry && (
        <button type="button" onClick={onRetry} style={{
          marginTop: 6, padding: "4px 10px", background: "transparent",
          border: `1px solid ${GOLD}`, color: GOLD,
          fontFamily: "var(--app-font-mono)", fontSize: 10,
          letterSpacing: "0.09em", textTransform: "uppercase",
          borderRadius: 3, cursor: "pointer",
        }}>Check again</button>
      )}
    </div>
  );
}
