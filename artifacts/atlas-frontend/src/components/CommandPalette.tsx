// Desktop Command Palette — same six launcher destinations as the mobile
// radial dock, presented as a search-first list. Opens on the global event
// `axiom:open-launcher` (dispatched by the AXIOM logo in the shell header)
// or via Cmd/Ctrl+K. Actions are dispatched as global events that
// UnifiedContextDock fulfils, so the destinations stay in lockstep with
// the mobile launcher.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Item = {
  id: string;
  label: string;
  hint: string;
  color: string;
  icon: ReactNode;
  run: () => void;
};

const ICON_STROKE = {
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function buildItems(): Item[] {
  const fire = (name: string) =>
    window.dispatchEvent(new CustomEvent(name));
  return [
    {
      id: "search",
      label: "Search",
      hint: "Find anything across Axiom",
      color: "#10B981",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" {...ICON_STROKE}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
      run: () => fire("axiom:open-search"),
    },
    {
      id: "capture",
      label: "Capture",
      hint: "Drop a thought into the Parking Lot",
      color: "#EC4899",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" {...ICON_STROKE}><path d="M12 5v14M5 12h14"/></svg>,
      run: () => fire("axiom:launcher-capture"),
    },
    {
      id: "decisions",
      label: "Decisions",
      hint: "Open the Ledger",
      color: "#D4AF37",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" {...ICON_STROKE}><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>,
      run: () => fire("axiom:launcher-decisions"),
    },
    {
      id: "conversations",
      label: "Conversations",
      hint: "Browse projects & threads",
      color: "#06B6D4",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" {...ICON_STROKE}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
      run: () => fire("axiom:launcher-conversations"),
    },
    {
      id: "files",
      label: "Files",
      hint: "Open the file tree",
      color: "#3B82F6",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" {...ICON_STROKE}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
      run: () => fire("axiom:launcher-files"),
    },
    {
      id: "settings",
      label: "Settings",
      hint: "Account & preferences",
      color: "#9CA3AF",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" {...ICON_STROKE}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
      run: () => fire("axiom:launcher-settings"),
    },
  ];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const items = useMemo(buildItems, []);

  // Open via header logo, Cmd/Ctrl+K, or programmatic event
  useEffect(() => {
    const openIt = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("axiom:open-launcher", openIt);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("axiom:open-launcher", openIt);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Reset state each time it opens; focus input
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) => it.label.toLowerCase().includes(q) || it.hint.toLowerCase().includes(q),
    );
  }, [items, query]);

  useEffect(() => {
    if (active >= filtered.length) setActive(0);
  }, [filtered.length, active]);

  if (!open || typeof document === "undefined") return null;

  const run = (item: Item) => {
    setOpen(false);
    // Defer so the palette unmounts cleanly before drawers/overlays open
    setTimeout(() => item.run(), 0);
  };

  return createPortal(
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2200,
        background: "rgba(4,3,6,0.72)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "14vh",
      }}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        style={{
          width: "min(640px, 92vw)",
          background: "rgba(18,16,22,0.96)",
          border: "1px solid rgba(var(--atlas-gold-rgb),0.28)",
          borderRadius: 14,
          boxShadow: "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
          overflow: "hidden",
          fontFamily: "var(--app-font-sans)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" {...ICON_STROKE} style={{ color: "rgba(var(--atlas-gold-rgb),0.7)" }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === "Enter") {
                e.preventDefault();
                const it = filtered[active];
                if (it) run(it);
              }
            }}
            placeholder="Search or jump to…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--atlas-fg)",
              fontFamily: "var(--app-font-mono)",
              fontSize: 15,
              letterSpacing: "0.01em",
            }}
          />
          <kbd style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.45)" }}>esc</kbd>
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 6, maxHeight: "48vh", overflowY: "auto" }}>
          {filtered.length === 0 && (
            <li style={{ padding: "18px 12px", textAlign: "center", color: "rgba(255,255,255,0.45)", fontSize: 13 }}>
              No matches
            </li>
          )}
          {filtered.map((it, idx) => {
            const isActive = idx === active;
            return (
              <li
                key={it.id}
                onMouseEnter={() => setActive(idx)}
                onClick={() => run(it)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: isActive ? "rgba(var(--atlas-gold-rgb),0.10)" : "transparent",
                  border: isActive ? "1px solid rgba(var(--atlas-gold-rgb),0.25)" : "1px solid transparent",
                  transition: "background 120ms ease",
                }}
              >
                <span style={{
                  width: 32, height: 32, borderRadius: 8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: `${it.color}1A`, color: it.color, flexShrink: 0,
                }}>
                  {it.icon}
                </span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                  <span style={{ color: "var(--atlas-fg)", fontSize: 14, fontWeight: 500 }}>{it.label}</span>
                  <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>{it.hint}</span>
                </span>
                {isActive && (
                  <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, color: "rgba(var(--atlas-gold-rgb),0.7)" }}>↵</span>
                )}
              </li>
            );
          })}
        </ul>
        <div style={{
          display: "flex", justifyContent: "space-between",
          padding: "8px 14px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          fontFamily: "var(--app-font-mono)", fontSize: 10,
          color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          <span>↑↓ navigate · ↵ open</span>
          <span>⌘K toggle</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default CommandPalette;
