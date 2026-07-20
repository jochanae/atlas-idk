/**
 * CSV send-turn extractor — markdown table, row-capped.
 */
import {
  SPREADSHEET_ROW_CAP,
  type AttachmentExtractResult,
} from "./types";

/** Minimal CSV line splitter that respects double-quoted fields. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function cellsToMarkdownRow(cells: string[]): string {
  const escaped = cells.map((c) => c.replace(/\|/g, "\\|").replace(/\n/g, " "));
  return `| ${escaped.join(" | ")} |`;
}

export async function extract(buf: Buffer): Promise<AttachmentExtractResult> {
  const raw = buf.toString("utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new Error("CSV extraction returned no rows");
  }

  const warnings: string[] = [];
  let truncated = false;
  let used = lines;
  if (used.length > SPREADSHEET_ROW_CAP) {
    truncated = true;
    used = used.slice(0, SPREADSHEET_ROW_CAP);
    warnings.push(
      `CSV truncated to first ${SPREADSHEET_ROW_CAP} rows`,
    );
  }

  const rows = used.map(parseCsvLine);
  const width = Math.max(...rows.map((r) => r.length), 1);
  const padded = rows.map((r) => {
    const copy = [...r];
    while (copy.length < width) copy.push("");
    return copy;
  });

  const header = padded[0]!;
  const body = padded.slice(1);
  const table = [
    cellsToMarkdownRow(header),
    `| ${Array(width).fill("---").join(" | ")} |`,
    ...body.map(cellsToMarkdownRow),
  ].join("\n");

  return {
    text: table,
    ...(warnings.length > 0 ? { warnings } : {}),
    stats: {
      sheets: 1,
      rows: padded.length,
      truncated,
    },
  };
}
