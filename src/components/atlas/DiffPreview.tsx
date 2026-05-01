import { useState, useMemo } from "react";
import { ArrowLeftRight, Eye, Code2 } from "lucide-react";

interface DiffPreviewProps {
  oldCode: string;
  newCode: string;
  filename: string;
  oldLabel?: string;
  newLabel?: string;
  onAccept?: () => void;
  onReject?: () => void;
}

type ViewMode = "split" | "unified" | "preview";

interface DiffLine {
  type: "same" | "add" | "remove";
  content: string;
  oldNum?: number;
  newNum?: number;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const lines: DiffLine[] = [];

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: "same", content: oldLines[i - 1], oldNum: i, newNum: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "add", content: newLines[j - 1], newNum: j });
      j--;
    } else {
      result.unshift({ type: "remove", content: oldLines[i - 1], oldNum: i });
      i--;
    }
  }

  return result;
}

export function DiffPreview({
  oldCode,
  newCode,
  filename,
  oldLabel = "Before",
  newLabel = "After",
  onAccept,
  onReject,
}: DiffPreviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const diff = useMemo(() => computeDiff(oldCode, newCode), [oldCode, newCode]);

  const stats = useMemo(() => {
    const added = diff.filter((l) => l.type === "add").length;
    const removed = diff.filter((l) => l.type === "remove").length;
    return { added, removed };
  }, [diff]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-border/40">
        <div className="flex items-center gap-2">
          <ArrowLeftRight size={12} className="text-muted-foreground" />
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            {filename}
          </span>
          <span className="text-[9px] font-mono text-emerald-400/70">+{stats.added}</span>
          <span className="text-[9px] font-mono text-red-400/70">-{stats.removed}</span>
        </div>
        <div className="flex items-center gap-1">
          {(["split", "unified"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider transition-colors ${
                viewMode === mode
                  ? "bg-accent/20 text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Diff body */}
      <div className="flex-1 min-h-0 overflow-auto">
        {viewMode === "split" ? (
          <div className="flex h-full">
            {/* Old */}
            <div className="flex-1 border-r border-border/30 overflow-auto">
              <div className="px-1 py-1">
                <div className="text-[8px] font-mono text-muted-foreground/40 uppercase tracking-widest px-2 py-1 border-b border-border/20 mb-1">
                  {oldLabel}
                </div>
                {diff.filter((l) => l.type !== "add").map((line, i) => (
                  <DiffLineRow key={i} line={line} side="old" />
                ))}
              </div>
            </div>
            {/* New */}
            <div className="flex-1 overflow-auto">
              <div className="px-1 py-1">
                <div className="text-[8px] font-mono text-muted-foreground/40 uppercase tracking-widest px-2 py-1 border-b border-border/20 mb-1">
                  {newLabel}
                </div>
                {diff.filter((l) => l.type !== "remove").map((line, i) => (
                  <DiffLineRow key={i} line={line} side="new" />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-1 py-1">
            {diff.map((line, i) => (
              <DiffLineRow key={i} line={line} side="unified" />
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      {(onAccept || onReject) && (
        <div className="flex-shrink-0 flex items-center justify-end gap-2 px-3 py-2 border-t border-border/40">
          {onReject && (
            <button
              type="button"
              onClick={onReject}
              className="px-3 py-1 rounded text-[9px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/30 border border-border/40 transition-colors"
            >
              Reject <kbd className="ml-1 text-[8px] opacity-40">⌘U</kbd>
            </button>
          )}
          {onAccept && (
            <button
              type="button"
              onClick={onAccept}
              className="px-3 py-1 rounded text-[9px] font-mono uppercase tracking-wider bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/20 transition-colors"
            >
              Accept <kbd className="ml-1 text-[8px] opacity-60">⌘Y</kbd>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DiffLineRow({ line, side }: { line: DiffLine; side: "old" | "new" | "unified" }) {
  const bgColor =
    line.type === "add"
      ? "bg-emerald-500/8"
      : line.type === "remove"
      ? "bg-red-500/8"
      : "bg-transparent";

  const textColor =
    line.type === "add"
      ? "text-emerald-300/80"
      : line.type === "remove"
      ? "text-red-300/80"
      : "text-foreground/60";

  const prefix =
    line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";

  const lineNum =
    side === "old" ? line.oldNum : side === "new" ? line.newNum : (line.newNum ?? line.oldNum);

  return (
    <div className={`flex items-start ${bgColor} hover:brightness-110 transition-colors`}>
      <span className="flex-shrink-0 w-8 text-right text-[9px] font-mono text-muted-foreground/30 px-1 py-px select-none">
        {lineNum ?? ""}
      </span>
      <span className={`flex-shrink-0 w-4 text-center text-[10px] font-mono ${textColor} select-none`}>
        {prefix}
      </span>
      <pre className={`flex-1 text-[10px] font-mono ${textColor} py-px pr-2 whitespace-pre-wrap break-all`}>
        {line.content}
      </pre>
    </div>
  );
}
