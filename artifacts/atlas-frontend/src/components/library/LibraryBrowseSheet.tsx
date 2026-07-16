import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { LibrarySurface } from "./LibrarySurface";

/**
 * Global Library browse sheet — same visual language as Atlas Focus,
 * mounts shared LibrarySurface in browse mode (no attach requirement).
 */
export interface LibraryBrowseSheetProps {
  open: boolean;
  onClose: () => void;
  onOpenConversation?: (
    conversationId: string,
    meta: { projectId: number | null; originSource: string },
  ) => void;
  onOpenProject?: (projectId: number) => void;
}

export function LibraryBrowseSheet({
  open,
  onClose,
  onOpenConversation,
  onOpenProject,
}: LibraryBrowseSheetProps) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) { setEntered(false); return; }
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 13000,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: entered ? "blur(4px)" : "none",
        WebkitBackdropFilter: entered ? "blur(4px)" : "none",
        opacity: entered ? 1 : 0,
        transition: "opacity 140ms ease, backdrop-filter 180ms ease",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        role="dialog"
        aria-label="Library"
        style={{
          width: "100%", maxWidth: 680,
          background: "var(--atlas-surface, #0d0d0d)",
          border: "1px solid var(--atlas-border, rgba(255,255,255,0.08))",
          borderBottom: "none",
          borderRadius: "16px 16px 0 0",
          maxHeight: "82vh",
          display: "flex", flexDirection: "column",
          transform: entered ? "translateY(0)" : "translateY(24px)",
          opacity: entered ? 1 : 0,
          transition: "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1) 60ms, opacity 200ms ease 60ms",
          willChange: "transform, opacity",
        }}
      >
        <div style={{
          padding: "16px 20px 12px",
          borderBottom: "1px solid var(--atlas-border, rgba(255,255,255,0.07))",
          flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{
              fontFamily: "var(--app-font-mono)", fontSize: 11, letterSpacing: "0.12em",
              textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.7,
            }}>
              Library
            </div>
            <div style={{
              marginTop: 4, fontSize: 12, color: "var(--atlas-muted)", opacity: 0.55,
              fontFamily: "var(--app-font-sans)",
            }}>
              Saved across Axiom
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer", color: "var(--atlas-muted)", opacity: 0.5, lineHeight: 1 }}
            aria-label="Close"
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 0 24px" }}>
          <LibrarySurface
            mode="browse"
            active={open}
            onOpenConversation={onOpenConversation}
            onOpenProject={onOpenProject}
            onClose={onClose}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
