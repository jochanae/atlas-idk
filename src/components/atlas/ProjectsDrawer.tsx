import { useEffect } from "react";
import { Plus, X, Folder } from "lucide-react";

export type DrawerProject = {
  id: string;
  name: string;
  thumbnailUrl?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  projects: DrawerProject[];
  activeProjectId?: string | null;
  onOpenProject: (id: string) => void;
  onNewProject: () => void;
};

/**
 * ProjectsDrawer — minimal slide-over from the header folder icon.
 * Single-column list of projects with 44px squircle thumbnails.
 * Built primarily for desktop access where there is no other entry point
 * to project switching besides the header.
 */
export function ProjectsDrawer({
  open,
  onClose,
  projects,
  activeProjectId,
  onOpenProject,
  onNewProject,
}: Props) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(2px)",
          zIndex: 90,
        }}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-label="Projects"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "min(85vw, 320px)",
          background: "var(--surface, var(--background))",
          borderRight: "1px solid color-mix(in oklab, var(--accent-gold) 14%, var(--border))",
          boxShadow: "8px 0 32px -8px rgba(0,0,0,0.45)",
          zIndex: 91,
          display: "flex",
          flexDirection: "column",
          animation: "atlas-projects-in 220ms cubic-bezier(.2,.8,.2,1)",
        }}
      >
        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid color-mix(in oklab, var(--accent-gold) 10%, var(--border))",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.02em",
              color: "var(--foreground)",
            }}
          >
            <Folder size={15} strokeWidth={1.6} />
            Projects
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close projects"
            style={{
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--foreground)",
              cursor: "pointer",
            }}
          >
            <X size={15} strokeWidth={1.6} />
          </button>
        </header>

        {/* New project */}
        <div style={{ padding: "10px 12px 6px" }}>
          <button
            type="button"
            onClick={() => {
              onNewProject();
              onClose();
            }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px dashed color-mix(in oklab, var(--accent-gold) 35%, var(--border))",
              background: "color-mix(in oklab, var(--accent-gold) 6%, transparent)",
              color: "color-mix(in oklab, var(--accent-gold) 80%, var(--foreground))",
              fontFamily: "Inter, sans-serif",
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <Plus size={14} strokeWidth={1.8} />
            New project
          </button>
        </div>

        {/* List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "6px 8px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {projects.length === 0 ? (
            <div
              style={{
                padding: "24px 12px",
                fontFamily: "Inter, sans-serif",
                fontSize: 12,
                color: "var(--muted-text, var(--muted-foreground))",
                textAlign: "center",
                lineHeight: 1.6,
              }}
            >
              No projects yet.
            </div>
          ) : (
            projects.map((p) => {
              const isActive = p.id === activeProjectId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onOpenProject(p.id);
                    onClose();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid transparent",
                    background: isActive
                      ? "color-mix(in oklab, var(--accent-gold) 10%, transparent)"
                      : "transparent",
                    color: "var(--foreground)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 140ms ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "color-mix(in oklab, var(--accent-gold) 5%, transparent)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  {/* 44px squircle thumbnail */}
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      flexShrink: 0,
                      background: p.thumbnailUrl
                        ? `center/cover url(${p.thumbnailUrl})`
                        : "linear-gradient(135deg, color-mix(in oklab, var(--accent-gold) 28%, var(--surface)) 0%, var(--surface) 100%)",
                      border: "1px solid color-mix(in oklab, var(--accent-gold) 18%, var(--border))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "Inter, sans-serif",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "color-mix(in oklab, var(--accent-gold) 80%, var(--foreground))",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {!p.thumbnailUrl && (p.name?.[0]?.toUpperCase() || "•")}
                  </div>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: "Inter, sans-serif",
                      fontSize: 13,
                      fontWeight: isActive ? 600 : 500,
                      letterSpacing: "0.005em",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.name}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <style>{`
        @keyframes atlas-projects-in {
          from { transform: translateX(-12px); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
      `}</style>
    </>
  );
}
