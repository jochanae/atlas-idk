import { useState } from "react";

/**
 * CommitPrompt — appears after clarity is reached (post-Adjust, post-resolution).
 * Two buttons: Commit Decision / Keep Exploring. No third option.
 *
 * This is a UI-only prompt. The actual commit transition is owned by the
 * caller (typically createEntryFromCard or commitEntry from src/lib/entries.ts),
 * because the caller already knows the context (session, message, payload).
 *
 * Per POSITIONING.md §6, this only appears when the conversation has reached
 * something concrete enough to lock in. The caller decides when to render it.
 */
export interface CommitPromptProps {
  /** The candidate decision title — what would land in the Ledger. */
  title: string;
  /** Optional 1-line summary shown beneath the title. */
  summary?: string;
  /** Called when the user wants to lock it in. */
  onCommit: (note?: string) => void | Promise<void>;
  /** Called when the user wants to keep exploring instead. */
  onKeepExploring?: () => void;
  /** Disable both buttons (e.g. while a commit is in flight). */
  busy?: boolean;
}

export function CommitPrompt({
  title,
  summary,
  onCommit,
  onKeepExploring,
  busy = false,
}: CommitPromptProps) {
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

  const handleCommit = async () => {
    if (busy) return;
    await onCommit(note.trim() || undefined);
  };

  return (
    <div
      role="region"
      aria-label="Commit prompt"
      style={{
        marginTop: 10,
        padding: "12px 14px",
        borderRadius: 10,
        background:
          "linear-gradient(180deg, color-mix(in oklab, var(--accent-gold) 5%, transparent), transparent)",
        border: "1px solid color-mix(in oklab, var(--accent-gold) 35%, var(--border))",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase" as const,
          color: "var(--accent-gold)",
          marginBottom: 6,
        }}
      >
        What are we committing to?
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: "-0.01em",
          color: "var(--foreground)",
        }}
      >
        {title}
      </div>
      {summary && (
        <div
          style={{
            marginTop: 4,
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--muted-text)",
          }}
        >
          {summary}
        </div>
      )}

      {showNote && (
        <textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional — note for future-you."
          rows={2}
          style={{
            marginTop: 10,
            width: "100%",
            background: "var(--surface-alt)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 13,
            color: "var(--foreground)",
            fontFamily: "var(--font-sans)",
            outline: "none",
            resize: "vertical",
          }}
        />
      )}

      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!showNote) {
              setShowNote(true);
              return;
            }
            void handleCommit();
          }}
          style={{
            padding: "7px 14px",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            background: "var(--accent-gold)",
            color: "var(--background)",
            border: "1px solid var(--accent-gold)",
            borderRadius: 4,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? "Committing…" : showNote ? "Lock it in" : "Commit decision"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setShowNote(false);
            setNote("");
            onKeepExploring?.();
          }}
          style={{
            padding: "7px 14px",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            background: "transparent",
            color: "var(--muted-text)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          Keep exploring
        </button>
      </div>
    </div>
  );
}
