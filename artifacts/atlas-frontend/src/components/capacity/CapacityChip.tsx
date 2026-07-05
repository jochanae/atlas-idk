import { useCapacity } from "@/hooks/useCapacity";
import { CapacityTranslation } from "./CapacityTranslation";
import * as Tooltip from "@radix-ui/react-tooltip";

/**
 * Header chip. Visible only when remaining <= 50%.
 * Never punitive — just a quiet marker.
 */
export function CapacityChip() {
  const { snapshot, percentRemaining } = useCapacity();
  if (!snapshot) return null;
  if (percentRemaining > 50) return null;

  const tone =
    percentRemaining <= 10
      ? "border-[hsl(var(--token-border))] text-[hsl(var(--token-fg))]"
      : "border-[hsl(var(--code-border))] text-[hsl(var(--code-fg))]";

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className={`
              inline-flex items-center gap-1.5 rounded-full border
              bg-[hsl(var(--code-bg)/0.75)] backdrop-blur-md
              px-2.5 py-1 text-xs font-medium
              transition-colors hover:bg-[hsl(var(--code-bg))]
              ${tone}
            `}
            aria-label={`${snapshot.remaining} build credits remaining`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-current opacity-70"
              aria-hidden
            />
            {snapshot.remaining} credits
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="bottom"
            sideOffset={8}
            className="
              z-50 rounded-md border border-[hsl(var(--code-border))]
              bg-[hsl(var(--code-bg)/0.95)] backdrop-blur-md
              p-3 shadow-lg text-[hsl(var(--code-fg))] max-w-[220px]
            "
          >
            <div className="text-xs font-medium mb-1">
              {snapshot.remaining} of {snapshot.total} build credits
            </div>
            <CapacityTranslation credits={snapshot.remaining} />
            <div className="mt-2 pt-2 border-t border-[hsl(var(--code-border))] text-[10px] opacity-60">
              Renews {new Date(snapshot.resetsAt).toLocaleDateString()}
            </div>
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
