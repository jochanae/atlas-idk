import { useCallback, useRef, useState } from "react";
import { useRun } from "@/context/RunContext";

/**
 * Composer — canonical send surface for the V1.2 turn-entry endpoint.
 *
 * Rules (see spec):
 *   - Generates one client-side UUID as the idempotencyKey per send attempt.
 *   - Retries reuse the same key so the server dedupes to the same run.
 *   - Optimistic UI is limited to the user message (via provider's
 *     pendingMessages). No optimistic assistant message, run card, plan,
 *     receipt, or timeline row is created here.
 *   - 202 is "accepted", not "completed". All assistant prose and run state
 *     arrive via SSE + REST hydration.
 *   - If the server returns `duplicate: true`, the existing pending row is
 *     reused; no second user message is added.
 *   - UNSUPPORTED_CONVERSATION_ID and other errors are surfaced verbatim.
 */
export function Composer() {
  const { sendMessage } = useRun();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Preserve the pending idempotency key so a Retry keeps the same UUID.
  const pendingKeyRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(async () => {
    const content = text.trim();
    if (!content || busy) return;
    setError(null);
    setBusy(true);

    const key = pendingKeyRef.current ?? crypto.randomUUID();
    pendingKeyRef.current = key;

    const res = await sendMessage(content, key);
    setBusy(false);
    if (res.ok) {
      setText("");
      pendingKeyRef.current = null;
      textareaRef.current?.focus();
    } else {
      // Keep the text + idempotency key so the user can retry with the same
      // key. That's the whole point of client-side idempotency.
      setError(res.code ? `${res.code}: ${res.error}` : res.error);
    }
  }, [text, busy, sendMessage]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 12px",
        borderTop: "1px solid var(--border)",
        background: "var(--panel)",
      }}
    >
      {error && (
        <div
          role="alert"
          style={{
            color: "var(--fail)",
            fontSize: 12,
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span>{error}</span>
          <button
            onClick={submit}
            disabled={busy}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text)",
              borderRadius: 6,
              padding: "2px 8px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message Atlas…"
          rows={2}
          disabled={busy}
          style={{
            flex: 1,
            resize: "none",
            padding: "8px 10px",
            background: "var(--panel-2)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 14,
            fontFamily: "inherit",
            lineHeight: 1.5,
          }}
        />
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          style={{
            padding: "8px 14px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: busy || !text.trim() ? "var(--panel-2)" : "var(--text)",
            color: busy || !text.trim() ? "var(--muted)" : "var(--panel)",
            fontSize: 13,
            cursor: busy || !text.trim() ? "default" : "pointer",
          }}
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
