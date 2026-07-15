import { useState, useEffect, useCallback } from "react";
import {
  fetchLibraryItems,
  deleteLibraryItem,
  type LibraryItem,
} from "@/lib/library";

interface Props {
  open: boolean;
  onClose: () => void;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    document: "Doc",
    prd: "PRD",
    plan: "Plan",
    strategy: "Strategy",
    spec: "Spec",
    outline: "Outline",
    brief: "Brief",
    bookmark: "Bookmark",
    sketch: "Sketch",
    other: "Item",
  };
  return map[kind] ?? kind;
}

function originLabel(item: LibraryItem): string {
  if (item.origin.source === "workspace") return "Workspace";
  if (item.origin.source === "ask-atlas") return "Ask Atlas";
  return "";
}

export function HomeArtifactLibrarySheet({ open, onClose }: Props) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fetched = await fetchLibraryItems({ limit: 100 });
      setItems(fetched);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) { load(); setSelectedId(null); }
  }, [open, load]);

  const handleDelete = useCallback(async (item: LibraryItem) => {
    setDeletingId(item.id);
    try {
      await deleteLibraryItem(item);
      setItems(prev => prev.filter(a => a.id !== item.id));
      if (selectedId === item.id) setSelectedId(null);
    } catch {}
    setDeletingId(null);
  }, [selectedId]);

  const selected = items.find(a => a.id === selectedId) ?? null;

  if (!open) return null;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 680,
        background: "var(--atlas-bg, #0d0d0d)",
        border: "1px solid var(--atlas-border, rgba(255,255,255,0.08))",
        borderBottom: "none",
        borderRadius: "16px 16px 0 0",
        maxHeight: "82vh",
        display: "flex", flexDirection: "column",
        animation: "slideUp 220ms ease",
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px",
          borderBottom: "1px solid var(--atlas-border, rgba(255,255,255,0.07))",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {selected && (
              <button
                onClick={() => setSelectedId(null)}
                style={{ background: "transparent", border: "none", padding: "2px 4px", cursor: "pointer", color: "var(--atlas-muted)", opacity: 0.6 }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12L6 8l4-4"/></svg>
              </button>
            )}
            <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.7 }}>
              {selected ? "Saved Document" : "Library"}
            </span>
            {!selected && items.length > 0 && (
              <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, color: "var(--atlas-muted)", opacity: 0.4 }}>
                {items.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", padding: "4px", cursor: "pointer", color: "var(--atlas-muted)", opacity: 0.5, lineHeight: 1 }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 24px" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "40px 0", fontFamily: "var(--app-font-mono)", fontSize: 11, color: "var(--atlas-muted)", opacity: 0.45, letterSpacing: "0.1em" }}>
              loading…
            </div>
          )}

          {!loading && !selected && items.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0 24px" }}>
              <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 11, color: "var(--atlas-muted)", opacity: 0.4, letterSpacing: "0.1em", marginBottom: 8 }}>
                nothing saved yet
              </div>
              <div style={{ fontSize: 13, color: "var(--atlas-muted)", opacity: 0.35, fontFamily: "var(--app-font-sans)", lineHeight: 1.5 }}>
                Deliverables you generate and documents you save from Atlas appear here.
              </div>
            </div>
          )}

          {!loading && !selected && items.map(item => (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--atlas-border, rgba(255,255,255,0.07))",
                marginBottom: 8,
                cursor: "pointer",
                transition: "border-color 140ms, background 140ms",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(201,162,76,0.3)";
                (e.currentTarget as HTMLDivElement).style.background = "rgba(201,162,76,0.03)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--atlas-border, rgba(255,255,255,0.07))";
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.12em",
                    textTransform: "uppercase", color: "var(--atlas-gold)", opacity: 0.7,
                    padding: "1px 5px", border: "1px solid rgba(201,162,76,0.25)", borderRadius: 3,
                  }}>
                    {kindLabel(item.kind)}
                  </span>
                  {originLabel(item) && (
                    <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9, color: "var(--atlas-muted)", opacity: 0.35, letterSpacing: "0.08em" }}>
                      {originLabel(item)}
                    </span>
                  )}
                  <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, color: "var(--atlas-muted)", opacity: 0.4 }}>
                    {formatDate(item.createdAt)}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)", fontWeight: 500, lineHeight: 1.35, marginBottom: 5 }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 12, color: "var(--atlas-muted)", fontFamily: "var(--app-font-sans)", opacity: 0.5, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {(item.content ?? item.preview).slice(0, 120)}
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); void handleDelete(item); }}
                disabled={deletingId === item.id}
                style={{
                  background: "transparent", border: "none", padding: "4px", cursor: "pointer",
                  color: "var(--atlas-muted)", opacity: deletingId === item.id ? 0.2 : 0.35,
                  flexShrink: 0, lineHeight: 1, marginTop: 2,
                  transition: "opacity 140ms",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.7"; (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.35"; (e.currentTarget as HTMLButtonElement).style.color = "var(--atlas-muted)"; }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="2 4 14 4"/><path d="M5 4V2h6v2"/><path d="M6 7v5M10 7v5"/><rect x="3" y="4" width="10" height="10" rx="1.5"/></svg>
              </button>
            </div>
          ))}

          {!loading && selected && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{
                    fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.12em",
                    textTransform: "uppercase", color: "var(--atlas-gold)", opacity: 0.7,
                    padding: "1px 5px", border: "1px solid rgba(201,162,76,0.25)", borderRadius: 3,
                  }}>
                    {kindLabel(selected.kind)}
                  </span>
                  {originLabel(selected) && (
                    <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9, color: "var(--atlas-muted)", opacity: 0.35, letterSpacing: "0.08em" }}>
                      {originLabel(selected)}
                    </span>
                  )}
                  <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, color: "var(--atlas-muted)", opacity: 0.4 }}>
                    {formatDate(selected.createdAt)}
                  </span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 600, color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)", marginBottom: 4 }}>
                  {selected.title}
                </div>
                {selected.project && (
                  <div style={{ fontSize: 11, color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)", opacity: 0.4, marginBottom: 8 }}>
                    {selected.project.name ?? `Project #${selected.project.id}`}
                  </div>
                )}
                {selected.origin.source === "workspace" && (
                  <div style={{ fontSize: 11, color: "var(--atlas-muted)", fontFamily: "var(--app-font-sans)", opacity: 0.45, marginBottom: 12, lineHeight: 1.5 }}>
                    Generated file — download from Workspace → Outputs.
                  </div>
                )}
              </div>
              <div style={{
                fontSize: 14, lineHeight: 1.75, color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)",
                opacity: 0.88, whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {selected.content ?? selected.preview}
              </div>
              <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
                <button
                  onClick={() => { navigator.clipboard.writeText(selected.content ?? selected.preview).catch(() => {}); }}
                  style={{
                    background: "transparent", border: "1px solid var(--atlas-border, rgba(255,255,255,0.1))",
                    borderRadius: 8, padding: "7px 14px", cursor: "pointer",
                    color: "var(--atlas-muted)", fontSize: 12, fontFamily: "var(--app-font-sans)",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="1" width="10" height="13" rx="1.5"/><path d="M3 3H2a1 1 0 00-1 1v11a1 1 0 001 1h10a1 1 0 001-1v-1"/></svg>
                  Copy
                </button>
                <button
                  onClick={() => void handleDelete(selected)}
                  style={{
                    background: "transparent", border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: 8, padding: "7px 14px", cursor: "pointer",
                    color: "#ef4444", fontSize: 12, fontFamily: "var(--app-font-sans)", opacity: 0.7,
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
