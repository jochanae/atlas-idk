import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useListProjects } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useDockVisibility, dockVisibility } from "@/hooks/useDockVisibility";

const LAST_PROJECT_KEY = "atlas-last-project-id";

/**
 * UnifiedContextDock
 *
 * Single context dock shared across the unified surface. Depth-adaptive:
 *   ambient      — broad nav (Home, Projects, A, Decisions, You)
 *   active       — contextual tools (Map, Files, A, Decisions, Forge)
 *   operational  — workspace tools (Chat, Ledger, A, Preview, Flow)
 *
 * The center "A" is the persistent Atlas Core anchor — it returns focus
 * to the conversation spine. It never opens Forge directly.
 *
 * Visual language (arch SVG + raised circular A + 4 flanking icon buttons)
 * is preserved from the existing home bottom nav / CockpitBar so swapping
 * in this dock does not change the look.
 *
 * Behavior is purely cosmetic + callback routing. No chat, API, or route
 * decisions live here.
 */
export type DockMode = "ambient" | "active" | "operational";
export type OperationalTab = "chat" | "ledger" | "manifest" | "map" | "files";

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
      <polygon points="256,130 178,390 216,390 268,188" fill="url(#udockgs)" />
      <polygon points="256,130 334,390 296,390 244,188" fill="url(#udockgs)" />
      <rect x="192" y="292" width="128" height="30" rx="5" fill="url(#udockgs)" />
    </svg>
  );
}

export function UnifiedContextDock(props: UnifiedContextDockProps) {
  const { mode, onAtlasCore } = props;
  const [location, setLocation] = useLocation();
  const { data: projectsRaw } = useListProjects();
  const projects = Array.isArray(projectsRaw) ? projectsRaw : [];
  const dockVisible = useDockVisibility();
  const [showAtlasHub, setShowAtlasHub] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);

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
      { id: "manifest", label: "Manifest", icon: ICONS.manifest, onClick: props.onManifest, active: at === "manifest" },
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
    <>
    <button
      type="button"
      aria-label={dockVisible ? "Hide navigation dock" : "Show navigation dock"}
      title={dockVisible ? "Hide dock" : "Show dock"}
      onClick={(e) => {
        e.stopPropagation();
        try { (navigator as any).vibrate?.(10); } catch {}
        dockVisibility.toggleManual();
      }}
      style={{
        position: "fixed",
        right: 10,
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${dockVisible ? 72 : 14}px)`,
        zIndex: 1001,
        width: 28,
        height: 28,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "color-mix(in oklab, var(--atlas-bg) 78%, transparent)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: "1px solid var(--atlas-gold-border)",
        color: "var(--atlas-gold)",
        boxShadow: "0 4px 14px rgba(0,0,0,0.45), 0 0 12px rgba(var(--atlas-gold-rgb),0.18)",
        cursor: "pointer",
        opacity: dockVisible ? 0.55 : 0.95,
        transition: "bottom 240ms cubic-bezier(.32,.72,0,1), opacity 200ms ease, transform 120ms ease",
        WebkitTapHighlightColor: "transparent",
        padding: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "scale(1.06)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = dockVisible ? "0.55" : "0.95"; e.currentTarget.style.transform = "scale(1)"; }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: dockVisible ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 220ms ease" }}>
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
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
              width: 56,
              height: 56,
              borderRadius: "50%",
              border: "2px solid var(--atlas-gold)",
              background: "var(--atlas-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              marginTop: -26,
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

        {right.map(renderSlot)}
      </div>

      {/* Atlas Command — radial launcher portal */}
      {showAtlasHub && typeof document !== "undefined" && createPortal(
        (() => {
          const RADIUS = 148;
          const ITEMS: { label: string; angleDeg: number; color: string; icon: ReactNode; action: () => void }[] = [
            {
              label: "Resume",
              angleDeg: -90,
              color: "#8B5CF6",
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>,
              action: () => { setShowAtlasHub(false); window.dispatchEvent(new CustomEvent("atlas:focus-composer")); onAtlasCore(); },
            },
            {
              label: "Parking Lot",
              angleDeg: -90 + 360 / 7,
              color: "#6366F1",
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 17V7h5a3 3 0 010 6H9" /></svg>,
              action: () => { setShowAtlasHub(false); setLocation("/parking-lot"); },
            },
            {
              label: "Search",
              angleDeg: -90 + (360 / 7) * 2,
              color: "#10B981",
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" /></svg>,
              action: () => { setShowAtlasHub(false); window.dispatchEvent(new CustomEvent("axiom:open-search")); },
            },
            {
              label: "Projects",
              angleDeg: -90 + (360 / 7) * 3,
              color: "#3B82F6",
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="9" y1="5" x2="9" y2="19"/></svg>,
              action: () => { setShowAtlasHub(false); setLocation("/projects"); },
            },
            {
              label: "New Project",
              angleDeg: -90 + (360 / 7) * 4,
              color: "#22C55E",
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
              action: () => { setShowAtlasHub(false); window.dispatchEvent(new CustomEvent("axiom:new-project")); },
            },
            {
              label: "Brain Dump",
              angleDeg: -90 + (360 / 7) * 5,
              color: "#EC4899",
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>,
              action: () => { setShowAtlasHub(false); window.dispatchEvent(new CustomEvent("axiom:brain-dump")); },
            },
            {
              label: "Global Insights",
              angleDeg: -90 + (360 / 7) * 6,
              color: "#14B8A6",
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>,
              action: () => { setShowAtlasHub(false); setLocation("/"); window.dispatchEvent(new CustomEvent("axiom:home-reset")); },
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

              {/* Radial stage — centered on screen, shifted up slightly to clear dock */}
              <div style={{
                position: "fixed",
                left: 0, right: 0,
                top: 0, bottom: 64,
                zIndex: 2001,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}>
                {/* Orbital ring */}
                <div style={{
                  position: "absolute",
                  width: RADIUS * 2 + 60,
                  height: RADIUS * 2 + 60,
                  borderRadius: "50%",
                  border: "1px solid rgba(201,162,76,0.10)",
                  pointerEvents: "none",
                  opacity: hubOpen ? 1 : 0,
                  transition: "opacity 400ms ease 80ms",
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
                        gap: 6,
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
                          background: `radial-gradient(circle at 40% 35%, ${item.color}22, ${item.color}09)`,
                          backdropFilter: "blur(16px)",
                          WebkitBackdropFilter: "blur(16px)",
                          border: `1px solid ${item.color}55`,
                          boxShadow: `0 0 0 1px ${item.color}22, 0 4px 24px ${item.color}30, inset 0 1px 0 rgba(255,255,255,0.08)`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: item.color,
                          transition: "transform 120ms ease, box-shadow 120ms ease",
                          WebkitTapHighlightColor: "transparent",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "scale(1.12)";
                          e.currentTarget.style.boxShadow = `0 0 0 1px ${item.color}44, 0 6px 32px ${item.color}55, inset 0 1px 0 rgba(255,255,255,0.12)`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "scale(1)";
                          e.currentTarget.style.boxShadow = `0 0 0 1px ${item.color}22, 0 4px 24px ${item.color}30, inset 0 1px 0 rgba(255,255,255,0.08)`;
                        }}
                        onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.92)"; }}
                        onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1.12)"; }}
                      >
                        {item.icon}
                      </button>
                      <span style={{
                        fontSize: 9.5,
                        fontFamily: "var(--app-font-mono)",
                        fontWeight: 600,
                        letterSpacing: "0.07em",
                        color: "rgba(255,255,255,0.72)",
                        textTransform: "uppercase",
                        textAlign: "center",
                        lineHeight: 1.25,
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                        textShadow: "0 1px 8px rgba(0,0,0,0.9)",
                      }}>
                        {item.label}
                      </span>
                    </div>
                  );
                })}

                {/* Central anchor */}
                <button
                  className="hub-center"
                  type="button"
                  onClick={closeHub}
                  style={{
                    position: "absolute",
                    width: 68, height: 68,
                    borderRadius: "50%",
                    border: "2px solid var(--atlas-gold)",
                    background: "var(--atlas-bg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    pointerEvents: "auto",
                    boxShadow: "0 0 0 8px rgba(201,162,76,0.08), 0 0 40px rgba(201,162,76,0.35), 0 0 80px rgba(201,162,76,0.12)",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <div style={{ width: 64, height: 64, borderRadius: "50%", overflow: "hidden" }}>
                    <AxiomCenterSVG size={64} />
                  </div>
                </button>
              </div>

              {/* Dismiss hint */}
              <div style={{
                position: "fixed",
                bottom: "max(env(safe-area-inset-bottom), 80px)",
                left: 0, right: 0,
                textAlign: "center",
                zIndex: 2001,
                pointerEvents: "none",
                opacity: hubOpen ? 0.38 : 0,
                transition: "opacity 400ms ease 300ms",
              }}>
                <span style={{ fontSize: 10, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "#fff", textTransform: "uppercase" }}>
                  Tap outside or center to close
                </span>
              </div>
            </>
          );
        })(),
        document.body
      )}

    </div>
    </>
  );
}

