import { useMemo, useState } from "react";

type DiffLine = {
  type: "add" | "remove" | "context";
  lineOld?: number;
  lineNew?: number;
  text: string;
  /** Word-level diff fragments within this line (only when granularity = 'word'). */
  fragments?: Array<{ text: string; type: "same" | "add" | "remove" }>;
};

export type DiffGranularity = "line" | "word";

type Props = {
  oldCode: string;
  newCode: string;
  oldLabel?: string;
  newLabel?: string;
  onAccept?: () => void;
  onReject?: () => void;
  /** Label shown on the Accept button (defaults to "Accept"). */
  acceptLabel?: string;
  /** Label shown on the Reject button (defaults to "Reject"). */
  rejectLabel?: string;
};

/* ── Line-level diff (LCS) ── */
function computeLineDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
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

/* ── Word-level diff ── */
function computeWordFragments(
  oldText: string,
  newText: string,
): Array<{ text: string; type: "same" | "add" | "remove" }> {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  const m = oldWords.length;
  const n = newWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        oldWords[i - 1] === newWords[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const frags: Array<{ text: string; type: "same" | "add" | "remove" }> = [];
  let ii = m,
    jj = n;
  const rev: typeof frags = [];

  while (ii > 0 || jj > 0) {
    if (ii > 0 && jj > 0 && oldWords[ii - 1] === newWords[jj - 1]) {
      rev.push({ text: oldWords[ii - 1], type: "same" });
      ii--;
      jj--;
    } else if (jj > 0 && (ii === 0 || dp[ii][jj - 1] >= dp[ii - 1][jj])) {
      rev.push({ text: newWords[jj - 1], type: "add" });
      jj--;
    } else {
      rev.push({ text: oldWords[ii - 1], type: "remove" });
      ii--;
    }
  }
  rev.reverse();

  // Merge consecutive same-type fragments
  for (const f of rev) {
    if (frags.length && frags[frags.length - 1].type === f.type) {
      frags[frags.length - 1].text += f.text;
    } else {
      frags.push({ ...f });
    }
  }
  return frags;
}

function computeWordDiff(oldStr: string, newStr: string): DiffLine[] {
  const lineDiff = computeLineDiff(oldStr, newStr);
  // For adjacent add/remove pairs, compute word-level fragments
  const result: DiffLine[] = [];
  for (let k = 0; k < lineDiff.length; k++) {
    const line = lineDiff[k];
    if (
      line.type === "remove" &&
      k + 1 < lineDiff.length &&
      lineDiff[k + 1].type === "add"
    ) {
      const next = lineDiff[k + 1];
      const fragments = computeWordFragments(line.text, next.text);
      result.push({ ...line, fragments: fragments.filter((f) => f.type !== "add") });
      result.push({ ...next, fragments: fragments.filter((f) => f.type !== "remove") });
      k++;
    } else {
      result.push(line);
    }
  }
  return result;
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

const fragColors = {
  add: { bg: "rgba(34, 197, 94, 0.25)", color: "#4ade80" },
  remove: { bg: "rgba(239, 68, 68, 0.25)", color: "#f87171" },
  same: { bg: "transparent", color: "inherit" },
};

export function DiffViewer({
  oldCode,
  newCode,
  oldLabel,
  newLabel,
  onAccept,
  onReject,
  acceptLabel = "Accept",
  rejectLabel = "Reject",
}: Props) {
  const [granularity, setGranularity] = useState<DiffGranularity>("line");

  const lines = useMemo(
    () => (granularity === "word" ? computeWordDiff(oldCode, newCode) : computeLineDiff(oldCode, newCode)),
    [oldCode, newCode, granularity],
  );

  const stats = useMemo(() => {
    let added = 0,
      removed = 0;
    for (const l of lines) {
      if (l.type === "add") added++;
      if (l.type === "remove") removed++;
    }
    return { added, removed };
  }, [lines]);

  const granularityBtn = (g: DiffGranularity, label: string) => (
    <button
      onClick={() => setGranularity(g)}
      style={{
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 9,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.08em",
        textTransform: "uppercase" as const,
        cursor: "pointer",
        border: "0.5px solid",
        borderColor: granularity === g ? "var(--accent-gold)" : "var(--glass-border)",
        background: granularity === g ? "color-mix(in oklab, var(--accent-gold) 15%, transparent)" : "transparent",
        color: granularity === g ? "var(--accent-gold)" : "var(--muted-text)",
        transition: "all 160ms ease",
      }}
    >
      {label}
    </button>
  );

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
          <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent-gold)" }}>
            Diff
          </span>
          <span style={{ fontSize: 10, color: "var(--muted-text)", display: "flex", gap: 8 }}>
            <span style={{ color: lineColors.add.text }}>+{stats.added}</span>
            <span style={{ color: lineColors.remove.text }}>−{stats.removed}</span>
          </span>
          {/* Granularity toggle */}
          <div style={{ display: "flex", gap: 3, marginLeft: 6 }}>
            {granularityBtn("line", "Line")}
            {granularityBtn("word", "Word")}
          </div>
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
                {rejectLabel}
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
                {acceptLabel}
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
              {/* Gutter */}
              <div
                style={{
                  width: 36, flexShrink: 0, textAlign: "right", padding: "0 6px",
                  color: "var(--muted-text)", opacity: 0.4, fontSize: 10,
                  userSelect: "none", background: c.gutter,
                }}
              >
                {line.lineOld ?? ""}
              </div>
              <div
                style={{
                  width: 36, flexShrink: 0, textAlign: "right", padding: "0 6px",
                  color: "var(--muted-text)", opacity: 0.4, fontSize: 10,
                  userSelect: "none", background: c.gutter,
                }}
              >
                {line.lineNew ?? ""}
              </div>
              {/* Symbol */}
              <div
                style={{
                  width: 18, flexShrink: 0, textAlign: "center",
                  color: c.text, fontWeight: 600, userSelect: "none",
                }}
              >
                {c.symbol}
              </div>
              {/* Code — with optional word fragments */}
              <pre
                style={{
                  margin: 0, padding: "0 8px",
                  color: line.type === "context" ? "var(--muted-text)" : c.text,
                  whiteSpace: "pre", flex: 1,
                }}
              >
                {line.fragments
                  ? line.fragments.map((f, fi) => (
                      <span
                        key={fi}
                        style={{
                          background: fragColors[f.type].bg,
                          borderRadius: f.type !== "same" ? 2 : 0,
                        }}
                      >
                        {f.text}
                      </span>
                    ))
                  : line.text}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
