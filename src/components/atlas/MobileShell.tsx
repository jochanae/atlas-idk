import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FolderOpen, MessageSquare, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";

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
 *
 * This wrapper assumes you only mount it on small viewports — the desktop
 * shell handles ≥1024px on its own.
 */

export type MobilePane = "projects" | "chat" | "artifact";

export interface MobileShellProps {
  renderProjects: () => ReactNode;
  renderChat: () => ReactNode;
  renderArtifact: () => ReactNode;
  /** Optional badges shown on the top tab bar */
  projectsCount?: number;
  artifactsCount?: number;
  /** Initial pane on mount (default: "chat") */
  initialPane?: MobilePane;
}

const PANES: MobilePane[] = ["projects", "chat", "artifact"];
const SWIPE_THRESHOLD_RATIO = 0.18; // 18% of width = commit to next pane
const VELOCITY_THRESHOLD = 0.45;     // px/ms — flick to advance regardless of distance
const HORIZONTAL_DOMINANCE = 1.25;   // |dx| must exceed |dy| * this to be a swipe
const EDGE_GRAB = 18;                // px from screen edge that always grabs

export function MobileShell({
  renderProjects,
  renderChat,
  renderArtifact,
  projectsCount = 0,
  artifactsCount = 0,
  initialPane = "chat",
}: MobileShellProps) {
  const [pane, setPane] = useState<MobilePane>(initialPane);
  const [dragOffset, setDragOffset] = useState(0); // px, negative = pulling left pane in
  const [dragging, setDragging] = useState(false);
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
    setPane(next);
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
      setPane(PANES[nextIndex]);
    }
    setDragOffset(0);
  };

  // Translate: each pane is 100% of track width, track is 300% wide
  const translatePct = -paneIndex * 100;
  const translatePx = dragOffset;
  const transform = `translate3d(calc(${translatePct}% + ${translatePx}px), 0, 0)`;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      {/* Top pane indicator / quick switcher */}
      <PaneTabs
        pane={pane}
        onChange={goTo}
        projectsCount={projectsCount}
        artifactsCount={artifactsCount}
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
}: {
  pane: MobilePane;
  onChange: (p: MobilePane) => void;
  projectsCount: number;
  artifactsCount: number;
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
