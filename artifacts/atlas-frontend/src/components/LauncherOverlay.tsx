// LauncherOverlay — shared obsidian-aesthetic shell used by the global
// launcher destinations (Files, Conversations). Keeps presentation in
// lockstep so each destination feels like the same surface family.

import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

export function LauncherOverlay({
  open,
  onClose,
  title,
  eyebrow,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 2400,
          background: "rgba(4,3,6,0.78)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      />
      <div
        role="dialog"
        aria-label={title}
        style={{
          position: "fixed",
          left: "50%", top: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 2401,
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "min(640px, calc(100vh - 80px - env(safe-area-inset-bottom, 0px)))",
          display: "flex", flexDirection: "column",
          background: "rgba(18,16,22,0.96)",
          border: "1px solid rgba(var(--atlas-gold-rgb),0.22)",
          borderRadius: 16,
          boxShadow: "0 28px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
          overflow: "hidden",
          fontFamily: "var(--app-font-sans)",
        }}
      >
        <header style={{
          padding: "18px 20px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          {eyebrow && (
            <div style={{
              fontFamily: "var(--app-font-mono)", fontSize: 9.5,
              letterSpacing: "0.22em", textTransform: "uppercase",
              color: "rgba(var(--atlas-gold-rgb),0.7)", marginBottom: 6,
            }}>
              {eyebrow}
            </div>
          )}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>
            <h2 style={{
              margin: 0, fontSize: 17, fontWeight: 500,
              color: "var(--atlas-fg)", letterSpacing: "0.01em",
            }}>{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                fontFamily: "var(--app-font-mono)", fontSize: 10,
                color: "rgba(255,255,255,0.55)", letterSpacing: "0.08em",
              }}
            >
              ESC
            </button>
          </div>
        </header>
        <div style={{
          flex: 1, overflowY: "auto",
          padding: "20px 20px calc(28px + env(safe-area-inset-bottom, 0px))",
        }}>
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}

export default LauncherOverlay;
