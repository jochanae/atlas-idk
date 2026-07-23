import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface ProjectOption {
  id: number;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  focusProjectId: number | null;
  projects: ProjectOption[];
  onSelectAllProjects: () => void;
  onSelectProject: (id: number) => void;
}

export function AskAtlasFocusSheet({
  open, onClose, focusProjectId, projects,
  onSelectAllProjects, onSelectProject,
}: Props) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) { setEntered(false); return; }
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: entered ? "blur(4px)" : "none",
        WebkitBackdropFilter: entered ? "blur(4px)" : "none",
        opacity: entered ? 1 : 0,
        transition: "opacity 140ms ease, backdrop-filter 180ms ease",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div style={{
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
      }}>
        <div style={{
          padding: "16px 20px 12px",
          borderBottom: "1px solid var(--atlas-border, rgba(255,255,255,0.07))",
          flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{
            fontFamily: "var(--app-font-mono)", fontSize: 11, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.7,
          }}>
            Joy focus
          </span>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer", color: "var(--atlas-muted)", opacity: 0.5, lineHeight: 1 }}
            aria-label="Close"
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 0 24px" }}>
          <button
            type="button"
            onClick={onSelectAllProjects}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", background: focusProjectId == null ? "color-mix(in oklab, var(--atlas-gold) 9%, transparent)" : "transparent", border: "none", cursor: "pointer", color: "var(--atlas-fg)", textAlign: "left", fontFamily: "var(--app-font-sans)", fontSize: 14 }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: focusProjectId == null ? "var(--atlas-gold)" : "rgba(201,162,76,0.45)", flexShrink: 0 }} />
            All Projects
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--atlas-muted)", opacity: 0.5 }}>General</span>
          </button>
          {projects.length === 0 && (
            <div style={{ padding: "16px 20px", fontSize: 12, color: "var(--atlas-muted)", opacity: 0.5, fontFamily: "var(--app-font-sans)" }}>
              No projects yet.
            </div>
          )}
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectProject(p.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", background: focusProjectId === p.id ? "color-mix(in oklab, var(--atlas-gold) 9%, transparent)" : "transparent", border: "none", cursor: "pointer", color: "var(--atlas-fg)", textAlign: "left", fontFamily: "var(--app-font-sans)", fontSize: 14 }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: focusProjectId === p.id ? "var(--atlas-gold)" : "rgba(201,162,76,0.45)", flexShrink: 0 }} />
              {p.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
