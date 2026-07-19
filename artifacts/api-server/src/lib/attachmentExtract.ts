/**
 * attachmentExtract — text extraction for OOXML binary formats.
 *
 * DOCX, PPTX, and XLSX are ZIP archives containing XML (OOXML / Office Open XML).
 * JSZip is already bundled in api-server, so no extra package is required.
 *
 * Extracts human-readable text so the model sees the actual content instead of
 * a "cannot extract" stub. Falls back to null on any error so the caller can
 * decide how to handle it.
 */
import JSZip from "jszip";

/** Decode XML entities in extracted text. */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

/**
 * Collect all text from XML elements matching `textTagRe`, splitting on
 * `paraEndTag` to preserve paragraph / line structure.
 *
 * @param xml        raw XML string
 * @param paraEndTag closing tag string used as a paragraph separator (e.g. "</w:p>")
 * @param textTagRe  regex with one capture group containing the text value
 */
function xmlToLines(xml: string, paraEndTag: string, textTagRe: RegExp): string {
  const lines: string[] = [];
  for (const para of xml.split(paraEndTag)) {
    const texts: string[] = [];
    const re = new RegExp(textTagRe.source, textTagRe.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(para)) !== null) {
      if (m[1] != null) texts.push(m[1]);
    }
    const line = decodeXmlEntities(texts.join("")).trim();
    if (line) lines.push(line);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ── DOCX ─────────────────────────────────────────────────────────────────────

async function extractDocx(zip: JSZip, filename: string): Promise<string | null> {
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return null;
  const text = xmlToLines(xml, "</w:p>", /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g);
  return text || null;
}

// ── PPTX ─────────────────────────────────────────────────────────────────────

async function extractPptx(zip: JSZip, filename: string): Promise<string | null> {
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
      const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
      return na - nb;
    });

  if (slideFiles.length === 0) return null;

  const parts: string[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.file(slideFiles[i]!)?.async("string");
    if (!xml) continue;
    const text = xmlToLines(xml, "</a:p>", /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g);
    if (text.trim()) parts.push(`[Slide ${i + 1}]\n${text}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

// ── XLSX ──────────────────────────────────────────────────────────────────────

async function extractXlsx(zip: JSZip, filename: string): Promise<string | null> {
  // 1. Shared strings table — all string cell values live here
  const sharedStrings: string[] = [];
  const ssXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  if (ssXml) {
    // Each <si> entry is one string; collect the concatenated <t> text inside it
    for (const si of ssXml.split("</si>")) {
      const texts: string[] = [];
      const tRe = /<t(?:\s[^>]*)?>([^<]*)<\/t>/g;
      let m: RegExpExecArray | null;
      while ((m = tRe.exec(si)) !== null) texts.push(m[1]);
      sharedStrings.push(decodeXmlEntities(texts.join("")));
    }
  }

  // 2. Worksheets
  const sheetFiles = Object.keys(zip.files)
    .filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
      const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
      return na - nb;
    });

  if (sheetFiles.length === 0) return null;

  const parts: string[] = [];
  for (let si = 0; si < sheetFiles.length; si++) {
    const xml = await zip.file(sheetFiles[si]!)?.async("string");
    if (!xml) continue;

    const rows: string[] = [];
    // Match each <row> block
    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
    let rowM: RegExpExecArray | null;
    while ((rowM = rowRe.exec(xml)) !== null) {
      const rowXml = rowM[1]!;
      const cells: string[] = [];
      // Match each <c> element: capture t= attribute and <v> value
      const cellRe = /<c\b([^>]*)>[\s\S]*?<v>([^<]*)<\/v>[\s\S]*?<\/c>/g;
      let cellM: RegExpExecArray | null;
      while ((cellM = cellRe.exec(rowXml)) !== null) {
        const attrs = cellM[1]!;
        const val = cellM[2]!;
        // t="s" means shared string index; otherwise it's an inline value
        const isShared = /\bt="s"/.test(attrs);
        cells.push(isShared ? (sharedStrings[parseInt(val, 10)] ?? val) : val);
      }
      if (cells.some((c) => c !== "")) rows.push(cells.join("\t"));
    }

    if (rows.length > 0) parts.push(`[Sheet ${si + 1}]\n${rows.join("\n")}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract readable text from a base64-encoded OOXML file (DOCX, PPTX, XLSX).
 * Returns `null` if the format is not supported, the ZIP cannot be parsed,
 * or no text content is found.
 *
 * Async but typically fast (< 200 ms for typical document sizes).
 */
export async function extractOoxmlText(
  base64: string,
  filename: string,
): Promise<string | null> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!["docx", "doc", "pptx", "ppt", "xlsx", "xls"].includes(ext)) return null;

  try {
    const buf = Buffer.from(base64, "base64");
    const zip = await JSZip.loadAsync(buf);

    if (ext === "docx" || ext === "doc") return extractDocx(zip, filename);
    if (ext === "pptx" || ext === "ppt") return extractPptx(zip, filename);
    if (ext === "xlsx" || ext === "xls") return extractXlsx(zip, filename);
    return null;
  } catch {
    return null;
  }
}
