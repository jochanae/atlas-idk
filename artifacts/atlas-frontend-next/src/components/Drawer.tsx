import { useEffect } from "react";

/**
 * Drawer — minimal right-side modal used by AtlasReceipt for the
 * Details/Changes and Preview surfaces. Kept self-contained; no
 * portal library so the scaffold stays dependency-free.
 */
export function Drawer({
  open, title, onClose, children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.5)",
        display: "flex", justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)", height: "100%",
          background: "var(--panel)",
          borderLeft: "1px solid var(--border)",
          display: "flex", flexDirection: "column",
        }}
      >
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid var(--border)",
        }}>
          <strong style={{ fontSize: 13 }}>{title}</strong>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "1px solid var(--border)",
              color: "var(--muted)", borderRadius: 6, padding: "3px 8px",
              fontSize: 12, cursor: "pointer",
            }}
          >
            Close
          </button>
        </header>
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

/** Compact loading / empty / error shell used inside receipt panels. */
export function LoadShell({
  label, state, onRetry,
}: {
  label: string;
  state: "loading" | "empty" | "error" | "disconnected";
  onRetry?: () => void;
}) {
  const map = {
    loading: { color: "var(--muted)", text: `Loading ${label}…` },
    empty: { color: "var(--muted)", text: `No ${label} for this run.` },
    error: { color: "var(--fail)", text: `Couldn't load ${label}.` },
    disconnected: { color: "var(--warn)", text: `Disconnected — ${label} unavailable.` },
  }[state];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      fontSize: 12, color: map.color, padding: "8px 0",
    }}>
      {state === "loading" && <Spinner />}
      <span>{map.text}</span>
      {(state === "error" || state === "disconnected") && onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: "transparent", border: "1px solid var(--border)",
            color: "var(--text)", borderRadius: 6, padding: "2px 8px",
            fontSize: 11, cursor: "pointer",
          }}
        >Retry</button>
      )}
    </div>
  );
}

export function Spinner() {
  return (
    <span
      aria-label="loading"
      style={{
        display: "inline-block", width: 10, height: 10,
        borderRadius: 999,
        border: "1.5px solid var(--border)",
        borderTopColor: "var(--accent)",
        animation: "atlas-spin 0.8s linear infinite",
      }}
    />
  );
}
