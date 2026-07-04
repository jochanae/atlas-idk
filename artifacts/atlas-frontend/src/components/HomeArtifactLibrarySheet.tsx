import { useState, useEffect, useCallback } from "react";

interface HomeArtifact {
  id: number;
  type: string;
  title: string;
  content: string;
  conversation_id: string | null;
  created_at: string;
}

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

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    document: "Doc",
    prd: "PRD",
    plan: "Plan",
    strategy: "Strategy",
    spec: "Spec",
    outline: "Outline",
    brief: "Brief",
  };
  return map[type] ?? type;
}

export function HomeArtifactLibrarySheet({ open, onClose }: Props) {
  const [artifacts, setArtifacts] = useState<HomeArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/home-artifacts", { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as { artifacts: HomeArtifact[] };
        setArtifacts(data.artifacts ?? []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) { load(); setSelectedId(null); }
  }, [open, load]);

  const handleDelete = useCallback(async (id: number) => {
    setDeletingId(id);
    try {
      await fetch(`/api/home-artifacts/${id}`, { method: "DELETE", credentials: "include" });
      setArtifacts(prev => prev.filter(a => a.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch {}
    setDeletingId(null);
  }, [selectedId]);

  const selected = artifacts.find(a => a.id === selectedId) ?? null;

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
            {!selected && artifacts.length > 0 && (
              <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, color: "var(--atlas-muted)", opacity: 0.4 }}>
                {artifacts.length}
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

          {!loading && !selected && artifacts.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0 24px" }}>
              <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 11, color: "var(--atlas-muted)", opacity: 0.4, letterSpacing: "0.1em", marginBottom: 8 }}>
                nothing saved yet
              </div>
              <div style={{ fontSize: 13, color: "var(--atlas-muted)", opacity: 0.35, fontFamily: "var(--app-font-sans)", lineHeight: 1.5 }}>
                Hit the bookmark icon on any Atlas response to save it here.
              </div>
            </div>
          )}

          {!loading && !selected && artifacts.map(artifact => (
            <div
              key={artifact.id}
              onClick={() => setSelectedId(artifact.id)}
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
                    {typeLabel(artifact.type)}
                  </span>
                  <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, color: "var(--atlas-muted)", opacity: 0.4 }}>
                    {formatDate(artifact.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)", fontWeight: 500, lineHeight: 1.35, marginBottom: 5 }}>
                  {artifact.title}
                </div>
                <div style={{ fontSize: 12, color: "var(--atlas-muted)", fontFamily: "var(--app-font-sans)", opacity: 0.5, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {artifact.content.slice(0, 120)}
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); handleDelete(artifact.id); }}
                disabled={deletingId === artifact.id}
                style={{
                  background: "transparent", border: "none", padding: "4px", cursor: "pointer",
                  color: "var(--atlas-muted)", opacity: deletingId === artifact.id ? 0.2 : 0.35,
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
                    {typeLabel(selected.type)}
                  </span>
                  <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, color: "var(--atlas-muted)", opacity: 0.4 }}>
                    {formatDate(selected.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 600, color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)", marginBottom: 4 }}>
                  {selected.title}
                </div>
              </div>
              <div style={{
                fontSize: 14, lineHeight: 1.75, color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)",
                opacity: 0.88, whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {selected.content}
              </div>
              <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
                <button
                  onClick={() => { navigator.clipboard.writeText(selected.content).catch(() => {}); }}
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
                  onClick={() => handleDelete(selected.id)}
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
