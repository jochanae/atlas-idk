import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

/**
 * ComposerDeepDive — Deep Dive as a composer verb (replaces DeepDiveSheet).
 *
 * Two states inside a focused-composer surface:
 *   brief    → prefilled context + destination chips. Launch opens external tool.
 *   awaiting → destination chip + paste box. Bring in returns text to caller.
 *
 * Rendered as a bottom-anchored panel with a blurred backdrop so the
 * composer surface itself is the "waiting room" — no in-between page.
 */
export function ComposerDeepDive({
  open,
  onClose,
  initialContext,
  onPasteBack,
}: {
  open: boolean;
  onClose: () => void;
  initialContext: string;
  onPasteBack?: (text: string) => void;
}) {
  type Dest = "chatgpt" | "perplexity" | "gemini";
  const [phase, setPhase] = useState<"brief" | "awaiting">("brief");
  const [context, setContext] = useState(initialContext);
  const [dest, setDest] = useState<Dest | null>(null);
  const [paste, setPaste] = useState("");
  const [copied, setCopied] = useState(false);
  const portalHost = typeof document !== "undefined" ? document.body : null;

  useEffect(() => {
    if (open) {
      setPhase("brief");
      setContext(initialContext);
      setDest(null);
      setPaste("");
      setCopied(false);
    }
  }, [open, initialContext]);

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

  const launch = (target: Dest) => {
    const encoded = encodeURIComponent(context);
    setDest(target);
    if (target === "chatgpt") {
      window.open(`https://chatgpt.com/?q=${encoded}`, "_blank");
    } else if (target === "perplexity") {
      window.open(`https://www.perplexity.ai/search?q=${encoded}`, "_blank");
    } else {
      navigator.clipboard.writeText(context).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
      setTimeout(() => window.open("https://gemini.google.com", "_blank"), 700);
    }
    setPhase("awaiting");
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
              Edit the brief, then pick where to dive. Your composer stays open — come back and paste the answer in.
            </div>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={6}
              autoFocus
              style={{
                width: "100%", resize: "vertical", minHeight: 110, maxHeight: 260,
                fontFamily: "var(--app-font-mono)", fontSize: 12, lineHeight: 1.55,
                padding: "10px 12px", borderRadius: 12,
                background: inputBg, border: `1px solid ${goldBorderSoft}`,
                color: "var(--atlas-fg)", outline: "none",
              }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {([
                { id: "chatgpt", label: "ChatGPT" },
                { id: "perplexity", label: "Perplexity" },
                { id: "gemini", label: "Gemini" },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => launch(t.id)}
                  disabled={!context.trim()}
                  style={{
                    padding: "11px 8px", borderRadius: 12,
                    background: "rgba(201,162,76,0.10)",
                    border: "1px solid rgba(201,162,76,0.32)",
                    color: "var(--atlas-gold)",
                    cursor: context.trim() ? "pointer" : "not-allowed",
                    opacity: context.trim() ? 1 : 0.45,
                    fontFamily: "var(--app-font-mono)", fontSize: 11, letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Dive → {t.label}
                </button>
              ))}
            </div>
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

            {copied && (
              <div style={{ fontSize: 11, color: "var(--atlas-gold)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em" }}>
                COPIED — PASTE INTO GEMINI, THEN BRING THE ANSWER BACK
              </div>
            )}

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
