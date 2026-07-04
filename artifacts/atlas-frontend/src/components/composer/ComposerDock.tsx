/**
 * ComposerDock — floating "A" orb that appears when the user progressively
 * collapses the composer past compact (chevron: full → compact → docked).
 *
 * Tap the orb to restore full. While the parent surface reports `chatPending`,
 * a soft gold ring pulses to signal live Atlas activity without expanding
 * the composer.
 *
 * Positioning:
 *   - Fixed, bottom-right, above the footer nav + safe-area inset.
 *   - z-index below the focus backdrop but above canvas content.
 *
 * Scope: workspace ChatComposer + Ask Atlas (post-first-message) only.
 * Homepage ambient / focus-composer states never render this.
 */
import { useShellStore } from "@/store/shellStore";
import { haptics } from "@/lib/haptics";

interface Props {
  /** When true, show the pulsing gold ring (Atlas streaming/working). */
  pending?: boolean;
  /** Right-edge offset in px. Defaults to 16. */
  offsetRight?: number;
  /** Bottom-edge offset in px (above footer). Defaults to 84 (workspace footer). */
  offsetBottom?: number;
  /** Optional aria label override. */
  label?: string;
  /** Force-render the dock regardless of shellStore visibility. Used by
   *  surfaces (Ask Atlas) that manage their own dock state locally. */
  forceVisible?: boolean;
  /** Custom restore handler. When omitted, calls shellStore.restoreComposer. */
  onRestore?: () => void;
}

export function ComposerDock({
  pending = false,
  offsetRight = 16,
  offsetBottom = 84,
  label = "Restore composer",
  forceVisible = false,
  onRestore,
}: Props) {
  const visibility = useShellStore((s) => s.composerVisibility);
  const restoreComposer = useShellStore((s) => s.restoreComposer);

  const shouldRender = forceVisible || visibility === "docked";
  if (!shouldRender) return null;

  const handleClick = () => {
    haptics.tap();
    if (onRestore) onRestore();
    else restoreComposer();
  };

  return (
    <>
      <style>{`
        @keyframes atlasDockPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(201,162,76,0.55), 0 8px 24px rgba(0,0,0,0.45); }
          50%     { box-shadow: 0 0 0 8px rgba(201,162,76,0), 0 8px 24px rgba(0,0,0,0.45); }
        }
        @keyframes atlasDockFloat {
          from { opacity: 0; transform: translateY(8px) scale(0.9); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <button
        type="button"
        aria-label={label}
        title={label}
        onPointerDown={(e) => { e.preventDefault(); }}
        onClick={handleClick}
        style={{
          position: "fixed",
          right: `calc(${offsetRight}px + env(safe-area-inset-right, 0px))`,
          bottom: `calc(${offsetBottom}px + env(safe-area-inset-bottom, 0px))`,
          zIndex: 45,
          width: 52, height: 52, padding: 0,
          borderRadius: "50%",
          border: "1px solid rgba(201,162,76,0.55)",
          background: "radial-gradient(circle at 30% 30%, rgba(30,25,18,0.98), rgba(10,10,12,0.98))",
          color: "var(--atlas-gold, #c9a24c)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: pending
            ? "atlasDockFloat 220ms cubic-bezier(0.22,1,0.36,1) both, atlasDockPulse 2.2s ease-in-out infinite 220ms"
            : "atlasDockFloat 220ms cubic-bezier(0.22,1,0.36,1) both",
          boxShadow: "0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(201,162,76,0.25)",
          WebkitTapHighlightColor: "transparent",
          fontFamily: "var(--app-font-serif, Georgia, serif)",
          fontSize: 22, fontWeight: 500, lineHeight: 1,
          letterSpacing: 0,
        }}
      >
        <span aria-hidden style={{ transform: "translateY(-1px)" }}>A</span>
      </button>
    </>
  );
}
