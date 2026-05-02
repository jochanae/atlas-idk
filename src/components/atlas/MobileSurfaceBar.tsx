import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { haptic } from "@/lib/haptics";

type Surface = "chat" | "ledger" | "preview";

export type BuildState = "idle" | "thinking" | "building" | "verifying";

type Props = {
  active: Surface;
  onChange: (s: Surface) => void;
  /** Live build state — drives the streaming indicator */
  buildState?: BuildState;
};

const SURFACES: Array<{ id: Surface; label: string; icon: ReactNode }> = [
  {
    id: "chat",
    label: "Chat",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12V4a1 1 0 011-1h10a1 1 0 011 1v6a1 1 0 01-1 1H5l-3 3z" />
      </svg>
    ),
  },
  {
    id: "ledger",
    label: "Ledger",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2h8a1 1 0 011 1v10l-3-2-2 2-2-2-3 2V3a1 1 0 011-1z" />
        <path d="M6 6h4M6 9h2" />
      </svg>
    ),
  },
  {
    id: "preview",
    label: "Workshop",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 3.5h11v9h-11z" />
        <path d="M5.5 3.5v9M2.5 6.5h11" />
      </svg>
    ),
  },
];

const BUILD_LABELS: Record<BuildState, string> = {
  idle: "",
  thinking: "Thinking…",
  building: "Building…",
  verifying: "Verifying…",
};

const BUILD_COLORS: Record<BuildState, string> = {
  idle: "transparent",
  thinking: "var(--accent-gold)",
  building: "var(--ember)",
  verifying: "var(--phosphor)",
};

export function MobileSurfaceBar({ active, onChange, buildState = "idle" }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [animating, setAnimating] = useState<"in" | "out" | null>(null);

  useEffect(() => {
    if (expanded) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating("in")));
    } else if (mounted) {
      setAnimating("out");
      const timer = setTimeout(() => { setMounted(false); setAnimating(null); }, 200);
      return () => clearTimeout(timer);
    }
  }, [expanded]);

  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeSurface = SURFACES.find((s) => s.id === active) ?? SURFACES[0];
  const isWorking = buildState !== "idle";

  // Close on outside click or Escape
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpanded(false);
        triggerRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setExpanded(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [expanded]);

  // Focus the active surface button when panel opens
  useEffect(() => {
    if (expanded && panelRef.current) {
      const activeBtn = panelRef.current.querySelector<HTMLButtonElement>(
        `[data-surface="${active}"]`,
      );
      activeBtn?.focus();
    }
  }, [expanded, active]);

  return (
    <div
      className="atlas-mobile-surface-bar"
      style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      {/* Collapsed: breadcrumb + build state + ghost toggle */}
      <button
        ref={triggerRef}
        aria-expanded={expanded}
        aria-controls="atlas-surface-panel"
        aria-label={`Current section: ${activeSurface.label}${isWorking ? `, ${BUILD_LABELS[buildState]}` : ""}. Toggle navigation.`}
        onClick={() => {
          setExpanded((o) => !o);
          haptic("light");
        }}
        className="atlas-surface-trigger"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 12px",
          borderRadius: 10,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          transition: "all 160ms ease",
        }}
      >
        {/* Streaming state pulse dot */}
        {isWorking && (
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: BUILD_COLORS[buildState],
              boxShadow: `0 0 8px ${BUILD_COLORS[buildState]}`,
              animation: "atlas-state-pulse 1.8s ease-in-out infinite",
              flexShrink: 0,
            }}
          />
        )}

        {/* Always show the active surface label so Workshop is discoverable */}
        <span
          aria-hidden="true"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: isWorking ? BUILD_COLORS[buildState] : "var(--accent-gold)",
            opacity: isWorking ? 0.85 : 0.7,
            transition: "opacity 160ms ease, color 160ms ease",
          }}
        >
          {isWorking ? BUILD_LABELS[buildState] : activeSurface.label}
        </span>

        <ChevronDown
          aria-hidden="true"
          size={10}
          strokeWidth={1.5}
          style={{
            color: "var(--accent-gold)",
            opacity: 0.5,
            transform: expanded ? "rotate(180deg)" : "rotate(0)",
            transition: "transform 220ms cubic-bezier(.2,.8,.2,1)",
          }}
        />
      </button>

      {/* Glass slide-down panel — stays mounted during exit transition */}
      {mounted && (
        <div
          ref={panelRef}
          id="atlas-surface-panel"
          role="tablist"
          aria-label="Workspace sections"
          aria-hidden={!expanded}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: "50%",
            display: "flex",
            gap: 2,
            padding: "6px 8px",
            borderRadius: 14,
            background: "var(--glass-bg)",
            backdropFilter: "blur(var(--glass-blur)) saturate(140%)",
            WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(140%)",
            border: "0.5px solid var(--glass-border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(212,175,55,0.06)",
            zIndex: 60,
            transformOrigin: "top center",
            transform: animating === "in"
              ? "translateX(-50%) translateY(0) scale(1)"
              : "translateX(-50%) translateY(-6px) scale(0.95)",
            opacity: animating === "in" ? 1 : 0,
            transition: "transform 200ms cubic-bezier(.2,.8,.2,1), opacity 200ms cubic-bezier(.2,.8,.2,1)",
            pointerEvents: animating === "in" ? "auto" : "none",
          }}
        >
          {SURFACES.map((s) => {
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={isActive}
                aria-label={`${s.label} section`}
                data-surface={s.id}
                tabIndex={isActive ? 0 : -1}
                onKeyDown={(e) => {
                  const idx = SURFACES.findIndex((x) => x.id === s.id);
                  let nextIdx = -1;
                  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                    nextIdx = (idx + 1) % SURFACES.length;
                  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                    nextIdx = (idx - 1 + SURFACES.length) % SURFACES.length;
                  } else if (e.key === "Home") {
                    nextIdx = 0;
                  } else if (e.key === "End") {
                    nextIdx = SURFACES.length - 1;
                  }
                  if (nextIdx >= 0) {
                    e.preventDefault();
                    const nextSurface = SURFACES[nextIdx];
                    panelRef.current
                      ?.querySelector<HTMLButtonElement>(`[data-surface="${nextSurface.id}"]`)
                      ?.focus();
                  }
                }}
                onClick={() => {
                  onChange(s.id);
                  setExpanded(false);
                  triggerRef.current?.focus();
                  haptic("light");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "6px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: isActive
                    ? "color-mix(in oklab, var(--accent-gold) 12%, transparent)"
                    : "transparent",
                  color: isActive ? "var(--accent-gold)" : "var(--muted-text)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "all 160ms ease",
                  minHeight: 34,
                }}
              >
                {s.icon}
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Live region announces section and build state changes */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isWorking
          ? `${BUILD_LABELS[buildState]} — ${activeSurface.label} section`
          : `${activeSurface.label} section active`}
      </div>
    </div>
  );
}
