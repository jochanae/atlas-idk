import { useCapacity } from "@/hooks/useCapacity";
import { CapacityTranslation } from "./CapacityTranslation";

interface Props {
  onAddCapacity?: () => void;
  onUpgrade?: () => void;
  onContinue?: () => void;
}

/**
 * Threshold-driven card. Renders only when remaining <= 20%.
 *  - <=20%  → compact "look at you go" tone
 *  - <=10%  → prominent with Add Capacity + Upgrade
 *  - 0      → gated: execution paused, thinking continues
 *
 * Never uses punitive language. Never blocks chat.
 */
export function CapacityCard({ onAddCapacity, onUpgrade, onContinue }: Props) {
  const { snapshot, percentRemaining } = useCapacity();
  if (!snapshot) return null;
  if (percentRemaining > 20) return null;

  const variant: "compact" | "prominent" | "gated" =
    snapshot.remaining === 0 ? "gated" : percentRemaining <= 10 ? "prominent" : "compact";

  return (
    <div
      role="status"
      className={`
        rounded-xl border backdrop-blur-md
        bg-[hsl(var(--code-bg)/0.8)]
        border-[hsl(var(--code-border))]
        text-[hsl(var(--code-fg))]
        ${variant === "prominent" || variant === "gated" ? "p-4" : "p-3"}
      `}
    >
      {variant === "compact" && (
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="text-sm font-medium">Look at you go.</div>
            <div className="text-xs text-[hsl(var(--code-muted-fg))] mt-0.5">
              {snapshot.remaining} executions remain this month.
            </div>
          </div>
        </div>
      )}

      {variant === "prominent" && (
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold">You've been building a lot.</div>
            <div className="text-xs text-[hsl(var(--code-muted-fg))] mt-1">
              {snapshot.remaining} of {snapshot.total} credits left this period.
            </div>
          </div>
          <CapacityTranslation credits={snapshot.remaining} />
          <div className="flex flex-wrap gap-2 pt-1">
            {onContinue && (
              <button
                type="button"
                onClick={onContinue}
                className="text-xs px-3 py-1.5 rounded-md bg-[hsl(var(--token-bg))] border border-[hsl(var(--token-border))] text-[hsl(var(--token-fg))] hover:opacity-90 transition"
              >
                Continue building
              </button>
            )}
            {onAddCapacity && (
              <button
                type="button"
                onClick={onAddCapacity}
                className="text-xs px-3 py-1.5 rounded-md border border-[hsl(var(--code-border))] hover:bg-[hsl(var(--code-bg))] transition"
              >
                Add capacity
              </button>
            )}
            {onUpgrade && (
              <button
                type="button"
                onClick={onUpgrade}
                className="text-xs px-3 py-1.5 rounded-md border border-[hsl(var(--code-border))] hover:bg-[hsl(var(--code-bg))] transition"
              >
                Upgrade plan
              </button>
            )}
          </div>
        </div>
      )}

      {variant === "gated" && (
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold">Execution paused.</div>
            <div className="text-xs text-[hsl(var(--code-muted-fg))] mt-1 leading-relaxed">
              Thinking, planning, and deciding continue without limits.
              Add capacity when you're ready to build again.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {onAddCapacity && (
              <button
                type="button"
                onClick={onAddCapacity}
                className="text-xs px-3 py-1.5 rounded-md bg-[hsl(var(--token-bg))] border border-[hsl(var(--token-border))] text-[hsl(var(--token-fg))] hover:opacity-90 transition"
              >
                Add capacity
              </button>
            )}
            {onUpgrade && (
              <button
                type="button"
                onClick={onUpgrade}
                className="text-xs px-3 py-1.5 rounded-md border border-[hsl(var(--code-border))] hover:bg-[hsl(var(--code-bg))] transition"
              >
                Upgrade plan
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
