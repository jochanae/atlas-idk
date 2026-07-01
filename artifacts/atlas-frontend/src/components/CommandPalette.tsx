import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { Command, Search, ArrowRight } from "lucide-react";
import {
  registerCommand,
  searchCommands,
  type Command as Cmd,
} from "@/lib/commandRegistry";

const SECTION_ORDER = ["Navigation", "Atlas", "Launcher", "Build", "System"];

function groupBySection(cmds: Cmd[]): [string, Cmd[]][] {
  const map = new Map<string, Cmd[]>();
  for (const cmd of cmds) {
    const s = cmd.section ?? "Other";
    if (!map.has(s)) map.set(s, []);
    map.get(s)!.push(cmd);
  }
  return SECTION_ORDER.filter((s) => map.has(s)).map((s) => [s, map.get(s)!]);
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [, nav] = useLocation();
  const navRef = useRef(nav);
  navRef.current = nav;

  // ── Register commands once ─────────────────────────────────────────────────
  useEffect(() => {
    const go = (path: string) => { navRef.current(path); setOpen(false); };
    const fire = (name: string) => {
      setOpen(false);
      setTimeout(() => window.dispatchEvent(new CustomEvent(name)), 0);
    };

    const commands: Cmd[] = [
      // Navigation
      { id: "go-home",        label: "Go Home",        description: "Return to the Atlas home page",    keywords: ["home","start","main"],             section: "Navigation", action: () => go("/home") },
      { id: "open-projects",  label: "Open Projects",  description: "View all your projects",            keywords: ["projects","list"],                 section: "Navigation", action: () => go("/projects") },
      { id: "open-workspace", label: "Open Workspace", description: "Go to your project workspace",      keywords: ["workspace","build","project"],     section: "Navigation", action: () => go("/workspace") },
      { id: "open-preview",   label: "Open Preview",   description: "Open the live app in a new tab",   keywords: ["preview","live","launch","view"],  section: "Navigation",
        action: () => { window.open(window.location.origin, "_blank", "noopener,noreferrer"); setOpen(false); },
      },

      // Launcher actions (wired to existing event handlers in UnifiedContextDock etc.)
      { id: "launcher-search",        label: "Search",        description: "Find anything across Axiom",      keywords: ["search","find"],              section: "Launcher", action: () => fire("axiom:open-search") },
      { id: "launcher-capture",       label: "Capture",       description: "Drop a thought into the Parking Lot", keywords: ["capture","parking","idea"], section: "Launcher", action: () => fire("axiom:launcher-capture") },
      { id: "launcher-decisions",     label: "Decisions",     description: "Open the Ledger",                 keywords: ["decisions","ledger"],         section: "Launcher", action: () => fire("axiom:launcher-decisions") },
      { id: "launcher-conversations", label: "Conversations", description: "Browse projects and threads",     keywords: ["conversations","threads"],    section: "Launcher", action: () => fire("axiom:launcher-conversations") },
      { id: "launcher-files",         label: "Files",         description: "Open the file tree",              keywords: ["files","tree"],               section: "Launcher", action: () => fire("axiom:launcher-files") },
      { id: "launcher-settings",      label: "Settings",      description: "Account and preferences",         keywords: ["settings","account","prefs"], section: "Launcher", action: () => fire("axiom:launcher-settings") },

      // Build
      {
        id: "build-typecheck",
        label: "Run Typecheck",
        description: "Type-check the frontend codebase",
        keywords: ["typecheck", "tsc", "typescript", "errors", "build", "check"],
        section: "Build",
        action: () => {
          window.dispatchEvent(new CustomEvent("axiom:build-run", { detail: { command: "typecheck" } }));
          setOpen(false);
        },
      },
      {
        id: "build-build",
        label: "Run Build",
        description: "Full production build of the frontend",
        keywords: ["build", "compile", "bundle", "vite", "production"],
        section: "Build",
        action: () => {
          window.dispatchEvent(new CustomEvent("axiom:build-run", { detail: { command: "build" } }));
          setOpen(false);
        },
      },

      // System
      {
        id: "toggle-theme",
        label: "Toggle Theme",
        description: "Switch between Obsidian (dark) and Parchment (light)",
        keywords: ["theme","dark","light","parchment","obsidian","mode"],
        section: "System",
        action: () => {
          const cur = document.documentElement.dataset.theme;
          if (cur === "parchment") {
            delete document.documentElement.dataset.theme;
            try { localStorage.setItem("atlas-theme", ""); } catch {}
          } else {
            document.documentElement.dataset.theme = "parchment";
            try { localStorage.setItem("atlas-theme", "parchment"); } catch {}
          }
          setOpen(false);
        },
      },
    ];

    commands.forEach(registerCommand);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Global shortcuts + open-launcher event ─────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onEvent = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("axiom:open-launcher", onEvent);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("axiom:open-launcher", onEvent);
    };
  }, []);

  // ── Reset + focus on open ──────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // ── Arrow / enter / escape keys ────────────────────────────────────────────
  const commands = useMemo(() => searchCommands(query), [query]);

  useEffect(() => { setActiveIndex(0); }, [query]);
  useEffect(() => { itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" }); }, [activeIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape")    { e.preventDefault(); setOpen(false); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, commands.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = commands[activeIndex];
        if (cmd) { cmd.action(); setOpen(false); }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex, commands]);

  const sections = useMemo(() => groupBySection(commands), [commands]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(4,3,6,0.68)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        zIndex: 2200,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "16vh", paddingLeft: 16, paddingRight: 16,
      }}
    >
      <div style={{
        width: "min(580px, 100%)",
        background: "color-mix(in oklab, var(--atlas-bg) 95%, white 5%)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 14,
        boxShadow: "0 32px 100px rgba(0,0,0,0.65), 0 0 0 1px rgba(212,175,55,0.07)",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>

        {/* Search row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "13px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}>
          <Command size={15} strokeWidth={1.8} style={{ color: "var(--atlas-gold)", flexShrink: 0, opacity: 0.8 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands…"
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              color: "var(--atlas-fg)", fontSize: 15, fontFamily: "inherit",
              caretColor: "var(--atlas-gold)",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Search size={12} style={{ color: "var(--atlas-muted)", opacity: 0.3 }} />
            <kbd style={{
              fontSize: 10, fontFamily: "var(--app-font-mono)",
              color: "var(--atlas-muted)", opacity: 0.45,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 5, padding: "2px 6px",
            }}>ESC</kbd>
          </div>
        </div>

        {/* Command list */}
        <div style={{ maxHeight: 380, overflowY: "auto", paddingTop: 4, paddingBottom: 6 }}>
          {commands.length === 0 ? (
            <div style={{
              padding: "24px 16px", textAlign: "center",
              color: "var(--atlas-muted)", fontSize: 13,
              fontFamily: "var(--app-font-mono)", opacity: 0.5,
            }}>
              No commands match &ldquo;{query}&rdquo;
            </div>
          ) : sections.map(([section, cmds]) => (
            <div key={section}>
              <div style={{
                padding: "8px 16px 3px",
                fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase",
                color: "var(--atlas-muted)", opacity: 0.4,
                fontFamily: "var(--app-font-mono)",
              }}>
                {section}
              </div>
              {cmds.map((cmd) => {
                const gi = commands.indexOf(cmd);
                const isActive = gi === activeIndex;
                return (
                  <div
                    key={cmd.id}
                    ref={(el) => { itemRefs.current[gi] = el; }}
                    role="option"
                    aria-selected={isActive}
                    onMouseMove={() => setActiveIndex(gi)}
                    onClick={() => { cmd.action(); setOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 16px", cursor: "pointer",
                      background: isActive ? "rgba(212,175,55,0.09)" : "transparent",
                      borderLeft: isActive ? "2px solid rgba(212,175,55,0.60)" : "2px solid transparent",
                      transition: "background 60ms ease",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14,
                        color: isActive ? "var(--atlas-gold)" : "var(--atlas-fg)",
                        fontWeight: 400, transition: "color 60ms ease",
                      }}>
                        {cmd.label}
                      </div>
                      {cmd.description && (
                        <div style={{
                          fontSize: 11, color: "var(--atlas-muted)", marginTop: 2,
                          opacity: 0.6, fontFamily: "var(--app-font-mono)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {cmd.description}
                        </div>
                      )}
                    </div>
                    {isActive && <ArrowRight size={13} style={{ color: "var(--atlas-gold)", opacity: 0.65, flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: "7px 16px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", gap: 16,
          fontFamily: "var(--app-font-mono)", fontSize: 10,
          color: "var(--atlas-muted)", opacity: 0.5, userSelect: "none",
        }}>
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>esc close</span>
          <span style={{ marginLeft: "auto" }}>
            {commands.length} command{commands.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default CommandPalette;
