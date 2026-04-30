import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  FolderOpen,
  MessageSquare,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  FileText,
  Code2,
  Table as TableIcon,
} from "lucide-react";

/**
 * MobileShell — three-pane swipeable native-feel shell.
 *
 *   ┌──────────┬──────────┬──────────┐
 *   │ Projects │   Chat   │ Artifact │
 *   │  (left)  │ (center) │  (right) │
 *   └──────────┴──────────┴──────────┘
 *
 * Behavior:
 *   - Center pane is the default (visible on first paint).
 *   - Horizontal swipe across the center pane snaps between panes.
 *   - Edge-pull (15px from screen edge) opens left/right drawer mid-gesture.
 *   - Tap a top tab to jump to a pane.
 *   - Vertical scroll inside the chat pane is preserved (we only intercept
 *     horizontal-dominant gestures).
 *   - Search icon in the tab bar opens a full-screen search overlay that
 *     queries projects, recent sessions, and artifacts in the current thread.
 *   - Pane snaps trigger an 8ms haptic pulse on supported devices.
 */

export type MobilePane = "projects" | "chat" | "artifact";

export type SearchableProject = { id: string; name: string };
export type SearchableSession = { id: string; title: string | null };
export type SearchableArtifact = {
  id: string;
  title: string;
  kind: "code" | "doc" | "table";
  language?: string;
};

export interface MobileShellProps {
  renderProjects: () => ReactNode;
  renderChat: () => ReactNode;
  renderArtifact: () => ReactNode;
  /** Optional badges shown on the top tab bar */
  projectsCount?: number;
  artifactsCount?: number;
  /** Initial pane on mount (default: "chat") */
  initialPane?: MobilePane;
  /** Search corpus + handlers. If omitted, the search button is hidden. */
  searchCorpus?: {
    projects: SearchableProject[];
    sessions: SearchableSession[];
    artifacts: SearchableArtifact[];
  };
  onPickProject?: (id: string) => void;
  onPickSession?: (id: string) => void;
  onPickArtifact?: (id: string) => void;
}

const PANES: MobilePane[] = ["projects", "chat", "artifact"];
const SWIPE_THRESHOLD_RATIO = 0.18; // 18% of width = commit to next pane
const VELOCITY_THRESHOLD = 0.45;     // px/ms — flick to advance regardless of distance
const HORIZONTAL_DOMINANCE = 1.25;   // |dx| must exceed |dy| * this to be a swipe
const EDGE_GRAB = 18;                // px from screen edge that always grabs

function haptic(ms = 8) {
  if (typeof navigator === "undefined") return;
  // navigator.vibrate is no-op on iOS Safari, gracefully ignored.
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* noop */
  }
}

export function MobileShell({
  renderProjects,
  renderChat,
  renderArtifact,
  projectsCount = 0,
  artifactsCount = 0,
  initialPane = "chat",
  searchCorpus,
  onPickProject,
  onPickSession,
  onPickArtifact,
}: MobileShellProps) {
  const [pane, setPane] = useState<MobilePane>(initialPane);
  const [dragOffset, setDragOffset] = useState(0); // px, negative = pulling left pane in
  const [dragging, setDragging] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const lockedDirection = useRef<"horizontal" | "vertical" | null>(null);
  const pointerActive = useRef(false);

  // Cache pane width
  useEffect(() => {
    const update = () => {
      widthRef.current = trackRef.current?.clientWidth ?? window.innerWidth;
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const paneIndex = PANES.indexOf(pane);

  const goTo = useCallback((next: MobilePane) => {
    setPane((current) => {
      if (current !== next) haptic(8);
      return next;
    });
    setDragOffset(0);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Ignore non-primary buttons / multi-touch
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerActive.current = true;
    startX.current = e.clientX;
    startY.current = e.clientY;
    startTime.current = performance.now();
    lockedDirection.current = null;
    setDragging(true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerActive.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    // Lock axis on first significant movement
    if (lockedDirection.current === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      const fromLeftEdge = startX.current <= EDGE_GRAB;
      const fromRightEdge = startX.current >= window.innerWidth - EDGE_GRAB;
      const edgeGrab = fromLeftEdge && dx > 0 || fromRightEdge && dx < 0;
      if (edgeGrab || Math.abs(dx) > Math.abs(dy) * HORIZONTAL_DOMINANCE) {
        lockedDirection.current = "horizontal";
        try {
          (e.target as Element).setPointerCapture?.(e.pointerId);
        } catch {
          /* noop */
        }
      } else {
        lockedDirection.current = "vertical";
      }
    }

    if (lockedDirection.current !== "horizontal") return;

    e.preventDefault();
    // Clamp so you can't drag past first/last pane
    let next = dx;
    if (pane === "projects" && next > 0) next = next * 0.25; // rubber-band
    if (pane === "artifact" && next < 0) next = next * 0.25;
    setDragOffset(next);
  };

  const finish = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerActive.current) return;
    pointerActive.current = false;
    setDragging(false);

    if (lockedDirection.current !== "horizontal") {
      setDragOffset(0);
      return;
    }

    const dx = e.clientX - startX.current;
    const dt = Math.max(performance.now() - startTime.current, 1);
    const velocity = Math.abs(dx) / dt; // px/ms
    const w = widthRef.current || window.innerWidth;
    const passed = Math.abs(dx) > w * SWIPE_THRESHOLD_RATIO || velocity > VELOCITY_THRESHOLD;

    if (passed) {
      const dir = dx < 0 ? 1 : -1; // dragging content left = next pane
      const nextIndex = Math.min(PANES.length - 1, Math.max(0, paneIndex + dir));
      const nextPane = PANES[nextIndex];
      if (nextPane !== pane) haptic(8);
      setPane(nextPane);
    }
    setDragOffset(0);
  };

  // Translate: each pane is 100% of track width, track is 300% wide
  const translatePct = -paneIndex * 100;
  const translatePx = dragOffset;
  const transform = `translate3d(calc(${translatePct}% + ${translatePx}px), 0, 0)`;

  const showSearch = !!searchCorpus;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      {/* Top pane indicator / quick switcher */}
      <PaneTabs
        pane={pane}
        onChange={goTo}
        projectsCount={projectsCount}
        artifactsCount={artifactsCount}
        showSearch={showSearch}
        onOpenSearch={() => setSearchOpen(true)}
      />

      {/* Swipeable track */}
      <div
        ref={trackRef}
        className="relative flex-1 min-h-0 touch-pan-y select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        style={{ overscrollBehaviorX: "contain" }}
      >
        <div
          className="flex h-full w-[300%]"
          style={{
            transform,
            transition: dragging ? "none" : "transform 280ms var(--ease-cinematic, cubic-bezier(0.22, 1, 0.36, 1))",
            willChange: "transform",
          }}
        >
          <PaneSlot label="Projects">{renderProjects()}</PaneSlot>
          <PaneSlot label="Chat">{renderChat()}</PaneSlot>
          <PaneSlot label="Artifact">{renderArtifact()}</PaneSlot>
        </div>

        {/* Edge hint chevrons — only visible on chat pane */}
        {pane === "chat" && (
          <>
            <EdgeHint side="left" onClick={() => goTo("projects")} />
            <EdgeHint side="right" onClick={() => goTo("artifact")} />
          </>
        )}
      </div>

      {searchOpen && searchCorpus && (
        <SearchOverlay
          corpus={searchCorpus}
          onClose={() => setSearchOpen(false)}
          onPickProject={(id) => {
            setSearchOpen(false);
            onPickProject?.(id);
            goTo("chat");
          }}
          onPickSession={(id) => {
            setSearchOpen(false);
            onPickSession?.(id);
            goTo("chat");
          }}
          onPickArtifact={(id) => {
            setSearchOpen(false);
            onPickArtifact?.(id);
            goTo("artifact");
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────

function PaneSlot({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section
      aria-label={label}
      className="h-full w-1/3 flex-shrink-0 overflow-hidden"
    >
      <div className="h-full w-full overflow-y-auto overflow-x-hidden overscroll-contain">
        {children}
      </div>
    </section>
  );
}

function PaneTabs({
  pane,
  onChange,
  projectsCount,
  artifactsCount,
  showSearch,
  onOpenSearch,
}: {
  pane: MobilePane;
  onChange: (p: MobilePane) => void;
  projectsCount: number;
  artifactsCount: number;
  showSearch: boolean;
  onOpenSearch: () => void;
}) {
  const tabs: Array<{ id: MobilePane; label: string; Icon: typeof FolderOpen; badge?: number }> = [
    { id: "projects", label: "Projects", Icon: FolderOpen, badge: projectsCount },
    { id: "chat", label: "Chat", Icon: MessageSquare },
    { id: "artifact", label: "Preview", Icon: Sparkles, badge: artifactsCount },
  ];

  return (
    <div className="flex-shrink-0 flex items-center justify-center gap-1 px-2 py-1.5 border-b border-border/40 bg-card/30 backdrop-blur">
      {tabs.map(({ id, label, Icon, badge }) => {
        const active = pane === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={[
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider",
              "transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
            aria-pressed={active}
            aria-label={label}
          >
            <Icon size={12} />
            <span>{label}</span>
            {typeof badge === "number" && badge > 0 && (
              <span className="ml-0.5 text-[9px] opacity-70">{badge}</span>
            )}
          </button>
        );
      })}
      {showSearch && (
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search"
          className="ml-1 flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <Search size={13} />
        </button>
      )}
    </div>
  );
}

function EdgeHint({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Open projects" : "Open preview"}
      className={[
        "absolute top-1/2 -translate-y-1/2 z-10",
        side === "left" ? "left-0" : "right-0",
        "h-16 w-5 flex items-center justify-center",
        "text-muted-foreground/60 hover:text-foreground",
        "bg-gradient-to-r",
        side === "left"
          ? "from-card/40 to-transparent rounded-r"
          : "from-transparent to-card/40 rounded-l",
        "pointer-events-auto",
      ].join(" ")}
    >
      <Icon size={14} />
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Search overlay

function SearchOverlay({
  corpus,
  onClose,
  onPickProject,
  onPickSession,
  onPickArtifact,
}: {
  corpus: NonNullable<MobileShellProps["searchCorpus"]>;
  onClose: () => void;
  onPickProject: (id: string) => void;
  onPickSession: (id: string) => void;
  onPickArtifact: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const needle = q.trim().toLowerCase();
  const { projects, sessions, artifacts } = useMemo(() => {
    if (!needle) {
      return {
        projects: corpus.projects.slice(0, 5),
        sessions: corpus.sessions.slice(0, 5),
        artifacts: corpus.artifacts.slice(0, 5),
      };
    }
    return {
      projects: corpus.projects.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 8),
      sessions: corpus.sessions
        .filter((s) => (s.title ?? "untitled").toLowerCase().includes(needle))
        .slice(0, 8),
      artifacts: corpus.artifacts
        .filter(
          (a) =>
            a.title.toLowerCase().includes(needle) ||
            a.kind.toLowerCase().includes(needle) ||
            (a.language ?? "").toLowerCase().includes(needle),
        )
        .slice(0, 8),
    };
  }, [corpus, needle]);

  const empty =
    projects.length === 0 && sessions.length === 0 && artifacts.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40">
        <Search size={14} className="text-muted-foreground flex-shrink-0" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search projects, sessions, artifacts…"
          className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/70 outline-none border-none"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className="flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/40"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {empty && (
          <p className="text-center text-[11px] font-mono text-muted-foreground py-8">
            No matches.
          </p>
        )}

        {projects.length > 0 && (
          <SearchSection title="Projects">
            {projects.map((p) => (
              <SearchRow
                key={p.id}
                icon={<FolderOpen size={12} />}
                label={p.name}
                onClick={() => onPickProject(p.id)}
              />
            ))}
          </SearchSection>
        )}

        {sessions.length > 0 && (
          <SearchSection title="Recent sessions">
            {sessions.map((s) => (
              <SearchRow
                key={s.id}
                icon={<MessageSquare size={12} />}
                label={s.title || "Untitled"}
                onClick={() => onPickSession(s.id)}
              />
            ))}
          </SearchSection>
        )}

        {artifacts.length > 0 && (
          <SearchSection title="Artifacts">
            {artifacts.map((a) => {
              const Icon = a.kind === "code" ? Code2 : a.kind === "table" ? TableIcon : FileText;
              return (
                <SearchRow
                  key={a.id}
                  icon={<Icon size={12} />}
                  label={a.title}
                  meta={a.language ?? a.kind}
                  onClick={() => onPickArtifact(a.id)}
                />
              );
            })}
          </SearchSection>
        )}
      </div>
    </div>
  );
}

function SearchSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-[9px] font-mono uppercase tracking-[0.14em] text-muted-foreground mb-1.5 px-1">
        {title}
      </h3>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function SearchRow({
  icon,
  label,
  meta,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-left text-[12px] text-foreground hover:bg-muted/40 transition-colors"
    >
      <span className="text-muted-foreground flex-shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {meta && (
        <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground flex-shrink-0">
          {meta}
        </span>
      )}
    </button>
  );
}
