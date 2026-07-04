import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

/**
 * ComposerDeepDive — frictionless scratchpad for taking a thought to another AI.
 *
 * Philosophy (per product direction): Deep Dive is NOT "export this conversation."
 * It's a clipboard-shaped surface. Start blank. One tiny header line for context.
 * You type what you want. Optional one-tap helpers: Insert last Atlas response,
 * Clear, Copy. Then pick a destination.
 *
 * Two states, same panel:
 *   brief    → blank textarea + helpers + destination chips
 *              (Gemini is a two-step: tap 1 copies, tap 2 opens Gemini)
 *   awaiting → destination chip + paste-back box → Bring in
 */
export function ComposerDeepDive({
  open,
  onClose,
  lastAtlasResponse,
  onPasteBack,
}: {
  open: boolean;
  onClose: () => void;
  lastAtlasResponse?: string;
  onPasteBack?: (text: string) => void;
}) {
  type Dest = "chatgpt" | "perplexity" | "gemini";
  const [phase, setPhase] = useState<"brief" | "awaiting">("brief");
  const [context, setContext] = useState("");
  const [dest, setDest] = useState<Dest | null>(null);
  const [paste, setPaste] = useState("");
  const [copiedFlash, setCopiedFlash] = useState(false);
  const [geminiArmed, setGeminiArmed] = useState(false); // two-step confirm

  const portalHost = typeof document !== "undefined" ? document.body : null;

  useEffect(() => {
    if (open) {
      setPhase("brief");
      setContext("");
      setDest(null);
      setPaste("");
      setCopiedFlash(false);
      setGeminiArmed(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const destLabel = useMemo(() => {
    if (dest === "chatgpt") return "ChatGPT";
    if (dest === "perplexity") return "Perplexity";
    if (dest === "gemini") return "Gemini";
    return "";
  }, [dest]);

  const excerpt = useMemo(() => {
    const s = context.replace(/\s+/g, " ").trim();
    return s.length > 90 ? `${s.slice(0, 90)}…` : s;
  }, [context]);

  if (!open || !portalHost) return null;

  // Hardcoded prefix — the ONLY thing added on top of the user's text.
  const HEADER_LINE = "Discuss this with another AI. Paste the response back into Atlas when you're finished.\n\n";

  const buildPayload = () => `${HEADER_LINE}${context.trim()}`;

  const copyPayload = async () => {
    try { await navigator.clipboard.writeText(buildPayload()); } catch { /* ignore */ }
    setCopiedFlash(true);
    setTimeout(() => setCopiedFlash(false), 1800);
  };

  const insertLast = () => {
    if (!lastAtlasResponse) return;
    setContext((prev) => (prev.trim() ? `${prev.trim()}\n\n${lastAtlasResponse}` : lastAtlasResponse));
  };

  const launch = async (target: Dest) => {
    if (!context.trim()) return;
    setDest(target);
    if (target === "chatgpt") {
      const encoded = encodeURIComponent(buildPayload());
      window.open(`https://chatgpt.com/?q=${encoded}`, "_blank");
      setPhase("awaiting");
    } else if (target === "perplexity") {
      const encoded = encodeURIComponent(buildPayload());
      window.open(`https://www.perplexity.ai/search?q=${encoded}`, "_blank");
      setPhase("awaiting");
    } else {
      // Two-step Gemini: first tap copies + arms, second tap opens Gemini.
      if (!geminiArmed) {
        await copyPayload();
        setGeminiArmed(true);
      } else {
        window.open("https://gemini.google.com", "_blank");
        setPhase("awaiting");
      }
    }
  };

  const bringIn = () => {
    if (!paste.trim()) return;
    onPasteBack?.(paste.trim());
    onClose();
  };

  const goldBorder = "color-mix(in oklab, var(--atlas-gold) 20%, transparent)";
  const goldBorderSoft = "color-mix(in oklab, var(--atlas-gold) 16%, transparent)";
  const panelBg = "color-mix(in oklab, var(--atlas-surface) 96%, transparent)";
  const inputBg = "color-mix(in oklab, var(--atlas-bg) 82%, transparent)";

  const helperBtnStyle = (enabled: boolean): React.CSSProperties => ({
    padding: "6px 10px", borderRadius: 8,
    background: "transparent",
    border: `1px solid ${goldBorderSoft}`,
    color: enabled ? "var(--atlas-gold)" : "var(--atlas-muted)",
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.5,
    fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.1em",
    textTransform: "uppercase",
  });

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: "rgba(0,0,0,0.42)", backdropFilter: "blur(14px) saturate(140%)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        padding: "12px 12px calc(env(safe-area-inset-bottom, 0px) + 12px)",
      }}
    >
      <div
        role="dialog"
        aria-label="Deep Dive"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 560,
          background: panelBg,
          backdropFilter: "blur(28px) saturate(150%)",
          border: `1px solid ${goldBorder}`,
          borderRadius: 20,
          boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.35)",
          padding: "12px 14px 14px",
          display: "flex", flexDirection: "column", gap: 10,
          maxHeight: "calc(100vh - 40px)", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{
            fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.14em",
            textTransform: "uppercase", color: "var(--atlas-gold)",
          }}>
            {phase === "brief" ? "Deep Dive ↗" : `Diving with ${destLabel}`}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel dive"
            style={{
              background: "transparent", border: "none", color: "var(--atlas-muted)",
              cursor: "pointer", fontSize: 12, padding: "2px 6px",
            }}
          >
            ✕
          </button>
        </div>

        {phase === "brief" ? (
          <>
            <div style={{ fontSize: 12.5, color: "var(--atlas-muted)", lineHeight: 1.5 }}>
              Research outside Atlas. Type what you want to explore, then pick where to dive. Paste the response back when you're done.
            </div>

            <textarea
              value={context}
              onChange={(e) => { setContext(e.target.value); setGeminiArmed(false); }}
              rows={6}
              autoFocus
              placeholder="What do you want to explore?"
              style={{
                width: "100%", resize: "vertical", minHeight: 130, maxHeight: 280,
                fontSize: 13.5, lineHeight: 1.55,
                padding: "10px 12px", borderRadius: 12,
                background: inputBg, border: `1px solid ${goldBorderSoft}`,
                color: "var(--atlas-fg)", outline: "none",
              }}
            />

            {/* Helper row */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button
                  type="button"
                  onClick={insertLast}
                  disabled={!lastAtlasResponse}
                  title={lastAtlasResponse ? "Insert last Atlas response" : "No Atlas response yet"}
                  style={helperBtnStyle(!!lastAtlasResponse)}
                >
                  + Last Atlas reply
                </button>
                <button
                  type="button"
                  onClick={() => { setContext(""); setGeminiArmed(false); }}
                  disabled={!context}
                  style={helperBtnStyle(!!context)}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={copyPayload}
                  disabled={!context.trim()}
                  style={helperBtnStyle(!!context.trim())}
                >
                  {copiedFlash ? "Copied ✓" : "Copy"}
                </button>
              </div>
            </div>

            <div style={{
              fontSize: 10.5, color: "var(--atlas-muted)", opacity: 0.7,
              fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em",
            }}>
              One line is added on top: <span style={{ color: "var(--atlas-gold)" }}>"Discuss this with another AI. Paste the response back into Atlas when you're finished."</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {([
                { id: "chatgpt", label: "ChatGPT" },
                { id: "perplexity", label: "Perplexity" },
                { id: "gemini", label: geminiArmed ? "Open Gemini →" : "Gemini" },
              ] as const).map((t) => {
                const isGeminiArmedBtn = t.id === "gemini" && geminiArmed;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => launch(t.id)}
                    disabled={!context.trim()}
                    style={{
                      padding: "11px 8px", borderRadius: 12,
                      background: isGeminiArmedBtn
                        ? "var(--atlas-gold)"
                        : "rgba(201,162,76,0.10)",
                      border: "1px solid rgba(201,162,76,0.32)",
                      color: isGeminiArmedBtn ? "var(--atlas-bg)" : "var(--atlas-gold)",
                      cursor: context.trim() ? "pointer" : "not-allowed",
                      opacity: context.trim() ? 1 : 0.45,
                      fontFamily: "var(--app-font-mono)", fontSize: 11, letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      fontWeight: isGeminiArmedBtn ? 600 : 400,
                    }}
                  >
                    {t.id === "gemini" ? t.label : `Dive → ${t.label}`}
                  </button>
                );
              })}
            </div>

            {geminiArmed && (
              <div style={{
                fontSize: 11.5, color: "var(--atlas-gold)",
                fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em",
                padding: "8px 10px", borderRadius: 8,
                background: "color-mix(in oklab, var(--atlas-gold) 8%, transparent)",
                border: `1px solid ${goldBorderSoft}`,
              }}>
                Copied to clipboard. Tap <b>Open Gemini →</b> to go paste it.
              </div>
            )}
          </>
        ) : (
          <>
            {/* Brief collapsed chip */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 10px", borderRadius: 10,
              background: "color-mix(in oklab, var(--atlas-gold) 6%, transparent)",
              border: `1px solid ${goldBorderSoft}`,
            }}>
              <div style={{
                fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.1em",
                color: "var(--atlas-gold)", textTransform: "uppercase",
              }}>
                {destLabel}
              </div>
              <div style={{ fontSize: 12, color: "var(--atlas-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {excerpt}
              </div>
              <button
                type="button"
                onClick={() => setPhase("brief")}
                style={{ background: "transparent", border: "none", color: "var(--atlas-gold)", cursor: "pointer", fontSize: 11 }}
              >
                Edit
              </button>
            </div>

            <div style={{
              fontSize: 11, color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)",
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              Drop the answer here when you're back
            </div>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={7}
              autoFocus
              placeholder="Paste the response from the external model…"
              style={{
                width: "100%", resize: "vertical", minHeight: 140, maxHeight: 320,
                fontSize: 13, lineHeight: 1.55, padding: "10px 12px", borderRadius: 12,
                background: inputBg, border: `1px solid ${goldBorderSoft}`,
                color: "var(--atlas-fg)", outline: "none",
              }}
            />

            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "9px 14px", borderRadius: 10, background: "transparent",
                  border: `1px solid ${goldBorderSoft}`,
                  color: "var(--atlas-muted)", cursor: "pointer", fontSize: 12,
                }}
              >
                Cancel dive
              </button>
              <button
                type="button"
                onClick={bringIn}
                disabled={!paste.trim()}
                style={{
                  padding: "10px 16px", borderRadius: 10,
                  background: paste.trim() ? "var(--atlas-gold)" : "rgba(201,162,76,0.2)",
                  border: "1px solid var(--atlas-gold)",
                  color: paste.trim() ? "var(--atlas-bg)" : "var(--atlas-muted)",
                  cursor: paste.trim() ? "pointer" : "not-allowed",
                  fontSize: 12, fontWeight: 600,
                }}
              >
                Bring in →
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    portalHost
  );
}
