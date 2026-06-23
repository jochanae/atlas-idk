import { useState, useRef, useCallback, useEffect } from "react";
import { Trash2, Move, X } from "lucide-react";

export interface SlideOverlay {
  id: string;
  type: "image" | "shape" | "text";
  src: string;
  x: number;       // 0-1920
  y: number;       // 0-1080
  width: number;   // px in 1920x1080 space
  height: number;
  rotation?: number;
  opacity?: number;
  label?: string;
}

interface SlideOverlayLayerProps {
  overlays: SlideOverlay[];
  editable?: boolean;
  onUpdate?: (overlays: SlideOverlay[]) => void;
}

/** Get the CSS scale of the slide container */
function getContainerScale(el: HTMLElement | null): number {
  if (!el) return 1;
  const slideEl = el.closest('.slide-content') as HTMLElement | null;
  if (!slideEl) return 1;
  const scaleMatch = slideEl.style?.transform?.match(/scale\(([\d.]+)\)/);
  return scaleMatch ? parseFloat(scaleMatch[1]) : 1;
}

/**
 * Renders and optionally allows drag-positioning of overlay elements on
 * a 1920×1080 slide canvas. Must be placed inside a container that is
 * exactly 1920×1080 (i.e. inside ScaledSlide's inner div).
 */
export default function SlideOverlayLayer({ overlays, editable = false, onUpdate }: SlideOverlayLayerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    scale: number;
    dragging: boolean;
  } | null>(null);

  // Click/tap outside to deselect
  useEffect(() => {
    if (!selectedId || !editable) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(`[data-overlay-id="${selectedId}"]`)) return;
      setSelectedId(null);
    };
    // Small delay so the selection click doesn't immediately deselect
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
      document.addEventListener("touchstart", handler);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [selectedId, editable]);

  const updateOverlay = useCallback((id: string, updates: Partial<SlideOverlay>) => {
    if (!onUpdate) return;
    onUpdate(overlays.map(o => o.id === id ? { ...o, ...updates } : o));
  }, [overlays, onUpdate]);

  const handleDelete = useCallback((id: string) => {
    if (!onUpdate) return;
    onUpdate(overlays.filter(o => o.id !== id));
    setSelectedId(null);
  }, [overlays, onUpdate]);

  /* ---- Drag via pointer events (works on touch + mouse, accounts for scale) ---- */
  const onDragStart = useCallback((id: string, clientX: number, clientY: number) => {
    const overlay = overlays.find(o => o.id === id);
    if (!overlay) return;
    const scale = getContainerScale(containerRef.current);
    dragRef.current = {
      id,
      startX: clientX,
      startY: clientY,
      origX: overlay.x,
      origY: overlay.y,
      scale,
      dragging: false,
    };
  }, [overlays]);

  const onDragMove = useCallback((clientX: number, clientY: number) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (clientX - d.startX) / d.scale;
    const dy = (clientY - d.startY) / d.scale;
    // Only consider it a drag after 4px movement (prevents accidental drags)
    if (!d.dragging && Math.abs(dx) + Math.abs(dy) < 4) return;
    d.dragging = true;
    const overlay = overlays.find(o => o.id === d.id);
    if (!overlay) return;
    const nx = Math.max(0, Math.min(1920 - overlay.width, d.origX + dx));
    const ny = Math.max(0, Math.min(1080 - overlay.height, d.origY + dy));
    updateOverlay(d.id, { x: Math.round(nx), y: Math.round(ny) });
  }, [overlays, updateOverlay]);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Global move/end listeners
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (dragRef.current) {
        e.preventDefault();
        onDragMove(e.clientX, e.clientY);
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (dragRef.current) {
        e.preventDefault();
        onDragMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const handleUp = () => onDragEnd();

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleUp);
    window.addEventListener("touchcancel", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleUp);
      window.removeEventListener("touchcancel", handleUp);
    };
  }, [onDragMove, onDragEnd]);

  /* ---- Resize via pointer events ---- */
  const resizeRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origW: number;
    origH: number;
    scale: number;
  } | null>(null);

  const onResizeStart = useCallback((id: string, clientX: number, clientY: number) => {
    const overlay = overlays.find(o => o.id === id);
    if (!overlay) return;
    const scale = getContainerScale(containerRef.current);
    resizeRef.current = { id, startX: clientX, startY: clientY, origW: overlay.width, origH: overlay.height, scale };
  }, [overlays]);

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      e.preventDefault();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const dx = (clientX - r.startX) / r.scale;
      const aspect = r.origW / r.origH;
      const nw = Math.max(40, r.origW + dx);
      updateOverlay(r.id, { width: Math.round(nw), height: Math.round(nw / aspect) });
    };
    const handleUp = () => { resizeRef.current = null; };

    window.addEventListener("mousemove", handleMove as any);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove as any, { passive: false });
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove as any);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove as any);
      window.removeEventListener("touchend", handleUp);
    };
  }, [updateOverlay]);

  if (!overlays || overlays.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: 1920, height: 1080 }}
    >
      {overlays.map((overlay) => {
        const isSelected = selectedId === overlay.id && editable;

        return (
          <div
            key={overlay.id}
            data-overlay-id={overlay.id}
            className={`absolute ${editable ? "pointer-events-auto" : ""}`}
            style={{
              left: overlay.x,
              top: overlay.y,
              width: overlay.width,
              height: overlay.height,
              transform: overlay.rotation ? `rotate(${overlay.rotation}deg)` : undefined,
              opacity: overlay.opacity ?? 1,
              zIndex: isSelected ? 50 : 10,
              cursor: editable ? "move" : undefined,
              touchAction: editable ? "none" : undefined,
            }}
            onMouseDown={(e) => {
              if (!editable) return;
              e.stopPropagation();
              e.preventDefault();
              setSelectedId(overlay.id);
              onDragStart(overlay.id, e.clientX, e.clientY);
            }}
            onTouchStart={(e) => {
              if (!editable) return;
              e.stopPropagation();
              e.preventDefault();
              setSelectedId(overlay.id);
              onDragStart(overlay.id, e.touches[0].clientX, e.touches[0].clientY);
            }}
          >
            {/* The asset */}
            {overlay.type === "image" && (
              <img
                src={overlay.src}
                alt={overlay.label || "Overlay"}
                className="w-full h-full object-contain select-none pointer-events-none"
                draggable={false}
              />
            )}

            {/* Selection ring + controls */}
            {isSelected && (
              <>
                <div className="absolute inset-0 border-2 border-primary rounded-sm pointer-events-none" />

                {/* Delete button — large and visible */}
                <button
                  className="absolute -top-14 right-0 w-12 h-12 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg active:scale-95 transition-transform pointer-events-auto"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(overlay.id);
                  }}
                >
                  <Trash2 className="w-6 h-6" />
                </button>

                {/* Deselect button */}
                <button
                  className="absolute -top-14 left-0 w-12 h-12 rounded-full bg-secondary text-foreground flex items-center justify-center shadow-lg active:scale-95 transition-transform pointer-events-auto"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(null);
                  }}
                >
                  <X className="w-6 h-6" />
                </button>

                {/* Move indicator */}
                <div className="absolute -top-14 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-primary text-primary-foreground rounded-full text-sm flex items-center gap-1.5 pointer-events-none whitespace-nowrap">
                  <Move className="w-4 h-4" />
                  Drag to move
                </div>

                {/* Resize handle — bottom-right, larger for touch */}
                <div
                  className="absolute -bottom-4 -right-4 w-10 h-10 bg-primary rounded-full cursor-se-resize pointer-events-auto flex items-center justify-center shadow-lg"
                  style={{ touchAction: "none" }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onResizeStart(overlay.id, e.clientX, e.clientY);
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    onResizeStart(overlay.id, e.touches[0].clientX, e.touches[0].clientY);
                  }}
                >
                  <svg className="w-4 h-4 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 22L12 22M22 22L22 12M22 22L14 14" />
                  </svg>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Generate a unique overlay ID */
export function createOverlayId(): string {
  return `ovl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}
