import { useState, useCallback, useRef, useEffect, type ReactNode } from "react";
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
  Settings,
  KeyRound,
  Play,
  Hammer,
  RotateCcw,
  Keyboard,
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
 */

export type SurfaceId = "chat" | "compass" | "ledger" | "parking";
export type InspectorTabId = "github" | "code" | "recs" | "files" | "console" | "settings" | "secrets";

export type BuildStatus = "idle" | "building" | "success" | "error";

export interface DesktopWorkspaceProps {
  renderMobile: () => ReactNode;
  renderCanvas: () => ReactNode;
  renderChatPane?: () => ReactNode;
  renderInspectorPanes: () => Partial<Record<InspectorTabId, ReactNode>>;
  activeSurface: SurfaceId;
  onSurfaceChange: (surface: SurfaceId) => void;
  onOpenHistory?: () => void;
  onOpenGallery?: () => void;
  parkedCount?: number;
  ledgerCount?: number;
  renderHeader?: () => ReactNode;
  renderFooter?: () => ReactNode;
  // Build status & auto-run
  buildStatus?: BuildStatus;
  autoRun?: boolean;
  onAutoRunChange?: (v: boolean) => void;
  onRun?: () => void;
  onBuild?: () => void;
}

const SURFACES: Array<{ id: SurfaceId; label: string; Icon: typeof MessageSquare }> = [
  { id: "chat", label: "Conversation", Icon: MessageSquare },
  { id: "compass", label: "Compass", Icon: Compass },
  { id: "ledger", label: "Ledger", Icon: ScrollText },
  { id: "parking", label: "Parking Lot", Icon: Inbox },
];

const INSPECTOR_TABS: Array<{ id: InspectorTabId; label: string; Icon: typeof Github }> = [
  { id: "files", label: "Files", Icon: Files },
  { id: "console", label: "Console", Icon: Terminal },
  { id: "code", label: "Code", Icon: FileCode2 },
  { id: "github", label: "GitHub", Icon: Github },
  { id: "recs", label: "Recs", Icon: ScrollText },
  { id: "settings", label: "Settings", Icon: Settings },
  { id: "secrets", label: "Secrets", Icon: Settings },
];

// ── localStorage helpers ──
function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch { return fallback; }
}
function saveJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

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
  buildStatus = "idle",
  autoRun = false,
  onAutoRunChange,
  onRun,
  onBuild,
}: DesktopWorkspaceProps) {
  const isDesktop = useIsDesktop();

  // ── Persisted layout state ──
  const [navCollapsed, setNavCollapsed] = useState(() => loadJson("atlas-nav-collapsed", true));
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => loadJson("atlas-inspector-collapsed", false));
  const [inspectorTab, setInspectorTab] = useState<InspectorTabId>(() => loadJson("atlas-inspector-tab", "files"));
  const [chatVisible, setChatVisible] = useState(() => loadJson("atlas-chat-visible", Boolean(renderChatPane)));
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  const [fullScreenTab, setFullScreenTab] = useState<InspectorTabId | null>(null);

  // Persist on change
  useEffect(() => { saveJson("atlas-nav-collapsed", navCollapsed); }, [navCollapsed]);
  useEffect(() => { saveJson("atlas-inspector-collapsed", inspectorCollapsed); }, [inspectorCollapsed]);
  useEffect(() => { saveJson("atlas-inspector-tab", inspectorTab); }, [inspectorTab]);
  useEffect(() => { saveJson("atlas-chat-visible", chatVisible); }, [chatVisible]);

  // ── Drag-and-drop panel reordering ──
  type PanelId = "chat" | "canvas" | "inspector";
  const [panelOrder, setPanelOrder] = useState<PanelId[]>(() => loadJson("atlas-panel-order", ["chat", "canvas", "inspector"]));
  const dragSourceRef = useRef<PanelId | null>(null);
  const [dragOverPanel, setDragOverPanel] = useState<PanelId | null>(null);

  const handlePanelDragStart = useCallback((panelId: PanelId) => {
    dragSourceRef.current = panelId;
  }, []);

  const handlePanelDragOver = useCallback((e: React.DragEvent, panelId: PanelId) => {
    e.preventDefault();
    if (dragSourceRef.current && dragSourceRef.current !== panelId) {
      setDragOverPanel(panelId);
    }
  }, []);

  const handlePanelDrop = useCallback((panelId: PanelId) => {
    const source = dragSourceRef.current;
    if (!source || source === panelId) {
      setDragOverPanel(null);
      dragSourceRef.current = null;
      return;
    }
    setPanelOrder((prev) => {
      const next = [...prev];
      const sourceIdx = next.indexOf(source);
      const targetIdx = next.indexOf(panelId);
      if (sourceIdx === -1 || targetIdx === -1) return prev;
      next.splice(sourceIdx, 1);
      next.splice(targetIdx, 0, source);
      saveJson("atlas-panel-order", next);
      return next;
    });
    setDragOverPanel(null);
    dragSourceRef.current = null;
  }, []);

  const handlePanelDragEnd = useCallback(() => {
    setDragOverPanel(null);
    dragSourceRef.current = null;
  }, []);

  // ── Keyboard shortcuts ──
  const [showShortcuts, setShowShortcuts] = useState(false);
  useEffect(() => {
    if (!isDesktop) return;
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      
      switch (e.key) {
        case "b":
          if (e.shiftKey) { e.preventDefault(); onBuild?.(); }
          else { e.preventDefault(); setChatVisible(v => !v); }
          break;
        case "`":
          e.preventDefault();
          setInspectorCollapsed(false);
          setInspectorTab("console");
          break;
        case "\\":
          e.preventDefault();
          setCanvasExpanded(v => !v);
          break;
        case "e":
          e.preventDefault();
          setInspectorCollapsed(false);
          setInspectorTab("files");
          break;
        case "Enter":
          if (e.shiftKey) { e.preventDefault(); onRun?.(); }
          break;
        case "/":
          e.preventDefault();
          setShowShortcuts(v => !v);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDesktop, onBuild, onRun]);

  if (!isDesktop) {
    return <>{renderMobile()}</>;
  }

  // ── Full-screen inspector tab ──
  if (fullScreenTab) {
    const panes = renderInspectorPanes();
    return (
      <div className="flex flex-col h-screen w-full bg-background text-foreground">
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-border/50">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            {INSPECTOR_TABS.find(t => t.id === fullScreenTab)?.label ?? fullScreenTab} — Full Screen
          </span>
          <button
            type="button"
            onClick={() => setFullScreenTab(null)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            <Minimize2 size={12} />
            Exit
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {panes[fullScreenTab] ?? <InspectorEmpty tab={fullScreenTab} />}
        </div>
      </div>
    );
  }

  const inspectorPanes = renderInspectorPanes();

  // Build panel map
  const panelContent: Record<PanelId, { visible: boolean; node: ReactNode; flex: string; width?: number }> = {
    chat: {
      visible: Boolean(renderChatPane && chatVisible && !canvasExpanded),
      flex: "none",
      width: 320,
      node: renderChatPane ? (
        <div className="h-full overflow-hidden flex flex-col">
          <PaneHeader title="Atlas" draggable />
          <div className="flex-1 min-h-0 overflow-auto">{renderChatPane()}</div>
        </div>
      ) : null,
    },
    canvas: {
      visible: true,
      flex: "1 1 0%",
      node: (
        <div className="h-full overflow-hidden relative">
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
      ),
    },
    inspector: {
      visible: !canvasExpanded,
      flex: "none",
      width: inspectorCollapsed ? 40 : 280,
      node: (
        <Inspector
          collapsed={inspectorCollapsed}
          onToggleCollapse={() => setInspectorCollapsed((v) => !v)}
          activeTab={inspectorTab}
          onTabChange={setInspectorTab}
          panes={inspectorPanes}
          onFullScreen={(tab) => setFullScreenTab(tab)}
        />
      ),
    },
  };

  const BUILD_STATUS_COLORS: Record<BuildStatus, string> = {
    idle: "bg-muted-foreground/30",
    building: "bg-amber-400 animate-pulse",
    success: "bg-emerald-400",
    error: "bg-red-400",
  };

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background text-foreground" style={{ minHeight: "fit-content" }}>
      {renderHeader && (
        <div className="flex-shrink-0 border-b border-border/50 min-h-fit">{renderHeader()}</div>
      )}

      {/* ── Status bar with build status & auto-run ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-1 border-b border-border/30 bg-card/20">
        {/* Build status */}
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${BUILD_STATUS_COLORS[buildStatus]}`} />
          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            {buildStatus === "idle" ? "Ready" : buildStatus === "building" ? "Building…" : buildStatus === "success" ? "Built" : "Error"}
          </span>
        </div>
        
        {/* Quick actions */}
        <div className="flex items-center gap-1 ml-auto">
          {/* Auto-run toggle */}
          {onAutoRunChange && (
            <button
              type="button"
              onClick={() => onAutoRunChange(!autoRun)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider transition-colors ${
                autoRun ? "text-emerald-400 bg-emerald-400/10" : "text-muted-foreground hover:text-foreground"
              }`}
              title={autoRun ? "Auto-run ON — previews refresh automatically" : "Auto-run OFF — click Run to refresh"}
            >
              <RotateCcw size={10} />
              Auto
            </button>
          )}
          {/* Keyboard shortcuts help */}
          <button
            type="button"
            onClick={() => setShowShortcuts(v => !v)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            title="Keyboard shortcuts (⌘/)"
          >
            <Keyboard size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* ── Fixed Nav rail ── */}
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

        {/* ── Content area — drag-reorderable panels ── */}
        <div className="flex-1 min-w-0 flex h-full">
          {panelOrder.map((panelId, idx) => {
            const panel = panelContent[panelId];
            if (!panel.visible) return null;
            const isDropTarget = dragOverPanel === panelId;
            return (
              <div
                key={panelId}
                draggable
                onDragStart={() => handlePanelDragStart(panelId)}
                onDragOver={(e) => handlePanelDragOver(e, panelId)}
                onDrop={() => handlePanelDrop(panelId)}
                onDragEnd={handlePanelDragEnd}
                onDragLeave={() => setDragOverPanel(null)}
                className={`h-full overflow-hidden transition-all duration-150 ${
                  idx > 0 ? "border-l border-border/50" : ""
                } ${panelId === "canvas" ? "min-w-0" : "flex-shrink-0"} ${
                  panelId === "inspector" ? "bg-card/30" : "bg-background"
                }`}
                style={{
                  flex: panel.flex,
                  width: panel.width,
                  outline: isDropTarget ? "2px solid var(--accent-gold)" : undefined,
                  outlineOffset: -2,
                  opacity: dragSourceRef.current === panelId ? 0.5 : 1,
                }}
              >
                {panel.node}
              </div>
            );
          })}
        </div>
      </div>

      {renderFooter && <div className="flex-shrink-0">{renderFooter()}</div>}

      {/* ── Keyboard shortcuts overlay ── */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-foreground mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-2">
              {[
                ["⌘ B", "Toggle chat sidecar"],
                ["⌘ ⇧ B", "Trigger build"],
                ["⌘ ⇧ Enter", "Re-run preview"],
                ["⌘ `", "Open console"],
                ["⌘ E", "Open file tree"],
                ["⌘ \\", "Toggle full canvas"],
                ["⌘ /", "Show shortcuts"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{desc}</span>
                  <kbd className="px-2 py-0.5 rounded bg-muted/50 border border-border/50 text-[10px] font-mono text-foreground">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowShortcuts(false)}
              className="mt-4 w-full text-center text-[10px] font-mono text-muted-foreground hover:text-foreground py-1.5 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
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
  onFullScreen,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeTab: InspectorTabId;
  onTabChange: (t: InspectorTabId) => void;
  panes: Partial<Record<InspectorTabId, ReactNode>>;
  onFullScreen: (tab: InspectorTabId) => void;
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
          className="atlas-nav-btn flex-shrink-0"
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
                className={`flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${
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
        {/* Full-screen button for active tab */}
        {(activeTab === "code" || activeTab === "console") && (
          <button
            type="button"
            onClick={() => onFullScreen(activeTab)}
            className="atlas-nav-btn flex-shrink-0"
            title={`Full screen ${activeTab}`}
            aria-label={`Full screen ${activeTab}`}
          >
            <Maximize2 size={12} />
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {panes[activeTab] ?? <InspectorEmpty tab={activeTab} />}
      </div>
    </div>
  );
}

function InspectorEmpty({ tab }: { tab: InspectorTabId }) {
  const messages: Record<InspectorTabId, string> = {
    files: "No files yet. Use /build to generate components.",
    console: "Waiting for build output…",
    github: "Connect a GitHub repository to view branches, commits, and files here.",
    code: "Generated code and previews will appear here.",
    recs: "No recommendations yet. They appear as Atlas notices patterns.",
    settings: "Select a project to view its settings.",
    secrets: "Manage API keys and secrets for your backend functions.",
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

function PaneHeader({ title, draggable: _draggable }: { title: string; draggable?: boolean }) {
  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border/40">
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{title}</span>
    </div>
  );
}
