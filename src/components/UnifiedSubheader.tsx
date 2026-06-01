import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MoreVertical } from "lucide-react";

export type UnifiedSubheaderTab = "chat" | "changes" | "blueprints" | "artifacts" | "console";
export type UnifiedSubheaderMenuAction = "files" | "memory" | "connections" | "forge" | "rescan-repo";

type UnifiedSubheaderProps = {
  activeTab: UnifiedSubheaderTab;
  onTabChange: (tab: UnifiedSubheaderTab) => void;
  hasProject: boolean;
  isMobile: boolean;
  showWorkspaceMenu?: boolean;
  onMenuAction?: (action: UnifiedSubheaderMenuAction) => void;
  hasConversation?: boolean;
};

const TABS: Array<{ id: UnifiedSubheaderTab; label: string; ariaLabel: string }> = [
  { id: "changes", label: "CHANGES", ariaLabel: "View changes" },
  { id: "blueprints", label: "BLUEPRINTS", ariaLabel: "Open blueprints" },
  { id: "artifacts", label: "ARTIFACTS", ariaLabel: "Open artifacts" },
  { id: "console", label: "CONSOLE", ariaLabel: "Open console" },
];

const MENU_ITEMS: Array<{ id: UnifiedSubheaderMenuAction; label: string }> = [
  { id: "files", label: "FILES" },
  { id: "memory", label: "MEMORY" },
  { id: "connections", label: "CONNECTIONS" },
  { id: "forge", label: "FORGE" },
  { id: "rescan-repo", label: "RESCAN REPO" },
];

function tabButtonStyle(active: boolean, isMobile: boolean): CSSProperties {
  return {
    position: "relative",
    padding: "6px 2px 10px",
    background: "transparent",
    border: "none",
    color: active ? "var(--atlas-fg)" : "var(--atlas-muted)",
    fontSize: isMobile ? 10 : 11,
    fontFamily: "var(--app-font-sans)",
    fontWeight: active ? 700 : 500,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    cursor: "pointer",
    transition: "color 200ms ease, opacity 200ms ease",
    display: "flex",
    alignItems: "center",
    gap: 6,
    opacity: active ? 1 : 0.5,
    whiteSpace: "nowrap",
  };
}

const chevronButtonStyle: CSSProperties = {
  width: 28,
  height: 28,
  padding: 0,
  borderRadius: 999,
  background: "transparent",
  border: "1px solid transparent",
  color: "rgba(201,162,76,0.72)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 16,
  lineHeight: 1,
};

export function UnifiedSubheader({
  activeTab,
  onTabChange,
  hasProject,
  isMobile,
  showWorkspaceMenu = false,
  onMenuAction,
  hasConversation = true,
}: UnifiedSubheaderProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const selectTab = (tab: UnifiedSubheaderTab) => {
    onTabChange(tab);
    setMenuOpen(false);
  };

  return (
    <div
      className={`atlas-unified-subheader atlas-unified-subheader--${expanded ? "expanded" : "collapsed"}`}
      style={{
        marginTop: 50,
        flexShrink: 0,
        position: "relative",
        zIndex: 20,
        width: "100%",
        background: "transparent",
      }}
    >
      <div
        className="atlas-app-header-row"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minHeight: expanded ? 44 : 28,
          padding: isMobile ? "8px 16px 6px" : "10px 22px 8px",
        }}
      >
        {expanded && hasProject ? (
          <nav
            aria-label="Workspace sections"
            className="scrollbar-none"
            style={{
              display: "flex",
              alignItems: "center",
              gap: isMobile ? 14 : 22,
              minWidth: 0,
              overflowX: "auto",
              overflowY: "hidden",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              flex: 1,
            }}
          >
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  aria-label={tab.ariaLabel}
                  style={tabButtonStyle(active, isMobile)}
                  onMouseEnter={(event) => {
                    if (!active) event.currentTarget.style.opacity = "0.82";
                  }}
                  onMouseLeave={(event) => {
                    if (!active) event.currentTarget.style.opacity = "0.5";
                  }}
                >
                  {tab.label}
                  {active && (
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        bottom: 2,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 3,
                        height: 3,
                        borderRadius: "50%",
                        background: "var(--atlas-gold)",
                        boxShadow: "0 0 6px rgba(201,162,76,0.6)",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        <div
          style={{ display: "flex", alignItems: "center", gap: isMobile ? 3 : 7, flexShrink: 0 }}
        >
          {expanded && showWorkspaceMenu && (
            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                title="Workspace menu"
                aria-label="Workspace menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                style={{
                  background: menuOpen ? "rgba(201,162,76,0.10)" : "transparent",
                  border: menuOpen ? "1px solid rgba(201,162,76,0.32)" : "1px solid transparent",
                  borderRadius: 6,
                  padding: "4px 4px",
                  cursor: "pointer",
                  color: menuOpen ? "var(--atlas-gold)" : "var(--atlas-muted)",
                  opacity: menuOpen ? 1 : 0.7,
                  lineHeight: 0,
                  display: "inline-flex",
                  flexShrink: 0,
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <MoreVertical size={16} strokeWidth={1.85} aria-hidden />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    zIndex: 60,
                    minWidth: 176,
                    padding: "6px 0",
                    borderRadius: 10,
                    background: "var(--atlas-surface)",
                    border: "1px solid var(--atlas-border)",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
                  }}
                >
                  {MENU_ITEMS.map((item) => {
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onMenuAction?.(item.id);
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "9px 12px",
                          background: "transparent",
                          border: "none",
                          color: "var(--atlas-fg)",
                          cursor: "pointer",
                          fontFamily: "var(--app-font-mono)",
                          fontSize: "var(--ts-caption)",
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          textAlign: "left",
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setExpanded((open) => !open);
              setMenuOpen(false);
            }}
            title={expanded ? "Collapse subheader" : "Expand subheader"}
            aria-label={expanded ? "Collapse subheader" : "Expand subheader"}
            aria-expanded={expanded}
            style={chevronButtonStyle}
          >
            {expanded ? "▴" : "▾"}
          </button>
        </div>
      </div>
    </div>
  );
}
