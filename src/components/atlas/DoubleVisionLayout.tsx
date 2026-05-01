import { type ReactNode, useRef, useState, useCallback, useEffect } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  useAnimation,
  type PanInfo,
} from "framer-motion";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/**
 * DoubleVisionLayout — Horizontal-peel layout with two layers:
 *
 *  Base Layer ("The Stage")  — full-screen preview/living-data area
 *  Top Layer ("Command Center") — frosted-glass chat/file-explorer pane
 *
 * Mobile: swipe from right edge peels back the Top Layer.
 *   50% → split-pane  |  90% → full-screen Stage
 *
 * Z Fold 6 unfolded (≥ 660px inner): permanent 40/60 split, no overlay.
 *
 * Desktop (≥ 1024px): not used — DesktopWorkspace handles that.
 */

interface Props {
  /** Content rendered on the Stage (base layer) */
  stage: ReactNode;
  /** Content rendered on the Command Center (top layer) */
  commandCenter: ReactNode;
  /** Gold drag-handle visible on mobile overlay */
  className?: string;
}

const SNAP_SPLIT = 0.5; // 50 % swipe → split view
const SNAP_FULL = 0.9; // 90 % swipe → full stage
const TRANSITION = { type: "spring" as const, stiffness: 300, damping: 34, mass: 0.8 };

export function DoubleVisionLayout({ stage, commandCenter, className = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);

  // Z Fold 6 unfolded ≥ 660px (portrait inner screen ~674px)
  const isZFold = useMediaQuery("(min-width: 660px) and (max-width: 1023px)");

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) setContainerW(containerRef.current.offsetWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // ── Z Fold permanent split ──
  if (isZFold) {
    return (
      <div
        ref={containerRef}
        className={`flex h-full w-full overflow-hidden ${className}`}
        style={{ background: "#050505" }}
      >
        {/* Stage — 60 % */}
        <div className="relative" style={{ width: "60%", minWidth: 0 }}>
          {stage}
        </div>
        {/* Divider */}
        <div
          style={{
            width: 1,
            background: "rgba(201,162,76,0.35)",
            flexShrink: 0,
          }}
        />
        {/* Command Center — 40 % */}
        <div
          className="relative flex flex-col"
          style={{
            width: "40%",
            minWidth: 0,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            background: "rgba(5,5,5,0.82)",
          }}
        >
          {commandCenter}
        </div>
      </div>
    );
  }

  // ── Mobile overlay peel ──
  return <MobilePeel containerRef={containerRef} containerW={containerW} stage={stage} commandCenter={commandCenter} className={className} />;
}

/* ────────────────────────────────────────────────────────────── */
/*  Mobile overlay with framer-motion pan gesture                */
/* ────────────────────────────────────────────────────────────── */

function MobilePeel({
  containerRef,
  containerW,
  stage,
  commandCenter,
  className,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  containerW: number;
  stage: ReactNode;
  commandCenter: ReactNode;
  className: string;
}) {
  const x = useMotionValue(0);
  const controls = useAnimation();
  const [snapState, setSnapState] = useState<"closed" | "split" | "full">("closed");

  // Transform: command center slides right, revealing stage underneath
  const commandCenterX = useTransform(x, (v) => v);
  const stageOpacity = useTransform(x, [0, containerW * 0.4], [0.6, 1]);
  const stageScale = useTransform(x, [0, containerW * 0.5], [0.92, 1]);

  const snapTo = useCallback(
    (target: "closed" | "split" | "full") => {
      const positions = {
        closed: 0,
        split: containerW * SNAP_SPLIT,
        full: containerW * SNAP_FULL,
      };
      setSnapState(target);
      controls.start({ x: positions[target], transition: TRANSITION });
    },
    [containerW, controls],
  );

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const progress = (x.get() + info.velocity.x * 0.15) / containerW;
      if (progress > 0.7) {
        snapTo("full");
      } else if (progress > 0.3) {
        snapTo("split");
      } else {
        snapTo("closed");
      }
    },
    [containerW, snapTo, x],
  );

  // Keyboard accessible toggle
  const cycleSnap = useCallback(() => {
    const order: Array<"closed" | "split" | "full"> = ["closed", "split", "full"];
    const next = order[(order.indexOf(snapState) + 1) % order.length];
    snapTo(next);
  }, [snapState, snapTo]);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden bg-background ${className}`}
    >
      {/* ── Base Layer: The Stage ── */}
      <motion.div
        className="absolute inset-0"
        style={{ opacity: stageOpacity, scale: stageScale }}
      >
        {stage}
      </motion.div>

      {/* ── Top Layer: Command Center ── */}
      <motion.div
        className="absolute inset-0 flex flex-col bg-background"
        style={{
          x: commandCenterX,
          borderLeft: "1px solid rgba(201,162,76,0.25)",
          willChange: "transform",
        }}
        drag="x"
        dragConstraints={{ left: 0, right: containerW * 0.92 }}
        dragElastic={0.08}
        onDragEnd={handleDragEnd}
        animate={controls}
      >
        {/* Gold drag handle */}
        <button
          type="button"
          onClick={cycleSnap}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              cycleSnap();
            }
          }}
          aria-label={`Toggle preview — currently ${snapState}`}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(201,162,76,0.7)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505] rounded-full"
          style={{
            width: 28,
            height: 56,
            background: "linear-gradient(180deg, rgba(201,162,76,0.5) 0%, rgba(201,162,76,0.25) 100%)",
            borderRadius: "14px",
            border: "1px solid rgba(201,162,76,0.4)",
            boxShadow: "0 0 12px 2px rgba(201,162,76,0.15)",
            cursor: "grab",
            transition: "box-shadow 0.4s ease-out",
          }}
        >
          {/* Notch lines */}
          <div className="flex flex-col gap-1 items-center">
            <div style={{ width: 3, height: 10, borderRadius: 2, background: "rgba(201,162,76,0.7)" }} />
            <div style={{ width: 3, height: 10, borderRadius: 2, background: "rgba(201,162,76,0.5)" }} />
          </div>
        </button>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {commandCenter}
        </div>
      </motion.div>

      {/* Snap indicator pills */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex gap-1.5"
        style={{ pointerEvents: "none" }}
      >
        {(["closed", "split", "full"] as const).map((s) => (
          <div
            key={s}
            style={{
              width: snapState === s ? 18 : 6,
              height: 6,
              borderRadius: 3,
              background: snapState === s ? "rgba(201,162,76,0.8)" : "rgba(201,162,76,0.25)",
              transition: "all 0.3s ease-out",
            }}
          />
        ))}
      </div>
    </div>
  );
}
