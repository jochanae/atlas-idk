// AskAtlasOverlay — ephemeral "I am thinking" surface.
//
// Architectural rules (locked in plan.md):
//   • This is NOT a workspace. No file editing. No Builder. No Forge.
//   • Conversations here are intentionally portfolio-scoped (no project_id).
//   • When Atlas's reply leans into build/implementation intent, surface a
//     single "→ Continue in Workspace" action that hands the thread off to
//     the real workspace flow via a CustomEvent.
//
// Backend usage: reuses useNexusChatStream with focusProjectId=null. No new
// endpoint, no payload change.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, X, ArrowRight } from "lucide-react";
import { useNexusChatStream } from "@/hooks/useNexusChatStream";

const BUILD_INTENT_RE =
  /\b(let'?s build|i'?ll build|let me build|implement(?:ing|ed)?|scaffold(?:ing|ed)?|create the (?:project|workspace|file|component)|spin up|kick off the build|start building|wire (?:this )?up|generate the (?:project|code|files))\b/i;

function hasBuildIntent(text: string): boolean {
  return BUILD_INTENT_RE.test(text);
}

export interface AskAtlasOverlayProps {
  open: boolean;
  onClose: () => void;
  seedMessage?: string | null;
  onOpenHistory?: () => void;
  /** Called when the user taps "Continue in Workspace". Receives the seed
   *  text we want the real workspace to start from. */
  onContinueInWorkspace: (seed: string) => void;
}

export function AskAtlasOverlay({
  open,
  onClose,
  seedMessage,
  onOpenHistory,
  onContinueInWorkspace,
}: AskAtlasOverlayProps) {
  const [draft, setDraft] = useState("");
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const seededRef = useRef<string | null>(null);

  const chat = useNexusChatStream({
    focusProjectId: null,
    model: "claude",
    conversationId: null,
    projectContext: null,
  });

  // Mount/unmount with exit animation
  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(r);
    }
    setVisible(false);
    const t = window.setTimeout(() => setMounted(false), 220);
    return () => window.clearTimeout(t);
  }, [open]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Autofocus composer when the overlay opens
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open]);

  // Seed the first message exactly once per seed value
  useEffect(() => {
    if (!open) return;
    const text = (seedMessage ?? "").trim();
    if (!text) return;
    if (seededRef.current === text) return;
    seededRef.current = text;
    void chat.send({ text });
  }, [open, seedMessage, chat]);

  // Reset the seed gate when the overlay closes so reopening with the same
  // text still re-sends.
  useEffect(() => {
    if (!open) seededRef.current = null;
  }, [open]);

  const handoffSeed = useMemo(() => {
    // Stitch the last few turns into a compact handoff prompt.
    const lines: string[] = [];
    for (const m of chat.messages.slice(-6)) {
      lines.push(`${m.role === "user" ? "Me" : "Atlas"}: ${m.content.trim()}`);
    }
    if (!lines.length) return draft.trim();
    return [
      "Continuing from an Ask Atlas thread:",
      "",
      ...lines,
      "",
      "Let's move this into the workspace and build.",
    ].join("\n");
  }, [chat.messages, draft]);

  const submit = () => {
    const text = draft.trim();
    if (!text || chat.isStreaming || chat.isPending) return;
    setDraft("");
    void chat.send({ text });
  };

  if (!mounted || typeof document === "undefined") return null;

  const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 2400,
          background: "rgba(4,3,6,0.78)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          opacity: visible ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
      />
      <style>{`
        @keyframes askAtlasDot { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0) } 40% { opacity: 1; transform: translateY(-2px) } }
        @keyframes askAtlasMsgIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        .ask-atlas-msg { animation: askAtlasMsgIn 220ms ${EASE} both; }
        .ask-atlas-chip { transition: background 160ms, border-color 160ms, transform 160ms; }
        .ask-atlas-chip:hover { background: rgba(212,175,55,0.10); border-color: rgba(212,175,55,0.32); }
        .ask-atlas-chip:active { transform: scale(0.97); }
      `}</style>
      <div
        role="dialog"
        aria-label="Ask Atlas"
        style={{
          position: "fixed",
          left: "50%", bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          transform: `translateX(-50%) translateY(${visible ? "0" : "16px"})`,
          opacity: visible ? 1 : 0,
          transition: `transform 260ms ${EASE}, opacity 220ms ease`,
          zIndex: 2401,
          width: "min(560px, calc(100vw - 24px))",
          maxHeight: "min(78vh, 720px)",
          display: "flex", flexDirection: "column",
          background: "rgba(18,16,22,0.97)",
          border: "1px solid rgba(212,175,55,0.28)",
          borderRadius: 18,
          boxShadow: "0 28px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
          overflow: "hidden",
          fontFamily: "var(--app-font-sans)",
          willChange: "transform, opacity",
        }}
      >
        {/* Header */}
        <header style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 26, height: 26, borderRadius: 8,
            background: "rgba(212,175,55,0.14)",
            color: "rgba(212,175,55,0.95)",
            fontFamily: "var(--app-font-serif, Georgia, serif)",
            fontWeight: 600, fontSize: 16, lineHeight: 1,
            letterSpacing: "-0.02em",
            filter: "drop-shadow(0 0 4px rgba(212,175,55,0.35))",
          }}>A</span>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span style={{
              fontFamily: "var(--app-font-mono)", fontSize: 10,
              letterSpacing: "0.18em", textTransform: "uppercase",
              color: "rgba(212,175,55,0.85)",
            }}>Ask Atlas</span>
            <span style={{
              fontSize: 11, color: "rgba(255,255,255,0.45)",
              letterSpacing: "0.01em",
            }}>Thinking across your portfolio</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            {onOpenHistory && (
              <button
                onClick={onOpenHistory}
                aria-label="Conversation history"
                title="Conversation history"
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 30, height: 30, borderRadius: 8,
                  background: "rgba(201,162,76,0.12)",
                  color: "rgba(201,162,76,0.9)",
                  border: "none", cursor: "pointer", padding: 0,
                }}
              >
                <Clock size={15} strokeWidth={1.7} />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close Ask Atlas"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 30, height: 30, borderRadius: 8,
                background: "transparent",
                color: "rgba(255,255,255,0.55)",
                border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", padding: 0,
              }}
            >
              <X size={14} strokeWidth={1.8} />
            </button>
          </div>
        </header>

        {/* Transcript */}
        <div style={{
          flex: 1, overflowY: "auto",
          padding: "14px 16px",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          {chat.messages.length === 0 && (
            <div style={{
              padding: "28px 8px 16px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
              textAlign: "center",
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 14,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: "radial-gradient(circle at 50% 35%, rgba(212,175,55,0.32), rgba(212,175,55,0.06) 70%)",
                border: "1px solid rgba(212,175,55,0.28)",
                color: "rgba(255,232,170,0.98)",
                fontFamily: "var(--app-font-serif, Georgia, serif)",
                fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em",
                filter: "drop-shadow(0 0 10px rgba(212,175,55,0.25))",
              }}>A</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 340 }}>
                <div style={{
                  fontFamily: "var(--app-font-mono)", fontSize: 10,
                  letterSpacing: "0.2em", textTransform: "uppercase",
                  color: "rgba(212,175,55,0.8)",
                }}>I am thinking</div>
                <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 14.5, lineHeight: 1.55 }}>
                  Think out loud. Nothing here gets built or saved to a project.
                </div>
                <div style={{ color: "rgba(255,255,255,0.42)", fontSize: 12.5, lineHeight: 1.5 }}>
                  When an idea is ready to ship, you'll see <em>Continue in Workspace</em>.
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 4 }}>
                {[
                  "What should I work on next?",
                  "Help me name this idea",
                  "Pressure-test this decision",
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    className="ask-atlas-chip"
                    onClick={() => {
                      setDraft(sample);
                      window.setTimeout(() => textareaRef.current?.focus(), 0);
                    }}
                    style={{
                      padding: "6px 10px", borderRadius: 999,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.72)",
                      fontSize: 12, cursor: "pointer",
                      fontFamily: "var(--app-font-sans)",
                    }}
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chat.messages.map((m, i) => {
            const isUser = m.role === "user";
            const lastAssistant = !isUser && i === chat.messages.length - 1;
            const showHandoff =
              !isUser && hasBuildIntent(m.content) && !chat.isStreaming;
            const isWaiting = lastAssistant && chat.isStreaming && !m.content;
            return (
              <div key={m.id ?? i} className="ask-atlas-msg" style={{
                display: "flex", flexDirection: "column", gap: 8,
                alignItems: isUser ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  maxWidth: "92%",
                  padding: isUser ? "9px 12px" : "2px 0",
                  borderRadius: isUser ? 12 : 0,
                  background: isUser ? "rgba(212,175,55,0.12)" : "transparent",
                  color: isUser ? "rgba(255,247,220,0.96)" : "rgba(255,255,255,0.92)",
                  border: isUser ? "1px solid rgba(212,175,55,0.22)" : "none",
                  fontSize: 14.5, lineHeight: 1.6,
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {isWaiting ? (
                    <span aria-label="Atlas is thinking" style={{ display: "inline-flex", gap: 4, alignItems: "center", height: 18 }}>
                      {[0, 1, 2].map((n) => (
                        <span key={n} style={{
                          width: 5, height: 5, borderRadius: 999,
                          background: "rgba(212,175,55,0.85)",
                          display: "inline-block",
                          animation: `askAtlasDot 1100ms ${EASE} ${n * 140}ms infinite`,
                        }} />
                      ))}
                    </span>
                  ) : m.content}
                </div>
                {showHandoff && (
                  <button
                    onClick={() => {
                      onContinueInWorkspace(handoffSeed);
                      onClose();
                    }}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "7px 12px", borderRadius: 999,
                      background: "rgba(212,175,55,0.14)",
                      color: "rgba(212,175,55,0.95)",
                      border: "1px solid rgba(212,175,55,0.4)",
                      cursor: "pointer",
                      fontFamily: "var(--app-font-mono)", fontSize: 10.5,
                      letterSpacing: "0.1em", textTransform: "uppercase",
                    }}
                  >
                    Continue in Workspace
                    <ArrowRight size={12} strokeWidth={2} />
                  </button>
                )}
              </div>
            );
          })}
          {chat.isPending && chat.messages.length > 0 && !chat.isStreaming && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Capturing intent…
            </div>
          )}
        </div>

        {/* Composer */}
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "10px 12px calc(12px + env(safe-area-inset-bottom, 0px))",
          display: "flex", alignItems: "flex-end", gap: 8,
        }}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask Atlas anything…"
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "9px 12px",
              color: "var(--atlas-fg, #fff)",
              fontFamily: "var(--app-font-sans)",
              fontSize: 14.5, lineHeight: 1.5,
              outline: "none",
              maxHeight: 140, minHeight: 38,
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || chat.isStreaming || chat.isPending}
            aria-label="Send"
            style={{
              width: 38, height: 38, borderRadius: 10,
              background: draft.trim() ? "rgba(212,175,55,0.9)" : "rgba(212,175,55,0.25)",
              color: "#0a0a0a",
              border: "none",
              cursor: draft.trim() ? "pointer" : "not-allowed",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              transition: "background 160ms",
            }}
          >
            <ArrowRight size={16} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

export default AskAtlasOverlay;
