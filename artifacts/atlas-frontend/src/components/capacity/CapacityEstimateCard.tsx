import type { CapacityEstimate } from "@/hooks/useCapacity";

interface Props {
  estimate: CapacityEstimate;
  onProceed: () => void;
  onAdjust?: () => void;
  onCancel?: () => void;
}

/**
 * Pre-execution estimate card. Shown after user triggers a build,
 * before the Forge run actually executes. Reuses the Decision Catch
 * card pattern — same surface, different intent.
 *
 * When enforcement is off (backend not live), this is informational only.
 */
export function CapacityEstimateCard({ estimate, onProceed, onAdjust, onCancel }: Props) {
  const { credits, breakdown, translation, sufficient, wouldRemainAfter } = estimate;

  return (
    <div
      className="
        rounded-xl border backdrop-blur-md
        bg-[hsl(var(--code-bg)/0.85)]
        border-[hsl(var(--code-border))]
        text-[hsl(var(--code-fg))]
        p-4 space-y-3
      "
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-medium">Before you build —</div>
        <div className="text-xs text-[hsl(var(--code-muted-fg))]">
          {breakdown.model}
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <div className="text-2xl font-semibold tabular-nums">{credits}</div>
        <div className="text-xs text-[hsl(var(--code-muted-fg))]">
          {credits === 1 ? "credit" : "credits"} estimated
        </div>
      </div>

      <div className="text-xs text-[hsl(var(--code-muted-fg))] leading-relaxed">
        {translation}.
        {sufficient
          ? ` ${wouldRemainAfter} would remain after this run.`
          : ` Not enough capacity — add more to proceed.`}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={onProceed}
          disabled={!sufficient}
          className="text-xs px-3 py-1.5 rounded-md bg-[hsl(var(--token-bg))] border border-[hsl(var(--token-border))] text-[hsl(var(--token-fg))] hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Proceed
        </button>
        {onAdjust && (
          <button
            type="button"
            onClick={onAdjust}
            className="text-xs px-3 py-1.5 rounded-md border border-[hsl(var(--code-border))] hover:bg-[hsl(var(--code-bg))] transition"
          >
            Adjust
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded-md text-[hsl(var(--code-muted-fg))] hover:text-[hsl(var(--code-fg))] transition"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
