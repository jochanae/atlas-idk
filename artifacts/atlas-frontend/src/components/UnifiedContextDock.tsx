import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useListProjects } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useDockVisibility, useHandoffChromeLock, HANDOFF_LOCKED_DOCK_RESERVED_PX, dockVisibility } from "@/hooks/useDockVisibility";
import { subscribeAnchorHeld, subscribeAnchorAbsorb } from "@/lib/atlasAnchor";

const LAST_PROJECT_KEY = "atlas-last-project-id";

/**
 * UnifiedContextDock
 *
 * Single context dock shared across the unified surface. Depth-adaptive:
 *   ambient      — broad nav (Home, Projects, A, Decisions, You)
 *   active       — contextual tools (Map, Files, A, Decisions, Forge)
 *   operational  — workspace tools (Chat, Ledger, A, Preview, Flow)
 *
 * The center glyph is the persistent Atlas Core anchor — it returns focus
 * to the conversation spine. It never opens Forge directly.
 *
 * Visual language (arch SVG + raised circular monogram + 4 flanking icon buttons)
 * is preserved from the existing home bottom nav / CockpitBar so swapping
 * in this dock does not change the look.
 *
 * Behavior is purely cosmetic + callback routing. No chat, API, or route
 * decisions live here.
 */
export type DockMode = "ambient" | "active" | "operational";
export type OperationalTab = "chat" | "ledger" | "manifest" | "insights" | "map" | "files";

export interface UnifiedContextDockProps {
  mode: DockMode;
  /** Return focus to Atlas Core / conversation spine. Always required. */
  onAtlasCore: () => void;

  // ambient
  onHome?: () => void;
  onProjects?: () => void;
  onDecisions?: () => void;
  onYou?: () => void;

  // active
  onMap?: () => void;
  onFiles?: () => void;
  onSpecify?: () => void;

  // operational
  onChat?: () => void;
  onLedger?: () => void;
  onManifest?: () => void;
  onInsights?: () => void;
  onFlow?: () => void;
  activeOperationalTab?: OperationalTab;

  // badges (operational ledger)
  entryCount?: number;

  /** If set, passed as project context when long-press opens Specify. */
  currentProjectName?: string;
}

type Slot = {
  id: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  active?: boolean;
  badge?: number;
  alert?: boolean;
};

const ICONS = {
  home: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  ),
  projects: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.75">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <line x1="9" y1="5" x2="9" y2="19" />
    </svg>
  ),
  decisions: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  ),
  you: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  map: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2" />
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="20" cy="4" r="1.5" />
      <circle cx="4" cy="20" r="1.5" />
      <circle cx="20" cy="20" r="1.5" />
      <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" />
      <line x1="18.5" y1="5.5" x2="13.5" y2="10.5" />
      <line x1="5.5" y1="18.5" x2="10.5" y2="13.5" />
      <line x1="18.5" y1="18.5" x2="13.5" y2="13.5" />
    </svg>
  ),
  files: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  ),
  forge: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2l-4 6h6l-4 8" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  ),
  chat: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  ledger: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  ),
  preview: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="15" rx="2" />
      <path d="M2 8h20" />
      <path d="M8 22h8M12 18v4" />
    </svg>
  ),
  manifest: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,2 15.5,9 23,10 17.5,15.5 19,23 12,19.5 5,23 6.5,15.5 1,10 8.5,9" />
    </svg>
  ),
  insights: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  ),
};

function AxiomCenterSVG({ size = 52 }: { size?: number }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} display="block">
      <defs>
        <radialGradient id="udockpg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#5B21B6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#0D0B09" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="udockgs" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#F5D97A" />
          <stop offset="50%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#A07820" />
        </radialGradient>
      </defs>
      <circle cx="256" cy="256" r="256" fill="#0D0B09" />
      <circle cx="256" cy="256" r="256" fill="url(#udockpg)" />
      <g transform="translate(197 307) scale(0.14 -0.14)">
        <path
          fill="url(#udockgs)"
          d="M1153 160Q1111 171 1069.5 181.5Q1028 192 985 201Q934 97 877 -3Q820 -103 756 -200Q707 -274 646.5 -345Q586 -416 518.5 -478.5Q451 -541 378.5 -593.5Q306 -646 232.5 -684.5Q159 -723 86.5 -744Q14 -765 -54 -765Q-115 -765 -177 -743.5Q-239 -722 -288.5 -679Q-338 -636 -369 -571.5Q-400 -507 -400 -420Q-400 -375 -389.5 -325Q-379 -275 -355 -222Q-331 -169 -293 -113.5Q-255 -58 -200 0Q-127 77 -36.5 133Q54 189 156 225.5Q258 262 369 279.5Q480 297 594 297Q669 297 743.5 290Q818 283 893 270Q946 380 989 489Q1032 598 1064 704Q1112 866 1133 985Q1154 1104 1154 1191Q1154 1265 1142 1318.5Q1130 1372 1111 1409.5Q1092 1447 1067 1470.5Q1042 1494 1016.5 1506.5Q991 1519 966.5 1523.5Q942 1528 923 1528Q843 1528 780 1490Q717 1452 673.5 1383Q630 1314 607 1216.5Q584 1119 584 1000Q584 907 600 828Q616 749 640 684Q664 619 692.5 569Q721 519 745.5 485Q770 451 786 433Q802 415 803 415L772 383Q708 438 652 505Q596 572 555 649Q514 726 490 812.5Q466 899 466 997Q466 1105 492.5 1206.5Q519 1308 571 1385.5Q623 1463 702 1509Q781 1555 887 1555Q954 1555 1017 1536Q1080 1517 1129 1472.5Q1178 1428 1207.5 1354.5Q1237 1281 1237 1175Q1237 1086 1215.5 973.5Q1194 861 1146 704Q1113 594 1073 491Q1033 388 985 285Q1027 274 1071.5 263.5Q1116 253 1165 244L1153 160ZM594 241Q476 241 374.5 219Q273 197 189 158Q105 119 39.5 64Q-26 9 -73 -56Q-119 -119 -142.5 -182Q-166 -245 -166 -305Q-166 -362 -147.5 -408.5Q-129 -455 -97 -488.5Q-65 -522 -22 -540Q21 -558 70 -558Q147 -558 230.5 -519Q314 -480 396.5 -409.5Q479 -339 556.5 -240Q634 -141 697 -20Q745 71 793 163Q721 202 594 241Z"
        />
      </g>
    </svg>
  );
}

export function UnifiedContextDock(props: UnifiedContextDockProps) {
  const { mode, onAtlasCore } = props;
  const [location, setLocation] = useLocation();
  const { data: projectsRaw } = useListProjects();
  const projects = Array.isArray(projectsRaw) ? projectsRaw : [];
  const dockVisible = useDockVisibility();
  const handoffChromeLocked = useHandoffChromeLock();
  const [showAtlasHub, setShowAtlasHub] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const [anchorHeld, setAnchorHeld] = useState(false);
  const [absorbTick, setAbsorbTick] = useState(0);
  useEffect(() => subscribeAnchorHeld(setAnchorHeld), []);
  useEffect(() => subscribeAnchorAbsorb(() => setAbsorbTick((n) => n + 1)), []);

  // `--atlas-dock-height` stays STABLE at 64px (consumers that float ABOVE the
  // dock — overlays, action sheets — anchor to it and must not oscillate).
  // `--atlas-dock-reserved` tracks the dock's currently-occupied vertical
  // space: 64px when visible, 18px (peek crescent) when collapsed. Workspace
  // content uses this for padding-bottom so freed space collapses naturally
  // when the dock hides, instead of leaving a dead void above the footer.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--atlas-dock-height", "64px");
  }, []);
  useEffect(() => {
    if (typeof document === "undefined") return;
    // During handoff hydration, keep reserved height frozen at peek so
    // footer/composer/safe-area don't incrementally reflow.
    if (handoffChromeLocked) {
      document.documentElement.style.setProperty(
        "--atlas-dock-reserved",
        HANDOFF_LOCKED_DOCK_RESERVED_PX,
      );
      return;
    }
    // Apply reserved-height in lockstep with the dock's own translateY
    // transition (240ms). The consumer padding-bottom transition matches
    // duration + easing so the composer and the dock move together —
    // no void between the collapsing footer and the composer's bottom edge.
    const target = dockVisible ? "64px" : "18px";
    document.documentElement.style.setProperty("--atlas-dock-reserved", target);
  }, [dockVisible, handoffChromeLocked]);

  useEffect(() => {
    if (showAtlasHub) {
      // Double RAF ensures CSS transition fires after DOM insertion
      requestAnimationFrame(() => requestAnimationFrame(() => setHubOpen(true)));
    } else {
      setHubOpen(false);
    }
  }, [showAtlasHub]);

  const closeHub = () => {
    setHubOpen(false);
    setTimeout(() => setShowAtlasHub(false), 320);
  };

  // Track last visited project so short-hold can return to it.
  useEffect(() => {
    const m = location.match(/^\/project\/(\d+)/);
    if (m) {
      try { localStorage.setItem(LAST_PROJECT_KEY, m[1]); } catch {}
    }
  }, [location]);

  // Bridge: desktop CommandPalette dispatches these events; dock fulfils them
  // with the same callbacks the mobile radial launcher uses. Single source of
  // truth for what each launcher action does.
  useEffect(() => {
    // Decisions + Settings still resolve via page-supplied callbacks because
    // they have real destinations everywhere (Ledger page / profile sheet).
    // Files / Conversations / Search / Capture are owned by global launchers
    // mounted in UnifiedShell — they MUST NOT fall back to per-page handlers,
    // which historically caused silent routes back to Home.
    const onDecisions = () => props.onDecisions?.();
    const onSettings = () => props.onYou?.();
    window.addEventListener("axiom:launcher-decisions", onDecisions);
    window.addEventListener("axiom:launcher-settings", onSettings);
    return () => {
      window.removeEventListener("axiom:launcher-decisions", onDecisions);
      window.removeEventListener("axiom:launcher-settings", onSettings);
    };
  }, [props.onDecisions, props.onYou]);

  const pressStartTime = useRef<number>(0);
  const longPressTimer = useRef<number | null>(null);
  const didLongPress = useRef(false);

  const pulseCenter = () => {
    if (typeof document === "undefined") return;
    const el = document.querySelector<HTMLButtonElement>(".udock-center");
    if (!el) return;
    el.classList.remove("udock-center-pulse");
    void el.offsetWidth;
    el.classList.add("udock-center-pulse");
  };

  const fireTap = () => {
    try { (navigator as any).vibrate?.(12); } catch {}
    pulseCenter();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("atlas:focus-composer"));
    }
    onAtlasCore();
  };

  const goToProjects = () => {
    try { (navigator as any).vibrate?.(28); } catch {}
    if (typeof window === "undefined") return;
    try { window.dispatchEvent(new CustomEvent("axiom:close-project-menu")); } catch {}
    setLocation("/projects");
    window.setTimeout(() => {
      if (window.location.pathname !== "/projects") {
        window.location.href = "/projects";
      }
    }, 150);
  };

  const goToLastProject = () => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(LAST_PROJECT_KEY); } catch {}
    const numId = id ? Number(id) : NaN;
    const exists = !Number.isNaN(numId) && projects.some((p: any) => p.id === numId && !p.archived);
    if (!exists) {
      // No valid recent project — fall back to projects list.
      try { localStorage.removeItem(LAST_PROJECT_KEY); } catch {}
      goToProjects();
      return;
    }
    try { (navigator as any).vibrate?.(18); } catch {}
    try { window.dispatchEvent(new CustomEvent("axiom:close-project-menu")); } catch {}
    setLocation(`/project/${numId}`);
    window.setTimeout(() => {
      if (!window.location.pathname.startsWith(`/project/${numId}`)) {
        window.location.href = `/project/${numId}`;
      }
    }, 150);
  };

  const startLongPress = () => {
    pressStartTime.current = Date.now();
    didLongPress.current = false;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      didLongPress.current = true;
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const resolveLongPress = (): boolean => {
    cancelLongPress();
    const duration = Date.now() - pressStartTime.current;
    if (duration >= 900) {
      try { (navigator as any).vibrate?.([35]); } catch {}
      setShowAtlasHub(true);
      return true;
    }
    if (duration >= 350) {
      // Medium-press dead zone: suppress tap, take no action.
      return true;
    }
    return false;
  };

  const suppressNextClick = useRef(false);
  const handleAtlasPointerUp = () => {
    if (resolveLongPress()) {
      suppressNextClick.current = true;
    }
  };
  const handleAtlasClick = () => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }
    if (!dockVisible) {
      dockVisibility.peek();
      return;
    }
    if (window.matchMedia("(hover: hover)").matches) {
      fireTap();
    }
  };





  let left: Slot[] = [];
  let right: Slot[] = [];

  if (mode === "ambient") {
    left = [
      { id: "home", label: "Home", icon: ICONS.home, onClick: props.onHome, active: true },
      { id: "projects", label: "Projects", icon: ICONS.projects, onClick: props.onProjects },
    ];
    right = [
      { id: "decisions", label: "Decisions", icon: ICONS.decisions, onClick: props.onDecisions },
      { id: "you", label: "You", icon: ICONS.you, onClick: props.onYou },
    ];
  } else if (mode === "active") {
    left = [
      { id: "map", label: "Map", icon: ICONS.map, onClick: props.onMap },
      { id: "files", label: "Files", icon: ICONS.files, onClick: props.onFiles },
    ];
    right = [
      { id: "decisions", label: "Decisions", icon: ICONS.decisions, onClick: props.onDecisions },
      { id: "parking", label: "Parking", icon: ICONS.ledger, onClick: () => setLocation("/parking-lot") },
    ];
  } else {
    const at = props.activeOperationalTab;
    left = [
      { id: "chat", label: "Chat", icon: ICONS.chat, onClick: props.onChat, active: at === "chat" },
      {
        id: "ledger",
        label: "Ledger",
        icon: ICONS.ledger,
        onClick: props.onLedger,
        active: at === "ledger",
        badge: props.entryCount && props.entryCount > 0 ? props.entryCount : undefined,
      },
    ];
    right = [
      { id: "insights", label: "Insights", icon: ICONS.insights, onClick: props.onInsights ?? props.onManifest, active: at === "insights" },
      { id: "flow", label: "Map", icon: ICONS.map, onClick: props.onFlow, active: at === "map" },
    ];
  }

  const renderSlot = (s: Slot) => {
    const color = s.active ? "var(--atlas-gold)" : "var(--atlas-muted)";
    return (
      <button
        key={s.id}
        onClick={s.onClick}
        aria-label={s.label}
        className="udock-slot"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
          background: "none",
          border: "none",
          cursor: s.onClick ? "pointer" : "default",
          padding: "6px 0",
          position: "relative",
          color,
          WebkitTapHighlightColor: "transparent",
          transition: "color var(--motion-fast) var(--ease-standard), transform var(--motion-instant) var(--ease-standard)",
        }}
      >
        <span style={{ position: "relative", display: "inline-flex", lineHeight: 0 }}>
          {s.icon}
          {(s.badge !== undefined || s.alert) && (
            <span
              style={{
                position: "absolute",
                top: -5,
                right: -8,
                minWidth: 14,
                height: 14,
                borderRadius: 7,
                background: s.alert ? "var(--atlas-ember)" : "color-mix(in srgb, var(--atlas-gold) 85%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 8,
                fontFamily: "var(--app-font-mono)",
                color: "#fff",
                fontWeight: 700,
                padding: "0 3px",
                boxShadow: s.alert
                  ? "0 0 8px rgba(146,64,14,0.6)"
                  : "0 0 0 2px var(--atlas-bg)",
              }}
            >
              {s.badge !== undefined ? (s.badge > 9 ? "9+" : String(s.badge)) : "!"}
            </span>
          )}
        </span>
        <span
          style={{
            fontSize: "var(--ts-micro)",
            fontFamily: "var(--app-font-mono)",
            letterSpacing: "var(--ls-mono-cap)",
            lineHeight: 1,
            textTransform: "uppercase",
            fontWeight: s.active ? 700 : 500,
          }}
        >
          {s.label}
        </span>
      </button>
    );
  };

  return (
    <div
      data-dock-mode={mode}
      data-dock-visible={dockVisible ? "true" : "false"}
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        pointerEvents: "auto",
        overflow: "visible",
        transform: dockVisible ? "translateY(0)" : "translateY(calc(100% - 18px))",
        transition: "transform 240ms cubic-bezier(.32,.72,0,1)",
        willChange: "transform",
      }}
    >
      <style>{`
        .udock-slot:active { transform: scale(0.92); }
        .udock-slot:hover { color: var(--atlas-gold) !important; opacity: 1 !important; }
        .udock-slot:focus-visible { outline: 2px solid var(--atlas-gold); outline-offset: 2px; border-radius: 8px; color: var(--atlas-gold) !important; }
        .udock-center:active { transform: translateY(0) scale(0.94); }
        .udock-center:focus-visible { outline: 2px solid var(--atlas-gold); outline-offset: 4px; }
        .udock-center:hover { box-shadow: 1px 1px 0 1px color-mix(in srgb, var(--atlas-gold) 12%, transparent), 0 0 28px color-mix(in srgb, var(--atlas-gold) 55%, transparent), 0 4px 12px rgba(0,0,0,0.5) !important; }
        @keyframes udockCenterPulse {
          0%   { box-shadow: 0 0 20px rgba(var(--atlas-gold-rgb),0.3), 0 4px 12px rgba(0,0,0,0.5); transform: translateY(0) scale(1); }
          35%  { box-shadow: 0 0 0 10px rgba(var(--atlas-gold-rgb),0.35), 0 0 36px rgba(var(--atlas-gold-rgb),0.75), 0 4px 12px rgba(0,0,0,0.5); transform: translateY(0) scale(1.06); }
          100% { box-shadow: 0 0 0 0 rgba(var(--atlas-gold-rgb),0), 0 0 20px rgba(var(--atlas-gold-rgb),0.3), 0 4px 12px rgba(0,0,0,0.5); transform: translateY(0) scale(1); }
        }
        .udock-center-pulse { animation: udockCenterPulse 520ms var(--ease-standard); }
        [data-dock-visible="false"] .udock-slot { pointer-events: none; opacity: 0; transition: opacity 200ms ease; }
        [data-dock-visible="true"] .udock-slot { transition: opacity 240ms ease 80ms; }
        [data-dock-visible="false"] .udock-center {
          box-shadow: 0 0 18px rgba(var(--atlas-gold-rgb),0.55), 0 0 36px rgba(var(--atlas-gold-rgb),0.25) !important;
        }
      `}</style>

      {/* Corner tap targets — only when the dock is hidden, so the user can
          expand it on surfaces with nothing to scroll. When visible, we do
          NOT add tap zones near the dock — they intercept taps meant for the
          CHAT / MAP / center icons. To collapse: swipe up, or tap the
          background content area. */}
      {!dockVisible && ["left", "right"].map((side) => (
        <button
          key={side}
          type="button"
          aria-label="Expand navigation dock"
          onClick={(e) => {
            e.stopPropagation();
            try { (navigator as any).vibrate?.(10); } catch {}
            dockVisibility.toggleManual();
          }}
          style={{
            position: "fixed",
            bottom: 0,
            [side]: 0,
            width: 56,
            height: 56,
            zIndex: 1000,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          } as React.CSSProperties}
        />
      ))}

      {/* Arch — fixed-width center dimple, flanks fill remaining width */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 64,
          display: "flex",
          pointerEvents: "none",
        }}
        aria-hidden
      >
        <div
          style={{
            flex: 1,
            background: "var(--atlas-nav-arch-fill, rgb(var(--atlas-bg-rgb)))",
            borderTop: "1px solid var(--atlas-gold-border)",
          }}
        />
        <svg
          width="94"
          height="64"
          viewBox="0 0 94 64"
          style={{ display: "block", overflow: "visible", flexShrink: 0 }}
        >
          <path
            d="M0,0 C15,0 24,22 47,22 C70,22 79,0 94,0 L94,64 L0,64 Z"
            fill="var(--atlas-nav-arch-fill, rgb(var(--atlas-bg-rgb)))"
          />
          <path
            d="M0,0.5 C15,0.5 24,22 47,22 C70,22 79,0.5 94,0.5"
            fill="none"
            stroke="var(--atlas-gold-border)"
            strokeWidth="1"
          />
        </svg>
        <div
          style={{
            flex: 1,
            background: "var(--atlas-nav-arch-fill, rgb(var(--atlas-bg-rgb)))",
            borderTop: "1px solid var(--atlas-gold-border)",
          }}
        />
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          height: 64,
          paddingBottom: "max(env(safe-area-inset-bottom), 6px)",
          zIndex: 1,
        }}
      >
        {left.map(renderSlot)}

        {/* Center — Atlas Core anchor */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "relative", width: 56, height: 56, marginTop: -26 }}>
            {/* Breathing halo — only while composer has a draft or Atlas is pending. */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                inset: -10,
                borderRadius: "50%",
                pointerEvents: "none",
                background: "radial-gradient(circle, rgba(201,162,76,0.28) 0%, rgba(201,162,76,0.12) 45%, rgba(201,162,76,0) 72%)",
                animation: anchorHeld ? "atlasAnchorBreathe 2400ms ease-in-out infinite" : undefined,
                opacity: anchorHeld ? undefined : 0,
                transition: "opacity 320ms ease",
              }}
            />
            {/* Contained absorb ripple — bounded strictly inside the ring. */}
            <span
              key={absorbTick}
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                pointerEvents: "none",
                overflow: "hidden",
              }}
            >
              {absorbTick > 0 && (
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(212,175,55,0.55) 0%, rgba(212,175,55,0.25) 42%, rgba(212,175,55,0) 72%)",
                    animation: "atlasAnchorAbsorb 400ms cubic-bezier(0.1, 0.8, 0.3, 1) forwards",
                    transformOrigin: "50% 50%",
                  }}
                />
              )}
            </span>
            <button
              title="Atlas Core — tap to focus chat, hold 900ms to open Atlas Hub"
              aria-label="Atlas Core. Tap to focus chat. Hold 900ms or right-click to open Atlas Hub."
              className="udock-center"
              onClick={handleAtlasClick}
              onTouchStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
                startLongPress();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!resolveLongPress()) fireTap();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                cancelLongPress();
                setShowAtlasHub(true);
              }}
              onKeyDown={(e) => {
                if (e.repeat) return;
                if (e.key === "Enter" && e.shiftKey) {
                  e.preventDefault();
                  cancelLongPress();
                  setShowAtlasHub(true);
                } else if (e.key === " " || e.key === "Spacebar") {
                  e.preventDefault();
                  startLongPress();
                }
              }}
              onKeyUp={(e) => {
                if (e.key === " " || e.key === "Spacebar") {
                  e.preventDefault();
                  if (!resolveLongPress()) fireTap();
                } else if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  fireTap();
                }
              }}
              style={{
                position: "absolute",
                inset: 0,
                width: 56,
                height: 56,
                borderRadius: "50%",
                border: "2px solid var(--atlas-gold)",
                background: "var(--atlas-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
                boxShadow: "0 0 20px rgba(var(--atlas-gold-rgb),0.3), 0 4px 12px rgba(0,0,0,0.5)",
                transition: "transform var(--motion-fast) var(--ease-standard), box-shadow var(--motion-base) var(--ease-standard)",
                WebkitTapHighlightColor: "transparent",
                touchAction: "none",
              }}
            >
              <div style={{ width: 52, height: 52, borderRadius: "50%", overflow: "hidden" }}>
                <AxiomCenterSVG />
              </div>
            </button>
          </div>
        </div>

        {right.map(renderSlot)}
      </div>

      {/* Anchor animation keyframes */}
      <style>{`
        @keyframes atlasAnchorBreathe {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50%      { opacity: 0.85; transform: scale(1.06); }
        }
        @keyframes atlasAnchorAbsorb {
          0%   { opacity: 0; transform: scale(0.15); }
          35%  { opacity: 1; }
          100% { opacity: 0; transform: scale(1.05); }
        }
      `}</style>

      {/* Atlas Command — radial launcher portal */}
      {showAtlasHub && typeof document !== "undefined" && createPortal(
        (() => {
          const RADIUS = 116;
          // Six utilities, 60° apart. All open as overlays/drawers — never navigate away from the current surface.
          // Layout:        Search (top)
          //          Capture   Decisions
          //                Atlas
          //       Conversations   Files
          //              Settings (bottom)
          const ITEMS: { label: string; angleDeg: number; color: string; icon: ReactNode; action: () => void }[] = [
            {
              label: "Search",
              angleDeg: -90,
              color: "#10B981",
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" /></svg>,
              action: () => { setShowAtlasHub(false); window.dispatchEvent(new CustomEvent("axiom:open-search")); },
            },
            {
              label: "Decisions",
              angleDeg: -30,
              color: "#D4AF37",
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>,
              action: () => { setShowAtlasHub(false); props.onDecisions?.(); },
            },
            {
              label: "Files",
              angleDeg: 30,
              color: "#3B82F6",
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
              action: () => { setShowAtlasHub(false); window.dispatchEvent(new CustomEvent("axiom:launcher-files")); },
            },
            {
              label: "Settings",
              angleDeg: 90,
              color: "#9CA3AF",
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
              action: () => { setShowAtlasHub(false); props.onYou?.(); },
            },
            {
              label: "Ask Joy",
              angleDeg: 150,
              color: "#D4AF37",
              icon: <span style={{ fontFamily: "var(--app-font-serif, Georgia, serif)", fontWeight: 600, fontSize: 15, lineHeight: 1, letterSpacing: "-0.02em", opacity: 0.92, filter: "drop-shadow(0 0 2.5px rgba(212,175,55,0.22))" }}>A</span>,
              action: () => {
                setShowAtlasHub(false);
                const onHome = location === "/home" || location === "/";
                if (!onHome) {
                  setLocation("/home");
                  window.setTimeout(() => {
                    window.dispatchEvent(new CustomEvent("axiom:ask-atlas"));
                    window.dispatchEvent(new Event("atlas:focus-composer"));
                  }, 60);
                } else {
                  window.dispatchEvent(new CustomEvent("axiom:ask-atlas"));
                  window.dispatchEvent(new Event("atlas:focus-composer"));
                }
              },
            },
            {
              label: "Capture",
              angleDeg: -150,
              color: "#EC4899",
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
              action: () => { setShowAtlasHub(false); window.dispatchEvent(new CustomEvent("axiom:launcher-capture")); },
            },
          ];


          return (
            <>
              <style>{`
                @keyframes hubScrimIn { from { opacity: 0 } to { opacity: 1 } }
                @keyframes hubScrimOut { from { opacity: 1 } to { opacity: 0 } }
                .hub-scrim { animation: ${hubOpen ? "hubScrimIn" : "hubScrimOut"} 280ms ease forwards; }
                @keyframes hubCenterIn { from { transform: scale(0.7); opacity: 0 } to { transform: scale(1); opacity: 1 } }
                @keyframes hubCenterOut { from { transform: scale(1); opacity: 1 } to { transform: scale(0.7); opacity: 0 } }
                .hub-center { animation: ${hubOpen ? "hubCenterIn" : "hubCenterOut"} 260ms cubic-bezier(0.34,1.56,0.64,1) forwards; }
              `}</style>

              {/* Scrim */}
              <div
                className="hub-scrim"
                onClick={closeHub}
                style={{
                  position: "fixed", inset: 0, zIndex: 2000,
                  background: "rgba(4,3,6,0.82)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              />

              {/* Radial stage — centered on screen, lifted clear of safe-area dock */}
              <div style={{
                position: "fixed",
                left: 0, right: 0,
                top: 0,
                bottom: "calc(env(safe-area-inset-bottom, 0px) + 124px)",
                zIndex: 2001,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}>
                {/* Orbital tracks — ultra-thin guide rings for spatial depth */}
                <div style={{
                  position: "absolute",
                  width: RADIUS * 2 + 60,
                  height: RADIUS * 2 + 60,
                  borderRadius: "50%",
                  border: "1px solid rgba(255,255,255,0.05)",
                  pointerEvents: "none",
                  opacity: hubOpen ? 1 : 0,
                  transition: "opacity 400ms ease 80ms",
                }} />
                <div style={{
                  position: "absolute",
                  width: RADIUS * 2 - 8,
                  height: RADIUS * 2 - 8,
                  borderRadius: "50%",
                  border: "1px solid rgba(255,255,255,0.035)",
                  pointerEvents: "none",
                  opacity: hubOpen ? 1 : 0,
                  transition: "opacity 500ms ease 140ms",
                }} />

                {/* Radial items */}
                {ITEMS.map((item, i) => {
                  const rad = (item.angleDeg * Math.PI) / 180;
                  const tx = Math.round(RADIUS * Math.cos(rad));
                  const ty = Math.round(RADIUS * Math.sin(rad));
                  const delay = hubOpen ? i * 30 : (ITEMS.length - 1 - i) * 22;
                  return (
                    <div
                      key={item.label}
                      style={{
                        position: "absolute",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 14,
                        pointerEvents: "auto",
                        transform: hubOpen
                          ? `translate(${tx}px, ${ty}px) scale(1)`
                          : `translate(0px, 0px) scale(0)`,
                        opacity: hubOpen ? 1 : 0,
                        transition: `transform 380ms cubic-bezier(0.34,1.42,0.64,1) ${delay}ms, opacity 240ms ease ${delay}ms`,
                        willChange: "transform, opacity",
                      }}
                    >
                      <button
                        type="button"
                        onClick={item.action}
                        style={{
                          width: 52, height: 52,
                          borderRadius: "50%",
                          // Transparent vessel — the aura, not a hard ring, defines the node
                          background: "transparent",
                          backdropFilter: "blur(14px)",
                          WebkitBackdropFilter: "blur(14px)",
                          border: "none",
                          // Volumetric drop-glow tinted by the icon's color signature
                          boxShadow: `0 0 24px 2px ${item.color}33, 0 0 56px 8px ${item.color}1A, inset 0 0 18px ${item.color}14`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: item.color,
                          transition: "transform 160ms ease, box-shadow 200ms ease",
                          WebkitTapHighlightColor: "transparent",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "scale(1.10)";
                          e.currentTarget.style.boxShadow = `0 0 32px 4px ${item.color}55, 0 0 72px 12px ${item.color}26, inset 0 0 22px ${item.color}22`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "scale(1)";
                          e.currentTarget.style.boxShadow = `0 0 24px 2px ${item.color}33, 0 0 56px 8px ${item.color}1A, inset 0 0 18px ${item.color}14`;
                        }}
                        onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.94)"; }}
                        onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1.10)"; }}
                      >
                        {item.icon}
                      </button>
                      <span style={{
                        fontSize: 8.5,
                        fontFamily: "var(--app-font-mono)",
                        fontWeight: 500,
                        letterSpacing: "0.22em",
                        color: "rgba(255,255,255,0.55)",
                        textTransform: "uppercase",
                        textAlign: "center",
                        lineHeight: 1.25,
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                        textShadow: "0 1px 12px rgba(0,0,0,0.95)",
                        marginTop: 2,
                      }}>
                        {item.label}
                      </span>
                    </div>
                  );
                })}

                {/* Central anchor — soft layered ambient halo, no hard ring */}
                <div style={{
                  position: "absolute",
                  width: 200, height: 200,
                  borderRadius: "50%",
                  pointerEvents: "none",
                  background: "radial-gradient(circle at 50% 50%, rgba(212,175,55,0.15) 0%, rgba(212,175,55,0.08) 28%, rgba(212,175,55,0.025) 55%, rgba(212,175,55,0) 78%)",
                  opacity: hubOpen ? 1 : 0,
                  transition: "opacity 500ms ease 80ms",
                  filter: "blur(2px)",
                }} />
                <button
                  className="hub-center"
                  type="button"
                  onClick={closeHub}
                  style={{
                    position: "absolute",
                    width: 68, height: 68,
                    borderRadius: "50%",
                    border: "none",
                    background: "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    pointerEvents: "auto",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <div style={{ width: 64, height: 64, borderRadius: "50%", overflow: "hidden" }}>
                    <AxiomCenterSVG size={64} />
                  </div>
                </button>
              </div>

              {/* Dismiss hint — elegant whisper anchored above the dock, clear of nodes */}
              <div style={{
                position: "fixed",
                bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
                left: 0, right: 0,
                textAlign: "center",
                zIndex: 2002,
                pointerEvents: "none",
                opacity: hubOpen ? 1 : 0,
                transition: "opacity 400ms ease 300ms",
              }}>
                <span style={{
                  fontSize: 8.5,
                  fontFamily: "var(--app-font-mono)",
                  fontWeight: 400,
                  letterSpacing: "0.28em",
                  color: "rgba(255,255,255,0.30)",
                  textTransform: "uppercase",
                  textShadow: "0 1px 10px rgba(0,0,0,0.8)",
                }}>
                  Tap outside or center to close
                </span>
              </div>
            </>
          );
        })(),
        document.body
      )}

    </div>
  );
}

