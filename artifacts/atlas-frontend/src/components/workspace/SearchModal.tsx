import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";

type SearchSource = "entry" | "session" | "nexus" | "thought";

interface SearchResult {
  source: SearchSource;
  id: number;
  title: string;
  snippet: string;
  projectId: number | null;
  sessionId: number | null;
  createdAt: string;
}

const SOURCE_LABEL: Record<SearchSource, string> = {
  entry: "Decision",
  session: "Session",
  nexus: "Conversation",
  thought: "Parking Lot",
};

const SOURCE_COLOR: Record<SearchSource, string> = {
  entry: "var(--atlas-phosphor)",
  session: "rgba(99,165,255,0.85)",
  nexus: "rgba(var(--atlas-gold-rgb),0.8)",
  thought: "rgba(192,132,252,0.85)",
};

function highlight(text: string, q: string): string {
  if (!q.trim()) return text;
  try {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`(${escaped})`, "gi"), "◆$1◆");
  } catch {
    return text;
  }
}

function HighlightedText({ text, q, style }: { text: string; q: string; style?: React.CSSProperties }) {
  const parts = highlight(text, q).split("◆");
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}$`, "i");
  return (
    <span style={style}>
      {parts.map((part, i) =>
        re.test(part) ? (
          <mark key={i} style={{ background: "rgba(201,162,76,0.28)", color: "var(--atlas-gold)", borderRadius: 2, padding: "0 1px" }}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

export function SearchModal({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: number;
}) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ q });
      if (projectId) params.set("projectId", String(projectId));
      const res = await fetch(`/api/search?${params}`);
      if (res.ok) setResults(await res.json());
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 240);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [results]);

  const navigate = useCallback((result: SearchResult) => {
    onClose();
    if (result.source === "entry") {
      setLocation(`/entry/${result.id}`);
    } else if (result.source === "session") {
      if (result.projectId) setLocation(`/project/${result.projectId}`);
    } else if (result.source === "nexus") {
      if (result.projectId) setLocation(`/project/${result.projectId}`);
    } else if (result.source === "thought") {
      // Parking lot — just close, no direct navigation
    }
  }, [onClose, setLocation]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, results.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter" && results[selectedIdx]) { navigate(results[selectedIdx]); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, results, selectedIdx, navigate, onClose]);

  if (!open) return null;

  const grouped: Partial<Record<SearchSource, SearchResult[]>> = {};
  for (const r of results) {
    if (!grouped[r.source]) grouped[r.source] = [];
    grouped[r.source]!.push(r);
  }

  const sourceOrder: SearchSource[] = ["entry", "session", "nexus", "thought"];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 9000,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(6px)",
        }}
      />

      {/* Panel */}
      <div style={{
        position: "fixed", left: "50%", top: "15%", transform: "translateX(-50%)",
        zIndex: 9001,
        width: "min(560px, calc(100vw - 32px))",
        background: "var(--atlas-bg)",
        border: "1px solid rgba(var(--atlas-gold-rgb),0.25)",
        borderRadius: 14,
        boxShadow: "0 24px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(var(--atlas-gold-rgb),0.08)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        maxHeight: "min(70vh, calc(100vh - 15% - 24px - env(safe-area-inset-bottom, 0px)))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {/* Search input row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 16px",
          borderBottom: results.length > 0 || loading ? "1px solid var(--atlas-border)" : "none",
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ color: "rgba(var(--atlas-muted-rgb),0.5)", flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search decisions, sessions, conversations…"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              fontFamily: "var(--app-font-sans)", fontSize: 15,
              color: "var(--atlas-fg)",
            }}
          />
          {loading && (
            <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "rgba(var(--atlas-muted-rgb),0.4)", textTransform: "uppercase" }}>
              searching…
            </span>
          )}
          <kbd style={{
            fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.06em",
            border: "1px solid var(--atlas-border)", borderRadius: 4,
            padding: "2px 6px", color: "rgba(var(--atlas-muted-rgb),0.5)",
            background: "rgba(255,255,255,0.03)",
          }}>
            esc
          </kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div style={{ overflowY: "auto", flex: 1 }} className="scrollbar-none">
            {sourceOrder.map((source) => {
              const items = grouped[source];
              if (!items?.length) return null;
              return (
                <div key={source}>
                  <div style={{
                    padding: "8px 16px 4px",
                    fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.14em",
                    textTransform: "uppercase", color: "rgba(var(--atlas-muted-rgb),0.45)",
                  }}>
                    {SOURCE_LABEL[source]}
                  </div>
                  {items.map((item) => {
                    const globalIdx = results.indexOf(item);
                    const isSelected = globalIdx === selectedIdx;
                    return (
                      <button
                        key={item.id}
                        onClick={() => navigate(item)}
                        onMouseEnter={() => setSelectedIdx(globalIdx)}
                        style={{
                          width: "100%", textAlign: "left", background: isSelected ? "rgba(var(--atlas-gold-rgb),0.07)" : "transparent",
                          border: "none", cursor: "pointer",
                          padding: "9px 16px",
                          display: "flex", flexDirection: "column", gap: 3,
                          borderLeft: `2px solid ${isSelected ? SOURCE_COLOR[source] : "transparent"}`,
                          transition: "background 80ms, border-color 80ms",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                            background: SOURCE_COLOR[source],
                            boxShadow: isSelected ? `0 0 6px ${SOURCE_COLOR[source]}` : "none",
                          }} />
                          <HighlightedText
                            text={item.title.length > 72 ? item.title.slice(0, 72) + "…" : item.title}
                            q={query}
                            style={{ fontFamily: "var(--app-font-sans)", fontSize: 13, fontWeight: 500, color: "var(--atlas-fg)", lineHeight: 1.35 }}
                          />
                        </div>
                        {item.snippet && item.snippet !== item.title && (
                          <HighlightedText
                            text={item.snippet.length > 120 ? item.snippet.slice(0, 120) + "…" : item.snippet}
                            q={query}
                            style={{ fontFamily: "var(--app-font-sans)", fontSize: 11.5, color: "var(--atlas-muted)", lineHeight: 1.5, paddingLeft: 14 }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!loading && query.length >= 2 && results.length === 0 && (
          <div style={{ padding: "32px 16px", textAlign: "center" }}>
            <p style={{ fontFamily: "var(--app-font-sans)", fontSize: 13, color: "var(--atlas-muted)", opacity: 0.5 }}>
              No results for <strong>"{query}"</strong>
            </p>
          </div>
        )}

        {/* Footer hint */}
        <div style={{
          padding: "8px 16px",
          borderTop: results.length > 0 ? "1px solid var(--atlas-border)" : "none",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          {results.length > 0 && (
            <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "rgba(var(--atlas-muted-rgb),0.35)", textTransform: "uppercase" }}>
              {results.length} result{results.length !== 1 ? "s" : ""} · ↑↓ navigate · ↵ open
            </span>
          )}
          {!query && (
            <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "rgba(var(--atlas-muted-rgb),0.3)", textTransform: "uppercase" }}>
              Search across decisions, sessions, and conversations
            </span>
          )}
        </div>
      </div>
    </>
  );
}
