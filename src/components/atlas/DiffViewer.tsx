import { useMemo } from "react";

type DiffLine = {
  type: "add" | "remove" | "context";
  lineOld?: number;
  lineNew?: number;
  text: string;
};

type Props = {
  oldCode: string;
  newCode: string;
  oldLabel?: string;
  newLabel?: string;
  onAccept?: () => void;
  onReject?: () => void;
};

/**
 * Simple line-level diff. Uses longest common subsequence approach
 * for a clean before/after comparison.
 */
function computeDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");

  // LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const result: DiffLine[] = [];
  let i = m,
    j = n;
  const stack: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: "context", lineOld: i, lineNew: j, text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: "add", lineNew: j, text: newLines[j - 1] });
      j--;
    } else {
      stack.push({ type: "remove", lineOld: i, text: oldLines[i - 1] });
      i--;
    }
  }

  stack.reverse();
  return stack;
}

const lineColors = {
  add: {
    bg: "rgba(34, 197, 94, 0.08)",
    border: "rgba(34, 197, 94, 0.25)",
    text: "#4ade80",
    gutter: "rgba(34, 197, 94, 0.15)",
    symbol: "+",
  },
  remove: {
    bg: "rgba(239, 68, 68, 0.08)",
    border: "rgba(239, 68, 68, 0.25)",
    text: "#f87171",
    gutter: "rgba(239, 68, 68, 0.15)",
    symbol: "−",
  },
  context: {
    bg: "transparent",
    border: "transparent",
    text: "var(--muted-text)",
    gutter: "transparent",
    symbol: " ",
  },
};

export function DiffViewer({ oldCode, newCode, oldLabel, newLabel, onAccept, onReject }: Props) {
  const lines = useMemo(() => computeDiff(oldCode, newCode), [oldCode, newCode]);

  const stats = useMemo(() => {
    let added = 0,
      removed = 0;
    for (const l of lines) {
      if (l.type === "add") added++;
      if (l.type === "remove") removed++;
    }
    return { added, removed };
  }, [lines]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--background)",
        fontFamily: "var(--font-mono)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "0.5px solid var(--glass-border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="var(--accent-gold)" strokeWidth={1.4}>
            <path d="M3 8h10M8 3v10" strokeLinecap="round" opacity={0.5} />
            <path d="M2 2h5v5H2zM9 9h5v5H9z" strokeLinejoin="round" />
          </svg>
          <span
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--accent-gold)",
            }}
          >
            Diff
          </span>
          <span style={{ fontSize: 10, color: "var(--muted-text)", display: "flex", gap: 8 }}>
            <span style={{ color: lineColors.add.text }}>+{stats.added}</span>
            <span style={{ color: lineColors.remove.text }}>−{stats.removed}</span>
          </span>
        </div>
        {(onAccept || onReject) && (
          <div style={{ display: "flex", gap: 6 }}>
            {onReject && (
              <button
                onClick={onReject}
                style={{
                  padding: "4px 12px",
                  borderRadius: 6,
                  background: "color-mix(in oklab, var(--violated) 15%, transparent)",
                  border: "0.5px solid color-mix(in oklab, var(--violated) 30%, transparent)",
                  color: lineColors.remove.text,
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                }}
              >
                Reject
              </button>
            )}
            {onAccept && (
              <button
                onClick={onAccept}
                style={{
                  padding: "4px 12px",
                  borderRadius: 6,
                  background: "color-mix(in oklab, var(--phosphor) 15%, transparent)",
                  border: "0.5px solid color-mix(in oklab, var(--phosphor) 30%, transparent)",
                  color: lineColors.add.text,
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                }}
              >
                Accept
              </button>
            )}
          </div>
        )}
      </div>

      {/* Labels */}
      {(oldLabel || newLabel) && (
        <div
          style={{
            display: "flex",
            gap: 16,
            padding: "6px 14px",
            borderBottom: "0.5px solid var(--glass-border)",
            fontSize: 10,
            color: "var(--muted-text)",
          }}
        >
          {oldLabel && (
            <span>
              <span style={{ color: lineColors.remove.text }}>◀</span> {oldLabel}
            </span>
          )}
          {newLabel && (
            <span>
              <span style={{ color: lineColors.add.text }}>▶</span> {newLabel}
            </span>
          )}
        </div>
      )}

      {/* Diff lines */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "auto",
          fontSize: 11,
          lineHeight: 1.7,
        }}
      >
        {lines.map((line, i) => {
          const c = lineColors[line.type];
          return (
            <div
              key={i}
              style={{
                display: "flex",
                background: c.bg,
                borderLeft: `2px solid ${c.border}`,
                minHeight: 20,
              }}
            >
              {/* Gutter — line numbers */}
              <div
                style={{
                  width: 36,
                  flexShrink: 0,
                  textAlign: "right",
                  padding: "0 6px",
                  color: "var(--muted-text)",
                  opacity: 0.4,
                  fontSize: 10,
                  userSelect: "none",
                  background: c.gutter,
                }}
              >
                {line.lineOld ?? ""}
              </div>
              <div
                style={{
                  width: 36,
                  flexShrink: 0,
                  textAlign: "right",
                  padding: "0 6px",
                  color: "var(--muted-text)",
                  opacity: 0.4,
                  fontSize: 10,
                  userSelect: "none",
                  background: c.gutter,
                }}
              >
                {line.lineNew ?? ""}
              </div>
              {/* Symbol */}
              <div
                style={{
                  width: 18,
                  flexShrink: 0,
                  textAlign: "center",
                  color: c.text,
                  fontWeight: 600,
                  userSelect: "none",
                }}
              >
                {c.symbol}
              </div>
              {/* Code */}
              <pre
                style={{
                  margin: 0,
                  padding: "0 8px",
                  color: line.type === "context" ? "var(--muted-text)" : c.text,
                  whiteSpace: "pre",
                  flex: 1,
                }}
              >
                {line.text}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
