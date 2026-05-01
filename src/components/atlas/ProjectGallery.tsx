import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence, useDragControls, type PanInfo } from "framer-motion";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { X, Star, ExternalLink, MoreHorizontal, FolderOpen, Plus } from "lucide-react";
import type { Project } from "@/lib/atlas";

/**
 * ProjectGallery — card-style grid of all projects.
 *
 * Display logic:
 *  - Mobile (< 660px): Bottom sheet, 90vh, drag handle, glassmorphism
 *  - Z Fold outer (< 660px): Same bottom sheet
 *  - Z Fold unfolded (660–1023px): Grid modal
 *  - Desktop/Tablet (≥ 768px except Z Fold outer): Centered modal overlay
 */

interface Props {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onNewProject: () => void;
}

export function ProjectGallery({ open, onClose, projects, activeProjectId, onSelectProject }: Props) {
  const isDesktopOrTablet = useMediaQuery("(min-width: 768px)");
  const isZFoldUnfolded = useMediaQuery("(min-width: 660px) and (max-width: 1023px)");

  // Z Fold unfolded → modal grid; mobile → bottom sheet; desktop → modal
  const useSheet = !isDesktopOrTablet && !isZFoldUnfolded;

  return (
    <AnimatePresence>
      {open && (
        useSheet
          ? <GalleryBottomSheet onClose={onClose} projects={projects} activeProjectId={activeProjectId} onSelectProject={onSelectProject} />
          : <GalleryModal onClose={onClose} projects={projects} activeProjectId={activeProjectId} onSelectProject={onSelectProject} />
      )}
    </AnimatePresence>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Bottom Sheet (mobile / Z Fold outer)                       */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function GalleryBottomSheet({ onClose, projects, activeProjectId, onSelectProject }: Omit<Props, "open">) {
  const sheetRef = useRef<HTMLDivElement>(null);

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      if (info.offset.y > 120 || info.velocity.y > 400) onClose();
    },
    [onClose],
  );

  return (
    <>
      {/* Scrim */}
      <motion.div
        className="fixed inset-0 z-50"
        style={{ background: "rgba(0,0,0,0.6)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        ref={sheetRef}
        className="fixed left-0 right-0 bottom-0 z-50 flex flex-col"
        style={{
          height: "90vh",
          background: "rgba(5,5,5,0.92)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(201,162,76,0.3)",
          borderRadius: "20px 20px 0 0",
        }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 36 }}
        drag="y"
        dragConstraints={{ top: 0 }}
        dragElastic={0.15}
        onDragEnd={handleDragEnd}
      >
        {/* Drag handle */}
        <div className="flex-shrink-0 flex justify-center py-3">
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(201,162,76,0.45)" }} />
        </div>

        <SheetHeader onClose={onClose} count={projects.length} />

        {/* Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-8">
          <div className="grid grid-cols-2 gap-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                active={p.id === activeProjectId}
                onSelect={() => { onSelectProject(p.id); onClose(); }}
              />
            ))}
          </div>
          {projects.length === 0 && <EmptyState />}
        </div>
      </motion.div>
    </>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Modal (desktop / tablet / Z Fold unfolded)                  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function GalleryModal({ onClose, projects, activeProjectId, onSelectProject }: Omit<Props, "open">) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* Scrim */}
      <motion.div
        className="fixed inset-0 z-50"
        style={{ background: "rgba(0,0,0,0.55)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
      >
        <div
          className="pointer-events-auto flex flex-col w-full max-w-4xl"
          style={{
            maxHeight: "80vh",
            background: "#050505",
            border: "1px solid rgba(201,162,76,0.3)",
            borderRadius: 16,
            boxShadow: "0 0 40px 4px rgba(201,162,76,0.08), 0 24px 80px rgba(0,0,0,0.6)",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Project Gallery"
        >
          <SheetHeader onClose={onClose} count={projects.length} />

          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  active={p.id === activeProjectId}
                  onSelect={() => { onSelectProject(p.id); onClose(); }}
                />
              ))}
            </div>
            {projects.length === 0 && <EmptyState />}
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Shared sub-components                                       */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function SheetHeader({ onClose, count }: { onClose: () => void; count: number }) {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b"
      style={{ borderColor: "rgba(201,162,76,0.15)" }}
    >
      <div className="flex items-center gap-2.5">
        <FolderOpen size={16} style={{ color: "rgba(201,162,76,0.7)" }} />
        <span
          style={{
            fontFamily: "'Geist Sans', system-ui, sans-serif",
            fontSize: 14,
            fontWeight: 600,
            color: "rgba(232,228,221,0.9)",
          }}
        >
          My Projects
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 10,
            color: "rgba(201,162,76,0.45)",
            background: "rgba(201,162,76,0.08)",
            padding: "2px 8px",
            borderRadius: 6,
          }}
        >
          {count}
        </span>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="p-1.5 rounded-lg hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(201,162,76,0.6)]"
        aria-label="Close gallery"
      >
        <X size={16} style={{ color: "rgba(232,228,221,0.5)" }} />
      </button>
    </div>
  );
}

function ProjectCard({ project, active, onSelect }: { project: Project; active: boolean; onSelect: () => void }) {
  const [starred, setStarred] = useState(false);
  const statusColor = project.status === "published"
    ? "rgba(74,222,128,0.8)"
    : project.status === "building"
      ? "rgba(250,204,21,0.8)"
      : "rgba(201,162,76,0.35)";

  const timeAgo = formatRelativeTime(project.created_at);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group text-left rounded-xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(201,162,76,0.7)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]"
      style={{
        background: active ? "rgba(201,162,76,0.06)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${active ? "rgba(201,162,76,0.5)" : "rgba(201,162,76,0.15)"}`,
        overflow: "hidden",
      }}
    >
      {/* Thumbnail area — 16:10 aspect ratio */}
      <div
        className="relative w-full"
        style={{
          paddingTop: "62.5%", /* 10/16 = 62.5% */
          background: "linear-gradient(135deg, rgba(201,162,76,0.04), rgba(5,5,5,0.95))",
        }}
      >
        {/* Placeholder grid pattern */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(201,162,76,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(201,162,76,0.03) 1px, transparent 1px)
            `,
            backgroundSize: "20px 20px",
          }}
        />

        {/* Project initial glyph */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            style={{
              fontFamily: "'Geist Sans', system-ui, sans-serif",
              fontSize: 28,
              fontWeight: 700,
              color: "rgba(201,162,76,0.18)",
            }}
          >
            {project.name.charAt(0).toUpperCase()}
          </span>
        </div>

        {/* Star button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setStarred(!starred); }}
          className="absolute top-2 right-2 p-1 rounded-md transition-colors hover:bg-white/10"
          aria-label={starred ? "Unstar project" : "Star project"}
        >
          <Star
            size={14}
            fill={starred ? "rgba(250,204,21,0.9)" : "none"}
            stroke={starred ? "rgba(250,204,21,0.9)" : "rgba(232,228,221,0.3)"}
          />
        </button>

        {/* Status badge */}
        {project.status === "published" && (
          <span
            className="absolute bottom-2 left-2"
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 8,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: statusColor,
              background: "rgba(0,0,0,0.6)",
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            Published
          </span>
        )}
      </div>

      {/* Card footer */}
      <div className="px-3 py-2.5 flex items-start gap-2">
        {/* Avatar circle */}
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(201,162,76,0.3), rgba(201,162,76,0.1))",
            border: "1px solid rgba(201,162,76,0.2)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 1,
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(201,162,76,0.7)" }}>
            {project.name.charAt(0).toUpperCase()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="truncate"
            style={{
              fontFamily: "'Geist Sans', system-ui, sans-serif",
              fontSize: 12,
              fontWeight: 600,
              color: "rgba(232,228,221,0.85)",
            }}
          >
            {project.name}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 9,
              color: "rgba(232,228,221,0.35)",
              marginTop: 1,
            }}
          >
            {timeAgo}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="p-0.5 rounded" style={{ color: "rgba(232,228,221,0.3)" }}>
            <ExternalLink size={11} />
          </span>
          <span className="p-0.5 rounded" style={{ color: "rgba(232,228,221,0.3)" }}>
            <MoreHorizontal size={11} />
          </span>
        </div>
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <FolderOpen size={32} style={{ color: "rgba(201,162,76,0.2)", marginBottom: 12 }} />
      <p style={{ fontSize: 13, color: "rgba(232,228,221,0.5)" }}>No projects yet</p>
      <p style={{ fontSize: 11, color: "rgba(232,228,221,0.3)", marginTop: 4 }}>
        Create your first project to get started
      </p>
    </div>
  );
}

/* ── Time helper ── */

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `Edited ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Edited ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Edited ${days}d ago`;
  return `Edited ${new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`;
}
