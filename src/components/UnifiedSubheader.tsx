import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronUp, MoreVertical, TerminalSquare } from "lucide-react";

export type UnifiedSubheaderTab = "chat" | "changes" | "blueprints" | "artifacts" | "console";

type UnifiedSubheaderProps = {
  activeTab: UnifiedSubheaderTab;
  onTabChange: (tab: UnifiedSubheaderTab) => void;
  hasProject: boolean;
  isMobile: boolean;
};

const TABS: Array<{ id: UnifiedSubheaderTab; label: string; ariaLabel: string }> = [
  { id: "chat", label: "Chat", ariaLabel: "Open chat" },
  { id: "changes", label: "Changes", ariaLabel: "View changes" },
  { id: "blueprints", label: "Blueprints", ariaLabel: "Open blueprints" },
  { id: "artifacts", label: "Artifacts", ariaLabel: "Open artifacts" },
  { id: "console", label: "Console", ariaLabel: "Open console" },
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

export function UnifiedSubheader({
  activeTab,
  onTabChange,
  hasProject,
  isMobile,
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

  const availableTabs = hasProject ? TABS : TABS.slice(0, 1);
  const primaryTabs = isMobile && hasProject ? availableTabs.slice(0, 2) : availableTabs;
  const overflowTabs = isMobile && hasProject ? availableTabs.slice(2) : [];
  const overflowActive = overflowTabs.some((tab) => tab.id === activeTab);

  const selectTab = (tab: UnifiedSubheaderTab) => {
    onTabChange(tab);
    setMenuOpen(false);
  };

  if (!expanded) {
    return (
      <div
        className="atlas-unified-subheader atlas-unified-subheader--collapsed"
        style={{
          marginTop: 50,
          flexShrink: 0,
          position: "relative",
          zIndex: 20,
          height: 18,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title="Show navigation tabs"
          aria-label="Show navigation tabs"
          aria-expanded={false}
          style={{
            height: 16,
            minWidth: 34,
            borderRadius: 999,
            border: "1px solid rgba(var(--atlas-gold-rgb),0.22)",
            background: "rgba(var(--atlas-bg-rgb),0.28)",
            color: "var(--atlas-gold)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            opacity: 0.72,
            padding: "0 10px",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <ChevronDown size={11} strokeWidth={2} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      className="atlas-unified-subheader atlas-unified-subheader--expanded"
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
          minHeight: 44,
          padding: isMobile ? "10px 16px 8px" : "12px 22px 10px",
        }}
      >
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
          {primaryTabs.map((tab) => {
            const active = activeTab === tab.id || (!hasProject && tab.id === "chat");
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
                {tab.id === "console" && <TerminalSquare size={12} strokeWidth={1.7} aria-hidden />}
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

        <div
          style={{ display: "flex", alignItems: "center", gap: isMobile ? 3 : 7, flexShrink: 0 }}
        >
          {overflowTabs.length > 0 && (
            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                title="More tabs"
                aria-label="More tabs"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                style={{
                  background: overflowActive || menuOpen ? "rgba(201,162,76,0.10)" : "transparent",
                  border:
                    overflowActive || menuOpen
                      ? "1px solid rgba(201,162,76,0.32)"
                      : "1px solid transparent",
                  borderRadius: 6,
                  padding: "4px 4px",
                  cursor: "pointer",
                  color: overflowActive || menuOpen ? "var(--atlas-gold)" : "var(--atlas-muted)",
                  opacity: overflowActive || menuOpen ? 1 : 0.7,
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
                  {overflowTabs.map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="menuitem"
                        onClick={() => selectTab(tab.id)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "9px 12px",
                          background: active ? "rgba(201,162,76,0.08)" : "transparent",
                          border: "none",
                          color: active ? "var(--atlas-gold)" : "var(--atlas-fg)",
                          cursor: "pointer",
                          fontFamily: "var(--app-font-mono)",
                          fontSize: "var(--ts-caption)",
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          textAlign: "left",
                        }}
                      >
                        {tab.id === "console" && (
                          <TerminalSquare size={12} strokeWidth={1.7} aria-hidden />
                        )}
                        {tab.label}
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
              setExpanded(false);
              setMenuOpen(false);
            }}
            title="Hide navigation tabs"
            aria-label="Hide navigation tabs"
            aria-expanded={true}
            style={{
              width: 24,
              height: 24,
              padding: 0,
              borderRadius: 999,
              background: "transparent",
              border: "1px solid transparent",
              color: "rgba(201,162,76,0.65)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChevronUp size={13} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
