/**
 * DOCX send-turn extractor — paragraphs + heading styles via OOXML walk.
 */
import {
  openOoxmlPackage,
  readEntryText,
} from "../../lib/verifiers/ooxmlUtils";
import type { AttachmentExtractResult } from "./types";
import { decodeXmlEntities } from "./xmlText";

function paragraphText(paraXml: string): string {
  const texts: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(paraXml)) !== null) {
    if (m[1] != null) texts.push(m[1]);
  }
  return decodeXmlEntities(texts.join("")).trim();
}

function headingLevel(paraXml: string): number | null {
  // w:pStyle w:val="Heading1" / "heading 2" / "Title" etc.
  const style =
    paraXml.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/i)?.[1] ??
    paraXml.match(/<w:pStyle\b[^>]*w:val='([^']+)'/i)?.[1] ??
    null;
  if (!style) return null;
  const normalized = style.trim().toLowerCase().replace(/\s+/g, "");
  if (normalized === "title") return 1;
  const m = normalized.match(/^heading([1-6])$/);
  if (m) return parseInt(m[1]!, 10);
  return null;
}

export async function extract(buf: Buffer): Promise<AttachmentExtractResult> {
  const pkg = await openOoxmlPackage(buf);
  const xml = await readEntryText(pkg, "word/document.xml");
  if (!xml) {
    throw new Error("DOCX missing word/document.xml");
  }

  const paragraphs = xml.split("</w:p>");
  const lines: string[] = [];
  let paragraphCount = 0;

  for (const para of paragraphs) {
    const text = paragraphText(para);
    if (!text) continue;
    paragraphCount += 1;
    const level = headingLevel(para);
    if (level != null) {
      const hashes = "#".repeat(Math.min(Math.max(level, 1), 6));
      lines.push(`${hashes} ${text}`);
    } else {
      lines.push(text);
    }
  }

  const text = lines.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    throw new Error("DOCX extraction returned no text");
  }

  return {
    text,
    stats: { paragraphs: paragraphCount },
  };
}
