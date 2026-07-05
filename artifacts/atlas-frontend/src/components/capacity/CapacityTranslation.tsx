import { translateCredits } from "@/hooks/useCapacity";

interface Props {
  credits: number;
  className?: string;
}

/**
 * "≈ 145 small edits / 48 medium features / 18 major builds"
 * Never show a raw credit number without this alongside.
 */
export function CapacityTranslation({ credits, className = "" }: Props) {
  const t = translateCredits(credits);
  return (
    <div className={`text-xs text-[hsl(var(--code-muted-fg))] leading-relaxed ${className}`}>
      <div className="opacity-70 mb-1">Approximately:</div>
      <ul className="space-y-0.5">
        <li>~{t.smallEdits} small edits</li>
        <li>~{t.mediumFeatures} medium features</li>
        <li>~{t.majorBuilds} major builds</li>
      </ul>
    </div>
  );
}
