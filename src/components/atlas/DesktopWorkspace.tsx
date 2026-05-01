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
  RotateCcw,
  Keyboard,
} from "lucide-react";

/**
 * DesktopWorkspace — Adaptive shell for desktop (≥1024px).
 *
 * DEFAULT MODE: Two-pane (Chat + Canvas) — clean, focused.
 * EXPANDED MODE: Toggle nav rail (left) and/or inspector (right) for full IDE.
 * FULL-SCREEN: Any individual pane can go full-screen for focused work.
 *
 * On <1024px, render `mobileFallback`.
 */

export type SurfaceId = "chat" | "compass" | "ledger" | "parking";
export type InspectorTabId = "github" | "code" | "recs" | "files" | "console" | "settings" | "secrets";
export type BuildStatus = "idle" | "building" | "success" | "error";

// Which pane is currently full-screened
type FullScreenTarget =
  | { type: "chat" }
  | { type: "canvas" }
  | { type: "inspector"; tab: InspectorTabId }
  | null;

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
  { id: "secrets", label: "Secrets", Icon: KeyRound },
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

  // ── Persisted layout — DEFAULT: two-pane (nav & inspector hidden) ──
  const [navVisible, setNavVisible] = useState(() => loadJson("atlas-nav-visible", false));
  const [navCollapsed, setNavCollapsed] = useState(() => loadJson("atlas-nav-collapsed", true));
  const [inspectorVisible, setInspectorVisible] = useState(() => loadJson("atlas-inspector-visible", false));
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => loadJson("atlas-inspector-collapsed", false));
  const [inspectorTab, setInspectorTab] = useState<InspectorTabId>(() => loadJson("atlas-inspector-tab", "files"));
  const [chatVisible, setChatVisible] = useState(() => loadJson("atlas-chat-visible", Boolean(renderChatPane)));
  const [fullScreen, setFullScreen] = useState<FullScreenTarget>(null);

  // Persist on change
  useEffect(() => { saveJson("atlas-nav-visible", navVisible); }, [navVisible]);
  useEffect(() => { saveJson("atlas-nav-collapsed", navCollapsed); }, [navCollapsed]);
  useEffect(() => { saveJson("atlas-inspector-visible", inspectorVisible); }, [inspectorVisible]);
  useEffect(() => { saveJson("atlas-inspector-collapsed", inspectorCollapsed); }, [inspectorCollapsed]);
  useEffect(() => { saveJson("atlas-inspector-tab", inspectorTab); }, [inspectorTab]);
  useEffect(() => { saveJson("atlas-chat-visible", chatVisible); }, [chatVisible]);

  // ── Toggle helpers ──
  const toggleNav = useCallback(() => setNavVisible(v => !v), []);
  const toggleInspector = useCallback(() => setInspectorVisible(v => !v), []);
  const openInspectorTab = useCallback((tab: InspectorTabId) => {
    setInspectorVisible(true);
    setInspectorCollapsed(false);
    setInspectorTab(tab);
  }, []);

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
    if (dragSourceRef.current && dragSourceRef.current !== panelId) setDragOverPanel(panelId);
  }, []);
  const handlePanelDrop = useCallback((panelId: PanelId) => {
    const source = dragSourceRef.current;
    if (!source || source === panelId) { setDragOverPanel(null); dragSourceRef.current = null; return; }
    setPanelOrder(prev => {
      const next = [...prev];
      const si = next.indexOf(source), ti = next.indexOf(panelId);
      if (si === -1 || ti === -1) return prev;
      next.splice(si, 1); next.splice(ti, 0, source);
      saveJson("atlas-panel-order", next);
      return next;
    });
    setDragOverPanel(null); dragSourceRef.current = null;
  }, []);
  const handlePanelDragEnd = useCallback(() => { setDragOverPanel(null); dragSourceRef.current = null; }, []);

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
        case "i":
          e.preventDefault(); toggleInspector();
          break;
        case "`":
          e.preventDefault(); openInspectorTab("console");
          break;
        case "\\":
          e.preventDefault();
          if (fullScreen) setFullScreen(null);
          else setFullScreen({ type: "canvas" });
          break;
        case "e":
          e.preventDefault(); openInspectorTab("files");
          break;
        case "j":
          e.preventDefault(); toggleNav();
          break;
        case "Enter":
          if (e.shiftKey) { e.preventDefault(); onRun?.(); }
          break;
        case "/":
          e.preventDefault(); setShowShortcuts(v => !v);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDesktop, onBuild, onRun, toggleInspector, toggleNav, openInspectorTab, fullScreen]);

  if (!isDesktop) return <>{renderMobile()}</>;

  // ── FULL-SCREEN MODE ──
  if (fullScreen) {
    let title = "";
    let content: ReactNode = null;

    if (fullScreen.type === "chat") {
      title = "Atlas Chat";
      content = renderChatPane ? renderChatPane() : null;
    } else if (fullScreen.type === "canvas") {
      title = "Canvas";
      content = renderCanvas();
    } else if (fullScreen.type === "inspector") {
      const panes = renderInspectorPanes();
      const tabInfo = INSPECTOR_TABS.find(t => t.id === fullScreen.tab);
      title = tabInfo?.label ?? fullScreen.tab;
      content = panes[fullScreen.tab] ?? <InspectorEmpty tab={fullScreen.tab} />;
    }

    return (
      <div className="flex flex-col h-screen w-full bg-background text-foreground">
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-border/50">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            {title} — Full Screen
          </span>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 rounded bg-muted/30 border border-border/40 text-[9px] font-mono text-muted-foreground">
              ⌘\
            </kbd>
            <button
              type="button"
              onClick={() => setFullScreen(null)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[9px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            >
              <Minimize2 size={12} />
              Exit
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">{content}</div>
      </div>
    );
  }

  const inspectorPanes = renderInspectorPanes();
  const showChat = Boolean(renderChatPane && chatVisible);
  const showInspector = inspectorVisible;

  // ── Panel map ──
  const panelContent: Record<PanelId, { visible: boolean; node: ReactNode; flex: string; width?: number }> = {
    chat: {
      visible: showChat,
      flex: "none",
      width: 320,
      node: renderChatPane ? (
        <div className="h-full overflow-hidden flex flex-col">
          <PaneHeader
            title="Atlas"
            onFullScreen={() => setFullScreen({ type: "chat" })}
          />
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
            onClick={() => setFullScreen({ type: "canvas" })}
            className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-card/60 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
            title="Full screen canvas (⌘\\)"
            aria-label="Full screen canvas"
          >
            <Maximize2 size={14} />
          </button>
          {renderCanvas()}
        </div>
      ),
    },
    inspector: {
      visible: showInspector,
      flex: "none",
      width: inspectorCollapsed ? 40 : 300,
      node: (
        <Inspector
          collapsed={inspectorCollapsed}
          onToggleCollapse={() => setInspectorCollapsed(v => !v)}
          activeTab={inspectorTab}
          onTabChange={setInspectorTab}
          panes={inspectorPanes}
          onFullScreen={(tab) => setFullScreen({ type: "inspector", tab })}
          onClose={() => setInspectorVisible(false)}
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

      {/* ── Status bar ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-1 border-b border-border/30 bg-card/20">
        {/* Left: panel toggles */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleNav}
            className={`p-1 rounded transition-colors ${navVisible ? "text-accent-foreground bg-accent/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}
            title={navVisible ? "Hide nav rail (⌘J)" : "Show nav rail (⌘J)"}
          >
            {navVisible ? <PanelLeftClose size={12} /> : <PanelLeftOpen size={12} />}
          </button>
          <button
            type="button"
            onClick={() => setChatVisible(v => !v)}
            className={`p-1 rounded transition-colors ${chatVisible ? "text-accent-foreground bg-accent/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}
            title={chatVisible ? "Hide chat (⌘B)" : "Show chat (⌘B)"}
          >
            <MessageSquare size={12} />
          </button>
          <button
            type="button"
            onClick={toggleInspector}
            className={`p-1 rounded transition-colors ${inspectorVisible ? "text-accent-foreground bg-accent/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}
            title={inspectorVisible ? "Hide inspector (⌘I)" : "Show inspector (⌘I)"}
          >
            {inspectorVisible ? <PanelRightClose size={12} /> : <PanelRightOpen size={12} />}
          </button>
        </div>

        {/* Center: build status */}
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${BUILD_STATUS_COLORS[buildStatus]}`} />
          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            {buildStatus === "idle" ? "Ready" : buildStatus === "building" ? "Building…" : buildStatus === "success" ? "Built" : "Error"}
          </span>
        </div>

        {/* Right: auto-run + shortcuts */}
        <div className="flex items-center gap-1 ml-auto">
          {onAutoRunChange && (
            <button
              type="button"
              onClick={() => onAutoRunChange(!autoRun)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider transition-colors ${
                autoRun ? "text-emerald-400 bg-emerald-400/10" : "text-muted-foreground hover:text-foreground"
              }`}
              title={autoRun ? "Auto-run ON" : "Auto-run OFF"}
            >
              <RotateCcw size={10} />
              Auto
            </button>
          )}
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
        {/* ── Nav rail (conditional) ── */}
        {navVisible && (
          <div
            className="flex-shrink-0 border-r border-border/50 bg-card/30 transition-[width] duration-200 overflow-y-auto overflow-x-hidden"
            style={{ width: navCollapsed ? 48 : 160, minHeight: 0 }}
          >
            <NavRail
              collapsed={navCollapsed}
              onToggleCollapse={() => setNavCollapsed(v => !v)}
              activeSurface={activeSurface}
              onSurfaceChange={onSurfaceChange}
              onOpenHistory={onOpenHistory}
              onOpenGallery={onOpenGallery}
              parkedCount={parkedCount}
              ledgerCount={ledgerCount}
              chatVisible={chatVisible}
              onToggleChat={renderChatPane ? () => setChatVisible(v => !v) : undefined}
              inspectorVisible={inspectorVisible}
              onToggleInspector={toggleInspector}
            />
          </div>
        )}

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
                className={`h-full overflow-hidden transition-all duration-200 ${
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-2">
              {[
                ["⌘ B", "Toggle chat"],
                ["⌘ I", "Toggle inspector"],
                ["⌘ J", "Toggle nav rail"],
                ["⌘ \\", "Full screen / exit"],
                ["⌘ ⇧ B", "Trigger build"],
                ["⌘ ⇧ Enter", "Re-run preview"],
                ["⌘ `", "Open console"],
                ["⌘ E", "Open file tree"],
                ["⌘ Y", "Accept diff"],
                ["⌘ U", "Reject diff"],
                ["⌘ /", "Show shortcuts"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{desc}</span>
                  <kbd className="px-2 py-0.5 rounded bg-muted/50 border border-border/50 text-[10px] font-mono text-foreground">{key}</kbd>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setShowShortcuts(false)} className="mt-4 w-full text-center text-[10px] font-mono text-muted-foreground hover:text-foreground py-1.5 rounded bg-muted/30 hover:bg-muted/50 transition-colors">
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
  collapsed, onToggleCollapse, activeSurface, onSurfaceChange,
  onOpenHistory, onOpenGallery, parkedCount, ledgerCount,
  chatVisible, onToggleChat, inspectorVisible, onToggleInspector,
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
  inspectorVisible: boolean;
  onToggleInspector: () => void;
}) {
  return (
    <nav className="h-full flex flex-col py-3 px-2 gap-1 min-h-fit overflow-y-auto overflow-x-hidden">
      <button type="button" onClick={onToggleCollapse} className="atlas-nav-btn self-start mb-2"
        aria-label={collapsed ? "Expand nav" : "Collapse nav"} title={collapsed ? "Expand nav" : "Collapse nav"}>
        {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
      </button>

      <div className="flex flex-col gap-0.5">
        {SURFACES.map(({ id, label, Icon }) => {
          const active = activeSurface === id;
          const badge = id === "parking" ? parkedCount : id === "ledger" ? ledgerCount : 0;
          return (
            <button key={id} type="button" onClick={() => onSurfaceChange(id)}
              className={`atlas-nav-btn justify-start gap-2 ${active ? "atlas-nav-btn-active" : ""}`} title={label}>
              <Icon size={14} className="flex-shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
              {!collapsed && badge > 0 && <span className="ml-auto text-[9px] font-mono opacity-60">{badge}</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col gap-0.5 pt-3 border-t border-border/40">
        {onOpenGallery && (
          <button type="button" onClick={onOpenGallery} className="atlas-nav-btn justify-start gap-2" title="All Projects">
            <FolderOpen size={14} className="flex-shrink-0" />
            {!collapsed && <span>All Projects</span>}
          </button>
        )}
        {onOpenHistory && (
          <button type="button" onClick={onOpenHistory} className="atlas-nav-btn justify-start gap-2" title="Session history">
            <ScrollText size={14} className="flex-shrink-0" />
            {!collapsed && <span>History</span>}
          </button>
        )}
        {onToggleChat && (
          <button type="button" onClick={onToggleChat}
            className={`atlas-nav-btn justify-start gap-2 ${chatVisible ? "atlas-nav-btn-active" : ""}`}
            title={chatVisible ? "Hide chat" : "Show chat"}>
            <MessageSquare size={14} className="flex-shrink-0" />
            {!collapsed && <span>Chat</span>}
          </button>
        )}
        <button type="button" onClick={onToggleInspector}
          className={`atlas-nav-btn justify-start gap-2 ${inspectorVisible ? "atlas-nav-btn-active" : ""}`}
          title={inspectorVisible ? "Hide inspector" : "Show inspector"}>
          <PanelRightOpen size={14} className="flex-shrink-0" />
          {!collapsed && <span>Inspector</span>}
        </button>
      </div>
    </nav>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Inspector
// ──────────────────────────────────────────────────────────────────────

function Inspector({
  collapsed, onToggleCollapse, activeTab, onTabChange, panes, onFullScreen, onClose,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeTab: InspectorTabId;
  onTabChange: (t: InspectorTabId) => void;
  panes: Partial<Record<InspectorTabId, ReactNode>>;
  onFullScreen: (tab: InspectorTabId) => void;
  onClose: () => void;
}) {
  if (collapsed) {
    return (
      <div className="h-full flex flex-col items-center py-3 px-2 gap-1">
        <button type="button" onClick={onToggleCollapse} className="atlas-nav-btn" aria-label="Expand inspector" title="Expand inspector">
          <PanelRightOpen size={14} />
        </button>
        {INSPECTOR_TABS.map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => { onTabChange(id); onToggleCollapse(); }} className="atlas-nav-btn" title={label} aria-label={label}>
            <Icon size={14} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center gap-1 px-2 py-2 border-b border-border/40">
        <button type="button" onClick={onClose} className="atlas-nav-btn flex-shrink-0" aria-label="Hide inspector" title="Hide inspector (⌘I)">
          <PanelRightClose size={14} />
        </button>
        <div className="flex-1 flex items-center gap-0.5 overflow-x-auto scrollbar-none min-w-0">
          {INSPECTOR_TABS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button key={id} type="button" onClick={() => onTabChange(id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`} title={label}>
                <Icon size={12} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        {/* Full-screen for ANY active tab */}
        <button type="button" onClick={() => onFullScreen(activeTab)} className="atlas-nav-btn flex-shrink-0"
          title={`Full screen ${activeTab}`} aria-label={`Full screen ${activeTab}`}>
          <Maximize2 size={12} />
        </button>
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
      <p className="text-[11px] font-mono text-muted-foreground leading-relaxed max-w-full break-words">{messages[tab]}</p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Misc
// ──────────────────────────────────────────────────────────────────────

function PaneHeader({ title, onFullScreen }: { title: string; onFullScreen?: () => void }) {
  return (
    <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40">
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{title}</span>
      {onFullScreen && (
        <button type="button" onClick={onFullScreen} className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted/30 transition-colors"
          title="Full screen" aria-label="Full screen">
          <Maximize2 size={10} />
        </button>
      )}
    </div>
  );
}
