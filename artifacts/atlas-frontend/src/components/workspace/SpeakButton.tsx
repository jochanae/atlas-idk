import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Volume2, Square } from "lucide-react";

/**
 * SpeakButton — read-aloud toggle for Atlas responses.
 *
 * Native Web Speech API (window.speechSynthesis) — free, offline, uses
 * whatever voices the device provides.
 *
 * Interaction:
 *  - Tap        → play / stop
 *  - Long-press → open voice picker (saved to localStorage)
 *
 * Long responses are split into ~200-char sentence chunks and queued
 * sequentially to work around Chromium's ~15s per-utterance cap.
 */

const VOICE_STORAGE_KEY = "atlas-tts-voice-uri";
const HINT_STORAGE_KEY = "atlas-tts-hint-seen";
const LONG_PRESS_MS = 450;

function cleanForSpeech(input: string): string {
  return (input ?? "")
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`[^`]*`/g, "")
    .replace(/!\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[#*_>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkForSpeech(text: string, maxLen = 200): string[] {
  const parts = text.match(/[^.!?\n]+[.!?]+["')\]]*\s*|[^.!?\n]+$/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  const flush = () => { const t = cur.trim(); if (t) out.push(t); cur = ""; };
  for (const part of parts) {
    if (part.length > maxLen) {
      flush();
      const words = part.split(/\s+/);
      let buf = "";
      for (const w of words) {
        if ((buf + " " + w).trim().length > maxLen && buf) { out.push(buf.trim()); buf = ""; }
        buf += (buf ? " " : "") + w;
      }
      if (buf.trim()) out.push(buf.trim());
      continue;
    }
    if (cur.length + part.length > maxLen && cur) flush();
    cur += part;
  }
  flush();
  return out;
}

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
  const supported = typeof window !== "undefined"
    && typeof window.speechSynthesis !== "undefined"
    && typeof window.SpeechSynthesisUtterance !== "undefined";

  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const queueRef = useRef<string[]>([]);
  const idxRef = useRef(0);
  const cancelledRef = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const load = () => {
      const list = synth.getVoices();
      if (list.length) setVoices(list);
    };
    load();
    synth.addEventListener?.("voiceschanged", load);
    return () => { synth.removeEventListener?.("voiceschanged", load); };
  }, [supported]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VOICE_STORAGE_KEY);
      if (saved) setVoiceURI(saved);
    } catch {}
  }, []);

  useEffect(() => () => {
    if (!supported) return;
    cancelledRef.current = true;
    try { window.speechSynthesis.cancel(); } catch {}
  }, [supported]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const selectedVoice = useMemo(
    () => voices.find(v => v.voiceURI === voiceURI) ?? null,
    [voices, voiceURI],
  );

  const speakChunk = useCallback((i: number) => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const chunks = queueRef.current;
    if (cancelledRef.current || i >= chunks.length) {
      setSpeaking(false);
      return;
    }
    idxRef.current = i;
    const u = new SpeechSynthesisUtterance(chunks[i]);
    if (selectedVoice) u.voice = selectedVoice;
    u.rate = 1.0;
    u.pitch = 1.0;
    u.onend = () => { if (!cancelledRef.current) speakChunk(i + 1); };
    u.onerror = () => { if (!cancelledRef.current) speakChunk(i + 1); };
    try { synth.speak(u); } catch { setSpeaking(false); }
  }, [selectedVoice, supported]);

  const toggle = useCallback(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    if (speaking) {
      cancelledRef.current = true;
      try { synth.cancel(); } catch {}
      setSpeaking(false);
      return;
    }
    const clean = cleanForSpeech(text);
    if (!clean) return;
    try { synth.cancel(); } catch {}
    queueRef.current = chunkForSpeech(clean);
    if (!queueRef.current.length) return;
    cancelledRef.current = false;
    setSpeaking(true);
    speakChunk(0);
  }, [speaking, supported, text, speakChunk]);

  const pickVoice = (uri: string) => {
    setVoiceURI(uri);
    try { localStorage.setItem(VOICE_STORAGE_KEY, uri); } catch {}
    setMenuOpen(false);
    if (speaking) {
      cancelledRef.current = true;
      try { window.speechSynthesis.cancel(); } catch {}
      cancelledRef.current = false;
      const resumeFrom = idxRef.current;
      setTimeout(() => { if (!cancelledRef.current) speakChunk(resumeFrom); }, 60);
    }
  };

  const startLongPress = () => {
    longPressedRef.current = false;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      longPressedRef.current = true;
      if (voices.length > 0) setMenuOpen(true);
      try { navigator.vibrate?.(20); } catch {}
    }, LONG_PRESS_MS);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  if (!supported) return null;

  const voiceLabel = selectedVoice?.name ?? "Default voice";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", position: "relative" }}>
      <button
        type="button"
        title={speaking ? "Stop (long-press for voice)" : `Read aloud (long-press for voice · ${voiceLabel})`}
        aria-label={speaking ? "Stop reading" : "Read aloud"}
        aria-pressed={speaking}
        onPointerDown={startLongPress}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onClick={(e) => {
          if (longPressedRef.current) { e.preventDefault(); longPressedRef.current = false; return; }
          toggle();
        }}
        onContextMenu={(e) => { e.preventDefault(); if (voices.length > 0) setMenuOpen(true); }}
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
          touchAction: "manipulation",
          ...style,
        }}
        onMouseEnter={e => { if (!speaking) e.currentTarget.style.opacity = "0.7"; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = speaking ? "0.9" : "0.35"; }}
      >
        {speaking
          ? <Square size={size} strokeWidth={1.8} fill="currentColor" />
          : <Volume2 size={size} strokeWidth={1.6} />}
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Select voice"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            right: 0,
            zIndex: 400,
            minWidth: 200,
            maxWidth: 280,
            maxHeight: 260,
            overflowY: "auto",
            background: "var(--atlas-surface)",
            border: "1px solid var(--atlas-border)",
            borderRadius: 10,
            boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
            padding: 4,
            fontFamily: "var(--app-font-sans)",
          }}
        >
          <button
            role="option"
            aria-selected={!voiceURI}
            onClick={() => pickVoice("")}
            style={voiceItemStyle(!voiceURI)}
          >
            System default
          </button>
          {voices.map(v => (
            <button
              key={v.voiceURI}
              role="option"
              aria-selected={voiceURI === v.voiceURI}
              onClick={() => pickVoice(v.voiceURI)}
              style={voiceItemStyle(voiceURI === v.voiceURI)}
              title={`${v.name} · ${v.lang}${v.default ? " · default" : ""}`}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {v.name}
              </span>
              <span style={{ opacity: 0.5, fontSize: 10, marginLeft: 6, fontFamily: "var(--app-font-mono)" }}>
                {v.lang}
              </span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function voiceItemStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "6px 8px",
    background: active ? "rgba(201,162,76,0.14)" : "transparent",
    border: "none",
    borderRadius: 6,
    color: active ? "var(--atlas-gold)" : "var(--atlas-fg)",
    fontSize: 12,
    fontFamily: "var(--app-font-sans)",
    textAlign: "left",
    cursor: "pointer",
  };
}
