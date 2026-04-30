import { useEffect, useRef, useState } from "react";

export type ConsoleEntry = {
  id: string;
  level: "info" | "warn" | "error" | "debug" | "system";
  message: string;
  timestamp: number;
  source?: string;
};

type Props = {
  entries: ConsoleEntry[];
  visible: boolean;
  onToggle: () => void;
};

const LEVEL_COLORS: Record<ConsoleEntry["level"], string> = {
  info: "var(--foreground)",
  warn: "var(--warning, var(--accent-gold))",
  error: "var(--ember)",
  debug: "var(--muted-text)",
  system: "var(--phosphor)",
};

const LEVEL_PREFIX: Record<ConsoleEntry["level"], string> = {
  info: "›",
  warn: "⚠",
  error: "✕",
  debug: "·",
  system: "⬡",
};

export function LiveConsoleStream({ entries, visible, onToggle }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  if (!visible) {
    // Collapsed: thin bar with entry count
    return (
      <button
        onClick={onToggle}
        aria-label="Open build console"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "6px 12px",
          background: "color-mix(in oklab, var(--surface) 60%, transparent)",
          backdropFilter: "blur(16px) saturate(130%)",
          WebkitBackdropFilter: "blur(16px) saturate(130%)",
          border: "none",
          borderTop: "0.5px solid var(--glass-border)",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--muted-text)",
          transition: "background 160ms ease",
        }}
      >
        <span style={{ color: "var(--phosphor)", fontSize: 11 }}>⬡</span>
        Console
        {entries.length > 0 && (
          <span
            style={{
              marginLeft: "auto",
              background: "color-mix(in oklab, var(--accent-gold) 12%, transparent)",
              padding: "1px 6px",
              borderRadius: 8,
              fontSize: 9,
              color: "var(--accent-gold)",
            }}
          >
            {entries.length}
          </span>
        )}
        <svg aria-hidden="true" viewBox="0 0 16 16" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M4 10l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "color-mix(in oklab, var(--background) 92%, transparent)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        borderTop: "0.5px solid var(--glass-border)",
        maxHeight: 200,
        minHeight: 80,
      }}
    >
      {/* Header bar */}
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 12px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--muted-text)",
          borderBottom: "0.5px solid var(--glass-border)",
          width: "100%",
        }}
      >
        <span style={{ color: "var(--phosphor)", fontSize: 11 }}>⬡</span>
        Console
        <span style={{ marginLeft: "auto", opacity: 0.5, fontSize: 9 }}>
          {entries.length} entries
        </span>
        <svg aria-hidden="true" viewBox="0 0 16 16" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Log stream */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "4px 0",
          scrollbarWidth: "none",
        }}
      >
        {entries.length === 0 ? (
          <div
            style={{
              padding: "16px 12px",
              textAlign: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--muted-text)",
              opacity: 0.4,
            }}
          >
            Waiting for build output…
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 6,
                padding: "2px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                lineHeight: 1.5,
                color: LEVEL_COLORS[entry.level],
                animation: "atlas-console-line-in 180ms ease-out",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 12,
                  textAlign: "center",
                  opacity: 0.6,
                  fontSize: 10,
                }}
              >
                {LEVEL_PREFIX[entry.level]}
              </span>
              <span style={{ flex: 1, wordBreak: "break-word" }}>
                {entry.message}
              </span>
              {entry.source && (
                <span style={{ flexShrink: 0, opacity: 0.3, fontSize: 9 }}>
                  {entry.source}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
