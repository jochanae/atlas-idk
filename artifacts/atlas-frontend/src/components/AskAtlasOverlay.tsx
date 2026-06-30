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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const seededRef = useRef<string | null>(null);

  const chat = useNexusChatStream({
    focusProjectId: null,
    model: "claude",
    conversationId: null,
    projectContext: null,
  });

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
    const t = window.setTimeout(() => textareaRef.current?.focus(), 60);
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

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 2400,
          background: "rgba(4,3,6,0.78)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          animation: "askAtlasScrimIn 200ms ease",
        }}
      />
      <style>{`
        @keyframes askAtlasScrimIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes askAtlasSheetIn { from { transform: translateY(24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
      <div
        role="dialog"
        aria-label="Ask Atlas"
        style={{
          position: "fixed",
          left: "50%", bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          transform: "translateX(-50%)",
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
          animation: "askAtlasSheetIn 260ms cubic-bezier(0.22, 1, 0.36, 1)",
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
            }}>Portfolio thinking · not a workspace</span>
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
              padding: "24px 12px",
              color: "rgba(255,255,255,0.55)",
              fontSize: 14, lineHeight: 1.55,
              textAlign: "center",
            }}>
              Think out loud. Atlas won't build anything here — when an idea is
              ready to ship, you'll see <em>Continue in Workspace</em>.
            </div>
          )}
          {chat.messages.map((m, i) => {
            const isUser = m.role === "user";
            const lastAssistant = !isUser && i === chat.messages.length - 1;
            const showHandoff =
              !isUser && hasBuildIntent(m.content) && !chat.isStreaming;
            return (
              <div key={m.id ?? i} style={{
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
                  {m.content || (lastAssistant && chat.isStreaming ? "…" : "")}
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
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}>
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
