import { useState } from "react";

export type ThinkingPrompt = {
  id: string;
  content: string;      // the question
  definition: string;   // why now
  benefit: string;      // payoff
};

type Props = {
  prompts: ThinkingPrompt[];
  loading?: boolean;
  onAsk: (prompt: ThinkingPrompt) => void;
  onPark: (prompt: ThinkingPrompt) => void;
  onDismiss: (prompt: ThinkingPrompt) => void;
  onRefresh?: () => void;
};

/**
 * §XI Phase 3 — "What Should I Be Thinking About Now"
 * A quiet card surfacing 1–3 anticipatory questions.
 * Lives in Zone B, above the chat thread.
 */
export function ThinkingPromptCard({
  prompts,
  loading,
  onAsk,
  onPark,
  onDismiss,
  onRefresh,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(
    prompts[0]?.id ?? null,
  );

  if (!loading && prompts.length === 0) return null;

  return (
    <div
      style={{
        margin: "0 4px 12px",
        padding: "10px 12px",
        borderRadius: 10,
        background:
          "color-mix(in oklab, var(--accent-gold) 4%, var(--surface))",
        border:
          "0.5px solid color-mix(in oklab, var(--accent-gold) 28%, var(--border))",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: prompts.length ? 8 : 0,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--accent-gold)",
            opacity: 0.85,
          }}
        >
          ◇ What you might think about now
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh prompts"
            title="Refresh"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted-text)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.4 : 0.6,
              padding: 2,
            }}
          >
            {loading ? "…" : "↻"}
          </button>
        )}
      </div>

      {loading && prompts.length === 0 && (
        <div
          style={{
            fontSize: 12,
            color: "var(--muted-text)",
            fontStyle: "italic",
            opacity: 0.7,
          }}
        >
          Atlas is reading the ledger…
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {prompts.map((p) => {
          const open = expanded === p.id;
          return (
            <div
              key={p.id}
              style={{
                borderRadius: 7,
                background: open ? "var(--background)" : "transparent",
                border: open
                  ? "0.5px solid color-mix(in oklab, var(--accent-gold) 22%, var(--border))"
                  : "0.5px solid transparent",
                transition: "all 180ms var(--ease-cinematic)",
              }}
            >
              <button
                type="button"
                onClick={() => setExpanded(open ? null : p.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  color: "var(--foreground)",
                  fontSize: 13,
                  lineHeight: 1.45,
                  padding: "8px 10px",
                  cursor: "pointer",
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    color: "var(--accent-gold)",
                    opacity: 0.6,
                    fontSize: 10,
                    marginTop: 3,
                    flexShrink: 0,
                  }}
                >
                  {open ? "▾" : "▸"}
                </span>
                <span>{p.content}</span>
              </button>

              {open && (
                <div
                  style={{
                    padding: "0 10px 10px 26px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "var(--muted-text)",
                        opacity: 0.7,
                        marginBottom: 2,
                      }}
                    >
                      Why now
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted-text)",
                        lineHeight: 1.5,
                      }}
                    >
                      {p.definition}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "var(--muted-text)",
                        opacity: 0.7,
                        marginBottom: 2,
                      }}
                    >
                      Payoff
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted-text)",
                        lineHeight: 1.5,
                      }}
                    >
                      {p.benefit}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      marginTop: 4,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onAsk(p)}
                      style={primaryBtn}
                    >
                      Ask Atlas
                    </button>
                    <button
                      type="button"
                      onClick={() => onPark(p)}
                      style={ghostBtn}
                    >
                      Park
                    </button>
                    <button
                      type="button"
                      onClick={() => onDismiss(p)}
                      style={ghostBtn}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: "var(--accent-gold)",
  color: "var(--background)",
  border: "none",
  borderRadius: 6,
  padding: "5px 10px",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--muted-text)",
  border: "0.5px solid var(--border)",
  borderRadius: 6,
  padding: "5px 10px",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  cursor: "pointer",
};
