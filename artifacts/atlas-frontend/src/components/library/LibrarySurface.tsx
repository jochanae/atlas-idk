import { useState, useEffect, useCallback, useMemo, type CSSProperties } from "react";
import { Search, X, ChevronLeft, Trash2, MoreHorizontal } from "lucide-react";
import {
  fetchLibraryItems,
  deleteLibraryItem,
  attachLibraryItem,
  detachLibraryItem,
  LibraryApiError,
  type LibraryItem,
} from "@/lib/library";
import {
  originPhrase,
  sanitizeContent,
  displayTitle,
  GROUP_ORDER,
  type LibraryGroup,
} from "./kindMeta";
import {
  semanticMetaFor,
  resolveConversationId,
  resolveProjectId,
  resolveDownloadTarget,
  isHtmlPrototype,
} from "./semanticMeta";
import { openLibraryDraftPreview } from "@/lib/library/openDraftPreview";

/**
 * Shared Library list + detail surface.
 * Mounted from Atlas Focus (attach) and the global drawer (browse).
 */

export type LibrarySurfaceMode = "attach" | "browse";

export interface LibrarySurfaceProps {
  mode: LibrarySurfaceMode;
  /** When true, fetch and render. Parent controls visibility. */
  active: boolean;
  focusProjectId?: number | null;
  focusProjectName?: string | null;
  conversationId?: string | null;
  attachedIds?: ReadonlySet<string>;
  onAttachmentsChange?: () => void;
  onOpenConversation?: (
    conversationId: string,
    meta: { projectId: number | null; originSource: string },
  ) => void;
  onOpenProject?: (projectId: number) => void;
  /** Navigate to a project workspace (used by Draft Preview open). */
  onNavigateToProject?: (projectId: number) => void;
  /** Current workspace project id when already inside a project. */
  currentProjectId?: number | null;
  /** Called after a successful attach in attach mode (closes Focus sheet). */
  onClose?: () => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

type FilterId = "all" | LibraryGroup;

const btnPrimary: CSSProperties = {
  background: "var(--atlas-gold, #c9a24c)",
  border: "1px solid var(--atlas-gold, #c9a24c)",
  borderRadius: 8,
  padding: "7px 14px",
  cursor: "pointer",
  color: "#000",
  fontSize: 12,
  fontFamily: "var(--app-font-sans)",
  fontWeight: 600,
};

const btnSecondary: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--atlas-border, rgba(255,255,255,0.1))",
  borderRadius: 8,
  padding: "7px 14px",
  cursor: "pointer",
  color: "var(--atlas-muted)",
  fontSize: 12,
  fontFamily: "var(--app-font-sans)",
};

const btnDanger: CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(239,68,68,0.2)",
  borderRadius: 8,
  padding: "7px 14px",
  cursor: "pointer",
  color: "#ef4444",
  fontSize: 12,
  fontFamily: "var(--app-font-sans)",
  opacity: 0.7,
};

export function LibrarySurface({
  mode,
  active,
  focusProjectId = null,
  focusProjectName = null,
  conversationId = null,
  attachedIds,
  onAttachmentsChange,
  onOpenConversation,
  onOpenProject,
  onNavigateToProject,
  currentProjectId = null,
  onClose,
}: LibrarySurfaceProps) {
  const attached = attachedIds ?? new Set<string>();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [attachBusyId, setAttachBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const effectiveScopeProjectId = showAllProjects ? null : focusProjectId;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const opts = effectiveScopeProjectId != null ? { projectId: effectiveScopeProjectId } : {};
      setItems(await fetchLibraryItems(opts));
    } catch (err) {
      setItems([]);
      setLoadError(err instanceof Error ? err.message : "Failed to load Library");
    } finally {
      setLoading(false);
    }
  }, [effectiveScopeProjectId]);

  useEffect(() => {
    if (active) {
      setSelectedId(null);
      setActionError(null);
      setMoreOpen(false);
      void load();
    }
  }, [active, load]);

  useEffect(() => { setShowAllProjects(false); }, [focusProjectId]);

  const handleDelete = useCallback(async (item: LibraryItem) => {
    setDeletingId(item.id);
    setActionError(null);
    try {
      await deleteLibraryItem(item);
      setItems((prev) => prev.filter((a) => a.id !== item.id));
      if (selectedId === item.id) setSelectedId(null);
      onAttachmentsChange?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove from Library");
    } finally {
      setDeletingId(null);
    }
  }, [selectedId, onAttachmentsChange]);

  const handleAttach = useCallback(async (item: LibraryItem) => {
    setActionError(null);
    if (!conversationId) {
      setActionError("Start a conversation first, then attach items to it.");
      return;
    }
    setAttachBusyId(item.id);
    try {
      await attachLibraryItem(item.id, conversationId);
      onAttachmentsChange?.();
      onClose?.();
    } catch (err) {
      const status = err instanceof LibraryApiError ? ` (${err.status})` : "";
      setActionError((err instanceof Error ? err.message : "Attach failed") + status);
    } finally {
      setAttachBusyId(null);
    }
  }, [conversationId, onAttachmentsChange, onClose]);

  const handleDetach = useCallback(async (item: LibraryItem) => {
    setActionError(null);
    if (!conversationId) return;
    setAttachBusyId(item.id);
    try {
      await detachLibraryItem(item.id, conversationId);
      onAttachmentsChange?.();
    } catch (err) {
      const status = err instanceof LibraryApiError ? ` (${err.status})` : "";
      setActionError((err instanceof Error ? err.message : "Detach failed") + status);
    } finally {
      setAttachBusyId(null);
    }
  }, [conversationId, onAttachmentsChange]);

  const groupCounts = useMemo(() => {
    const c: Record<LibraryGroup, number> = { Bookmarks: 0, Documents: 0, Sketches: 0, Other: 0 };
    for (const it of items) c[semanticMetaFor(it).group]++;
    return c;
  }, [items]);

  const visibleGroups: FilterId[] = useMemo(() => {
    const out: FilterId[] = ["all"];
    for (const g of GROUP_ORDER) if (groupCounts[g] > 0) out.push(g);
    return out;
  }, [groupCounts]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (filter !== "all" && semanticMetaFor(it).group !== filter) return false;
      if (!q) return true;
      return (
        it.title.toLowerCase().includes(q)
        || (it.preview ?? "").toLowerCase().includes(q)
        || semanticMetaFor(it).label.toLowerCase().includes(q)
      );
    });
  }, [items, filter, query]);

  const grouped = useMemo(() => {
    const map = new Map<LibraryGroup, LibraryItem[]>();
    for (const it of filteredItems) {
      const g = semanticMetaFor(it).group;
      const arr = map.get(g) ?? [];
      arr.push(it);
      map.set(g, arr);
    }
    return GROUP_ORDER
      .filter((g) => (map.get(g)?.length ?? 0) > 0)
      .map((g) => ({ group: g, items: map.get(g)! }));
  }, [filteredItems]);

  if (!active) return null;

  const selected = items.find((a) => a.id === selectedId) ?? null;

  if (selected) {
    return (
      <LibraryDetail
        item={selected}
        mode={mode}
        conversationId={conversationId}
        attachedIds={attached}
        attachBusyId={attachBusyId}
        deletingId={deletingId}
        actionError={actionError}
        isCompact={isCompact}
        moreOpen={moreOpen}
        setMoreOpen={setMoreOpen}
        onBack={() => { setSelectedId(null); setMoreOpen(false); setActionError(null); }}
        onAttach={handleAttach}
        onDetach={handleDetach}
        onDelete={handleDelete}
        onOpenConversation={onOpenConversation}
        onOpenProject={onOpenProject}
        onNavigateToProject={onNavigateToProject}
        currentProjectId={currentProjectId}
        onClose={onClose}
        setActionError={setActionError}
      />
    );
  }

  return (
    <div style={{ padding: "0 20px" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10,
      }}>
        <span style={{
          fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.14em",
          textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.55,
        }}>
          Library · {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      {focusProjectName && !showAllProjects && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          marginBottom: 10, padding: "6px 10px",
          border: "1px solid rgba(201,162,76,0.18)", borderRadius: 8,
          background: "color-mix(in oklab, var(--atlas-gold) 4%, transparent)",
        }}>
          <span style={{ fontSize: 11, color: "var(--atlas-muted)", fontFamily: "var(--app-font-sans)" }}>
            Showing items in <span style={{ color: "var(--atlas-fg)", fontWeight: 500 }}>{focusProjectName}</span>
          </span>
          <button
            onClick={() => setShowAllProjects(true)}
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "var(--atlas-gold)", fontSize: 11, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em" }}
          >
            Show all
          </button>
        </div>
      )}
      {focusProjectName && showAllProjects && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          marginBottom: 10, padding: "6px 10px",
          border: "1px solid var(--atlas-border, rgba(255,255,255,0.06))", borderRadius: 8,
        }}>
          <span style={{ fontSize: 11, color: "var(--atlas-muted)", fontFamily: "var(--app-font-sans)" }}>
            Showing all Library items
          </span>
          <button
            onClick={() => setShowAllProjects(false)}
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "var(--atlas-muted)", fontSize: 11, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em" }}
          >
            Scope to {focusProjectName}
          </button>
        </div>
      )}

      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px", marginBottom: 10,
        border: "1px solid var(--atlas-border, rgba(255,255,255,0.08))",
        borderRadius: 8, background: "rgba(255,255,255,0.02)",
      }}>
        <Search size={13} color="var(--atlas-muted)" strokeWidth={1.8} style={{ opacity: 0.5 }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Library"
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)", fontSize: 13,
          }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear search"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "var(--atlas-muted)", opacity: 0.5, display: "inline-flex" }}
          >
            <X size={12} strokeWidth={1.8} />
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {visibleGroups.map((f) => {
          const activeChip = filter === f;
          const label = f === "all" ? "All" : f;
          const count = f === "all" ? items.length : groupCounts[f];
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "4px 10px", borderRadius: 999,
                border: `1px solid ${activeChip ? "color-mix(in oklab, var(--atlas-gold) 55%, transparent)" : "var(--atlas-border, rgba(255,255,255,0.08))"}`,
                background: activeChip ? "color-mix(in oklab, var(--atlas-gold) 12%, transparent)" : "transparent",
                color: activeChip ? "var(--atlas-gold)" : "var(--atlas-muted)",
                fontFamily: "var(--app-font-sans)", fontSize: 11, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              {label}
              <span style={{ opacity: 0.6, fontFamily: "var(--app-font-mono)", fontSize: 10 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "40px 0", fontFamily: "var(--app-font-mono)", fontSize: 11, color: "var(--atlas-muted)", opacity: 0.45, letterSpacing: "0.1em" }}>
          loading…
        </div>
      )}

      {!loading && loadError && (
        <div style={{ textAlign: "center", padding: "24px 12px", fontSize: 13, color: "#ef4444", fontFamily: "var(--app-font-sans)", opacity: 0.85 }}>
          {loadError}
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => load()}
              style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 6, padding: "5px 10px", color: "#ef4444", cursor: "pointer", fontSize: 11, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em" }}
            >RETRY</button>
          </div>
        </div>
      )}

      {actionError && (
        <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 6, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444", fontSize: 12, fontFamily: "var(--app-font-sans)" }}>
          {actionError}
        </div>
      )}

      {!loading && !loadError && items.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0 20px" }}>
          <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 11, color: "var(--atlas-muted)", opacity: 0.4, letterSpacing: "0.1em", marginBottom: 8 }}>
            nothing here yet
          </div>
          <div style={{ fontSize: 13, color: "var(--atlas-muted)", opacity: 0.5, fontFamily: "var(--app-font-sans)", lineHeight: 1.5 }}>
            Nothing in your Library yet.<br />
            Bookmarked responses and generated work will appear here.
          </div>
        </div>
      )}

      {!loading && !loadError && items.length > 0 && filteredItems.length === 0 && (
        <div style={{ textAlign: "center", padding: "30px 0", fontSize: 13, color: "var(--atlas-muted)", opacity: 0.5, fontFamily: "var(--app-font-sans)" }}>
          No matches.
        </div>
      )}

      {!loading && !loadError && grouped.map(({ group, items: rows }) => (
        <div key={group} style={{ marginBottom: 14 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 4px", marginBottom: 4,
            fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.14em",
            textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.55,
          }}>
            <span>{group}</span>
            <span style={{ opacity: 0.6 }}>{rows.length}</span>
          </div>
          {rows.map((item) => {
            const isAttached = attached.has(item.id);
            const meta = semanticMetaFor(item);
            const Icon = meta.icon;
            return (
              <div
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "12px 14px", borderRadius: 10,
                  border: `1px solid ${isAttached ? "color-mix(in oklab, var(--atlas-gold) 40%, transparent)" : "var(--atlas-border, rgba(255,255,255,0.07))"}`,
                  background: isAttached ? "color-mix(in oklab, var(--atlas-gold) 5%, transparent)" : "transparent",
                  marginBottom: 8, cursor: "pointer",
                  transition: "border-color 140ms, background 140ms",
                }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isAttached ? "color-mix(in oklab, var(--atlas-gold) 12%, transparent)" : "rgba(255,255,255,0.03)",
                  color: isAttached ? "var(--atlas-gold)" : "var(--atlas-muted)",
                  marginTop: 2,
                }}>
                  <Icon size={15} strokeWidth={1.6} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                    <span style={{
                      fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.12em",
                      textTransform: "uppercase", color: isAttached ? "var(--atlas-gold)" : "var(--atlas-muted)",
                      opacity: isAttached ? 0.85 : 0.65,
                    }}>
                      {meta.label}
                    </span>
                    {isAttached && (
                      <span style={{
                        fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.12em",
                        textTransform: "uppercase", color: "var(--atlas-gold)",
                        padding: "1px 5px", border: "1px solid rgba(201,162,76,0.5)", borderRadius: 3,
                      }}>In conversation</span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)", fontWeight: 500, lineHeight: 1.35, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {displayTitle(item)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--atlas-muted)", fontFamily: "var(--app-font-sans)", opacity: 0.55, lineHeight: 1.4 }}>
                    {originPhrase(item.origin, item.project?.name)}
                    {" · "}{formatDate(item.createdAt)}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); void handleDelete(item); }}
                  disabled={deletingId === item.id}
                  aria-label="Remove from Library"
                  style={{
                    background: "transparent", border: "none", padding: 4, cursor: "pointer",
                    color: "var(--atlas-muted)", opacity: deletingId === item.id ? 0.2 : 0.35,
                    flexShrink: 0, lineHeight: 1, marginTop: 2,
                  }}
                >
                  <Trash2 size={12} strokeWidth={1.6} />
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function LibraryDetail({
  item,
  mode,
  conversationId,
  attachedIds,
  attachBusyId,
  deletingId,
  actionError,
  isCompact,
  moreOpen,
  setMoreOpen,
  onBack,
  onAttach,
  onDetach,
  onDelete,
  onOpenConversation,
  onOpenProject,
  onNavigateToProject,
  currentProjectId,
  onClose,
  setActionError,
}: {
  item: LibraryItem;
  mode: LibrarySurfaceMode;
  conversationId: string | null;
  attachedIds: ReadonlySet<string>;
  attachBusyId: string | null;
  deletingId: string | null;
  actionError: string | null;
  isCompact: boolean;
  moreOpen: boolean;
  setMoreOpen: (v: boolean) => void;
  onBack: () => void;
  onAttach: (item: LibraryItem) => void;
  onDetach: (item: LibraryItem) => void;
  onDelete: (item: LibraryItem) => void;
  onOpenConversation?: LibrarySurfaceProps["onOpenConversation"];
  onOpenProject?: LibrarySurfaceProps["onOpenProject"];
  onNavigateToProject?: LibrarySurfaceProps["onNavigateToProject"];
  currentProjectId: number | null;
  onClose?: () => void;
  setActionError: (msg: string | null) => void;
}) {
  const isAttached = attachedIds.has(item.id);
  const busy = attachBusyId === item.id;
  const meta = semanticMetaFor(item);
  const sanitized = sanitizeContent(item.content ?? item.preview ?? null);
  const conversationIdResolved = resolveConversationId(item);
  const projectIdResolved = resolveProjectId(item);
  const download = resolveDownloadTarget(item);
  const htmlPrototype = isHtmlPrototype(item);
  const showAttach = mode === "attach";
  const [draftBusy, setDraftBusy] = useState(false);

  type ActionDef = {
    key: string;
    label: string;
    onClick: () => void;
    variant: "primary" | "secondary" | "danger";
    disabled?: boolean;
    title?: string;
  };

  const actions: ActionDef[] = [];

  // Primary action — one clear CTA
  if (htmlPrototype && download) {
    actions.push({
      key: "draft-preview",
      label: draftBusy ? "Opening…" : "Open in Draft Preview",
      onClick: () => {
        void (async () => {
          setDraftBusy(true);
          setActionError(null);
          try {
            const probe = await openLibraryDraftPreview(
              {
                sourceKind: "project-artifact",
                sourceId: download.artifactId,
                projectId: download.projectId,
                artifactType: item.sourceRef?.sourceKind === "project-artifact"
                  ? item.sourceRef.artifactType
                  : null,
              },
              {
                navigateToProject: onNavigateToProject,
                currentProjectId,
              },
            );
            if (!probe.usable) {
              setActionError(
                `Could not open Draft Preview (${probe.status}${probe.contentType ? ` · ${probe.contentType}` : ""}).`,
              );
              return;
            }
            onClose?.();
          } catch (err) {
            setActionError(err instanceof Error ? err.message : "Failed to open Draft Preview");
          } finally {
            setDraftBusy(false);
          }
        })();
      },
      variant: "primary",
      disabled: draftBusy,
    });
  } else if (meta.primaryAction === "open-conversation" && conversationIdResolved && onOpenConversation) {
    actions.push({
      key: "open-conversation",
      label: item.kind === "bookmark" || item.sourceRef?.sourceKind === "conversation-bookmark"
        ? "Open conversation"
        : "Open source conversation",
      onClick: () => onOpenConversation(conversationIdResolved, {
        projectId: projectIdResolved,
        originSource: item.origin.source,
      }),
      variant: "primary",
    });
  } else if (meta.primaryAction === "open-download" && download) {
    actions.push({
      key: "download-primary",
      label: "Download",
      onClick: () => {
        window.open(`/api/projects/${download.projectId}/artifacts/${download.artifactId}/download`, "_blank");
      },
      variant: "primary",
    });
  }

  if (showAttach) {
    if (isAttached) {
      actions.push({
        key: "detach",
        label: busy ? "Removing…" : "Remove from conversation",
        onClick: () => onDetach(item),
        variant: "secondary",
        disabled: busy || !conversationId,
      });
    } else {
      actions.push({
        key: "attach",
        label: busy ? "Attaching…" : "Bring into conversation",
        onClick: () => onAttach(item),
        variant: actions.some((a) => a.variant === "primary") ? "secondary" : "primary",
        disabled: busy || !conversationId,
      });
    }
  }

  if (projectIdResolved != null && onOpenProject) {
    actions.push({
      key: "open-project",
      label: "Open source project",
      onClick: () => onOpenProject(projectIdResolved),
      variant: "secondary",
    });
  }

  // Source conversation as secondary when primary was draft-preview / download
  if (
    conversationIdResolved
    && onOpenConversation
    && !actions.some((a) => a.key === "open-conversation")
  ) {
    actions.push({
      key: "open-conversation",
      label: "Open source conversation",
      onClick: () => onOpenConversation(conversationIdResolved, {
        projectId: projectIdResolved,
        originSource: item.origin.source,
      }),
      variant: "secondary",
    });
  }

  if (download && !actions.some((a) => a.key === "download-primary")) {
    actions.push({
      key: "download",
      label: "Download",
      onClick: () => {
        window.open(`/api/projects/${download.projectId}/artifacts/${download.artifactId}/download`, "_blank");
      },
      variant: "secondary",
    });
  }

  // Copy for prose / Ask Atlas documents
  if (!download || item.origin.source === "ask-atlas") {
    actions.push({
      key: "copy",
      label: "Copy",
      onClick: () => {
        navigator.clipboard.writeText(item.content ?? item.preview ?? "").catch(() => {});
      },
      variant: "secondary",
    });
  }

  actions.push({
    key: "remove",
    label: deletingId === item.id ? "Removing…" : "Remove from Library",
    onClick: () => onDelete(item),
    variant: "danger",
    disabled: deletingId === item.id,
  });

  const primary = actions.find((a) => a.variant === "primary");
  const secondary = actions.filter((a) => a !== primary);
  const visibleSecondary = isCompact ? secondary.slice(0, 1) : secondary;
  const overflowSecondary = isCompact ? secondary.slice(1) : [];

  const renderBtn = (a: ActionDef) => (
    <button
      key={a.key}
      type="button"
      onClick={a.onClick}
      disabled={a.disabled}
      title={a.title}
      style={{
        ...(a.variant === "primary" ? btnPrimary : a.variant === "danger" ? btnDanger : btnSecondary),
        opacity: a.disabled ? 0.55 : (a.variant === "danger" ? 0.7 : 1),
        cursor: a.disabled ? "not-allowed" : "pointer",
      }}
    >
      {a.label}
    </button>
  );

  return (
    <div style={{ padding: "0 20px" }}>
      <button
        onClick={onBack}
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "var(--atlas-muted)", opacity: 0.6, fontSize: 12, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}
      >
        <ChevronLeft size={12} strokeWidth={1.8} />
        BACK
      </button>

      {actionError && (
        <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 6, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444", fontSize: 12, fontFamily: "var(--app-font-sans)" }}>
          {actionError}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.14em",
          textTransform: "uppercase", color: "var(--atlas-gold)",
          padding: "3px 7px", border: "1px solid rgba(201,162,76,0.35)", borderRadius: 4,
        }}>
          <meta.icon size={11} strokeWidth={1.8} />
          {meta.label}
        </span>
        {isAttached && (
          <span style={{
            fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--atlas-gold)",
            padding: "3px 7px", border: "1px solid rgba(201,162,76,0.5)", borderRadius: 4,
          }}>In conversation</span>
        )}
      </div>

      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)", marginBottom: 6, lineHeight: 1.3, wordBreak: "break-word" }}>
        {displayTitle(item)}
      </div>

      <div style={{ fontSize: 12, color: "var(--atlas-muted)", opacity: 0.6, fontFamily: "var(--app-font-sans)", marginBottom: 16 }}>
        {originPhrase(item.origin, item.project?.name)}
        {" · "}{formatDate(item.createdAt)}
      </div>

      {sanitized?.kind === "prose" && (
        <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)", opacity: 0.88, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {sanitized.text}
        </div>
      )}
      {sanitized?.kind === "unavailable" && (
        <div style={{ fontSize: 12, color: "var(--atlas-muted)", opacity: 0.55, fontFamily: "var(--app-font-sans)", fontStyle: "italic" }}>
          Preview unavailable for this item type.
        </div>
      )}

      {showAttach && !conversationId && (
        <div style={{ marginTop: 14, fontSize: 12, color: "var(--atlas-muted)", opacity: 0.6, fontFamily: "var(--app-font-sans)" }}>
          Start a conversation first to attach items to it.
        </div>
      )}

      <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {primary && renderBtn(primary)}
        {visibleSecondary.map(renderBtn)}
        {overflowSecondary.length > 0 && (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              aria-label="More actions"
              onClick={() => setMoreOpen(!moreOpen)}
              style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <MoreHorizontal size={14} strokeWidth={1.8} />
              More
            </button>
            {moreOpen && (
              <div style={{
                position: "absolute", bottom: "110%", right: 0, zIndex: 5,
                minWidth: 200, padding: 6, borderRadius: 10,
                background: "var(--atlas-surface, #0d0d0d)",
                border: "1px solid var(--atlas-border, rgba(255,255,255,0.12))",
                boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                display: "flex", flexDirection: "column", gap: 4,
              }}>
                {overflowSecondary.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    disabled={a.disabled}
                    title={a.title}
                    onClick={() => { a.onClick(); setMoreOpen(false); }}
                    style={{
                      background: "transparent", border: "none", textAlign: "left",
                      padding: "8px 10px", borderRadius: 6, cursor: a.disabled ? "not-allowed" : "pointer",
                      color: a.variant === "danger" ? "#ef4444" : "var(--atlas-fg)",
                      fontSize: 12, fontFamily: "var(--app-font-sans)",
                      opacity: a.disabled ? 0.5 : 1,
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
