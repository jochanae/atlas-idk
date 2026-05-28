import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, Sparkles, FolderInput, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { API_BASE, getAuthHeaders } from "@/lib/api";

interface MentalShredderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShredResult {
  reframe: string;
  smallest_action: string;
  original: string;
}

const SUGGESTIONS = [
  "I'm behind on every project I touch.",
  "What if this whole thing fails?",
  "I can't keep up.",
  "I'll never get clarity on this.",
];

const goldGrad = "linear-gradient(135deg, #F2D89A 0%, #C9A24C 100%)";
const goldGradSoft = "linear-gradient(135deg, rgba(242,216,154,0.18) 0%, rgba(201,162,76,0.10) 100%)";

export function MentalShredderModal({ open, onOpenChange }: MentalShredderModalProps) {
  const [thought, setThought] = useState("");
  const [phase, setPhase] = useState<"input" | "shredding" | "result">("input");
  const [result, setResult] = useState<ShredResult | null>(null);
  const [isFiling, setIsFiling] = useState(false);

  const reset = () => {
    setThought("");
    setResult(null);
    setPhase("input");
    setIsFiling(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      reset();
      onOpenChange(false);
    } else {
      onOpenChange(true);
    }
  };

  const handleShred = async () => {
    const text = thought.trim();
    if (text.length < 3) {
      toast.error("Drop a thought to shred (at least a few words).");
      return;
    }
    setPhase("shredding");
    try {
      const resp = await fetch(`${API_BASE}/api/mental-shredder`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ thought: text }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({} as Record<string, unknown>));
        throw new Error((err as { error?: string }).error || `Shredder failed (${resp.status})`);
      }
      const data = (await resp.json()) as ShredResult;
      await new Promise((r) => setTimeout(r, 900));
      setResult({ ...data, original: data.original ?? text });
      setPhase("result");
    } catch (e) {
      console.error("[mental-shredder] error:", e);
      toast.error(e instanceof Error ? e.message : "Couldn't shred that thought. Try again.");
      setPhase("input");
    }
  };

  const handleFile = () => {
    if (!result) return;
    setIsFiling(true);
    // Transient session: no persistence. Surface as a premium gold toast.
    setTimeout(() => {
      toast.success("Filed to your Vault.", {
        className: "atlas-toast-premium",
        description: "Reframe + smallest action saved to this session.",
      });
      reset();
      onOpenChange(false);
    }, 350);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="p-0 max-w-lg overflow-hidden border-0 bg-transparent"
        style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}
      >
        <div
          style={{
            position: "relative",
            background: "linear-gradient(180deg, #16151B 0%, #0B0A0F 100%)",
            border: "1px solid rgba(230,198,135,0.28)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {/* Ambient gold glow */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(60% 40% at 50% 0%, rgba(230,198,135,0.12), transparent 70%)",
          }} />

          {/* Header */}
          <div style={{
            position: "relative",
            padding: "16px 48px 14px 18px",
            borderBottom: "1px solid rgba(230,198,135,0.16)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: goldGrad,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 14px rgba(230,198,135,0.35)",
              flexShrink: 0,
            }}>
              <Sparkles size={15} strokeWidth={2.4} color="#1a1606" />
            </div>
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--atlas-fg)", letterSpacing: "-0.005em" }}>
                Mental Shredder
              </div>
              <div style={{
                fontSize: 10.5, fontFamily: "var(--app-font-mono)",
                letterSpacing: "0.12em", textTransform: "uppercase",
                color: "var(--atlas-gold)", opacity: 0.8, marginTop: 2,
              }}>
                Zero-trace · Sovereign session
              </div>
            </div>
          </div>

          {/* Body */}
          <div style={{ position: "relative", padding: "18px 20px 20px", minHeight: 320 }}>
            {phase === "input" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ fontSize: 13, color: "var(--atlas-fg)", opacity: 0.75, lineHeight: 1.55, margin: 0 }}>
                  Drop the noise. Atlas turns anxious chatter into structure and one smallest next move.
                </p>
                <textarea
                  value={thought}
                  onChange={(e) => setThought(e.target.value)}
                  placeholder="e.g. I'll never get this product to launch…"
                  maxLength={1000}
                  rows={4}
                  style={{
                    width: "100%", resize: "none",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(230,198,135,0.18)",
                    borderRadius: 8, padding: "10px 12px",
                    fontSize: 13, color: "var(--atlas-fg)",
                    fontFamily: "var(--app-font-sans)", lineHeight: 1.5,
                    outline: "none",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(230,198,135,0.45)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(230,198,135,0.18)"; }}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setThought(s)}
                      style={{
                        fontSize: 11, padding: "4px 10px", borderRadius: 999,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(230,198,135,0.18)",
                        color: "var(--atlas-fg)", opacity: 0.75,
                        cursor: "pointer", fontFamily: "var(--app-font-sans)",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleShred}
                  disabled={thought.trim().length < 3}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 8,
                    background: thought.trim().length < 3 ? "rgba(230,198,135,0.18)" : goldGrad,
                    color: thought.trim().length < 3 ? "rgba(255,255,255,0.45)" : "#1a1606",
                    border: "none", cursor: thought.trim().length < 3 ? "default" : "pointer",
                    fontWeight: 600, fontSize: 13.5, letterSpacing: "0.01em",
                    fontFamily: "var(--app-font-sans)",
                    boxShadow: thought.trim().length < 3 ? "none" : "0 6px 18px rgba(201,162,76,0.28)",
                    transition: "transform 120ms ease",
                  }}
                >
                  Shred it
                </button>
              </div>
            )}

            {phase === "shredding" && (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", minHeight: 280, gap: 22,
              }}>
                <div style={{ width: "100%", maxWidth: 340 }}>
                  <div style={{
                    textAlign: "center", fontSize: 13.5, fontStyle: "italic",
                    color: "var(--atlas-fg)", opacity: 0.85, marginBottom: 16,
                    padding: "0 8px",
                  }}>
                    "{thought}"
                  </div>
                  <div style={{ display: "flex", gap: 2, height: 48, overflow: "hidden" }}>
                    {Array.from({ length: 24 }).map((_, i) => (
                      <span
                        key={i}
                        style={{
                          flex: 1,
                          background: "linear-gradient(180deg, #E6C687 0%, rgba(230,198,135,0.25) 100%)",
                          borderRadius: 2,
                          animation: `atlasShredFall 700ms ease-in ${i * 25}ms forwards`,
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 12, color: "var(--atlas-gold)", opacity: 0.85,
                  fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}>
                  <Loader2 size={13} className="animate-spin" />
                  Restructuring
                </div>
              </div>
            )}

            {phase === "result" && result && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "fadeIn 280ms ease" }}>
                <div style={{
                  borderRadius: 12,
                  border: "1px solid rgba(230,198,135,0.32)",
                  background: goldGradSoft,
                  padding: "14px 14px 16px",
                  boxShadow: "0 0 28px rgba(230,198,135,0.08) inset",
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
                    textTransform: "uppercase", color: "var(--atlas-gold)",
                    opacity: 0.85, marginBottom: 6, fontFamily: "var(--app-font-mono)",
                  }}>
                    Atlas Reframe
                  </div>
                  <p style={{ fontSize: 14, color: "var(--atlas-fg)", lineHeight: 1.55, margin: 0 }}>
                    {result.reframe}
                  </p>
                  <div style={{ height: 1, background: "rgba(230,198,135,0.18)", margin: "12px 0" }} />
                  <div style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
                    textTransform: "uppercase", color: "var(--atlas-gold)",
                    opacity: 0.85, marginBottom: 6, fontFamily: "var(--app-font-mono)",
                  }}>
                    Smallest Next Action
                  </div>
                  <p style={{ fontSize: 14, color: "var(--atlas-fg)", lineHeight: 1.55, margin: 0 }}>
                    {result.smallest_action}
                  </p>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={reset}
                    style={{
                      flex: 1, padding: "9px 12px", borderRadius: 8,
                      background: "transparent",
                      border: "1px solid rgba(230,198,135,0.25)",
                      color: "var(--atlas-fg)", opacity: 0.8,
                      cursor: "pointer", fontSize: 13, fontWeight: 500,
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                      fontFamily: "var(--app-font-sans)",
                    }}
                  >
                    <RotateCcw size={13} /> Shred another
                  </button>
                  <button
                    type="button"
                    onClick={handleFile}
                    disabled={isFiling}
                    style={{
                      flex: 1, padding: "9px 12px", borderRadius: 8,
                      background: goldGrad, color: "#1a1606",
                      border: "none", cursor: isFiling ? "default" : "pointer",
                      fontSize: 13, fontWeight: 600,
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                      fontFamily: "var(--app-font-sans)",
                      boxShadow: "0 6px 18px rgba(201,162,76,0.28)",
                    }}
                  >
                    {isFiling ? <Loader2 size={13} className="animate-spin" /> : <FolderInput size={13} />}
                    File to Vault
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{
            padding: "8px 18px 12px", textAlign: "center",
            fontSize: 10, color: "var(--atlas-muted)", opacity: 0.55,
            fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", textTransform: "uppercase",
          }}>
            Transient · Not logged · Not stored
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
