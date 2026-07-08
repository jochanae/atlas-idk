import { useRef, useEffect, useState, useCallback, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import { useNexusChatStream } from "@/hooks/useNexusChatStream";
import { Tier1GapCard } from "@/components/workspace/Tier1GapCard";

interface WorkspaceConversationSurfaceProps {
  projectId: number;
  conversationId?: string | null;
  className?: string;
}

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center", paddingLeft: 2 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "var(--atlas-gold, #c9a24c)",
            opacity: 0.6,
            animation: "wcs-pulse 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </span>
  );
}

function deriveConversationId(projectId: number): string {
  const key = `nexus_conv_${projectId}`;
  try {
    const stored = localStorage.getItem(key);
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function parseWriteFile(content: string): Array<{ path: string; fileContent: string }> {
  const results: Array<{ path: string; fileContent: string }> = [];
  const tokenRe = /WRITE_FILE:\s*(\{[^}]+\})/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(content)) !== null) {
    try {
      const meta = JSON.parse(match[1]) as { path?: string };
      if (!meta.path) continue;
      const before = content.slice(0, match.index);
      const fenceEnd = before.lastIndexOf("```");
      if (fenceEnd === -1) continue;
      const fenceStart = before.lastIndexOf("```", fenceEnd - 1);
      if (fenceStart === -1) continue;
      const rawBlock = before.slice(fenceStart + 3, fenceEnd);
      const firstNewline = rawBlock.indexOf("\n");
      const fileContent = firstNewline === -1 ? rawBlock : rawBlock.slice(firstNewline + 1);
      results.push({ path: meta.path, fileContent });
    } catch {
    }
  }
  return results;
}

export function WorkspaceConversationSurface({
  projectId,
}: WorkspaceConversationSurfaceProps) {
  const [conversationId, setConversationId] = useState<string>(() =>
    deriveConversationId(projectId)
  );
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prevStreamingRef = useRef(false);
  const processedTokens = useRef(new Set<string>());

  const { messages, isStreaming, isPending, send, abort } = useNexusChatStream({
    focusProjectId: projectId,
    mode: "workspace",
    conversationId,
    onConversationId: (id) => {
      setConversationId(id);
      try { localStorage.setItem(`nexus_conv_${projectId}`, id); } catch { }
    },
  });

  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;
    if (!wasStreaming || isStreaming) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const writes = parseWriteFile(last.content);
    for (const { path, fileContent } of writes) {
      const dedupeKey = `${path}::${fileContent.length}`;
      if (processedTokens.current.has(dedupeKey)) continue;
      processedTokens.current.add(dedupeKey);
      fetch("/api/nexus/write-file", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, path, content: fileContent }),
      })
        .then((r) => {
          if (r.ok) {
            window.dispatchEvent(new CustomEvent("axiom:file-edited", { detail: { path, projectId } }));
            window.dispatchEvent(new CustomEvent("axiom:workspace-refresh", { detail: { projectId } }));
          }
        })
        .catch(() => { });
    }
  }, [isStreaming, messages, projectId]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => { autoResize(); }, [input, autoResize]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!atBottom.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  useEffect(() => {
    if (messages.length > 0) {
      const el = scrollRef.current;
      if (el) {
        requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
      }
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isPending || isStreaming) return;
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await send({ text });
  }, [input, isPending, isStreaming, send]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  const canSend = input.trim().length > 0 && !isPending && !isStreaming;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        height: "100%",
        position: "relative",
      }}
    >
      <style>{`
        @keyframes wcs-pulse {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
          40% { transform: scale(1); opacity: 0.9; }
        }
        .wcs-message-content a { color: var(--atlas-gold, #c9a24c); text-decoration: underline; }
        .wcs-message-content code {
          font-family: var(--app-font-mono, monospace);
          font-size: 0.82em;
          background: rgba(255,255,255,0.06);
          border-radius: 3px;
          padding: 1px 5px;
        }
        .wcs-message-content pre {
          background: rgba(0,0,0,0.35);
          border: 0.5px solid rgba(255,255,255,0.08);
          border-radius: 6px;
          padding: 12px 14px;
          overflow-x: auto;
          margin: 8px 0;
        }
        .wcs-message-content pre code {
          background: none;
          padding: 0;
          font-size: 0.8em;
          line-height: 1.55;
        }
        .wcs-message-content p { margin: 0 0 8px; }
        .wcs-message-content p:last-child { margin-bottom: 0; }
        .wcs-message-content ul, .wcs-message-content ol {
          margin: 4px 0 8px;
          padding-left: 18px;
        }
        .wcs-message-content li { margin-bottom: 2px; }
        .wcs-message-content h1, .wcs-message-content h2, .wcs-message-content h3 {
          font-size: 1em;
          font-weight: 600;
          margin: 12px 0 4px;
          color: var(--atlas-fg, rgba(255,255,255,0.92));
        }
        .wcs-message-content blockquote {
          border-left: 2px solid var(--atlas-gold, #c9a24c);
          margin: 8px 0;
          padding-left: 10px;
          color: rgba(255,255,255,0.6);
        }
        .wcs-textarea::-webkit-scrollbar { width: 4px; }
        .wcs-textarea::-webkit-scrollbar-track { background: transparent; }
        .wcs-textarea::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
        .wcs-scroll::-webkit-scrollbar { width: 4px; }
        .wcs-scroll::-webkit-scrollbar-track { background: transparent; }
        .wcs-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>

      <div
        ref={scrollRef}
        className="wcs-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "24px 20px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {messages.length === 0 && !isPending && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 8,
              opacity: 0.35,
              minHeight: 120,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--atlas-gold, #c9a24c)",
                opacity: 0.4,
              }}
            />
            <span
              style={{
                fontFamily: "var(--app-font-mono, monospace)",
                fontSize: "var(--ts-xs, 11px)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--atlas-fg, rgba(255,255,255,0.9))",
              }}
            >
              Atlas workspace
            </span>
          </div>
        )}

        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          const isLast = i === messages.length - 1;
          const displayContent = msg.content
            .replace(/WRITE_FILE:\s*\{[^}]+\}/g, "")
            .trim();
          return (
            <div
              key={msg.id ?? i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: isUser ? "flex-end" : "flex-start",
                gap: 4,
              }}
            >
              <div
                className={isUser ? undefined : "wcs-message-content"}
                style={{
                  maxWidth: isUser ? "72%" : "100%",
                  padding: isUser ? "9px 13px" : "2px 0",
                  borderRadius: isUser ? 14 : 0,
                  background: isUser
                    ? "color-mix(in oklab, var(--atlas-gold, #c9a24c) 12%, rgba(0,0,0,0.4))"
                    : "transparent",
                  border: isUser
                    ? "0.5px solid color-mix(in oklab, var(--atlas-gold, #c9a24c) 22%, transparent)"
                    : "none",
                  fontSize: "var(--ts-sm, 13.5px)",
                  lineHeight: 1.55,
                  color: "var(--atlas-fg, rgba(255,255,255,0.88))",
                  wordBreak: "break-word",
                }}
              >
                {isUser ? (
                  <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
                ) : (
                  <>
                    <ReactMarkdown>
                      {displayContent}
                    </ReactMarkdown>
                    {isLast && msg.streaming && <TypingDots />}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {isPending && !isStreaming && (
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            <TypingDots />
          </div>
        )}
      </div>

      <div
        style={{
          padding: "10px 16px 14px",
          borderTop: "0.5px solid rgba(255,255,255,0.06)",
          background: "var(--atlas-surface, rgba(0,0,0,0.25))",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 8,
            background: "rgba(255,255,255,0.04)",
            border: "0.5px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            padding: "8px 10px 8px 14px",
          }}
        >
          <textarea
            ref={textareaRef}
            className="wcs-textarea"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Atlas…"
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              resize: "none",
              color: "var(--atlas-fg, rgba(255,255,255,0.88))",
              fontSize: "var(--ts-sm, 13.5px)",
              lineHeight: 1.5,
              fontFamily: "var(--app-font-sans, sans-serif)",
              minHeight: 22,
              maxHeight: 200,
              overflow: "auto",
            }}
          />
          {isStreaming ? (
            <button
              onClick={abort}
              style={{
                flexShrink: 0,
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "rgba(255,255,255,0.08)",
                border: "0.5px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.6)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
              }}
              title="Stop"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect x="1" y="1" width="8" height="8" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => void handleSend()}
              disabled={!canSend}
              style={{
                flexShrink: 0,
                width: 30,
                height: 30,
                borderRadius: 8,
                background: canSend
                  ? "color-mix(in oklab, var(--atlas-gold, #c9a24c) 80%, transparent)"
                  : "rgba(255,255,255,0.05)",
                border: canSend
                  ? "none"
                  : "0.5px solid rgba(255,255,255,0.08)",
                color: canSend ? "#000" : "rgba(255,255,255,0.2)",
                cursor: canSend ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.15s, color 0.15s",
              }}
              title="Send (Enter)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            marginTop: 6,
            opacity: 0.3,
          }}
        >
          <span
            style={{
              fontFamily: "var(--app-font-mono, monospace)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--atlas-fg, rgba(255,255,255,0.9))",
            }}
          >
            Atlas · workspace
          </span>
        </div>
      </div>
    </div>
  );
}
