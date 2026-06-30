import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ActiveRuns } from "./home/ActiveRuns";

export type ComposerSheetProject = { id: number; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  projects: ComposerSheetProject[];
};

/**
 * Atlas Composer, hosted as a bottom-anchored sheet opened from the project
 * drawer (Tools → Atlas Composer). Wraps <ActiveRuns/> so the composer form
 * AND any in-flight / completed runs render in one place.
 */
export function AtlasComposerSheet({ open, onClose, projects }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)",
          zIndex: 12100,
          animation: "atlas-composer-fade-in 180ms ease",
        }}
      />
      <aside
        role="dialog"
        aria-label="Atlas Composer"
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: 0,
          top: "max(env(safe-area-inset-top, 0px), 4vh)",
          width: "min(720px, 100vw)",
          backgroundColor: "var(--atlas-bg)",
          borderTop: "1px solid var(--atlas-gold-border)",
          borderLeft: "1px solid var(--atlas-gold-border)",
          borderRight: "1px solid var(--atlas-gold-border)",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          boxShadow: "0 -12px 60px -12px rgba(0,0,0,0.75), 0 0 0 1px rgba(201,162,76,0.06)",
          zIndex: 12101,
          display: "flex", flexDirection: "column",
          animation: "atlas-composer-slide-in 240ms cubic-bezier(.2,.8,.2,1)",
          overflow: "hidden",
        }}
      >
        {/* Drag handle */}
        <div style={{
          flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "8px 0 4px",
        }}>
          <div style={{
            width: 36, height: 3, borderRadius: 999,
            background: "rgba(201,162,76,0.25)",
          }} />
        </div>

        {/* Header */}
        <header style={{
          flexShrink: 0,
          padding: "6px 16px 12px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid var(--atlas-gold-border)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{
              fontSize: 9.5, fontWeight: 600,
              fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)",
              letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.7,
            }}>
              Atlas Composer
            </span>
            <span style={{
              fontSize: 10.5, color: "var(--atlas-muted)",
              fontFamily: "var(--app-font-sans)",
            }}>
              Start a build, decision, or thinking session
            </span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, border: "none",
              background: "transparent", color: "var(--atlas-muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </header>

        {/* Body */}
        <div style={{
          flex: 1, minHeight: 0, overflowY: "auto",
          padding: "16px",
          overscrollBehavior: "contain",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        }}>
          <ActiveRuns projects={projects} />
        </div>
      </aside>

      <style>{`
        @keyframes atlas-composer-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes atlas-composer-slide-in {
          from { transform: translate(-50%, 24px); opacity: 0; }
          to   { transform: translate(-50%, 0);    opacity: 1; }
        }
      `}</style>
    </>,
    document.body
  );
}
