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
import { useLocation } from "wouter";
import { LayoutGrid, List, Search, FileText, Image as ImageIcon, Code2, Archive, Folder, Sparkles, Bookmark, File as FileIcon, Eye, X, FolderTree } from "lucide-react";
import { useListProjects } from "@workspace/api-client-react";
import { fetchLibraryItems, type LibraryItem } from "@/lib/library";
import {
  getRecentAttachments,
  subscribeRecentAttachments,
  clearRecentAttachments,
  type RecentAttachmentEntry,
} from "@/components/files/recentAttachments";

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

// ── Session browse state (section / filters / search / project) ─────────────
// Survives remounts when the user leaves /files and returns in the same tab.
const BROWSE_STATE_KEY = "atlas.files.browseState";

type BrowseSessionState = {
  section: FilesSection;
  typeFilter: FilesTypeFilter;
  query: string;
  workspaceProjectId: number | null;
};

const SECTIONS: FilesSection[] = ["all", "workspace", "saved", "generated", "recent"];
const TYPE_FILTERS: FilesTypeFilter[] = ["any", "images", "documents", "code", "archives"];

function readBrowseSession(): Partial<BrowseSessionState> {
  try {
    const raw = sessionStorage.getItem(BROWSE_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Partial<BrowseSessionState> = {};
    if ((SECTIONS as string[]).includes(parsed.section)) out.section = parsed.section as FilesSection;
    if ((TYPE_FILTERS as string[]).includes(parsed.typeFilter)) out.typeFilter = parsed.typeFilter as FilesTypeFilter;
    if (typeof parsed.query === "string") out.query = parsed.query;
    if (parsed.workspaceProjectId == null) out.workspaceProjectId = null;
    else if (typeof parsed.workspaceProjectId === "number" && Number.isFinite(parsed.workspaceProjectId)) {
      out.workspaceProjectId = parsed.workspaceProjectId;
    }
    return out;
  } catch {
    return {};
  }
}

function writeBrowseSession(state: BrowseSessionState) {
  try {
    sessionStorage.setItem(BROWSE_STATE_KEY, JSON.stringify(state));
  } catch { /* noop */ }
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
  const sessionInit = readBrowseSession();
  const [section, setSection] = useState<FilesSection>(
    () => sessionInit.section ?? "all",
  );
  const [typeFilter, setTypeFilter] = useState<FilesTypeFilter>(
    () => sessionInit.typeFilter ?? "any",
  );
  const [query, setQuery] = useState(() => sessionInit.query ?? "");
  // Recent attachments log (localStorage-backed).
  const [recentLog, setRecentLog] = useState<RecentAttachmentEntry[]>(() => getRecentAttachments());
  useEffect(() => subscribeRecentAttachments(() => setRecentLog(getRecentAttachments())), []);
  const recentOrder = useMemo(() => {
    const m = new Map<string, number>();
    recentLog.forEach((e, i) => m.set(e.id, i));
    return m;
  }, [recentLog]);
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
    () => pinnedProjectId ?? currentProjectId ?? sessionInit.workspaceProjectId ?? null,
  );
  useEffect(() => {
    if (pinnedProjectId != null) setWorkspaceProjectId(pinnedProjectId);
    else if (workspaceProjectId == null && projects.length > 0) {
      setWorkspaceProjectId(currentProjectId ?? projects[0].id);
    }
  }, [pinnedProjectId, currentProjectId, projects, workspaceProjectId]);

  // Persist browse UI for same-session return to /files (and attach reuse).
  useEffect(() => {
    if (pinnedProjectId != null) return; // don't overwrite global browse project with a pinned attach context
    writeBrowseSession({
      section,
      typeFilter,
      query,
      workspaceProjectId,
    });
  }, [section, typeFilter, query, workspaceProjectId, pinnedProjectId]);

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
      // Recent = files the user has actually attached (from the local log).
      // Include known aggregated files, plus synthesize lightweight rows for
      // entries whose source no longer resolves (e.g. deleted saved item).
      const byId = new Map(arr.map((f) => [f.id, f] as const));
      arr = recentLog.map((entry) => {
        const existing = byId.get(entry.id);
        if (existing) return existing;
        return {
          id: entry.id,
          name: entry.name,
          category: (entry.category as FilesTypeFilter | undefined) ?? categoryFor(entry.name),
          section: (entry.section as UnifiedFile["section"]) ?? "saved",
          updatedAt: entry.attachedAt,
          projectLabel: entry.projectLabel ?? null,
          availability: "all-projects",
          thumbUrl: entry.thumbUrl ?? null,
        } satisfies UnifiedFile;
      });
    }
    if (typeFilter !== "any") arr = arr.filter((f) => f.category === typeFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter((f) => f.name.toLowerCase().includes(q) || (f.preview ?? "").toLowerCase().includes(q));
    }
    if (section === "recent") {
      // Preserve attach-order (most recent first) instead of updatedAt sort.
      return [...arr].sort((a, b) => (recentOrder.get(a.id) ?? 0) - (recentOrder.get(b.id) ?? 0));
    }
    return [...arr].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [files, section, typeFilter, query, recentLog, recentOrder]);

  const toggle = (id: string) => {
    if (!onSelectionChange) return;
    onSelectionChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const isLoading = librarySavedQ.isLoading || generatedQ.isLoading || (workspaceProjectId != null && workspaceTreeQ.isLoading);
  const anyError = librarySavedQ.error || generatedQ.error || workspaceTreeQ.error;
  const isNarrow = useIsNarrow(720);
  const [, setLocation] = useLocation();
  // Cards vs Tree — inline switch for the workspace project pane.
  const [sourceView, setSourceView] = useState<"cards" | "tree">("cards");
  const openProjectWorkspace = () => {
    if (workspaceProjectId != null) setLocation(`/project/${workspaceProjectId}`);
  };
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
            <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
              <select
                value={workspaceProjectId ?? ""}
                onChange={(e) => setWorkspaceProjectId(parseInt(e.target.value, 10))}
                style={{ flex: 1, minWidth: 0, padding: "6px 8px", borderRadius: 6, fontSize: 12, background: "hsl(var(--muted) / 0.35)", border: "1px solid hsl(var(--border))", color: "inherit", fontFamily: "var(--app-font-sans)" }}
              >
                {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
              <ViewSourceToggle value={sourceView} onChange={setSourceView} onOpenWorkspace={openProjectWorkspace} disabled={workspaceProjectId == null} />
            </div>
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
                <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                  <select
                    value={workspaceProjectId ?? ""}
                    onChange={(e) => setWorkspaceProjectId(parseInt(e.target.value, 10))}
                    style={{ flex: 1, minWidth: 0, padding: "6px 8px", borderRadius: 6, fontSize: 12, background: "hsl(var(--muted) / 0.35)", border: "1px solid hsl(var(--border))", color: "inherit", fontFamily: "var(--app-font-sans)" }}
                  >
                    {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>
                  <ViewSourceToggle onOpenTree={openProjectTree} disabled={workspaceProjectId == null} />
                </div>
              </RailGroup>
            )}
          </aside>
        )}

        {/* Right pane: results */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: 12, overscrollBehavior: "contain" }}>
          {section === "recent" && recentLog.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 11, color: "var(--atlas-muted, hsl(var(--muted-foreground)))", fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <span>{recentLog.length} recently attached</span>
              <button
                type="button"
                onClick={() => { if (confirm("Clear recent attachments history?")) clearRecentAttachments(); }}
                style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit", textTransform: "inherit", padding: 4 }}
              >
                Clear
              </button>
            </div>
          )}
          {isLoading && <EmptyPane title="Loading…" body="Fetching your files." />}
          {!isLoading && anyError && <EmptyPane title="Couldn't load files" body={String((anyError as Error).message ?? anyError)} />}
          {!isLoading && !anyError && visible.length === 0 && (
            section === "recent"
              ? <EmptyPane title="No recent attachments" body="Files you attach to messages will appear here." />
              : <EmptyPane title="No files match" body="Try a different section or clear the search." />
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

/** Toggle beside the project dropdown: Cards view (current FilesBrowser) vs
 *  Tree view (jumps to /project/:id workspace filesystem). */
function ViewSourceToggle({ onOpenTree, disabled }: { onOpenTree: () => void; disabled?: boolean }) {
  return (
    <div
      role="group"
      aria-label="File view source"
      style={{
        display: "flex", gap: 2, padding: 2, borderRadius: 6,
        background: "hsl(var(--muted) / 0.35)", border: "1px solid hsl(var(--border))",
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        aria-pressed="true"
        title="Cards — unified files"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 24, borderRadius: 4, cursor: "default",
          background: "hsl(var(--primary) / 0.14)",
          color: "hsl(var(--primary))",
          border: "none",
        }}
      ><LayoutGrid size={12} /></button>
      <button
        type="button"
        onClick={onOpenTree}
        disabled={disabled}
        aria-pressed="false"
        title="Project workspace tree"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 24, borderRadius: 4,
          cursor: disabled ? "not-allowed" : "pointer",
          background: "transparent",
          color: "hsl(var(--muted-foreground))",
          border: "none",
          opacity: disabled ? 0.4 : 1,
        }}
      ><FolderTree size={12} /></button>
    </div>
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

function FileRow({ file, selected, mode, onClick, onPreview }: { file: UnifiedFile; selected: boolean; mode: "browse" | "attach"; onClick: () => void; onPreview: () => void; currentConversationId: string | null }) {
  return (
    <li data-unified-file-id={file.id} data-unified-file={JSON.stringify(file)} style={{ display: "flex", alignItems: "stretch", gap: 4 }}>
      <button
        onClick={onClick}
        style={{
          flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10,
          padding: "8px 10px", borderRadius: 6, cursor: "pointer",
          background: selected ? "hsl(var(--primary) / 0.10)" : "transparent",
          border: "1px solid " + (selected ? "hsl(var(--primary) / 0.35)" : "transparent"),
          textAlign: "left", color: "inherit",
        }}
      >
        {mode === "attach" && (
          <input type="checkbox" readOnly checked={selected} style={{ pointerEvents: "none", flexShrink: 0 }} />
        )}
        <span style={{ color: "hsl(var(--primary))", flexShrink: 0 }}><CategoryGlyph cat={file.category} /></span>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.projectLabel ?? "—"}</span>
            <span>·</span>
            <span style={{ flexShrink: 0 }}>{new Date(file.updatedAt).toLocaleDateString()}</span>
          </div>
        </span>
        <AvailabilityBadge availability={file.availability} />
      </button>
      {mode === "attach" && (
        <button
          onClick={(e) => { e.stopPropagation(); onPreview(); }}
          aria-label="Preview"
          title="Preview"
          style={{
            flexShrink: 0, width: 36, display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 6, background: "transparent",
            border: "1px solid hsl(var(--border))",
            color: "hsl(var(--muted-foreground))", cursor: "pointer",
          }}
        >
          <Eye size={14} />
        </button>
      )}
    </li>
  );
}

function FileTile({ file, selected, mode, onClick, onPreview }: { file: UnifiedFile; selected: boolean; mode: "browse" | "attach"; onClick: () => void; onPreview: () => void }) {
  return (
    <div
      data-unified-file-id={file.id}
      data-unified-file={JSON.stringify(file)}
      style={{
        position: "relative",
        display: "flex", flexDirection: "column", gap: 6,
        padding: 8, borderRadius: 8,
        background: selected ? "hsl(var(--primary) / 0.10)" : "hsl(var(--muted) / 0.28)",
        border: "1px solid " + (selected ? "hsl(var(--primary) / 0.4)" : "hsl(var(--border))"),
      }}
    >
      <button
        onClick={onClick}
        style={{
          all: "unset", cursor: "pointer",
          display: "flex", flexDirection: "column", gap: 6,
          color: "inherit",
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
      <button
        onClick={(e) => { e.stopPropagation(); onPreview(); }}
        aria-label="Preview"
        title="Preview"
        style={{
          position: "absolute", top: 6, right: 6,
          width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 6, background: "hsl(var(--background) / 0.75)",
          border: "1px solid hsl(var(--border))",
          color: "hsl(var(--muted-foreground))", cursor: "pointer",
          backdropFilter: "blur(4px)",
        }}
      >
        <Eye size={13} />
      </button>
    </div>
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

// ── Preview Panel ────────────────────────────────────────────────────────────
// Full-screen sheet on mobile (isNarrow), right-side drawer on desktop.
// Scrollable body with safe-area padding.

function PreviewPanel({
  file, mode, isNarrow, onClose, onPrimary, isSelected,
}: {
  file: UnifiedFile;
  mode: "browse" | "attach";
  isNarrow: boolean;
  onClose: () => void;
  onPrimary: () => void;
  isSelected: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const primaryLabel = mode === "attach"
    ? (isSelected ? "Remove selection" : "Add to attachments")
    : (file.section === "workspace" ? "Open in workspace" : "Open");

  const containerStyle: React.CSSProperties = isNarrow
    ? {
        position: "fixed", inset: 0, zIndex: 3000,
        display: "flex", flexDirection: "column",
        background: "hsl(var(--background))",
        color: "hsl(var(--foreground))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }
    : {
        position: "absolute", top: 0, right: 0, bottom: 0,
        width: "min(380px, 60%)", zIndex: 30,
        display: "flex", flexDirection: "column",
        background: "hsl(var(--popover))",
        color: "hsl(var(--popover-foreground))",
        borderLeft: "1px solid hsl(var(--border))",
        boxShadow: "-16px 0 48px hsl(var(--background) / 0.4)",
      };

  const shortName = file.name.split("/").pop() ?? file.name;
  const isImage = file.category === "images";

  return (
    <>
      {!isNarrow && (
        <div
          onClick={onClose}
          style={{ position: "absolute", inset: 0, zIndex: 29, background: "hsl(var(--background) / 0.5)" }}
        />
      )}
      <div style={containerStyle} role="dialog" aria-label={`Preview: ${shortName}`}>
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          padding: "14px 16px", borderBottom: "1px solid hsl(var(--border))", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ color: "hsl(var(--primary))", flexShrink: 0 }}><CategoryGlyph cat={file.category} /></span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shortName}</div>
              <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", fontFamily: "var(--app-font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2 }}>
                {file.section}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close preview"
            style={{
              flexShrink: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 6, background: "transparent",
              border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))", cursor: "pointer",
            }}
          ><X size={14} /></button>
        </header>

        <div style={{
          flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch",
          padding: 16, display: "flex", flexDirection: "column", gap: 14,
        }}>
          <div style={{
            aspectRatio: isImage ? "4/3" : "16/9",
            borderRadius: 8,
            background: "hsl(var(--muted) / 0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "hsl(var(--primary))", overflow: "hidden",
            border: "1px solid hsl(var(--border))",
          }}>
            {file.thumbUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <img src={file.thumbUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <div style={{ transform: "scale(2.4)", opacity: 0.7 }}>
                <CategoryGlyph cat={file.category} />
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <AvailabilityBadge availability={file.availability} />
            {file.projectLabel && (
              <span style={{
                fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase",
                padding: "2px 6px", borderRadius: 4,
                border: "1px solid hsl(var(--border))",
                color: "hsl(var(--muted-foreground))",
                fontFamily: "var(--app-font-mono)",
              }}>{file.projectLabel}</span>
            )}
          </div>

          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", fontSize: 12 }}>
            <dt style={{ color: "hsl(var(--muted-foreground))" }}>Path</dt>
            <dd style={{ margin: 0, wordBreak: "break-all", fontFamily: "var(--app-font-mono)" }}>{file.name}</dd>
            <dt style={{ color: "hsl(var(--muted-foreground))" }}>Type</dt>
            <dd style={{ margin: 0 }}>{file.category}</dd>
            <dt style={{ color: "hsl(var(--muted-foreground))" }}>Updated</dt>
            <dd style={{ margin: 0 }}>{new Date(file.updatedAt).toLocaleString()}</dd>
          </dl>

          {file.preview && (
            <div style={{
              padding: 12, borderRadius: 8,
              background: "hsl(var(--muted) / 0.35)",
              border: "1px solid hsl(var(--border))",
              fontSize: 12, lineHeight: 1.55,
              color: "hsl(var(--popover-foreground) / 0.85)",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              maxHeight: 260, overflowY: "auto", WebkitOverflowScrolling: "touch",
            }}>
              {file.preview}
            </div>
          )}
        </div>

        <footer style={{
          display: "flex", gap: 8, padding: "12px 16px calc(12px + env(safe-area-inset-bottom, 0px))",
          borderTop: "1px solid hsl(var(--border))", flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "10px 14px", borderRadius: 8,
              background: "transparent", border: "1px solid hsl(var(--border))",
              color: "hsl(var(--popover-foreground))", cursor: "pointer",
              fontSize: 13, fontFamily: "var(--app-font-sans)",
            }}
          >Close</button>
          <button
            onClick={onPrimary}
            style={{
              flex: 2, padding: "10px 14px", borderRadius: 8,
              background: "hsl(var(--primary))", border: "1px solid hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))", cursor: "pointer",
              fontSize: 13, fontWeight: 500, fontFamily: "var(--app-font-sans)",
            }}
          >{primaryLabel}</button>
        </footer>
      </div>
    </>
  );
}


export default FilesBrowser;
