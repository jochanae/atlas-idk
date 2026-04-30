import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pencil, Settings, Archive, Copy } from "lucide-react";
import { MODES, ModeIcon, type ModeId } from "./AtlasFrontDoor";
import { haptic } from "@/lib/haptics";

type Props = {
  projectName: string | null;
  sessionActive: boolean;
  onRename: (newName: string) => void;
  onOpenParking?: () => void;
  onNavigateLedger?: () => void;
  activeMode?: ModeId;
  onModeChange?: (mode: ModeId) => void;
};

export function ProjectHeaderCenter({
  projectName,
  sessionActive,
  onRename,
  onOpenParking,
  onNavigateLedger,
  activeMode,
  onModeChange,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);

  const displayName = projectName || "Untitled";
  const isUntitled = !projectName || projectName === "Untitled";

  // Close dropdown on outside click / Escape
  useEffect(() => {
    if (!dropdownOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDropdownOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [dropdownOpen]);

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

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
          onClick={() => setDropdownOpen((o) => !o)}
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
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          {/* Active session glow dot */}
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

      {/* Dropdown */}
      {dropdownOpen && (
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
            onClick={() => { setDropdownOpen(false); /* stub */ }}
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
            onClick={() => { setDropdownOpen(false); /* stub */ }}
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
