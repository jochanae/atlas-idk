/**
 * XLSX send-turn extractor — sheet-per-sheet markdown tables, row-capped.
 */
import {
  entriesMatching,
  openOoxmlPackage,
  readEntryText,
} from "../../lib/verifiers/ooxmlUtils";
import {
  SPREADSHEET_ROW_CAP,
  type AttachmentExtractResult,
} from "./types";
import { decodeXmlEntities, sortByTrailingNumber } from "./xmlText";

async function loadSharedStrings(pkg: Awaited<ReturnType<typeof openOoxmlPackage>>): Promise<string[]> {
  const ssXml = await readEntryText(pkg, "xl/sharedStrings.xml");
  if (!ssXml) return [];
  const sharedStrings: string[] = [];
  for (const si of ssXml.split("</si>")) {
    const texts: string[] = [];
    const tRe = /<t(?:\s[^>]*)?>([^<]*)<\/t>/g;
    let m: RegExpExecArray | null;
    while ((m = tRe.exec(si)) !== null) texts.push(m[1]!);
    sharedStrings.push(decodeXmlEntities(texts.join("")));
  }
  return sharedStrings;
}

function cellsToMarkdownRow(cells: string[]): string {
  const escaped = cells.map((c) => c.replace(/\|/g, "\\|").replace(/\n/g, " "));
  return `| ${escaped.join(" | ")} |`;
}

function rowsToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length), 1);
  const padded = rows.map((r) => {
    const copy = [...r];
    while (copy.length < width) copy.push("");
    return copy;
  });
  const header = padded[0]!;
  const body = padded.slice(1);
  const lines = [
    cellsToMarkdownRow(header),
    `| ${Array(width).fill("---").join(" | ")} |`,
    ...body.map(cellsToMarkdownRow),
  ];
  return lines.join("\n");
}

export async function extract(buf: Buffer): Promise<AttachmentExtractResult> {
  const pkg = await openOoxmlPackage(buf);
  const sharedStrings = await loadSharedStrings(pkg);
  const sheetFiles = sortByTrailingNumber(
    entriesMatching(pkg, /^xl\/worksheets\/sheet\d+\.xml$/i),
  );

  if (sheetFiles.length === 0) {
    throw new Error("XLSX contains 0 worksheets");
  }

  const warnings: string[] = [];
  const parts: string[] = [];
  let totalRows = 0;
  let truncated = false;

  for (let si = 0; si < sheetFiles.length; si++) {
    const xml = await readEntryText(pkg, sheetFiles[si]!);
    if (!xml) continue;

    const rows: string[][] = [];
    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
    let rowM: RegExpExecArray | null;
    while ((rowM = rowRe.exec(xml)) !== null) {
      const rowXml = rowM[1]!;
      const cells: string[] = [];
      const cellRe = /<c\b([^>]*)>(?:[\s\S]*?<v>([^<]*)<\/v>)?[\s\S]*?<\/c>/g;
      let cellM: RegExpExecArray | null;
      while ((cellM = cellRe.exec(rowXml)) !== null) {
        const attrs = cellM[1]!;
        const val = cellM[2] ?? "";
        const isShared = /\bt="s"/.test(attrs);
        const isInline = /\bt="inlineStr"/.test(attrs);
        if (isShared) {
          cells.push(sharedStrings[parseInt(val, 10)] ?? val);
        } else if (isInline) {
          const inline = rowXml
            .slice(cellM.index, cellM.index + cellM[0].length)
            .match(/<t(?:\s[^>]*)?>([^<]*)<\/t>/);
          cells.push(decodeXmlEntities(inline?.[1] ?? val));
        } else {
          cells.push(val);
        }
      }
      if (cells.some((c) => c !== "")) rows.push(cells);
    }

    if (rows.length === 0) continue;

    let sheetRows = rows;
    if (sheetRows.length > SPREADSHEET_ROW_CAP) {
      truncated = true;
      sheetRows = sheetRows.slice(0, SPREADSHEET_ROW_CAP);
      warnings.push(
        `sheet ${si + 1} truncated to first ${SPREADSHEET_ROW_CAP} rows`,
      );
    }
    totalRows += sheetRows.length;
    const table = rowsToMarkdownTable(sheetRows);
    parts.push(`[Sheet ${si + 1}]\n${table}`);
  }

  if (parts.length === 0) {
    throw new Error("XLSX extraction returned no cell text");
  }

  return {
    text: parts.join("\n\n"),
    ...(warnings.length > 0 ? { warnings } : {}),
    stats: {
      sheets: sheetFiles.length,
      rows: totalRows,
      truncated,
    },
  };
}
