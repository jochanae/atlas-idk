import { useEffect, useId } from "react";
import { useShellStore } from "@/store/shellStore";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Composer visibility contract (mem://design/composer-modes).
 *
 *   full     — default. Conversation is the activity.
 *   compact  — Atlas produced a long-read / ledger / analysis / decision /
 *              research / code-explainer artifact and the user is reading.
 *   hidden   — a stage artifact (Preview, Flow, Sketch, Map, Canvas, large
 *              wireframe) owns the screen. Mobile only by default; desktop
 *              stays compact unless the user explicitly enters fullscreen.
 *
 * Visibility is determined by the highest-priority active claim:
 *   hidden > compact > full.
 *
 * The gold "A" (atlas:focus-composer) clears stage claims and forces full.
 * Footer/dock scroll behavior is independent and intentionally untouched.
 */

export type ComposerVisibility = "full" | "compact" | "docked" | "hidden";

export type StageArtifactKind =
  | "preview"
  | "flow"
  | "sketch"
  | "image"
  | "map"
  | "canvas"
  | "wireframe";

export type ReadingDensityKind =
  | "long-read"
  | "ledger"
  | "analysis"
  | "decision"
  | "research"
  | "code-explainer";

/**
 * Stage artifact mount hook. Call from a panel that owns the screen
 * (PreviewPanel, FlowPanel, full-screen Sketch/Image, etc.). On mobile this
 * resolves to `hidden`; on desktop it resolves to `compact` unless
 * `desktopHidden` is set (explicit fullscreen / focus mode).
 */
export function useStageArtifact(_kind: StageArtifactKind, _opts?: { desktopHidden?: boolean; active?: boolean }) {
  // Temporarily inert: registering stage claims on mount was causing the
  // workspace composer to toggle hidden/visible repeatedly, which cascaded
  // into layout thrash and broke scrolling. Visibility state lives in the
  // store and the hook signature is preserved so callers don't change.
}


/**
 * Reading-density hook. Marks an assistant artifact as a long-read / ledger
 * / analysis / etc. so the composer slips into compact while the user reads.
 * Compact is EXPLICIT — never auto-triggered by raw message length.
 */
export function useReadingDensity(kind: ReadingDensityKind | null | undefined, opts?: { active?: boolean }) {
  const active = (opts?.active ?? true) && !!kind;
  const id = useId();
  const register = useShellStore((s) => s.registerComposerClaim);
  const release = useShellStore((s) => s.releaseComposerClaim);

  useEffect(() => {
    if (!active || !kind) return;
    register(id, { source: "reading", kind, visibility: "compact" });
    return () => release(id);
  }, [id, active, kind, register, release]);
}

export function useComposerVisibility(): ComposerVisibility {
  return useShellStore((s) => s.composerVisibility);
}
