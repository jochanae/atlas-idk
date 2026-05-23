import { useEffect, useRef, useState } from "react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";


const FALLBACK_BY_LENS: Record<string, string[]> = {
  build: [
    "Inspecting codebase...",
    "Tracing dependencies...",
    "Reviewing architecture...",
    "Preparing implementation...",
    "Analyzing file structure...",
  ],
  think: [
    "Exploring strategic direction...",
    "Reviewing previous decisions...",
    "Connecting related concepts...",
    "Considering implications...",
    "Building context...",
  ],
  flow: [
    "Mapping relationships...",
    "Organizing project structure...",
    "Updating operational context...",
    "Tracing flow dependencies...",
    "Reviewing node states...",
  ],
  default: [
    "Atlas is thinking...",
    "Reviewing context...",
    "Processing your request...",
    "Preparing response...",
    "Analyzing...",
  ],
};

function atlasActivityStatus(content: string): string {
  const narration = content.match(/^NARRATION:(.+)/)?.[1]?.trim();
  if (narration) return narration;
  const planStep = content.match(/PLAN_STEP:\s*(.+)/i)?.[1]?.trim();
  if (planStep) return planStep;
  if (/LINE_PATCH/i.test(content)) return "Patching code...";
  if (/FILE_EDIT/i.test(content)) return "Preparing changes...";
  if (/FILE_READ/i.test(content)) return "Reading files...";
  if (/\b(git|push)\b/i.test(content)) return "Pushing to GitHub...";
  return "";
}

export function AtlasActivityBar({
  content,
  lens,
}: {
  content: string;
  lens?: string;
}) {
  const resolved = atlasActivityStatus(content);
  const fallbacks = FALLBACK_BY_LENS[lens ?? "default"] ?? FALLBACK_BY_LENS.default;

  const [displayed, setDisplayed] = useState(resolved || fallbacks[0]);
  const [visible, setVisible] = useState(true);
  const fallbackIdx = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (resolved) {
      setVisible(false);
      setTimeout(() => { setDisplayed(resolved); setVisible(true); }, 180);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    // Rotate fallback phrases every 3 seconds
    timerRef.current = setInterval(() => {
      fallbackIdx.current = (fallbackIdx.current + 1) % fallbacks.length;
      setVisible(false);
      setTimeout(() => {
        setDisplayed(fallbacks[fallbackIdx.current]);
        setVisible(true);
      }, 180);
    }, 3000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [resolved, fallbacks]);

  return (
    <div
      style={{
        margin: "2px 0 18px",
        padding: "6px 10px",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
        background: "color-mix(in oklab, var(--atlas-gold) 7%, transparent)",
        border: "1px solid color-mix(in oklab, var(--atlas-gold) 14%, transparent)",
        pointerEvents: "none",
      }}
    >
      <LoadingSpinner size="sm" color="atlas" />

      <span
        style={{
          fontFamily: "var(--app-font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.18s ease",
        }}
      >
        {displayed}
      </span>
    </div>
  );
}
