import { useEffect, useRef, useState, type ReactNode } from "react";

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
export type OperationalTab = "chat" | "ledger" | "preview" | "map" | "files";

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
  onForge?: () => void;

  // operational
  onChat?: () => void;
  onLedger?: () => void;
  onPreview?: () => void;
  onFlow?: () => void;
  activeOperationalTab?: OperationalTab;

  // badges (operational ledger)
  entryCount?: number;
  activeCatch?: boolean;
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
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

  const [sheetOpen, setSheetOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

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

  const goToLastConversation = () => {
    try { (navigator as any).vibrate?.(28); } catch {}
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    const projectMatch = path.match(/^\/project\/([^/]+)/);
    const lastProject = projectMatch?.[1] || localStorage.getItem("atlas:lastProjectId");
    if (lastProject && !projectMatch) {
      // Jump back into the last active conversation
      window.location.assign(`/project/${lastProject}`);
    } else {
      // Already in the active conversation, or none exists — open the conversations panel
      window.location.assign("/projects");
    }
  };

  const startLongPress = () => {
    longPressFired.current = false;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      goToLastConversation();
    }, 480);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const handleAtlasClick = () => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    fireTap();
  };

  // Close sheet on Escape
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSheetOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const goVariant = (target: "ambient" | "active" | "operational") => {
    setSheetOpen(false);
    try { (navigator as any).vibrate?.(10); } catch {}
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    const projectMatch = path.match(/^\/project\/([^/]+)/);
    const lastProject = projectMatch?.[1] || localStorage.getItem("atlas:lastProjectId");
    if (projectMatch) localStorage.setItem("atlas:lastProjectId", projectMatch[1]);

    if (target === "ambient") {
      window.location.assign("/home");
    } else if (target === "active") {
      // Active = Home with composer focused
      if (path === "/home" || path === "/") {
        window.dispatchEvent(new CustomEvent("atlas:focus-composer"));
      } else {
        sessionStorage.setItem("atlas:focusComposerOnLoad", "1");
        window.location.assign("/home");
      }
    } else {
      // Operational = workspace chat
      if (lastProject) {
        if (projectMatch) {
          window.dispatchEvent(new CustomEvent("atlas:focus-composer"));
        } else {
          window.location.assign(`/project/${lastProject}`);
        }
      } else {
        window.location.assign("/projects");
      }
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
      { id: "forge", label: "Forge", icon: ICONS.forge, onClick: props.onForge },
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
        alert: props.activeCatch,
      },
    ];
    right = [
      { id: "preview", label: "Preview", icon: ICONS.preview, onClick: props.onPreview, active: at === "preview" },
      { id: "flow", label: "Flow", icon: ICONS.map, onClick: props.onFlow, active: at === "map" },
    ];
  }

  const renderSlot = (s: Slot) => {
    const color = s.active
      ? "rgba(212,175,55,0.9)"
      : "rgba(120,113,108,0.55)";
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
                background: s.alert ? "var(--atlas-ember)" : "rgba(201,162,76,0.85)",
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
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        overflow: "visible",
      }}
    >
      <style>{`
        .udock-slot:active { transform: scale(0.92); }
        .udock-slot:hover { color: rgba(212,175,55,0.75) !important; }
        .udock-slot:focus-visible { outline: 2px solid rgba(212,175,55,0.85); outline-offset: 2px; border-radius: 8px; color: rgba(212,175,55,0.95) !important; }
        .udock-center:active { transform: translateY(0) scale(0.94); }
        .udock-center:focus-visible { outline: 2px solid rgba(212,175,55,0.95); outline-offset: 4px; }
        .udock-center:hover { box-shadow: 0 0 0 6px rgba(212,175,55,0.12), 0 0 28px rgba(212,175,55,0.55), 0 4px 12px rgba(0,0,0,0.5) !important; }
        @keyframes udockCenterPulse {
          0%   { box-shadow: 0 0 20px rgba(var(--atlas-gold-rgb),0.3), 0 4px 12px rgba(0,0,0,0.5); transform: translateY(0) scale(1); }
          35%  { box-shadow: 0 0 0 10px rgba(212,175,55,0.35), 0 0 36px rgba(212,175,55,0.75), 0 4px 12px rgba(0,0,0,0.5); transform: translateY(0) scale(1.06); }
          100% { box-shadow: 0 0 0 0 rgba(212,175,55,0), 0 0 20px rgba(var(--atlas-gold-rgb),0.3), 0 4px 12px rgba(0,0,0,0.5); transform: translateY(0) scale(1); }
        }
        .udock-center-pulse { animation: udockCenterPulse 520ms var(--ease-standard); }
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
            background: "var(--atlas-nav-arch-fill, rgba(var(--atlas-bg-rgb),0.97))",
            borderTop: "1px solid rgba(212,175,55,0.18)",
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
            fill="var(--atlas-nav-arch-fill, rgba(var(--atlas-bg-rgb),0.97))"
          />
          <path
            d="M0,0.5 C15,0.5 24,22 47,22 C70,22 79,0.5 94,0.5"
            fill="none"
            stroke="rgba(212,175,55,0.2)"
            strokeWidth="1"
          />
        </svg>
        <div
          style={{
            flex: 1,
            background: "var(--atlas-nav-arch-fill, rgba(var(--atlas-bg-rgb),0.97))",
            borderTop: "1px solid rgba(212,175,55,0.18)",
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
            title="Atlas Core — Enter to focus chat, hold or Shift+Enter to switch surface"
            aria-label="Atlas Core. Press Enter to focus chat. Hold or press Shift+Enter to switch surface."
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            className="udock-center"
            onClick={handleAtlasClick}
            onPointerDown={startLongPress}
            onPointerUp={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onPointerCancel={cancelLongPress}
            onContextMenu={(e) => { e.preventDefault(); longPressFired.current = true; setSheetOpen(true); }}
            onKeyDown={(e) => {
              if (e.repeat) return;
              if (e.key === "Enter" && e.shiftKey) {
                e.preventDefault();
                longPressFired.current = true;
                setSheetOpen(true);
              } else if (e.key === " " || e.key === "Spacebar") {
                e.preventDefault();
                startLongPress();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Spacebar") {
                e.preventDefault();
                const fired = longPressFired.current;
                cancelLongPress();
                if (!fired) fireTap();
                longPressFired.current = false;
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                fireTap();
              }
            }}
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              border: "2px solid #D4AF37",
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
              touchAction: "manipulation",
            }}
          >
            <div style={{ width: 52, height: 52, borderRadius: "50%", overflow: "hidden" }}>
              <AxiomCenterSVG />
            </div>
          </button>
        </div>

        {right.map(renderSlot)}
      </div>

      {sheetOpen && (
        <>
          <div
            onClick={() => setSheetOpen(false)}
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(4px)", zIndex: 250,
              animation: "udockFade 180ms var(--ease-standard) both",
            }}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label="Switch surface"
            style={{
              position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 260,
              padding: "16px 16px calc(env(safe-area-inset-bottom) + 88px)",
              animation: "udockSlideUp 220ms var(--ease-standard) both",
            }}
          >
            <div
              style={{
                maxWidth: 480, margin: "0 auto",
                background: "var(--atlas-bg)",
                border: "1px solid rgba(212,175,55,0.25)",
                borderRadius: 18,
                boxShadow: "0 20px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.4)",
                overflow: "hidden",
              }}
            >
              <div style={{
                padding: "14px 18px 6px",
                fontFamily: "var(--app-font-mono)",
                fontSize: "var(--ts-micro)",
                letterSpacing: "var(--ls-mono-cap)",
                textTransform: "uppercase",
                color: "rgba(212,175,55,0.7)",
              }}>Switch surface</div>
              {(() => {
                const hasLastProject = typeof window !== "undefined" && !!localStorage.getItem("atlas:lastProjectId");
                const rows = [
                  { id: "ambient", title: "Ambient", subtitle: "Home · open thinking field", action: "Return to home" },
                  { id: "active", title: "Active", subtitle: "A conversation in motion", action: "Open a focused thread" },
                  { id: "operational", title: "Operational", subtitle: "Project workspace · build & ledger", action: hasLastProject ? "Open last project" : "Choose a project" },
                ];
                return rows.map((opt) => {
                  const isCurrent = opt.id === mode;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => !isCurrent && goVariant(opt.id as "ambient" | "active" | "operational")}
                      disabled={isCurrent}
                      aria-current={isCurrent ? "true" : undefined}
                      style={{
                        display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
                        gap: 12, padding: "14px 18px",
                        background: "none", border: "none", textAlign: "left",
                        cursor: isCurrent ? "default" : "pointer",
                        borderTop: "1px solid rgba(212,175,55,0.08)",
                        color: "var(--atlas-text, #E8E4DD)",
                        WebkitTapHighlightColor: "transparent",
                        opacity: isCurrent ? 0.65 : 1,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>{opt.title}</div>
                        <div style={{ fontSize: 12, color: "rgba(168,162,158,0.85)", marginTop: 2 }}>{opt.subtitle}</div>
                        {!isCurrent && (
                          <div style={{
                            fontFamily: "var(--app-font-mono)", fontSize: 10,
                            letterSpacing: "var(--ls-mono-cap)", textTransform: "uppercase",
                            color: "rgba(212,175,55,0.75)", marginTop: 6,
                          }}>{opt.action} →</div>
                        )}
                      </div>
                      {isCurrent ? (
                        <span style={{
                          fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "var(--ls-mono-cap)",
                          textTransform: "uppercase", color: "rgba(212,175,55,0.9)",
                          padding: "3px 8px", border: "1px solid rgba(212,175,55,0.35)", borderRadius: 999,
                          flexShrink: 0,
                        }}>You're here</span>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                          stroke="rgba(212,175,55,0.7)" strokeWidth="1.75"
                          strokeLinecap="round" strokeLinejoin="round"
                          style={{ flexShrink: 0 }} aria-hidden>
                          <polyline points="9 6 15 12 9 18" />
                        </svg>
                      )}
                    </button>
                  );
                });
              })()}
              <button
                onClick={() => setSheetOpen(false)}
                style={{
                  display: "block", width: "100%", padding: "14px 18px",
                  background: "rgba(0,0,0,0.25)", border: "none", borderTop: "1px solid rgba(212,175,55,0.12)",
                  color: "rgba(168,162,158,0.85)", cursor: "pointer",
                  fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)",
                  letterSpacing: "var(--ls-mono-cap)", textTransform: "uppercase",
                }}
              >Cancel</button>
            </div>
          </div>
          <style>{`
            @keyframes udockFade { from { opacity: 0; } to { opacity: 1; } }
            @keyframes udockSlideUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          `}</style>
        </>
      )}
    </div>
  );
}

