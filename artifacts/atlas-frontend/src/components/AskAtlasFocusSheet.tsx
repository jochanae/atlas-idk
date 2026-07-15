import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, X, ChevronLeft, Trash2 } from "lucide-react";
import {
  fetchLibraryItems,
  deleteLibraryItem,
  attachLibraryItem,
  detachLibraryItem,
  LibraryApiError,
  type LibraryItem,
} from "../lib/library";
import {
  metaFor,
  originPhrase,
  sanitizeContent,
  displayTitle,
  GROUP_ORDER,
  type LibraryGroup,
} from "./library/kindMeta";

/**
 * AskAtlasFocusSheet — Focus + Library sheet.
 *
 * The Library tab is an ATTACH CHOOSER, not a management surface. It answers
 * one question: "Find something and bring it into this conversation."
 * Structure stays stable as content grows (search + filter chips + grouped
 * list — never toggles between flat/grouped or list/grid).
 */

interface ProjectOption {
  id: number;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  focusProjectId: number | null;
  projects: ProjectOption[];
  onSelectAllProjects: () => void;
  onSelectProject: (id: number) => void;
  /** Active Ask Atlas conversation id — required for attachment actions. */
  conversationId: string | null;
  /** Ids of library items currently attached to the active conversation. */
  attachedIds: ReadonlySet<string>;
  /** Called after a successful attach/detach so the parent can re-fetch. */
  onAttachmentsChange: () => void;
  initialTab?: "projects" | "library";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch { return ""; }
}

type FilterId = "all" | LibraryGroup;

export function AskAtlasFocusSheet({
  open, onClose, focusProjectId, projects,
  onSelectAllProjects, onSelectProject,
  conversationId, attachedIds, onAttachmentsChange,
  initialTab = "projects",
}: Props) {
  const [tab, setTab] = useState<"projects" | "library">(initialTab);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [attachBusyId, setAttachBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  /** Local override: when a project is focused, user can escape scope to see everything. */
  const [showAllProjects, setShowAllProjects] = useState(false);
  /** Mount-flicker fix: enter state gates the sheet slide until backdrop is opaque. */
  const [entered, setEntered] = useState(false);

  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
  useEffect(() => {
    if (!open) { setEntered(false); return; }
    // Next frame: backdrop is painted, now slide the sheet.
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, [open]);

  const focusedProjectName = useMemo(
    () => (focusProjectId != null ? projects.find(p => p.id === focusProjectId)?.name ?? null : null),
    [focusProjectId, projects],
  );

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
    if (open && tab === "library") {
      setSelectedId(null);
      setActionError(null);
      load();
    }
  }, [open, tab, load]);

  // Reset scope-override when the focus project actually changes.
  useEffect(() => { setShowAllProjects(false); }, [focusProjectId]);

  const handleDelete = useCallback(async (item: LibraryItem) => {
    setDeletingId(item.id);
    setActionError(null);
    try {
      await deleteLibraryItem(item);
      setItems(prev => prev.filter(a => a.id !== item.id));
      if (selectedId === item.id) setSelectedId(null);
      onAttachmentsChange();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete");
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
      onAttachmentsChange();
      onClose();
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
      onAttachmentsChange();
    } catch (err) {
      const status = err instanceof LibraryApiError ? ` (${err.status})` : "";
      setActionError((err instanceof Error ? err.message : "Detach failed") + status);
    } finally {
      setAttachBusyId(null);
    }
  }, [conversationId, onAttachmentsChange]);

  // Derived: filter → search → group
  const groupCounts = useMemo(() => {
    const c: Record<LibraryGroup, number> = { Bookmarks: 0, Documents: 0, Sketches: 0, Other: 0 };
    for (const it of items) c[metaFor(it.kind).group]++;
    return c;
  }, [items]);

  const visibleGroups: FilterId[] = useMemo(() => {
    const out: FilterId[] = ["all"];
    for (const g of GROUP_ORDER) if (groupCounts[g] > 0) out.push(g);
    return out;
  }, [groupCounts]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(it => {
      if (filter !== "all" && metaFor(it.kind).group !== filter) return false;
      if (!q) return true;
      return (
        it.title.toLowerCase().includes(q) ||
        (it.preview ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, filter, query]);

  const grouped = useMemo(() => {
    const map = new Map<LibraryGroup, LibraryItem[]>();
    for (const it of filteredItems) {
      const g = metaFor(it.kind).group;
      const arr = map.get(g) ?? [];
      arr.push(it);
      map.set(g, arr);
    }
    return GROUP_ORDER
      .filter(g => (map.get(g)?.length ?? 0) > 0)
      .map(g => ({ group: g, items: map.get(g)! }));
  }, [filteredItems]);

  if (!open) return null;

  const selected = items.find(a => a.id === selectedId) ?? null;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: "rgba(0,0,0,0.55)",
        // Blur is deferred until after the sheet has settled — mobile Chrome
        // repaints backdrop-filter mid-animation which causes the flicker.
        backdropFilter: entered ? "blur(4px)" : "none",
        WebkitBackdropFilter: entered ? "blur(4px)" : "none",
        opacity: entered ? 1 : 0,
        transition: "opacity 140ms ease, backdrop-filter 180ms ease",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 680,
        background: "var(--atlas-surface, #0d0d0d)",
        border: "1px solid var(--atlas-border, rgba(255,255,255,0.08))",
        borderBottom: "none",
        borderRadius: "16px 16px 0 0",
        maxHeight: "82vh",
        display: "flex", flexDirection: "column",
        transform: entered ? "translateY(0)" : "translateY(24px)",
        opacity: entered ? 1 : 0,
        transition: "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1) 60ms, opacity 200ms ease 60ms",
        willChange: "transform, opacity",
      }}>
        {/* Header + tabs */}
        <div style={{
          padding: "16px 20px 0",
          borderBottom: "1px solid var(--atlas-border, rgba(255,255,255,0.07))",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{
              fontFamily: "var(--app-font-mono)", fontSize: 11, letterSpacing: "0.12em",
              textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.7,
            }}>
              Atlas focus
            </span>
            <button
              onClick={onClose}
              style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer", color: "var(--atlas-muted)", opacity: 0.5, lineHeight: 1 }}
              aria-label="Close"
            >
              <X size={14} strokeWidth={1.8} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["projects", "library"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "8px 14px", background: "transparent", border: "none",
                  borderBottom: tab === t ? "2px solid var(--atlas-gold, #c9a24c)" : "2px solid transparent",
                  color: tab === t ? "var(--atlas-fg)" : "var(--atlas-muted)",
                  fontFamily: "var(--app-font-sans)", fontSize: 13, fontWeight: tab === t ? 600 : 400,
                  cursor: "pointer", marginBottom: -1,
                }}
              >
                {t === "projects" ? "Projects" : "Library"}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 0 24px" }}>
          {tab === "projects" && (
            <>
              <button
                type="button"
                onClick={onSelectAllProjects}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", background: focusProjectId == null ? "color-mix(in oklab, var(--atlas-gold) 9%, transparent)" : "transparent", border: "none", cursor: "pointer", color: "var(--atlas-fg)", textAlign: "left", fontFamily: "var(--app-font-sans)", fontSize: 14 }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: focusProjectId == null ? "var(--atlas-gold)" : "rgba(201,162,76,0.45)", flexShrink: 0 }} />
                All Projects
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--atlas-muted)", opacity: 0.5 }}>General</span>
              </button>
              {projects.length === 0 && (
                <div style={{ padding: "16px 20px", fontSize: 12, color: "var(--atlas-muted)", opacity: 0.5, fontFamily: "var(--app-font-sans)" }}>
                  No projects yet.
                </div>
              )}
              {projects.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectProject(p.id)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", background: focusProjectId === p.id ? "color-mix(in oklab, var(--atlas-gold) 9%, transparent)" : "transparent", border: "none", cursor: "pointer", color: "var(--atlas-fg)", textAlign: "left", fontFamily: "var(--app-font-sans)", fontSize: 14 }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: focusProjectId === p.id ? "var(--atlas-gold)" : "rgba(201,162,76,0.45)", flexShrink: 0 }} />
                  {p.name}
                </button>
              ))}
            </>
          )}

          {tab === "library" && !selected && (
            <div style={{ padding: "0 20px" }}>
              {/* Summary + search + filters — stable structure */}
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

              {/* Scope banner */}
              {focusedProjectName && !showAllProjects && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  marginBottom: 10, padding: "6px 10px",
                  border: "1px solid rgba(201,162,76,0.18)", borderRadius: 8,
                  background: "color-mix(in oklab, var(--atlas-gold) 4%, transparent)",
                }}>
                  <span style={{ fontSize: 11, color: "var(--atlas-muted)", fontFamily: "var(--app-font-sans)" }}>
                    Showing items in <span style={{ color: "var(--atlas-fg)", fontWeight: 500 }}>{focusedProjectName}</span>
                  </span>
                  <button
                    onClick={() => setShowAllProjects(true)}
                    style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "var(--atlas-gold)", fontSize: 11, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em" }}
                  >
                    Show all
                  </button>
                </div>
              )}
              {focusedProjectName && showAllProjects && (
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
                    Scope to {focusedProjectName}
                  </button>
                </div>
              )}

              {/* Search */}
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
                  onChange={e => setQuery(e.target.value)}
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

              {/* Filter chips */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {visibleGroups.map(f => {
                  const active = filter === f;
                  const label = f === "all" ? "All" : f;
                  const count = f === "all" ? items.length : groupCounts[f];
                  return (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      style={{
                        padding: "4px 10px", borderRadius: 999,
                        border: `1px solid ${active ? "color-mix(in oklab, var(--atlas-gold) 55%, transparent)" : "var(--atlas-border, rgba(255,255,255,0.08))"}`,
                        background: active ? "color-mix(in oklab, var(--atlas-gold) 12%, transparent)" : "transparent",
                        color: active ? "var(--atlas-gold)" : "var(--atlas-muted)",
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
                    Nothing in your Library yet.<br/>
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
                  {rows.map(item => {
                    const isAttached = attachedIds.has(item.id);
                    const meta = metaFor(item.kind);
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
                              {meta.typeLabel}
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
                          onClick={e => { e.stopPropagation(); handleDelete(item); }}
                          disabled={deletingId === item.id}
                          aria-label="Delete"
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
          )}

          {tab === "library" && selected && (() => {
            const isAttached = attachedIds.has(selected.id);
            const busy = attachBusyId === selected.id;
            const meta = metaFor(selected.kind);
            const sanitized = sanitizeContent(selected.content ?? selected.preview ?? null);
            return (
              <div style={{ padding: "0 20px" }}>
                <button
                  onClick={() => setSelectedId(null)}
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

                {/* Type chip */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.14em",
                    textTransform: "uppercase", color: "var(--atlas-gold)",
                    padding: "3px 7px", border: "1px solid rgba(201,162,76,0.35)", borderRadius: 4,
                  }}>
                    <meta.icon size={11} strokeWidth={1.8} />
                    {meta.typeLabel}
                  </span>
                  {isAttached && (
                    <span style={{
                      fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.12em",
                      textTransform: "uppercase", color: "var(--atlas-gold)",
                      padding: "3px 7px", border: "1px solid rgba(201,162,76,0.5)", borderRadius: 4,
                    }}>In conversation</span>
                  )}
                </div>

                {/* Title */}
                <div style={{ fontSize: 18, fontWeight: 600, color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)", marginBottom: 6, lineHeight: 1.3, wordBreak: "break-word" }}>
                  {displayTitle(selected)}
                </div>

                {/* Origin line */}
                <div style={{ fontSize: 12, color: "var(--atlas-muted)", opacity: 0.6, fontFamily: "var(--app-font-sans)", marginBottom: 16 }}>
                  {originPhrase(selected.origin, selected.project?.name)}
                  {" · "}{formatDate(selected.createdAt)}
                </div>

                {/* Sanitized body */}
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

                {!conversationId && (
                  <div style={{ marginTop: 14, fontSize: 12, color: "var(--atlas-muted)", opacity: 0.6, fontFamily: "var(--app-font-sans)" }}>
                    Start a conversation first to attach items to it.
                  </div>
                )}

                <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {isAttached ? (
                    <button
                      onClick={() => handleDetach(selected)}
                      disabled={busy || !conversationId}
                      style={{ background: "transparent", border: "1px solid color-mix(in oklab, var(--atlas-gold) 50%, transparent)", borderRadius: 8, padding: "7px 14px", cursor: busy ? "wait" : "pointer", color: "var(--atlas-gold)", fontSize: 12, fontFamily: "var(--app-font-sans)", fontWeight: 600, opacity: busy ? 0.6 : 1 }}
                    >
                      {busy ? "Removing…" : "Remove from conversation"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAttach(selected)}
                      disabled={busy || !conversationId}
                      style={{ background: "var(--atlas-gold, #c9a24c)", border: "1px solid var(--atlas-gold, #c9a24c)", borderRadius: 8, padding: "7px 14px", cursor: busy || !conversationId ? "not-allowed" : "pointer", color: "#000", fontSize: 12, fontFamily: "var(--app-font-sans)", fontWeight: 600, opacity: busy || !conversationId ? 0.55 : 1 }}
                    >
                      {busy ? "Attaching…" : "Bring into conversation"}
                    </button>
                  )}
                  <button
                    onClick={() => { navigator.clipboard.writeText(selected.content ?? selected.preview ?? "").catch(() => {}); }}
                    style={{ background: "transparent", border: "1px solid var(--atlas-border, rgba(255,255,255,0.1))", borderRadius: 8, padding: "7px 14px", cursor: "pointer", color: "var(--atlas-muted)", fontSize: 12, fontFamily: "var(--app-font-sans)" }}
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => handleDelete(selected)}
                    style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "7px 14px", cursor: "pointer", color: "#ef4444", fontSize: 12, fontFamily: "var(--app-font-sans)", opacity: 0.7 }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
