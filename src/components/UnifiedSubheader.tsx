import { useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { Play } from "lucide-react";

export type UnifiedSubheaderTab = "chat" | "changes" | "blueprints" | "artifacts" | "console";
export type UnifiedSubheaderMenuAction = "files" | "memory" | "connections" | "forge" | "rescan-repo";

type UnifiedSubheaderProps = {
  activeTab: UnifiedSubheaderTab;
  onTabChange: (tab: UnifiedSubheaderTab) => void;
  hasProject: boolean;
  isMobile: boolean;
  showWorkspaceMenu?: boolean;
  onMenuAction?: (action: UnifiedSubheaderMenuAction) => void;
  onLaunch?: () => void;
  hasConversation?: boolean;
  expanded?: boolean;
  onExpandedChange?: Dispatch<SetStateAction<boolean>>;
};

const TABS: Array<{ id: UnifiedSubheaderTab; label: string; ariaLabel: string }> = [
  { id: "changes", label: "CHANGES", ariaLabel: "View changes" },
  { id: "blueprints", label: "BLUEPRINTS", ariaLabel: "Open blueprints" },
  { id: "artifacts", label: "ARTIFACTS", ariaLabel: "Open artifacts" },
  { id: "console", label: "CONSOLE", ariaLabel: "Open console" },
];


function tabButtonStyle(active: boolean, isMobile: boolean): CSSProperties {
  return {
    position: "relative",
    padding: "6px 2px 10px",
    background: "transparent",
    border: "none",
    color: active ? "var(--atlas-fg)" : "var(--atlas-muted)",
    fontSize: isMobile ? 11 : 12,
    fontFamily: "var(--app-font-sans)",
    fontWeight: active ? 700 : 500,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    cursor: "pointer",
    transition: "color 200ms ease, opacity 200ms ease",
    display: "flex",
    alignItems: "center",
    gap: 6,
    opacity: active ? 1 : 0.55,
    whiteSpace: "nowrap",
  };
}

export function UnifiedSubheader({
  activeTab,
  onTabChange,
  hasProject,
  isMobile,
  showWorkspaceMenu = false,
  onLaunch,
  hasConversation = true,
  expanded: controlledExpanded,
  onExpandedChange,
}: UnifiedSubheaderProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = controlledExpanded ?? internalExpanded;
  const setExpanded = onExpandedChange ?? setInternalExpanded;
  const [launchHover, setLaunchHover] = useState(false);
  const [launchActive, setLaunchActive] = useState(false);

  const selectTab = (tab: UnifiedSubheaderTab) => {
    onTabChange(tab);
  };

  const showRow = expanded && hasProject;


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
      {/* Collapsible tab row — slides up and out of DOM flow when collapsed */}
      <div
        style={{
          maxHeight: showRow ? 56 : 0,
          overflow: "hidden",
          transition: "max-height 240ms ease",
        }}
        aria-hidden={!showRow}
      >
        <div
          className="atlas-app-header-row"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: isMobile ? "8px 16px 6px" : "10px 22px 8px",
          }}
        >
          <nav
            aria-label="Workspace sections"
            className="scrollbar-none"
            style={{
              display: "flex",
              alignItems: "center",
              gap: isMobile ? 16 : 22,
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
                    if (!active) event.currentTarget.style.opacity = "0.85";
                  }}
                  onMouseLeave={(event) => {
                    if (!active) event.currentTarget.style.opacity = "0.55";
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

        </div>
      </div>

      {/* Play button — pinned. Tap = primary action (launch when collapsed, collapse when expanded).
          Long-press = secondary (expand when collapsed, launch when expanded). Icon rotates 90° when expanded. */}
      {showWorkspaceMenu && hasProject && (() => {
        const longPressTimer = useRef<number | null>(null);
        const longPressFired = useRef(false);

        const clearLongPress = () => {
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        };

        const handlePointerDown = () => {
          setLaunchActive(true);
          longPressFired.current = false;
          clearLongPress();
          longPressTimer.current = window.setTimeout(() => {
            longPressFired.current = true;
            // Long-press: collapsed → expand, expanded → launch
            if (expanded) {
              onLaunch?.();
            } else {
              setExpanded(true);
            }
            try { navigator.vibrate?.(40); } catch { /* ignore */ }
          }, 450);
        };

        const handlePointerUp = () => {
          setLaunchActive(false);
          clearLongPress();
        };

        const handlePointerCancel = () => {
          setLaunchActive(false);
          clearLongPress();
          longPressFired.current = true; // suppress click
        };

        const handleClick = (e: React.MouseEvent) => {
          if (longPressFired.current) {
            e.preventDefault();
            e.stopPropagation();
            longPressFired.current = false;
            return;
          }
          // Tap: collapsed → launch, expanded → collapse
          if (expanded) {
            setExpanded(false);
          } else {
            onLaunch?.();
          }
        };

        return (
          <button
            type="button"
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerCancel}
            onPointerCancel={handlePointerCancel}
            onMouseEnter={() => setLaunchHover(true)}
            onMouseLeave={() => { setLaunchHover(false); setLaunchActive(false); }}
            title={expanded ? "Tap to hide tabs · long-press to launch" : "Tap to launch · long-press to show tabs"}
            aria-label={expanded ? "Hide tabs (long-press to launch full screen)" : "Launch full screen (long-press to show tabs)"}
            aria-expanded={expanded}
            style={{
              position: "absolute",
              top: expanded ? (isMobile ? 8 : 10) : 4,
              right: isMobile ? 16 : 22,
              zIndex: 2,
              background: launchActive
                ? "color-mix(in oklab, var(--atlas-gold) 18%, transparent)"
                : launchHover
                ? "color-mix(in oklab, var(--atlas-gold) 10%, transparent)"
                : "transparent",
              border: `1px solid ${launchHover || launchActive ? "color-mix(in oklab, var(--atlas-gold) 38%, transparent)" : "transparent"}`,
              borderRadius: 8,
              padding: "5px 6px",
              cursor: "pointer",
              color: launchHover || launchActive ? "var(--atlas-gold)" : "color-mix(in oklab, var(--atlas-gold) 70%, var(--atlas-muted))",
              opacity: launchHover || launchActive ? 1 : 0.85,
              lineHeight: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 160ms ease, color 160ms ease, border-color 160ms ease, opacity 160ms ease, top 240ms ease",
              WebkitTapHighlightColor: "transparent",
              boxShadow: launchHover || launchActive ? "0 0 12px rgba(201,162,76,0.25)" : "none",
              touchAction: "manipulation",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                transition: "transform 200ms cubic-bezier(.32,.72,0,1)",
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              }}
            >
              <Play size={15} strokeWidth={2} fill="currentColor" aria-hidden />
            </span>
          </button>
        );
      })()}
    </div>
  );
}
