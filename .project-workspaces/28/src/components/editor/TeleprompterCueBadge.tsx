/**
 * TeleprompterCueBadge — renders a delivery cue as a colored inline badge
 */
import type { CueConfig } from "@/lib/teleprompterCues";

interface CueBadgeProps {
  config: CueConfig;
}

export default function TeleprompterCueBadge({ config }: CueBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-full text-[0.65em] font-bold uppercase tracking-wider select-none align-middle ${config.color} ${config.textColor}`}
      aria-label={config.label}
    >
      <span className="text-[0.9em]">{config.icon}</span>
      {config.label}
    </span>
  );
}
