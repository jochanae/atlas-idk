import { useState } from "react";
import { createPortal } from "react-dom";
import { useCreateEntry, getListEntriesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { buildParkedEntryPayload } from "@/lib/parking";

interface ParkSheetProject {
  id: number;
  name: string;
}

interface ParkSheetProps {
  projectId: number | null;
  projects: ParkSheetProject[];
  onClose: () => void;
  onOpenFull: () => void;
  onParked?: (content: string) => void;
}

export function ParkSheet({ projectId: initialProjectId, projects, onClose, onOpenFull, onParked }: ParkSheetProps) {
  const [content, setContent] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    initialProjectId ?? projects[0]?.id ?? null
  );
  const [status, setStatus] = useState<"idle" | "parking" | "done">("idle");
  const queryClient = useQueryClient();
  const createEntry = useCreateEntry();

  const activeProjectId = selectedProjectId ?? projects[0]?.id ?? null;

  const handlePark = async () => {
    const trimmed = content.trim();
    if (!trimmed || !activeProjectId || status === "parking") return;
    setStatus("parking");
    try {
      await createEntry.mutateAsync({
        projectId: activeProjectId,
        data: buildParkedEntryPayload(trimmed),
      });
      void queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey(activeProjectId, {}) });
      setStatus("done");
      onParked?.(trimmed);
      setTimeout(() => onClose(), 850);
    } catch {
      setStatus("idle");
    }
  };

  const portalHost = typeof document !== "undefined" ? document.body : null;
  if (!portalHost) return null;

  return createPortal(
    <>
      <style>{`
        @keyframes park-sheet-slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 260,
          background: "color-mix(in oklab, var(--atlas-bg, #0a0a0a) 64%, transparent)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 261,
          background: "var(--atlas-surface, #111)",
          borderTop: "1px solid var(--atlas-border, rgba(212,175,55,0.15))",
          borderRadius: "18px 18px 0 0",
          padding: "20px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
          maxWidth: 620,
          margin: "0 auto",
          boxShadow: "0 -24px 60px -24px rgba(201,162,76,0.12)",
          animation: "park-sheet-slide-up 210ms cubic-bezier(0.2,0,0,1)",
        }}
      >
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
            <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="var(--atlas-gold, #c9a24c)" strokeWidth="1.5" />
            <path d="M5.5 11V5h3.2a2.3 2.3 0 0 1 0 4.6H5.5" stroke="var(--atlas-gold, #c9a24c)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{
            fontFamily: "var(--app-font-mono, monospace)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--atlas-gold, #c9a24c)",
            opacity: 0.85,
          }}>
            Park for Later
          </span>

          {/* Project picker — only shown when parking from global context with multiple projects */}
          {initialProjectId === null && projects.length > 1 && (
            <select
              value={selectedProjectId ?? ""}
              onChange={(e) => setSelectedProjectId(Number(e.target.value))}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: "1px solid var(--atlas-border, rgba(212,175,55,0.15))",
                color: "var(--atlas-muted, rgba(255,255,255,0.45))",
                borderRadius: 6,
                padding: "3px 8px",
                fontSize: 10,
                fontFamily: "var(--app-font-mono, monospace)",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} style={{ background: "var(--atlas-bg, #0a0a0a)" }}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={onClose}
            style={{
              marginLeft: initialProjectId !== null || projects.length <= 1 ? "auto" : 0,
              background: "transparent",
              border: "none",
              color: "var(--atlas-muted, rgba(255,255,255,0.45))",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: "0 2px",
              opacity: 0.55,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Textarea */}
        <textarea
          autoFocus
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void handlePark();
            }
          }}
          placeholder="Park a thought — Atlas will analyze it when you come back…"
          disabled={status === "done"}
          rows={4}
          style={{
            width: "100%",
            background: "color-mix(in oklab, var(--atlas-fg, #fff) 4%, transparent)",
            border: "1px solid var(--atlas-border, rgba(212,175,55,0.15))",
            borderRadius: 10,
            color: "var(--atlas-fg, #e8e8e8)",
            fontFamily: "var(--app-font-sans, sans-serif)",
            fontSize: 14,
            lineHeight: 1.6,
            padding: "12px 14px",
            resize: "none",
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color 150ms",
            display: "block",
          }}
        />

        {/* Footer row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <button
            type="button"
            onClick={() => { onOpenFull(); onClose(); }}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--app-font-mono, monospace)",
              fontSize: 10,
              letterSpacing: "0.06em",
              color: "var(--atlas-gold, #c9a24c)",
              opacity: 0.55,
              padding: 0,
            }}
          >
            Open Parking Lot →
          </button>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontFamily: "var(--app-font-mono, monospace)",
              fontSize: 9,
              color: "var(--atlas-muted, rgba(255,255,255,0.3))",
              opacity: 0.6,
            }}>
              ⌘↵
            </span>
            <button
              type="button"
              onClick={() => void handlePark()}
              disabled={!content.trim() || !activeProjectId || status !== "idle"}
              style={{
                padding: "8px 20px",
                borderRadius: 8,
                border: "1px solid var(--atlas-gold, #c9a24c)",
                background: status === "done"
                  ? "rgba(100,200,100,0.1)"
                  : content.trim() && activeProjectId
                    ? "var(--atlas-gold, #c9a24c)"
                    : "transparent",
                color: status === "done"
                  ? "rgb(120,200,120)"
                  : content.trim() && activeProjectId
                    ? "var(--atlas-bg, #0a0a0a)"
                    : "var(--atlas-gold, #c9a24c)",
                cursor: !content.trim() || !activeProjectId || status !== "idle" ? "default" : "pointer",
                fontFamily: "var(--app-font-mono, monospace)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                opacity: !content.trim() || !activeProjectId ? 0.35 : 1,
                transition: "all 150ms",
              }}
            >
              {status === "parking" ? "Parking…" : status === "done" ? "✓ Parked" : "Park"}
            </button>
          </div>
        </div>
      </div>
    </>,
    portalHost
  );
}
