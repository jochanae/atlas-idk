/**
 * FilesBrowser — the unified Files surface.
 *
 * Slice 1: standalone browser used by /files. Later mounted inside every
 * composer "+" menu so users see the same view everywhere.
 *
 * Sections are filters over aggregated sources, NOT separate destinations:
 *   All · Workspace · Saved · Generated · Recent
 *
 * Type filters compose on top of section: Images · Documents · Code · Archives.
 *
 * Every row carries an Availability badge (Current Conversation / Atlas Project
 * / All Projects) so the user never has to guess where the file "lives."
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, List, Search, FileText, Image as ImageIcon, Code2, Archive, Folder, Sparkles, Bookmark, File as FileIcon, Eye, X } from "lucide-react";
import { useListProjects } from "@workspace/api-client-react";
import { fetchLibraryItems, type LibraryItem } from "@/lib/library";

// Narrow-screen detector — inline to avoid coupling FilesBrowser to a hook.
function useIsNarrow(breakpoint = 720): boolean {
  const [narrow, setNarrow] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = () => setNarrow(window.innerWidth < breakpoint);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [breakpoint]);
  return narrow;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type FilesSection = "all" | "workspace" | "saved" | "generated" | "recent";
export type FilesTypeFilter = "any" | "images" | "documents" | "code" | "archives";
export type FilesViewMode = "list" | "thumb";

export type FilesAvailability = "current-conversation" | "atlas-project" | "all-projects";

export interface UnifiedFile {
  id: string;
  name: string;
  /** high-level category derived from name/kind — used for the type filter */
  category: FilesTypeFilter;
  /** source section this file belongs to */
  section: Exclude<FilesSection, "all" | "recent">;
  /** ISO timestamp used for Recent + sort */
  updatedAt: string;
  /** Human-readable project label, if any */
  projectLabel?: string | null;
  /** Availability scope */
  availability: FilesAvailability;
  /** Optional thumbnail URL */
  thumbUrl?: string | null;
  /** Short preview text for list rows */
  preview?: string;
  /** Raw underlying record for the click handler */
  raw?: unknown;
}

export interface FilesBrowserProps {
  mode?: "browse" | "attach";
  /** attach mode: selected file ids */
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  /** browse mode: what to do on row click */
  onOpen?: (file: UnifiedFile) => void;
  /** Optional context to bias Availability display */
  currentProjectId?: number | null;
  currentConversationId?: string | null;
  /** If set, hide the workspace project picker and pin to this project */
  pinnedProjectId?: number | null;
}

// ── Category inference ──────────────────────────────────────────────────────

const IMAGE_RX = /\.(png|jpe?g|gif|webp|svg|avif|bmp|tiff?)$/i;
const CODE_RX = /\.(t|j)sx?$|\.(py|rb|go|rs|java|c|cpp|h|hpp|cs|php|swift|kt|sql|sh|css|scss|html?|json|ya?ml|toml|md|mdx)$/i;
const ARCHIVE_RX = /\.(zip|tar|gz|rar|7z)$/i;
const DOC_RX = /\.(pdf|docx?|xlsx?|pptx?|txt|rtf|epub|csv)$/i;

function categoryFor(name: string): FilesTypeFilter {
  if (IMAGE_RX.test(name)) return "images";
  if (CODE_RX.test(name)) return "code";
  if (ARCHIVE_RX.test(name)) return "archives";
  if (DOC_RX.test(name)) return "documents";
  return "any";
}

// ── Workspace tree (project filesystem) ─────────────────────────────────────

interface FsNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: FsNode[];
  updatedAt?: string;
}
interface TreeResponse { workspaceDir: string; children: FsNode[] }

async function fetchTree(projectId: number): Promise<TreeResponse> {
  const res = await fetch(`/api/fs/${projectId}/tree`, { credentials: "include" });
  if (!res.ok) throw new Error(`Workspace tree HTTP ${res.status}`);
  return res.json();
}

function flattenFs(nodes: FsNode[], parentPath = ""): FsNode[] {
  const out: FsNode[] = [];
  for (const n of nodes) {
    const full = parentPath ? `${parentPath}/${n.name}` : n.name;
    if (n.type === "file") out.push({ ...n, path: full });
    if (n.children) out.push(...flattenFs(n.children, full));
  }
  return out;
}

// ── Component ───────────────────────────────────────────────────────────────

export function FilesBrowser({
  mode = "browse",
  selectedIds = [],
  onSelectionChange,
  onOpen,
  currentProjectId = null,
  currentConversationId = null,
  pinnedProjectId = null,
}: FilesBrowserProps) {
  const [section, setSection] = useState<FilesSection>("all");
  const [typeFilter, setTypeFilter] = useState<FilesTypeFilter>("any");
  const [query, setQuery] = useState("");
  // per-section view mode, remembered in localStorage
  const [viewByS, setViewByS] = useState<Record<FilesSection, FilesViewMode>>(() => {
    try {
      const raw = localStorage.getItem("atlas.files.view");
      if (raw) return JSON.parse(raw);
    } catch { /* noop */ }
    return { all: "list", workspace: "list", saved: "list", generated: "thumb", recent: "list" };
  });
  useEffect(() => {
    try { localStorage.setItem("atlas.files.view", JSON.stringify(viewByS)); } catch { /* noop */ }
  }, [viewByS]);
  const view = viewByS[section];
  const setView = (v: FilesViewMode) => setViewByS((prev) => ({ ...prev, [section]: v }));

  // ── Data sources ─────────────────────────────────────────────────────────
  const { data: projectsRaw } = useListProjects();
  const projects = useMemo(() => Array.isArray(projectsRaw) ? projectsRaw : [], [projectsRaw]);
  const [workspaceProjectId, setWorkspaceProjectId] = useState<number | null>(
    pinnedProjectId ?? currentProjectId ?? null,
  );
  useEffect(() => {
    if (pinnedProjectId != null) setWorkspaceProjectId(pinnedProjectId);
    else if (workspaceProjectId == null && projects.length > 0) {
      setWorkspaceProjectId(currentProjectId ?? projects[0].id);
    }
  }, [pinnedProjectId, currentProjectId, projects, workspaceProjectId]);

  const librarySavedQ = useQuery<LibraryItem[]>({
    queryKey: ["files-library-saved"],
    queryFn: () => fetchLibraryItems({ limit: 100 }),
    staleTime: 30_000,
  });

  const generatedQ = useQuery<LibraryItem[]>({
    queryKey: ["files-library-generated"],
    queryFn: () => fetchLibraryItems({ kind: "sketch", limit: 100 }),
    staleTime: 30_000,
  });

  const workspaceTreeQ = useQuery<TreeResponse>({
    queryKey: ["files-workspace-tree", workspaceProjectId],
    queryFn: () => fetchTree(workspaceProjectId as number),
    enabled: workspaceProjectId != null,
    staleTime: 20_000,
  });

  const projectNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  // ── Aggregate ────────────────────────────────────────────────────────────
  const files: UnifiedFile[] = useMemo(() => {
    const out: UnifiedFile[] = [];

    // Saved (library, excluding sketches which live in Generated)
    for (const item of librarySavedQ.data ?? []) {
      if (item.kind === "sketch") continue;
      out.push({
        id: `saved:${item.id}`,
        name: item.title,
        category: categoryFor(item.title),
        section: "saved",
        updatedAt: item.updatedAt ?? item.createdAt,
        projectLabel: item.project?.name ?? projectNameById.get(item.project?.id ?? -1) ?? null,
        availability: item.project ? "atlas-project" : "all-projects",
        preview: item.preview,
        raw: item,
      });
    }

    // Generated (sketches / artifacts)
    for (const item of generatedQ.data ?? []) {
      out.push({
        id: `gen:${item.id}`,
        name: item.title,
        category: "images",
        section: "generated",
        updatedAt: item.updatedAt ?? item.createdAt,
        projectLabel: item.project?.name ?? projectNameById.get(item.project?.id ?? -1) ?? null,
        availability: item.project ? "atlas-project" : "all-projects",
        preview: item.preview,
        raw: item,
      });
    }

    // Workspace tree
    if (workspaceProjectId != null && workspaceTreeQ.data) {
      const flat = flattenFs(workspaceTreeQ.data.children);
      const label = projectNameById.get(workspaceProjectId) ?? `Project #${workspaceProjectId}`;
      for (const f of flat) {
        out.push({
          id: `ws:${workspaceProjectId}:${f.path}`,
          name: f.path,
          category: categoryFor(f.name),
          section: "workspace",
          updatedAt: f.updatedAt ?? new Date().toISOString(),
          projectLabel: label,
          availability: "atlas-project",
          raw: f,
        });
      }
    }

    return out;
  }, [librarySavedQ.data, generatedQ.data, workspaceTreeQ.data, workspaceProjectId, projectNameById]);

  const visible = useMemo(() => {
    let arr = files;
    if (section === "workspace") arr = arr.filter((f) => f.section === "workspace");
    else if (section === "saved") arr = arr.filter((f) => f.section === "saved");
    else if (section === "generated") arr = arr.filter((f) => f.section === "generated");
    else if (section === "recent") {
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      arr = arr.filter((f) => new Date(f.updatedAt).getTime() >= cutoff);
    }
    if (typeFilter !== "any") arr = arr.filter((f) => f.category === typeFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter((f) => f.name.toLowerCase().includes(q) || (f.preview ?? "").toLowerCase().includes(q));
    }
    return [...arr].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [files, section, typeFilter, query]);

  const toggle = (id: string) => {
    if (!onSelectionChange) return;
    onSelectionChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const isLoading = librarySavedQ.isLoading || generatedQ.isLoading || (workspaceProjectId != null && workspaceTreeQ.isLoading);
  const anyError = librarySavedQ.error || generatedQ.error || workspaceTreeQ.error;
  const isNarrow = useIsNarrow(720);
  const [previewFile, setPreviewFile] = useState<UnifiedFile | null>(null);

  const openPreview = (f: UnifiedFile) => setPreviewFile(f);
  const closePreview = () => setPreviewFile(null);

  const primaryAction = (f: UnifiedFile) => {
    if (mode === "attach") toggle(f.id);
    else onOpen?.(f);
    closePreview();
  };

  // Rail contents (used inline for desktop aside AND horizontal pill row for mobile).
  const sectionButtons = (
    <>
      <RailBtn active={section === "all"} onClick={() => setSection("all")} icon={<FileIcon size={13} />}>All</RailBtn>
      <RailBtn active={section === "workspace"} onClick={() => setSection("workspace")} icon={<Folder size={13} />}>Workspace</RailBtn>
      <RailBtn active={section === "saved"} onClick={() => setSection("saved")} icon={<Bookmark size={13} />}>Saved</RailBtn>
      <RailBtn active={section === "generated"} onClick={() => setSection("generated")} icon={<Sparkles size={13} />}>Generated</RailBtn>
      <RailBtn active={section === "recent"} onClick={() => setSection("recent")} icon={<FileText size={13} />}>Recent</RailBtn>
    </>
  );
  const typeButtons = (
    <>
      <RailBtn active={typeFilter === "any"} onClick={() => setTypeFilter("any")}>Any</RailBtn>
      <RailBtn active={typeFilter === "images"} onClick={() => setTypeFilter("images")} icon={<ImageIcon size={13} />}>Images</RailBtn>
      <RailBtn active={typeFilter === "documents"} onClick={() => setTypeFilter("documents")} icon={<FileText size={13} />}>Documents</RailBtn>
      <RailBtn active={typeFilter === "code"} onClick={() => setTypeFilter("code")} icon={<Code2 size={13} />}>Code</RailBtn>
      <RailBtn active={typeFilter === "archives"} onClick={() => setTypeFilter("archives")} icon={<Archive size={13} />}>Archives</RailBtn>
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%", color: "hsl(var(--popover-foreground, 30 20% 92%))", position: "relative" }}>
      {/* Header: search + view toggle */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: "1px solid hsl(var(--border))", flexShrink: 0 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "hsl(var(--muted) / 0.35)", border: "1px solid hsl(var(--border))" }}>
          <Search size={14} strokeWidth={1.6} opacity={0.6} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files..."
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "inherit", fontSize: 13, fontFamily: "var(--app-font-sans)" }}
          />
        </div>
        <div style={{ display: "flex", gap: 2, padding: 2, borderRadius: 8, background: "hsl(var(--muted) / 0.35)", border: "1px solid hsl(var(--border))" }}>
          <ViewToggleBtn active={view === "list"} onClick={() => setView("list")} label="List"><List size={14} /></ViewToggleBtn>
          <ViewToggleBtn active={view === "thumb"} onClick={() => setView("thumb")} label="Thumbnails"><LayoutGrid size={14} /></ViewToggleBtn>
        </div>
      </div>

      {/* Mobile: horizontal scrolling pill rows for Section + Type */}
      {isNarrow && (
        <div style={{
          display: "flex", flexDirection: "column", gap: 6,
          padding: "8px 12px", borderBottom: "1px solid hsl(var(--border))", flexShrink: 0,
        }}>
          <div style={{
            display: "flex", gap: 4, overflowX: "auto", WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
          }}>{sectionButtons}</div>
          <div style={{
            display: "flex", gap: 4, overflowX: "auto", WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
          }}>{typeButtons}</div>
          {(section === "workspace" || section === "all") && !pinnedProjectId && projects.length > 0 && (
            <select
              value={workspaceProjectId ?? ""}
              onChange={(e) => setWorkspaceProjectId(parseInt(e.target.value, 10))}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 6, fontSize: 12, background: "hsl(var(--muted) / 0.35)", border: "1px solid hsl(var(--border))", color: "inherit", fontFamily: "var(--app-font-sans)" }}
            >
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          )}
        </div>
      )}

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Desktop-only left rail */}
        {!isNarrow && (
          <aside style={{ width: 168, flexShrink: 0, borderRight: "1px solid hsl(var(--border))", padding: "12px 8px", overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column", gap: 14 }}>
            <RailGroup label="Sections">{sectionButtons}</RailGroup>
            <RailGroup label="Type">{typeButtons}</RailGroup>
            {(section === "workspace" || section === "all") && !pinnedProjectId && projects.length > 0 && (
              <RailGroup label="Project">
                <select
                  value={workspaceProjectId ?? ""}
                  onChange={(e) => setWorkspaceProjectId(parseInt(e.target.value, 10))}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, fontSize: 12, background: "hsl(var(--muted) / 0.35)", border: "1px solid hsl(var(--border))", color: "inherit", fontFamily: "var(--app-font-sans)" }}
                >
                  {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </RailGroup>
            )}
          </aside>
        )}

        {/* Right pane: results */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: 12, overscrollBehavior: "contain" }}>
          {isLoading && <EmptyPane title="Loading…" body="Fetching your files." />}
          {!isLoading && anyError && <EmptyPane title="Couldn't load files" body={String((anyError as Error).message ?? anyError)} />}
          {!isLoading && !anyError && visible.length === 0 && (
            <EmptyPane title="No files match" body="Try a different section or clear the search." />
          )}
          {!isLoading && !anyError && visible.length > 0 && (
            view === "list" ? (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
                {visible.map((f) => (
                  <FileRow
                    key={f.id} file={f}
                    selected={selectedIds.includes(f.id)}
                    mode={mode}
                    onClick={() => {
                      if (mode === "attach") toggle(f.id);
                      else openPreview(f);
                    }}
                    onPreview={() => openPreview(f)}
                    currentConversationId={currentConversationId}
                  />
                ))}
              </ul>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                {visible.map((f) => (
                  <FileTile
                    key={f.id} file={f}
                    selected={selectedIds.includes(f.id)}
                    mode={mode}
                    onClick={() => {
                      if (mode === "attach") toggle(f.id);
                      else openPreview(f);
                    }}
                    onPreview={() => openPreview(f)}
                  />
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {mode === "attach" && (
        <div style={{
          padding: "10px 14px calc(10px + env(safe-area-inset-bottom, 0px))",
          borderTop: "1px solid hsl(var(--border))",
          display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em" }}>
            {selectedIds.length} selected
          </span>
        </div>
      )}

      {previewFile && (
        <PreviewPanel
          file={previewFile}
          mode={mode}
          isNarrow={isNarrow}
          onClose={closePreview}
          onPrimary={() => primaryAction(previewFile)}
          isSelected={selectedIds.includes(previewFile.id)}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ViewToggleBtn({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick} aria-label={label} title={label}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 26, borderRadius: 6, cursor: "pointer",
        background: active ? "hsl(var(--primary) / 0.14)" : "transparent",
        color: active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
        border: "none",
      }}
    >{children}</button>
  );
}

function RailGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", padding: "0 6px 4px", fontFamily: "var(--app-font-mono)" }}>{label}</div>
      {children}
    </div>
  );
}

function RailBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px", borderRadius: 6, cursor: "pointer",
        background: active ? "hsl(var(--primary) / 0.14)" : "transparent",
        color: active ? "hsl(var(--primary))" : "hsl(var(--popover-foreground) / 0.85)",
        border: "none", textAlign: "left", fontSize: 12.5,
        fontFamily: "var(--app-font-sans)",
      }}
    >
      {icon && <span style={{ opacity: 0.9, display: "inline-flex" }}>{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

function AvailabilityBadge({ availability }: { availability: FilesAvailability }) {
  const label =
    availability === "current-conversation" ? "Current conversation"
    : availability === "atlas-project" ? "Project"
    : "All projects";
  return (
    <span style={{
      fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase",
      padding: "2px 6px", borderRadius: 4,
      border: "1px solid hsl(var(--border))",
      color: "hsl(var(--muted-foreground))",
      fontFamily: "var(--app-font-mono)", whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function CategoryGlyph({ cat }: { cat: FilesTypeFilter }) {
  const size = 14, s = 1.6;
  if (cat === "images") return <ImageIcon size={size} strokeWidth={s} />;
  if (cat === "code") return <Code2 size={size} strokeWidth={s} />;
  if (cat === "archives") return <Archive size={size} strokeWidth={s} />;
  if (cat === "documents") return <FileText size={size} strokeWidth={s} />;
  return <FileIcon size={size} strokeWidth={s} />;
}

function FileRow({ file, selected, mode, onClick }: { file: UnifiedFile; selected: boolean; mode: "browse" | "attach"; onClick: () => void; currentConversationId: string | null }) {
  return (
    <li data-unified-file-id={file.id} data-unified-file={JSON.stringify(file)}>
      <button
        onClick={onClick}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "8px 10px", borderRadius: 6, cursor: "pointer",
          background: selected ? "hsl(var(--primary) / 0.10)" : "transparent",
          border: "1px solid " + (selected ? "hsl(var(--primary) / 0.35)" : "transparent"),
          textAlign: "left", color: "inherit",
        }}
      >
        {mode === "attach" && (
          <input type="checkbox" readOnly checked={selected} style={{ pointerEvents: "none" }} />
        )}
        <span style={{ color: "hsl(var(--primary))", flexShrink: 0 }}><CategoryGlyph cat={file.category} /></span>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
            <span>{file.projectLabel ?? "—"}</span>
            <span>·</span>
            <span>{new Date(file.updatedAt).toLocaleDateString()}</span>
          </div>
        </span>
        <AvailabilityBadge availability={file.availability} />
      </button>
    </li>
  );
}

function FileTile({ file, selected, mode, onClick }: { file: UnifiedFile; selected: boolean; mode: "browse" | "attach"; onClick: () => void }) {
  return (
    <button
      data-unified-file-id={file.id}
      data-unified-file={JSON.stringify(file)}
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", gap: 6,
        padding: 8, borderRadius: 8, cursor: "pointer",
        background: selected ? "hsl(var(--primary) / 0.10)" : "hsl(var(--muted) / 0.28)",
        border: "1px solid " + (selected ? "hsl(var(--primary) / 0.4)" : "hsl(var(--border))"),
        textAlign: "left", color: "inherit",
      }}
    >
      <div style={{
        aspectRatio: "4/3", borderRadius: 6, background: "hsl(var(--muted) / 0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "hsl(var(--primary))", overflow: "hidden",
      }}>
        {file.thumbUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img src={file.thumbUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <CategoryGlyph cat={file.category} />
        )}
      </div>
      <div style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name.split("/").pop()}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {file.projectLabel ?? ""}
        </span>
        <AvailabilityBadge availability={file.availability} />
      </div>
      {mode === "attach" && selected && (
        <div style={{ fontSize: 10, color: "hsl(var(--primary))", fontFamily: "var(--app-font-mono)", letterSpacing: "0.12em" }}>SELECTED</div>
      )}
    </button>
  );
}

function EmptyPane({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: "48px 12px", textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
      <div style={{ fontSize: 14, color: "hsl(var(--popover-foreground))", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, maxWidth: 320, margin: "0 auto", lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

export default FilesBrowser;
