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

const ALL_LEVELS: ConsoleEntry["level"][] = ["info", "warn", "error", "debug", "system"];

export function LiveConsoleStream({ entries, visible, onToggle }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [activeFilters, setActiveFilters] = useState<Set<ConsoleEntry["level"]>>(
    () => new Set(ALL_LEVELS),
  );

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

  const toggleFilter = (level: ConsoleEntry["level"]) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        if (next.size > 1) next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const filtered = entries.filter((e) => activeFilters.has(e.level));

  const errorCount = entries.filter((e) => e.level === "error").length;
  const warnCount = entries.filter((e) => e.level === "warn").length;

  if (!visible) {
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
      className="flex flex-col h-full"
      style={{
        background: "color-mix(in oklab, var(--background) 92%, transparent)",
      }}
    >
      {/* Header bar with filters */}
      <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/40">
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mr-1">Filter:</span>
        {ALL_LEVELS.map((level) => {
          const active = activeFilters.has(level);
          const count = level === "error" ? errorCount : level === "warn" ? warnCount : undefined;
          return (
            <button
              key={level}
              type="button"
              onClick={() => toggleFilter(level)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider transition-colors"
              style={{
                background: active ? "color-mix(in oklab, var(--accent) 10%, transparent)" : "transparent",
                color: active ? LEVEL_COLORS[level] : "var(--muted-text)",
                opacity: active ? 1 : 0.4,
                border: `0.5px solid ${active ? "var(--border)" : "transparent"}`,
              }}
            >
              <span style={{ fontSize: 8 }}>{LEVEL_PREFIX[level]}</span>
              {level}
              {count !== undefined && count > 0 && (
                <span className="text-[8px]" style={{ color: LEVEL_COLORS[level] }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
        <span className="ml-auto text-[9px] font-mono text-muted-foreground/50">
          {filtered.length}/{entries.length}
        </span>
      </div>

      {/* Log stream */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        style={{ padding: "4px 0", scrollbarWidth: "none" }}
      >
        {filtered.length === 0 ? (
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
            {entries.length === 0 ? "Waiting for build output…" : "No matching logs"}
          </div>
        ) : (
          filtered.map((entry) => (
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
              <span style={{ flexShrink: 0, width: 12, textAlign: "center", opacity: 0.6, fontSize: 10 }}>
                {LEVEL_PREFIX[entry.level]}
              </span>
              <span style={{ flex: 1, wordBreak: "break-word" }}>{entry.message}</span>
              {entry.source && (
                <span style={{ flexShrink: 0, opacity: 0.3, fontSize: 9 }}>{entry.source}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
