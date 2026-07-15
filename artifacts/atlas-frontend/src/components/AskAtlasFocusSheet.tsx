import { useState, useEffect, useCallback } from "react";
import {
  fetchLibraryItems,
  deleteLibraryItem,
  attachLibraryItem,
  detachLibraryItem,
  LibraryApiError,
  type LibraryItem,
  type LibraryItemKind,
} from "../lib/library";

/**
 * AskAtlasFocusSheet — Focus + Reference sheet.
 *
 * Two tabs:
 *   • Projects  — the focus picker.
 *   • Reference — the user's Library items. Reads via `../lib/library`,
 *     which now points at the canonical `/api/library` endpoint.
 *
 * "Bring into conversation" is a REAL persistent attachment
 * (`POST /api/library/:id/context`). There is no quoted-context
 * fallback: if the attach call fails, the user sees an error, not a
 * silent success.
 *
 * Copy still reads "Reference" — the rename to "Library" ships in the
 * same release once end-to-end verification passes.
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
  initialTab?: "projects" | "reference";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

function kindLabel(kind: LibraryItemKind): string {
  const map: Record<LibraryItemKind, string> = {
    document: "Doc", prd: "PRD", plan: "Plan", strategy: "Strategy",
    spec: "Spec", outline: "Outline", brief: "Brief",
    bookmark: "Bookmark", sketch: "Sketch", other: "Item",
  };
  return map[kind] ?? "Item";
}

export function AskAtlasFocusSheet({
  open, onClose, focusProjectId, projects,
  onSelectAllProjects, onSelectProject,
  conversationId, attachedIds, onAttachmentsChange,
  initialTab = "projects",
}: Props) {
  const [tab, setTab] = useState<"projects" | "reference">(initialTab);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [attachBusyId, setAttachBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // If a project is focused, scope to that project's items; otherwise
      // show everything the user has access to (mirrors "All Projects").
      const opts = focusProjectId != null ? { projectId: focusProjectId } : {};
      setItems(await fetchLibraryItems(opts));
    } catch (err) {
      setItems([]);
      setLoadError(err instanceof Error ? err.message : "Failed to load Library");
    } finally {
      setLoading(false);
    }
  }, [focusProjectId]);

  useEffect(() => {
    if (open && tab === "reference") {
      setSelectedId(null);
      setActionError(null);
      load();
    }
  }, [open, tab, load]);

  const handleDelete = useCallback(async (item: LibraryItem) => {
    setDeletingId(item.id);
    setActionError(null);
    try {
      await deleteLibraryItem(item);
      setItems(prev => prev.filter(a => a.id !== item.id));
      if (selectedId === item.id) setSelectedId(null);
      // A deleted item can't stay attached; refresh parent so any stale chip clears.
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
      setActionError("Start a conversation first, then attach references to it.");
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

  if (!open) return null;

  const selected = items.find(a => a.id === selectedId) ?? null;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
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
        animation: "focusSheetSlideUp 220ms ease",
      }}>
        <style>{`@keyframes focusSheetSlideUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

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
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>
            </button>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["projects", "reference"] as const).map(t => (
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
                {t === "projects" ? "Projects" : "Reference"}
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

          {tab === "reference" && (
            <div style={{ padding: "0 20px" }}>
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

              {!loading && !loadError && !selected && items.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0 20px" }}>
                  <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 11, color: "var(--atlas-muted)", opacity: 0.4, letterSpacing: "0.1em", marginBottom: 8 }}>
                    nothing here yet
                  </div>
                  <div style={{ fontSize: 13, color: "var(--atlas-muted)", opacity: 0.35, fontFamily: "var(--app-font-sans)", lineHeight: 1.5 }}>
                    Bookmark any Atlas response to keep it here — then bring it back into a future conversation.
                  </div>
                </div>
              )}

              {!loading && !loadError && !selected && items.map(item => {
                const isAttached = attachedIds.has(item.id);
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{
                        fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.12em",
                        textTransform: "uppercase", color: "var(--atlas-gold)", opacity: 0.7,
                        padding: "1px 5px", border: "1px solid rgba(201,162,76,0.25)", borderRadius: 3,
                      }}>
                        {kindLabel(item.kind)}
                      </span>
                      <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, color: "var(--atlas-muted)", opacity: 0.4 }}>
                        {formatDate(item.createdAt)}
                      </span>
                      {item.project?.name && (
                        <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, color: "var(--atlas-muted)", opacity: 0.5 }}>
                          · {item.project.name}
                        </span>
                      )}
                      {isAttached && (
                        <span style={{
                          fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.12em",
                          textTransform: "uppercase", color: "var(--atlas-gold)",
                          padding: "1px 5px", border: "1px solid rgba(201,162,76,0.5)", borderRadius: 3,
                        }}>Attached</span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)", fontWeight: 500, lineHeight: 1.35, marginBottom: 5 }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--atlas-muted)", fontFamily: "var(--app-font-sans)", opacity: 0.5, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.preview}
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
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="2 4 14 4"/><path d="M5 4V2h6v2"/><path d="M6 7v5M10 7v5"/><rect x="3" y="4" width="10" height="10" rx="1.5"/></svg>
                  </button>
                </div>
                );
              })}

              {!loading && selected && (() => {
                const isAttached = attachedIds.has(selected.id);
                const busy = attachBusyId === selected.id;
                return (
                <div>
                  <button
                    onClick={() => setSelectedId(null)}
                    style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "var(--atlas-muted)", opacity: 0.6, fontSize: 12, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12L6 8l4-4"/></svg>
                    BACK
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{
                      fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.12em",
                      textTransform: "uppercase", color: "var(--atlas-gold)", opacity: 0.7,
                      padding: "1px 5px", border: "1px solid rgba(201,162,76,0.25)", borderRadius: 3,
                    }}>
                      {kindLabel(selected.kind)}
                    </span>
                    <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, color: "var(--atlas-muted)", opacity: 0.4 }}>
                      {formatDate(selected.createdAt)}
                    </span>
                    {selected.project?.name && (
                      <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, color: "var(--atlas-muted)", opacity: 0.5 }}>
                        · {selected.project.name}
                      </span>
                    )}
                    {isAttached && (
                      <span style={{
                        fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.12em",
                        textTransform: "uppercase", color: "var(--atlas-gold)",
                        padding: "1px 5px", border: "1px solid rgba(201,162,76,0.5)", borderRadius: 3,
                      }}>Attached</span>
                    )}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 600, color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)", marginBottom: 12 }}>
                    {selected.title}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.75, color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)", opacity: 0.88, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {selected.content ?? selected.preview}
                  </div>
                  {!conversationId && (
                    <div style={{ marginTop: 14, fontSize: 12, color: "var(--atlas-muted)", opacity: 0.6, fontFamily: "var(--app-font-sans)" }}>
                      Start a conversation first to attach references to it.
                    </div>
                  )}
                  <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
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
                      onClick={() => { navigator.clipboard.writeText(selected.content ?? selected.preview).catch(() => {}); }}
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
          )}
        </div>
      </div>
    </div>
  );
}
