import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronDown, Pencil, Settings, Archive, Copy } from "lucide-react";
import { MODES, ModeIcon, type ModeId } from "./AtlasFrontDoor";
import { haptic } from "@/lib/haptics";

type Surface = "chat" | "ledger" | "preview";

type Props = {
  projectName: string | null;
  sessionActive: boolean;
  onRename: (newName: string) => void;
  onOpenParking?: () => void;
  onNavigateLedger?: () => void;
  activeMode?: ModeId;
  onModeChange?: (mode: ModeId) => void;
  /** Surface navigation via long-press */
  activeSurface?: Surface;
  onSurfaceChange?: (s: Surface) => void;
};

const SURFACES: Array<{ id: Surface; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "ledger", label: "Ledger" },
  { id: "preview", label: "Preview" },
];

const HINT_STORAGE_KEY = "atlas-hold-hint-last-switch";
const HINT_COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48 hours

function shouldShowHint(): boolean {
  try {
    const last = localStorage.getItem(HINT_STORAGE_KEY);
    if (!last) return true;
    return Date.now() - Number(last) > HINT_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function recordSurfaceSwitch() {
  try {
    localStorage.setItem(HINT_STORAGE_KEY, String(Date.now()));
  } catch {}
}

export function ProjectHeaderCenter({
  projectName,
  sessionActive,
  onRename,
  onOpenParking,
  onNavigateLedger,
  activeMode,
  onModeChange,
  activeSurface,
  onSurfaceChange,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modeExpanded, setModeExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [surfacePanelOpen, setSurfacePanelOpen] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surfacePanelRef = useRef<HTMLDivElement>(null);

  const displayName = projectName || "Untitled";
  const isUntitled = !projectName || projectName === "Untitled";

  // Show ghost hint on mount if user hasn't switched surfaces recently
  useEffect(() => {
    if (!sessionActive) return;
    if (shouldShowHint()) {
      const t = setTimeout(() => setHintVisible(true), 1200);
      const t2 = setTimeout(() => setHintVisible(false), 6000);
      return () => { clearTimeout(t); clearTimeout(t2); };
    }
  }, [sessionActive]);

  // Close dropdown on outside click / Escape
  useEffect(() => {
    if (!dropdownOpen && !surfacePanelOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setSurfacePanelOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDropdownOpen(false);
        setSurfacePanelOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [dropdownOpen, surfacePanelOpen]);

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  const startRename = () => {
    setRenameValue(isUntitled ? "" : displayName);
    setRenaming(true);
    setDropdownOpen(false);
  };

  const submitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== projectName) {
      onRename(trimmed);
    }
    setRenaming(false);
  };

  // Long-press handlers
  const handlePointerDown = useCallback(() => {
    if (renaming) return;
    longPressTimer.current = setTimeout(() => {
      haptic("medium");
      setSurfacePanelOpen(true);
      setDropdownOpen(false);
      setHintVisible(false);
    }, 500);
  }, [renaming]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerCancel = handlePointerUp;

  const handleClick = useCallback(() => {
    // Only open dropdown if not coming from a long-press
    if (!surfacePanelOpen) {
      setDropdownOpen((o) => !o);
    }
  }, [surfacePanelOpen]);

  const handleSurfaceSelect = useCallback((s: Surface) => {
    onSurfaceChange?.(s);
    setSurfacePanelOpen(false);
    recordSurfaceSwitch();
    haptic("light");
  }, [onSurfaceChange]);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      {renaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={submitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--accent-gold)",
            borderRadius: 8,
            padding: "4px 10px",
            color: "var(--foreground)",
            fontSize: 13,
            fontWeight: 500,
            fontFamily: "inherit",
            outline: "none",
            width: 160,
            textAlign: "center",
            letterSpacing: "0.02em",
          }}
        />
      ) : (
        <button
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            background: "transparent",
            border: "none",
            padding: "4px 8px",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            borderRadius: 8,
            transition: "background 160ms ease",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          {sessionActive && (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#22C55E",
                boxShadow: "0 0 6px rgba(34,197,94,0.6)",
                animation: "atlas-pulse 2.4s ease-in-out infinite",
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "var(--foreground)",
              letterSpacing: "0.02em",
              maxWidth: 160,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </span>
          {activeMode && (() => {
            const modeInfo = MODES.find((x) => x.id === activeMode)!;
            const isPhosphor = modeInfo.color === "phosphor";
            const isGold = modeInfo.color === "accent-gold";
            const accent = isGold ? "var(--accent-gold)" : isPhosphor ? "var(--phosphor)" : "var(--ember)";
            return (
              <>
                <span style={{ color: "var(--muted-text)", opacity: 0.3, fontSize: 10, margin: "0 2px" }}>·</span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: accent,
                  }}
                >
                  <ModeIcon mode={activeMode} size={10} />
                  {modeInfo.label}
                </span>
              </>
            );
          })()}
          {isUntitled && (
            <Pencil
              size={11}
              strokeWidth={1.5}
              style={{ color: "var(--accent-gold)", flexShrink: 0 }}
            />
          )}
          <ChevronDown
            size={12}
            strokeWidth={1.5}
            style={{
              color: "var(--muted-text)",
              flexShrink: 0,
              transform: dropdownOpen ? "rotate(180deg)" : "rotate(0)",
              transition: "transform 200ms ease",
            }}
          />
        </button>
      )}

      {/* Ghost hint: HOLD TO NAVIGATE */}
      {sessionActive && hintVisible && !surfacePanelOpen && !dropdownOpen && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--accent-gold)",
            opacity: 0.55,
            marginTop: 2,
            animation: "atlas-hint-fade 4.8s ease forwards",
            pointerEvents: "none",
          }}
        >
          Hold to navigate
        </span>
      )}

      {/* Surface navigation panel (long-press triggered) */}
      {surfacePanelOpen && (
        <div
          ref={surfacePanelRef}
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 2,
            padding: "6px 8px",
            borderRadius: 14,
            background: "var(--glass-bg)",
            backdropFilter: "blur(var(--glass-blur)) saturate(140%)",
            WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(140%)",
            border: "0.5px solid var(--glass-border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(212,175,55,0.06)",
            zIndex: 90,
            animation: "atlas-menu-in 200ms cubic-bezier(.2,.8,.2,1)",
            transformOrigin: "top center",
          }}
        >
          {SURFACES.map((s) => {
            const isActive = activeSurface === s.id;
            return (
              <button
                key={s.id}
                onClick={() => handleSurfaceSelect(s.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "8px 16px",
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
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Regular Dropdown */}
      {dropdownOpen && !surfacePanelOpen && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            width: 220,
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--surface) 96%, transparent) 0%, color-mix(in oklab, var(--background) 92%, transparent) 100%)",
            backdropFilter: "blur(18px) saturate(140%)",
            WebkitBackdropFilter: "blur(18px) saturate(140%)",
            border: "1px solid color-mix(in oklab, var(--accent-gold) 18%, var(--border))",
            borderRadius: 12,
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 50px -16px rgba(0,0,0,0.6)",
            padding: 6,
            zIndex: 90,
            animation: "atlas-menu-in 220ms cubic-bezier(.2,.8,.2,1)",
            transformOrigin: "top center",
          }}
        >
          <DropdownItem icon={<Pencil size={13} />} label="Rename project" onClick={startRename} />
          <DropdownItem
            icon={<Settings size={13} />}
            label="Project settings"
            onClick={() => { setDropdownOpen(false); }}
            hint="Soon"
          />
          <DropdownItem
            icon={<Archive size={13} />}
            label="Parking Lot"
            onClick={() => { setDropdownOpen(false); onOpenParking?.(); }}
          />
          <DropdownItem
            icon={<Copy size={13} />}
            label="Clone project"
            onClick={() => { setDropdownOpen(false); }}
            hint="Soon"
          />
          <div
            style={{
              height: 1,
              margin: "6px 8px",
              background: "color-mix(in oklab, var(--accent-gold) 8%, var(--border))",
            }}
          />
          <DropdownItem
            icon={
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 13, height: 13, fontSize: 10, fontFamily: "var(--font-mono)",
                color: "var(--phosphor)",
              }}>
                ◈
              </span>
            }
            label="View ledger"
            onClick={() => { setDropdownOpen(false); onNavigateLedger?.(); }}
          />
          {activeMode && onModeChange && (
            <>
              <div
                style={{
                  height: 1,
                  margin: "6px 8px",
                  background: "color-mix(in oklab, var(--accent-gold) 8%, var(--border))",
                }}
              />
              <button
                type="button"
                onClick={() => { setModeExpanded((o) => !o); haptic("light"); }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "transparent",
                  border: "none",
                  color: "var(--foreground)",
                  fontFamily: "Inter, var(--font-sans)",
                  fontSize: 12.5,
                  cursor: "pointer",
                  transition: "background 160ms ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "color-mix(in oklab, var(--accent-gold) 8%, transparent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ display: "flex", alignItems: "center", color: "var(--muted-text)" }}>
                  <ModeIcon mode={activeMode} size={13} />
                </span>
                <span style={{ flex: 1, textAlign: "left" }}>Mode</span>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: (() => {
                    const mi = MODES.find((x) => x.id === activeMode)!;
                    return mi.color === "accent-gold" ? "var(--accent-gold)" : mi.color === "phosphor" ? "var(--phosphor)" : "var(--ember)";
                  })(),
                  marginRight: 4,
                }}>
                  {MODES.find((x) => x.id === activeMode)!.label}
                </span>
                <ChevronDown
                  size={10}
                  strokeWidth={1.5}
                  style={{
                    color: "var(--muted-text)",
                    transform: modeExpanded ? "rotate(180deg)" : "rotate(0)",
                    transition: "transform 200ms ease",
                  }}
                />
              </button>
              {modeExpanded && (
                <div style={{ padding: "2px 4px 4px" }}>
                  {MODES.map((mode) => {
                    const isActive = mode.id === activeMode;
                    const mp = mode.color === "phosphor";
                    const mg = mode.color === "accent-gold";
                    const c = mg ? "var(--accent-gold)" : mp ? "var(--phosphor)" : "var(--ember)";
                    return (
                      <button
                        key={mode.id}
                        onClick={() => { onModeChange(mode.id); setModeExpanded(false); setDropdownOpen(false); haptic("light"); }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          minHeight: 36,
                          padding: "6px 10px 6px 24px",
                          border: "none",
                          borderRadius: 8,
                          background: isActive ? "rgba(212, 175, 55, 0.08)" : "transparent",
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: isActive ? c : "var(--muted-text)",
                          cursor: "pointer",
                          transition: "background 120ms ease, color 120ms ease",
                        }}
                        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "color-mix(in oklab, var(--accent-gold) 6%, transparent)"; }}
                        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                      >
                        <ModeIcon mode={mode.id} size={12} />
                        {mode.label}
                        {isActive && (
                          <span style={{ marginLeft: "auto", fontSize: 10, opacity: 0.6 }}>✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 8,
        background: "transparent",
        border: "none",
        color: "var(--foreground)",
        fontFamily: "Inter, var(--font-sans)",
        fontSize: 12.5,
        cursor: "pointer",
        transition: "background 160ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "color-mix(in oklab, var(--accent-gold) 8%, transparent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ display: "flex", alignItems: "center", color: "var(--muted-text)" }}>{icon}</span>
      <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
      {hint && (
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.06em",
          color: "var(--muted-text)",
          opacity: 0.5,
          textTransform: "uppercase",
        }}>
          {hint}
        </span>
      )}
    </button>
  );
}
