/**
 * Teleprompter Cue System
 * Renders delivery cues like [PAUSE], [BREATHE], [SLOW DOWN], [EMPHASIZE], [LOOK UP]
 * as colored inline badges in the teleprompter.
 */

export interface CueConfig {
  label: string;
  color: string; // Tailwind bg class
  textColor: string; // Tailwind text class
  icon: string; // emoji
}

export const CUE_MAP: Record<string, CueConfig> = {
  pause: { label: "PAUSE", color: "bg-amber-500/30", textColor: "text-amber-300", icon: "⏸" },
  breathe: { label: "BREATHE", color: "bg-emerald-500/30", textColor: "text-emerald-300", icon: "🌬" },
  "slow down": { label: "SLOW DOWN", color: "bg-blue-500/30", textColor: "text-blue-300", icon: "🐢" },
  emphasize: { label: "EMPHASIZE", color: "bg-purple-500/30", textColor: "text-purple-300", icon: "💪" },
  "look up": { label: "LOOK UP", color: "bg-pink-500/30", textColor: "text-pink-300", icon: "👀" },
  transition: { label: "TRANSITION", color: "bg-cyan-500/30", textColor: "text-cyan-300", icon: "→" },
  // Physical delivery cues
  "step forward": { label: "STEP FORWARD", color: "bg-orange-500/30", textColor: "text-orange-300", icon: "🚶" },
  "lean in": { label: "LEAN IN", color: "bg-rose-500/30", textColor: "text-rose-300", icon: "↗" },
  gesture: { label: "GESTURE", color: "bg-violet-500/30", textColor: "text-violet-300", icon: "🤲" },
  "open palms": { label: "OPEN PALMS", color: "bg-violet-500/30", textColor: "text-violet-300", icon: "🤲" },
  "eye contact": { label: "EYE CONTACT", color: "bg-pink-500/30", textColor: "text-pink-300", icon: "👁" },
  "scan audience": { label: "SCAN AUDIENCE", color: "bg-pink-500/30", textColor: "text-pink-300", icon: "👀" },
  "lower voice": { label: "LOWER VOICE", color: "bg-indigo-500/30", textColor: "text-indigo-300", icon: "🔉" },
  "raise voice": { label: "RAISE VOICE", color: "bg-red-500/30", textColor: "text-red-300", icon: "🔊" },
  smile: { label: "SMILE", color: "bg-yellow-500/30", textColor: "text-yellow-300", icon: "😊" },
  "power stance": { label: "POWER STANCE", color: "bg-orange-500/30", textColor: "text-orange-300", icon: "🦸" },
  "step back": { label: "STEP BACK", color: "bg-slate-500/30", textColor: "text-slate-300", icon: "↩" },
  "dramatic pause": { label: "DRAMATIC PAUSE", color: "bg-amber-600/30", textColor: "text-amber-200", icon: "⏳" },
};

// Regex to match all cues including physical delivery cues
// Also matches [~30 seconds] style timing cues and [GESTURE — open palms] style
const CUE_REGEX = /\[(pause|breathe|slow down|emphasize|look up|transition|step forward|lean in|gesture|open palms|eye contact|scan audience|lower voice|raise voice|smile|power stance|step back|dramatic pause|~\d+\s*(?:seconds?|sec|s|minutes?|min|m))(?:\s*[—–-]\s*[^\]]+)?\]/gi;

export interface ParsedSegment {
  type: "text" | "cue" | "timing" | "breath";
  content: string;
  cueConfig?: CueConfig;
}

/**
 * Parse teleprompter text into segments of text and cues
 */
export function parseCues(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  let lastIndex = 0;

  const matches = text.matchAll(CUE_REGEX);
  for (const match of matches) {
    // Add text before the cue
    if (match.index! > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index!) });
    }

    const cueRaw = match[1].toLowerCase();
    // Strip any detail after — dash (e.g. "gesture — open palms" → "gesture")
    const cueText = cueRaw.replace(/\s*[—–-]\s*.+$/, "").trim();

    // Check if it's a timing cue like [~30 seconds]
    if (cueText.startsWith("~")) {
      segments.push({
        type: "timing",
        content: match[0],
        cueConfig: { label: match[1], color: "bg-orange-500/30", textColor: "text-orange-300", icon: "⏱" },
      });
    } else {
      const config = CUE_MAP[cueText];
      if (config) {
        segments.push({ type: "cue", content: match[0], cueConfig: config });
      } else {
        segments.push({ type: "text", content: match[0] });
      }
    }

    lastIndex = match.index! + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments;
}

/**
 * Insert cues into script text. Useful for the "Format with Arc" pipeline.
 */
export function insertDefaultCues(text: string): string {
  // Add [BREATHE] after sentences ending with . ! ? followed by a space
  let result = text.replace(/([.!?])\s+/g, "$1 [BREATHE] ");
  // Add [PAUSE] before section headings (lines that are short and followed by longer text)
  return result;
}
