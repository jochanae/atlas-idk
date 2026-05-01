import { useState, type ReactNode } from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import {
  MessageSquare,
  Compass,
  ScrollText,
  Inbox,
  Github,
  FileCode2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
  Minimize2,
  FolderOpen,
  Terminal,
  Files,
} from "lucide-react";

/**
 * DesktopWorkspace — four-pane resizable shell for desktop (≥1024px).
 *
 * Layout (left → right):
 *   1. Nav rail        — surface switcher + history/parking shortcuts
 *   2. Atlas chat      — (mounted by parent into `chatPane`)
 *   3. Main canvas     — primary surface (Conversation/Compass/Ledger/Parking)
 *   4. Right inspector — tabbed: GitHub • Code/Preview • Recommendations
 *
 * On <1024px, render `mobileFallback` (the existing single-column shell).
 *
 * Pane sizes persist to localStorage via `autoSaveId`.
 */

export type SurfaceId = "chat" | "compass" | "ledger" | "parking";
export type InspectorTabId = "github" | "code" | "recs" | "files" | "console";

export interface DesktopWorkspaceProps {
  // Mobile fallback — render-prop, only mounted on <lg viewports
  renderMobile: () => ReactNode;

  // Desktop pane contents — render-props, only mounted on lg+ viewports
  renderCanvas: () => ReactNode;
  renderChatPane?: () => ReactNode;
  renderInspectorPanes: () => Partial<Record<InspectorTabId, ReactNode>>;

  // Nav rail state
  activeSurface: SurfaceId;
  onSurfaceChange: (surface: SurfaceId) => void;
  onOpenHistory?: () => void;
  onOpenGallery?: () => void;
  parkedCount?: number;
  ledgerCount?: number;

  // Top header (project breadcrumb, user menu) — rendered above all panes (desktop only)
  renderHeader?: () => ReactNode;

  // Footer audit line (desktop only)
  renderFooter?: () => ReactNode;
}

const SURFACES: Array<{ id: SurfaceId; label: string; Icon: typeof MessageSquare }> = [
  { id: "chat", label: "Conversation", Icon: MessageSquare },
  { id: "compass", label: "Compass", Icon: Compass },
  { id: "ledger", label: "Ledger", Icon: ScrollText },
  { id: "parking", label: "Parking Lot", Icon: Inbox },
];

const INSPECTOR_TABS: Array<{ id: InspectorTabId; label: string; Icon: typeof Github }> = [
  { id: "github", label: "GitHub", Icon: Github },
  { id: "code", label: "Code", Icon: FileCode2 },
  { id: "recs", label: "Recs", Icon: ScrollText },
];

export function DesktopWorkspace({
  renderMobile,
  renderCanvas,
  renderChatPane,
  renderInspectorPanes,
  activeSurface,
  onSurfaceChange,
  onOpenHistory,
  onOpenGallery,
  parkedCount = 0,
  ledgerCount = 0,
  renderHeader,
  renderFooter,
}: DesktopWorkspaceProps) {
  const isDesktop = useIsDesktop();
  const [navCollapsed, setNavCollapsed] = useState(true);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTabId>("code");
  const [chatVisible, setChatVisible] = useState(Boolean(renderChatPane));
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  // Render only the active branch — prevents double-mounting heavy components
  // (chat, realtime subscriptions, etc.).
  if (!isDesktop) {
    return <>{renderMobile()}</>;
  }

  const inspectorPanes = renderInspectorPanes();

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background text-foreground" style={{ minHeight: "fit-content" }}>
      {renderHeader && (
        <div className="flex-shrink-0 border-b border-border/50 min-h-fit">{renderHeader()}</div>
      )}

      <div className="flex-1 min-h-0 flex">
        {/* ── Fixed Nav rail ─────────────────────────────────────── */}
        <div
          className="flex-shrink-0 border-r border-border/50 bg-card/30 transition-[width] duration-200 overflow-y-auto overflow-x-hidden"
          style={{ width: navCollapsed ? 48 : 160, minHeight: 0 }}
        >
          <NavRail
            collapsed={navCollapsed}
            onToggleCollapse={() => setNavCollapsed((v) => !v)}
            activeSurface={activeSurface}
            onSurfaceChange={onSurfaceChange}
            onOpenHistory={onOpenHistory}
            onOpenGallery={onOpenGallery}
            parkedCount={parkedCount}
            ledgerCount={ledgerCount}
            chatVisible={chatVisible}
            onToggleChat={renderChatPane ? () => setChatVisible((v) => !v) : undefined}
          />
        </div>

        {/* ── Content area (flex layout) ────────────────────────────── */}
        <div className="flex-1 min-w-0 flex h-full">
          {/* ── Chat sidecar (optional) ────────────────── */}
          {renderChatPane && chatVisible && !canvasExpanded && (
            <div className="flex-shrink-0 bg-background border-r border-border/50" style={{ width: 320 }}>
              <div className="h-full overflow-hidden flex flex-col">
                <PaneHeader title="Atlas" />
                <div className="flex-1 min-h-0 overflow-auto">{renderChatPane()}</div>
              </div>
            </div>
          )}

          {/* ── Main canvas ─────────────────────────────── */}
          <div className="flex-1 min-w-0 h-full overflow-hidden relative">
            <button
              type="button"
              onClick={() => setCanvasExpanded((v) => !v)}
              className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-card/60 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
              title={canvasExpanded ? "Exit full canvas" : "Expand canvas"}
              aria-label={canvasExpanded ? "Exit full canvas" : "Expand canvas"}
            >
              {canvasExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            {renderCanvas()}
          </div>

          {/* ── Right inspector ──────────────────────────── */}
          {!canvasExpanded && (
            <div
              className="flex-shrink-0 border-l border-border/50 bg-card/30 transition-[width] duration-200"
              style={{ width: inspectorCollapsed ? 40 : 280 }}
            >
              <Inspector
                collapsed={inspectorCollapsed}
                onToggleCollapse={() => setInspectorCollapsed((v) => !v)}
                activeTab={inspectorTab}
                onTabChange={setInspectorTab}
                panes={inspectorPanes}
              />
            </div>
          )}
        </div>
      </div>

      {renderFooter && <div className="flex-shrink-0">{renderFooter()}</div>}
    </div>
  );
}


// ──────────────────────────────────────────────────────────────────────
// Nav rail
// ──────────────────────────────────────────────────────────────────────

function NavRail({
  collapsed,
  onToggleCollapse,
  activeSurface,
  onSurfaceChange,
  onOpenHistory,
  onOpenGallery,
  parkedCount,
  ledgerCount,
  chatVisible,
  onToggleChat,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeSurface: SurfaceId;
  onSurfaceChange: (s: SurfaceId) => void;
  onOpenHistory?: () => void;
  onOpenGallery?: () => void;
  parkedCount: number;
  ledgerCount: number;
  chatVisible: boolean;
  onToggleChat?: () => void;
}) {
  return (
    <nav className="h-full flex flex-col py-3 px-2 gap-1 min-h-fit overflow-y-auto overflow-x-hidden">
      <button
        type="button"
        onClick={onToggleCollapse}
        className="atlas-nav-btn self-start mb-2"
        aria-label={collapsed ? "Expand nav" : "Collapse nav"}
        title={collapsed ? "Expand nav" : "Collapse nav"}
      >
        {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
      </button>

      <div className="flex flex-col gap-0.5">
        {SURFACES.map(({ id, label, Icon }) => {
          const active = activeSurface === id;
          const badge =
            id === "parking" ? parkedCount : id === "ledger" ? ledgerCount : 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSurfaceChange(id)}
              className={`atlas-nav-btn justify-start gap-2 ${active ? "atlas-nav-btn-active" : ""}`}
              title={label}
            >
              <Icon size={14} className="flex-shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
              {!collapsed && badge > 0 && (
                <span className="ml-auto text-[9px] font-mono opacity-60">{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col gap-0.5 pt-3 border-t border-border/40">
        {onOpenGallery && (
          <button
            type="button"
            onClick={onOpenGallery}
            className="atlas-nav-btn justify-start gap-2"
            title="All Projects"
          >
            <FolderOpen size={14} className="flex-shrink-0" />
            {!collapsed && <span>All Projects</span>}
          </button>
        )}
        {onOpenHistory && (
          <button
            type="button"
            onClick={onOpenHistory}
            className="atlas-nav-btn justify-start gap-2"
            title="Session history"
          >
            <ScrollText size={14} className="flex-shrink-0" />
            {!collapsed && <span>History</span>}
          </button>
        )}
        {onToggleChat && (
          <button
            type="button"
            onClick={onToggleChat}
            className={`atlas-nav-btn justify-start gap-2 ${chatVisible ? "atlas-nav-btn-active" : ""}`}
            title={chatVisible ? "Hide chat sidecar" : "Show chat sidecar"}
          >
            <MessageSquare size={14} className="flex-shrink-0" />
            {!collapsed && <span>Chat sidecar</span>}
          </button>
        )}
      </div>
    </nav>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Inspector
// ──────────────────────────────────────────────────────────────────────

function Inspector({
  collapsed,
  onToggleCollapse,
  activeTab,
  onTabChange,
  panes,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeTab: InspectorTabId;
  onTabChange: (t: InspectorTabId) => void;
  panes: Partial<Record<InspectorTabId, ReactNode>>;
}) {
  if (collapsed) {
    return (
      <div className="h-full flex flex-col items-center py-3 px-2 gap-1">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="atlas-nav-btn"
          aria-label="Expand inspector"
          title="Expand inspector"
        >
          <PanelRightOpen size={14} />
        </button>
        {INSPECTOR_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              onTabChange(id);
              onToggleCollapse();
            }}
            className="atlas-nav-btn"
            title={label}
            aria-label={label}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center gap-1 px-2 py-2 border-b border-border/40">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="atlas-nav-btn"
          aria-label="Collapse inspector"
          title="Collapse inspector"
        >
          <PanelRightClose size={14} />
        </button>
        <div className="flex-1 flex items-center gap-0.5 overflow-x-auto scrollbar-none min-w-0">
          {INSPECTOR_TABS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange(id)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                title={label}
              >
                <Icon size={12} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {panes[activeTab] ?? <InspectorEmpty tab={activeTab} />}
      </div>
    </div>
  );
}

function InspectorEmpty({ tab }: { tab: InspectorTabId }) {
  const messages: Record<InspectorTabId, string> = {
    github: "Connect a GitHub repository to view branches, commits, and files here.",
    code: "Generated code and previews will appear here.",
    recs: "No recommendations yet. They appear as Atlas notices patterns.",
  };
  return (
    <div className="h-full flex items-center justify-center p-6 text-center">
      <p className="text-[11px] font-mono text-muted-foreground leading-relaxed max-w-full break-words">
        {messages[tab]}
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Misc
// ──────────────────────────────────────────────────────────────────────

function PaneHeader({ title }: { title: string }) {
  return (
    <div className="flex-shrink-0 px-3 py-2 border-b border-border/40">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
    </div>
  );
}

function ResizeHandle() {
  return (
    <PanelResizeHandle className="w-px bg-border/50 hover:bg-accent-gold/60 data-[resize-handle-state=drag]:bg-accent-gold transition-colors relative group">
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </PanelResizeHandle>
  );
}
