import { useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import {
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
  Minimize2,
  FileCode2,
  Terminal,
  Files,
  Settings,
  KeyRound,
  Github,
  ScrollText,
  Keyboard,
} from "lucide-react";

/**
 * DesktopWorkspace — Clean two-pane layout inspired by Cursor / Lovable.
 *
 * DEFAULT: Chat (left) + Canvas (right) — fluid, minimal chrome.
 * Inspector slides in from the right when toggled.
 * Full-screen mode for any pane.
 */

export type SurfaceId = "chat" | "compass" | "ledger" | "parking";
export type InspectorTabId = "github" | "code" | "recs" | "files" | "console" | "settings" | "secrets";
export type BuildStatus = "idle" | "building" | "success" | "error";

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

const INSPECTOR_TABS: Array<{ id: InspectorTabId; label: string; Icon: typeof Github }> = [
  { id: "files", label: "Files", Icon: Files },
  { id: "console", label: "Console", Icon: Terminal },
  { id: "code", label: "Code", Icon: FileCode2 },
  { id: "github", label: "GitHub", Icon: Github },
  { id: "recs", label: "Recs", Icon: ScrollText },
  { id: "settings", label: "Settings", Icon: Settings },
  { id: "secrets", label: "Secrets", Icon: KeyRound },
];

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

  // Layout state
  const [chatVisible, setChatVisible] = useState(() => loadJson("atlas-chat-visible", true));
  const [inspectorVisible, setInspectorVisible] = useState(() => loadJson("atlas-inspector-visible", false));
  const [inspectorTab, setInspectorTab] = useState<InspectorTabId>(() => loadJson("atlas-inspector-tab", "files"));
  const [fullScreen, setFullScreen] = useState<FullScreenTarget>(null);
  const [chatWidth, setChatWidth] = useState(() => loadJson("atlas-chat-width", 480));
  const [inspectorWidth, setInspectorWidth] = useState(() => loadJson("atlas-inspector-width", 320));
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1440));
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // Allow chat to grow up to ~70% of viewport so users can hit half-screen comfortably
  const chatMaxWidth = Math.max(480, Math.floor(viewportWidth * 0.7));
  const inspectorMaxWidth = Math.max(400, Math.floor(viewportWidth * 0.6));
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Persist
  useEffect(() => { saveJson("atlas-chat-visible", chatVisible); }, [chatVisible]);
  useEffect(() => { saveJson("atlas-inspector-visible", inspectorVisible); }, [inspectorVisible]);
  useEffect(() => { saveJson("atlas-inspector-tab", inspectorTab); }, [inspectorTab]);
  useEffect(() => { saveJson("atlas-chat-width", chatWidth); }, [chatWidth]);
  useEffect(() => { saveJson("atlas-inspector-width", inspectorWidth); }, [inspectorWidth]);

  const toggleInspector = useCallback(() => setInspectorVisible(v => !v), []);
  const openInspectorTab = useCallback((tab: InspectorTabId) => {
    setInspectorVisible(true);
    setInspectorTab(tab);
  }, []);

  // Keyboard shortcuts
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
        case "i": e.preventDefault(); toggleInspector(); break;
        case "`": e.preventDefault(); openInspectorTab("console"); break;
        case "\\": e.preventDefault();
          if (fullScreen) setFullScreen(null);
          else setFullScreen({ type: "canvas" });
          break;
        case "e": e.preventDefault(); openInspectorTab("files"); break;
        case "Enter":
          if (e.shiftKey) { e.preventDefault(); onRun?.(); }
          break;
        case "/": e.preventDefault(); setShowShortcuts(v => !v); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDesktop, onBuild, onRun, toggleInspector, openInspectorTab, fullScreen]);

  if (!isDesktop) return <div className="h-screen w-full overflow-hidden">{renderMobile()}</div>;

  // ── Full-screen ──
  if (fullScreen) {
    let title = "";
    let content: ReactNode = null;
    if (fullScreen.type === "chat") {
      title = "Chat"; content = renderChatPane?.() ?? null;
    } else if (fullScreen.type === "canvas") {
      title = "Canvas"; content = renderCanvas();
    } else {
      const panes = renderInspectorPanes();
      const tabInfo = INSPECTOR_TABS.find(t => t.id === fullScreen.tab);
      title = tabInfo?.label ?? fullScreen.tab;
      content = panes[fullScreen.tab] ?? <InspectorEmpty tab={fullScreen.tab} />;
    }
    return (
      <div className="flex flex-col h-screen w-full bg-background text-foreground">
        <div className="flex items-center justify-between px-4 h-10 border-b border-border/30 bg-background/80 backdrop-blur-md">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          <button onClick={() => setFullScreen(null)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
            <Minimize2 size={14} /> Exit
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">{content}</div>
      </div>
    );
  }

  const showChat = Boolean(renderChatPane && chatVisible);
  const showInspector = inspectorVisible;
  const inspectorPanes = renderInspectorPanes();

  return (
    <div className="flex flex-col h-screen w-full text-foreground overflow-hidden"
      style={{ background: "var(--background)" }}>
      {/* ── Header — single, thin bar ── */}
      {renderHeader && (
        <div className="flex-shrink-0 z-20">{renderHeader()}</div>
      )}

      {/* ── Main content area — unified shell ── */}
      <div className="flex-1 min-h-0 flex relative p-2 gap-0">
        {/* Chat pane — seamless with shell */}
        {showChat && (
          <>
            <div
              className="flex-shrink-0 h-full flex flex-col overflow-hidden rounded-xl"
              style={{ width: Math.min(chatWidth, chatMaxWidth), minWidth: 320, maxWidth: chatMaxWidth, background: "var(--surface)" }}
            >
              {renderChatPane!()}
            </div>
            <ResizeHandle
              onResize={(dx) => setChatWidth(w => Math.max(320, Math.min(chatMaxWidth, w + dx)))}
              onDoubleClick={() => setChatWidth(Math.floor(viewportWidth * 0.5))}
            />
          </>
        )}

        {/* Canvas — inset panel with rounded corners and elevated surface */}
        <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden relative rounded-xl"
          style={{
            background: "var(--surface-alt)",
            border: "1px solid var(--glass-border)",
          }}>
          {/* Thin canvas toolbar */}
          <div className="flex-shrink-0 flex items-center justify-between h-9 px-3"
            style={{ borderBottom: "1px solid var(--glass-border)" }}>
            <div className="flex items-center gap-2">
              {!showChat && renderChatPane && (
                <button onClick={() => setChatVisible(true)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors" title="Show chat (⌘B)">
                  <PanelLeftOpen size={15} />
                </button>
              )}
              {showChat && (
                <button onClick={() => setChatVisible(false)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors" title="Hide chat (⌘B)">
                  <PanelLeftClose size={15} />
                </button>
              )}
              {/* Build status dot */}
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  buildStatus === "idle" ? "bg-muted-foreground/30" :
                  buildStatus === "building" ? "bg-amber-400 animate-pulse" :
                  buildStatus === "success" ? "bg-emerald-400" : "bg-red-400"
                }`} />
                <span className="text-[10px] text-muted-foreground/60">
                  {buildStatus === "building" ? "Building…" : buildStatus === "error" ? "Error" : ""}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setFullScreen({ type: "canvas" })}
                className="p-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-muted/40 transition-colors" title="Full screen (⌘\\)">
                <Maximize2 size={13} />
              </button>
              <button onClick={toggleInspector}
                className={`p-1 rounded-md transition-colors ${inspectorVisible ? "text-foreground bg-muted/40" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
                title={inspectorVisible ? "Hide inspector (⌘I)" : "Show inspector (⌘I)"}>
                {inspectorVisible ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
              </button>
              <button onClick={() => setShowShortcuts(v => !v)}
                className="p-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-muted/40 transition-colors" title="Shortcuts (⌘/)">
                <Keyboard size={13} />
              </button>
            </div>
          </div>
          {/* Canvas content */}
          <div className="flex-1 min-h-0 overflow-auto">
            {renderCanvas()}
          </div>
        </div>

        {/* Inspector pane — also inset */}
        {showInspector && (
          <>
            <ResizeHandle
              side="right"
              onResize={(dx) => setInspectorWidth(w => Math.max(240, Math.min(inspectorMaxWidth, w - dx)))}
              onDoubleClick={() => setInspectorWidth(Math.floor(viewportWidth * 0.4))}
            />
            <div
              className="flex-shrink-0 h-full flex flex-col overflow-hidden rounded-xl"
              style={{
                width: Math.min(inspectorWidth, inspectorMaxWidth), minWidth: 240, maxWidth: inspectorMaxWidth,
                background: "var(--surface-alt)",
                border: "1px solid var(--glass-border)",
              }}
            >
              {/* Inspector tab bar */}
              <div className="flex-shrink-0 flex items-center gap-0.5 h-9 px-2 overflow-x-auto scrollbar-none"
                style={{ borderBottom: "1px solid var(--glass-border)" }}>
                {INSPECTOR_TABS.map(({ id, label, Icon }) => (
                  <button key={id} onClick={() => setInspectorTab(id)}
                    className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                      inspectorTab === id
                        ? "text-foreground bg-muted/50"
                        : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/30"
                    }`} title={label}>
                    <Icon size={12} />
                    <span>{label}</span>
                  </button>
                ))}
                <div className="ml-auto flex-shrink-0 flex items-center gap-0.5">
                  <button onClick={() => setFullScreen({ type: "inspector", tab: inspectorTab })}
                    className="p-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-muted/40 transition-colors" title="Full screen">
                    <Maximize2 size={11} />
                  </button>
                  <button onClick={() => setInspectorVisible(false)}
                    className="p-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-muted/40 transition-colors" title="Close (⌘I)">
                    <PanelRightClose size={13} />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                {inspectorPanes[inspectorTab] ?? <InspectorEmpty tab={inspectorTab} />}
              </div>
            </div>
          </>
        )}
      </div>

      {renderFooter && <div className="flex-shrink-0">{renderFooter()}</div>}

      {/* Shortcuts overlay */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="bg-card border border-border/50 rounded-2xl p-6 max-w-xs w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground mb-3">Shortcuts</h3>
            <div className="space-y-1.5">
              {[
                ["⌘ B", "Toggle chat"],
                ["⌘ I", "Toggle inspector"],
                ["⌘ \\", "Full screen"],
                ["⌘ ⇧ B", "Build"],
                ["⌘ ⇧ ↵", "Re-run"],
                ["⌘ `", "Console"],
                ["⌘ E", "File tree"],
                ["⌘ Y", "Accept diff"],
                ["⌘ U", "Reject diff"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{desc}</span>
                  <kbd className="px-1.5 py-0.5 rounded-md bg-muted/40 border border-border/30 text-[10px] font-mono text-foreground/70">{key}</kbd>
                </div>
              ))}
            </div>
            <button onClick={() => setShowShortcuts(false)}
              className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Resize handle — thin, fluid, Cursor-style ──
function ResizeHandle({ onResize, side = "left" }: { onResize: (dx: number) => void; side?: "left" | "right" }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastX.current = e.clientX;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const dx = ev.clientX - lastX.current;
      lastX.current = ev.clientX;
      onResize(dx);
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [onResize]);

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      title="Drag to resize · double-click for half-screen"
      className="flex-shrink-0 w-[6px] cursor-col-resize group relative z-10"
      style={{ touchAction: "none" }}
    >
      <div className="absolute inset-y-0 -left-[4px] -right-[4px]" />
      <div className="absolute inset-y-0 left-[2px] w-px bg-border/30 group-hover:bg-accent/60 group-active:bg-accent transition-colors" />
    </div>
  );
}

function InspectorEmpty({ tab }: { tab: InspectorTabId }) {
  const messages: Record<InspectorTabId, string> = {
    files: "No files yet. Use /build to generate components.",
    console: "Waiting for build output…",
    github: "Connect a GitHub repository to view branches and commits.",
    code: "Generated code will appear here.",
    recs: "Recommendations appear as Atlas notices patterns.",
    settings: "Select a project to view settings.",
    secrets: "Manage API keys and secrets.",
  };
  return (
    <div className="h-full flex items-center justify-center p-6 text-center">
      <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-[200px]">{messages[tab]}</p>
    </div>
  );
}
