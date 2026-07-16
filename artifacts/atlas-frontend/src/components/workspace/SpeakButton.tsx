import { useEffect, useState, useCallback } from "react";
import { Volume2, Square } from "lucide-react";

/**
 * SpeakButton — tiny read-aloud toggle for Atlas responses.
 *
 * Uses the browser's native Web Speech API (window.speechSynthesis) so it
 * costs nothing and works offline on whatever voices the device provides.
 * Intentionally minimal: an icon-only affordance for the action bar under
 * assistant messages. If the API is unavailable, renders nothing.
 */
export function SpeakButton({
  text,
  size = 12,
  style,
  className,
}: {
  text: string;
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const [speaking, setSpeaking] = useState(false);

  const supported = typeof window !== "undefined"
    && typeof window.speechSynthesis !== "undefined"
    && typeof window.SpeechSynthesisUtterance !== "undefined";

  // Stop any in-flight speech when the component unmounts.
  useEffect(() => {
    return () => {
      if (!supported) return;
      try {
        if (speaking) window.speechSynthesis.cancel();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = useCallback(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    if (speaking) {
      try { synth.cancel(); } catch {}
      setSpeaking(false);
      return;
    }
    const clean = (text ?? "")
      .replace(/```[\s\S]*?```/g, " code block ")
      .replace(/`[^`]*`/g, "")
      .replace(/[#*_>~]/g, "")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) return;
    try { synth.cancel(); } catch {}
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 1.0;
    u.pitch = 1.0;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    try { synth.speak(u); } catch { setSpeaking(false); }
  }, [speaking, supported, text]);

  if (!supported) return null;

  return (
    <button
      type="button"
      title={speaking ? "Stop reading" : "Read aloud"}
      aria-label={speaking ? "Stop reading" : "Read aloud"}
      aria-pressed={speaking}
      onClick={toggle}
      className={className}
      style={{
        background: "transparent",
        border: "none",
        padding: "3px 4px",
        cursor: "pointer",
        opacity: speaking ? 0.9 : 0.35,
        color: speaking ? "var(--atlas-gold)" : "var(--atlas-muted)",
        lineHeight: 1,
        transition: "opacity 140ms, color 140ms",
        ...style,
      }}
      onMouseEnter={e => { if (!speaking) e.currentTarget.style.opacity = "0.7"; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = speaking ? "0.9" : "0.35"; }}
    >
      {speaking
        ? <Square size={size} strokeWidth={1.8} fill="currentColor" />
        : <Volume2 size={size} strokeWidth={1.6} />}
    </button>
  );
}
