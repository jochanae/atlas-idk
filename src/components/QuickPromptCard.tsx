/**
 * QuickPromptCard — standalone, drop-anywhere capture surface.
 *
 * Keeps the original Quick Prompt's intent (fast capture → /api/quick-prompt)
 * but redesigns the form-factor:
 *   • Two-state morph: resting single-line bar → active multi-line composer
 *   • Tag strip (Idea · Decision · Build · Dump) biases the payload
 *   • ⌘↵ to submit, Esc to collapse
 *   • Voice → text via SpeechRecognition (where supported)
 *   • Inline confirmation flips the card; no navigation away
 *   • Amber "ignite" underline fills L→R as you type
 *
 * Props are scoped so the same component slots into:
 *   1. Homepage hero (context="home")
 *   2. Global ⌘K modal (context="modal")
 *   3. Axiom Flow composer toggle (context="flow")
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Mic, MicOff, CornerDownLeft, X } from "lucide-react";

type Intent = "idea" | "decision" | "build" | "dump";

const INTENTS: Array<{ id: Intent; label: string; hint: string }> = [
  { id: "idea",     label: "Idea",     hint: "loose thought" },
  { id: "decision", label: "Decision", hint: "commit this" },
  { id: "build",    label: "Build",    hint: "make it real" },
  { id: "dump",     label: "Dump",     hint: "raw brain" },
];

type Props = {
  context?: "home" | "modal" | "flow";
  placeholder?: string;
  builder?: string;            // forwarded to /api/quick-prompt
  projectId?: string | null;
  onCaptured?: (result: { intent: Intent; text: string; response: string }) => void;
  /** When set, suppresses inline confirmation and hands result up immediately. */
  inlineOnly?: boolean;
};

export function QuickPromptCard({
  context = "home",
  placeholder,
  builder = "Axiom",
  projectId,
  onCaptured,
  inlineOnly,
}: Props) {
  const [expanded, setExpanded] = useState(context === "modal");
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<Intent>("idea");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const recogRef = useRef<any>(null);

  const restingPlaceholder =
    placeholder ??
    (context === "flow"
      ? "Brain dump — captured to Forge, won't interrupt chat…"
      : "Capture an idea, decision, or build intent…");

  // ── auto-grow textarea ────────────────────────────────────────────────────
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 320) + "px";
  }, [text, expanded]);

  // ── voice ─────────────────────────────────────────────────────────────────
  const toggleVoice = () => {
    const W: any = window;
    const Rec = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Rec) { setError("Voice not supported in this browser."); return; }
    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }
    const r = new Rec();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    let base = text;
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) base = (base + " " + t).trim();
        else interim += t;
      }
      setText((base + " " + interim).trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
    r.start();
    setListening(true);
  };

  // ── submit ────────────────────────────────────────────────────────────────
  const canSubmit = text.trim().length > 5 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/quick-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          description: text.trim(),
          builder,
          intent,
          projectId: projectId ?? undefined,
        }),
      });
      if (!res.ok) throw new Error("capture failed");
      const response = await res.text();
      onCaptured?.({ intent, text: text.trim(), response });
      if (!inlineOnly) {
        const head = text.trim().split(/\s+/).slice(0, 6).join(" ");
        setConfirmation(head + (text.trim().split(/\s+/).length > 6 ? "…" : ""));
        setText("");
        setTimeout(() => {
          setConfirmation(null);
          if (context !== "modal") setExpanded(false);
        }, 2200);
      } else {
        setText("");
      }
    } catch {
      setError("Capture failed — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── key handling ──────────────────────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault(); submit(); return;
    }
    if (e.key === "Escape" && context !== "modal") {
      e.preventDefault();
      if (!text.trim()) setExpanded(false);
      (e.target as HTMLTextAreaElement).blur();
    }
  };

  // ── styles ────────────────────────────────────────────────────────────────
  const wrap: CSSProperties = {
    width: "100%",
    maxWidth: context === "home" ? 620 : "100%",
    margin: "0 auto",
    position: "relative",
    borderRadius: 14,
    border: "1px solid rgba(var(--atlas-gold-rgb), 0.18)",
    background: "rgba(var(--atlas-bg-rgb, 13, 11, 9), 0.55)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    boxShadow: expanded
      ? "0 12px 40px -16px rgba(var(--atlas-gold-rgb), 0.35), 0 0 0 1px rgba(var(--atlas-gold-rgb), 0.10)"
      : "0 6px 22px -14px rgba(0,0,0,0.5)",
    transition: "box-shadow 220ms ease, border-color 220ms ease",
    overflow: "hidden",
  };

  const igniteFill = Math.min(1, text.trim().length / 60);

  // ── confirmation state ────────────────────────────────────────────────────
  if (confirmation) {
    return (
      <div style={{ ...wrap, padding: "18px 18px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          fontFamily: "var(--app-font-mono)", fontSize: 13,
          color: "var(--atlas-gold)",
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "var(--atlas-gold)",
            boxShadow: "0 0 12px var(--atlas-gold)",
          }} />
          <span style={{ letterSpacing: "0.04em" }}>Captured →</span>
          <span style={{ color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)", opacity: 0.88 }}>
            {confirmation}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      {/* RESTING (collapsed) */}
      {!expanded && (
        <button
          type="button"
          onClick={() => { setExpanded(true); setTimeout(() => inputRef.current?.focus(), 30); }}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            width: "100%", padding: "16px 18px",
            background: "transparent", border: "none", cursor: "text",
            textAlign: "left",
            color: "rgba(var(--atlas-muted-rgb), 0.85)",
            fontFamily: "var(--app-font-sans)", fontSize: 15,
          }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "var(--atlas-gold)",
            animation: "forge-pulse 2.6s ease-in-out infinite",
            flexShrink: 0,
          }} />
          <span style={{ flex: 1, opacity: 0.7 }}>{restingPlaceholder}</span>
          <span style={{
            fontFamily: "var(--app-font-mono)", fontSize: 10,
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: "rgba(var(--atlas-muted-rgb), 0.5)",
          }}>
            ⌘ K
          </span>
        </button>
      )}

      {/* EXPANDED (active composer) */}
      {expanded && (
        <div style={{ padding: "14px 14px 10px" }}>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={restingPlaceholder}
            rows={2}
            style={{
              width: "100%", resize: "none", border: "none", outline: "none",
              background: "transparent",
              color: "var(--atlas-fg)",
              fontFamily: "var(--app-font-sans)", fontSize: 15,
              lineHeight: 1.55, letterSpacing: "-0.005em",
              padding: "4px 4px 8px",
              minHeight: 60,
            }}
          />

          {/* Ignite underline */}
          <div style={{
            height: 1, width: "100%",
            background: "rgba(var(--atlas-gold-rgb), 0.10)",
            position: "relative", overflow: "hidden", marginBottom: 10,
          }}>
            <div style={{
              position: "absolute", inset: 0,
              transform: `scaleX(${igniteFill})`, transformOrigin: "left",
              background: "linear-gradient(90deg, transparent, var(--atlas-gold) 60%, #FFD27A)",
              transition: "transform 240ms ease",
              boxShadow: igniteFill > 0.1 ? "0 0 10px rgba(var(--atlas-gold-rgb), 0.5)" : "none",
            }} />
          </div>

          {/* Tag strip + actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
              {INTENTS.map(t => {
                const active = intent === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setIntent(t.id)}
                    title={t.hint}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 999,
                      border: `1px solid ${active ? "rgba(var(--atlas-gold-rgb), 0.55)" : "rgba(var(--atlas-gold-rgb), 0.14)"}`,
                      background: active ? "rgba(var(--atlas-gold-rgb), 0.14)" : "transparent",
                      color: active ? "var(--atlas-gold)" : "rgba(var(--atlas-muted-rgb), 0.7)",
                      fontFamily: "var(--app-font-mono)", fontSize: 10,
                      letterSpacing: "0.12em", textTransform: "uppercase",
                      cursor: "pointer", transition: "all 160ms",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={toggleVoice}
              title={listening ? "Stop dictation" : "Dictate"}
              style={iconBtn(listening)}
            >
              {listening ? <MicOff size={14} /> : <Mic size={14} />}
            </button>

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              style={{
                ...iconBtn(false),
                background: canSubmit ? "var(--atlas-gold)" : "rgba(var(--atlas-gold-rgb), 0.10)",
                color: canSubmit ? "#0D0B09" : "rgba(var(--atlas-gold-rgb), 0.35)",
                borderColor: "transparent",
                cursor: canSubmit ? "pointer" : "not-allowed",
                paddingInline: 10,
                gap: 6,
              }}
            >
              <CornerDownLeft size={13} />
              <span style={{ fontSize: 10, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em" }}>
                {submitting ? "…" : "⌘↵"}
              </span>
            </button>

            {context !== "modal" && (
              <button
                type="button"
                onClick={() => { setText(""); setExpanded(false); }}
                title="Collapse"
                style={iconBtn(false)}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {error && (
            <div style={{
              marginTop: 8, fontSize: 12,
              color: "rgba(239, 68, 68, 0.9)", fontFamily: "var(--app-font-mono)",
              letterSpacing: "0.04em",
            }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function iconBtn(active: boolean): CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    height: 28, minWidth: 28,
    padding: "0 8px",
    borderRadius: 8,
    border: `1px solid ${active ? "rgba(var(--atlas-gold-rgb), 0.55)" : "rgba(var(--atlas-gold-rgb), 0.14)"}`,
    background: active ? "rgba(var(--atlas-gold-rgb), 0.14)" : "transparent",
    color: active ? "var(--atlas-gold)" : "rgba(var(--atlas-muted-rgb), 0.8)",
    cursor: "pointer", transition: "all 160ms",
  };
}

export default QuickPromptCard;
