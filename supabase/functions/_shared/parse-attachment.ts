// parse-attachment.ts — Fetches an uploaded file by URL and turns it into
// model-ready context. Used by atlas-chat (and any other surface that
// accepts file attachments) to give Atlas actual "eyes" on user material.
//
// Strategy by MIME:
//   text/* | application/json | .md | .csv | .txt   → raw UTF-8 text
//   application/pdf                                  → extracted text (pdf-parse)
//   image/*                                          → return URL for vision input
//   anything else                                    → filename + size summary

export type Attachment = {
  name: string;
  url: string;
  type: string;
};

export type ParsedAttachment = {
  name: string;
  type: string;
  /** Plain text extracted from the file (truncated). null for images/binaries. */
  text: string | null;
  /** When the file is an image, surface its URL so Claude can see it directly. */
  imageUrl: string | null;
  /** Human-friendly note for binaries we can't parse. */
  note: string | null;
};

const MAX_TEXT_CHARS = 20_000; // ~5k tokens per file ceiling

function looksTextual(type: string, name: string): boolean {
  if (type.startsWith("text/")) return true;
  if (type === "application/json") return true;
  const lower = name.toLowerCase();
  return /\.(md|markdown|txt|csv|tsv|json|yaml|yml|log|xml|html?|js|ts|tsx|jsx|css|py|rb|go|rs|java|c|cc|cpp|h|hpp|sh)$/.test(lower);
}

function truncate(s: string): string {
  if (s.length <= MAX_TEXT_CHARS) return s;
  return s.slice(0, MAX_TEXT_CHARS) + `\n\n[... truncated, ${s.length - MAX_TEXT_CHARS} more chars]`;
}

async function parsePdf(buf: ArrayBuffer): Promise<string> {
  // Lightweight, edge-compatible PDF text extraction.
  // unpdf is pure-JS and works in Deno without native deps.
  try {
    const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n\n") : String(text ?? "");
  } catch (err) {
    console.error("parse-attachment: pdf parse failed", err);
    return "";
  }
}

export async function parseAttachment(att: Attachment): Promise<ParsedAttachment> {
  const base: ParsedAttachment = {
    name: att.name,
    type: att.type,
    text: null,
    imageUrl: null,
    note: null,
  };

  // Images → hand the URL to the vision model instead of bytes.
  if (att.type.startsWith("image/")) {
    return { ...base, imageUrl: att.url };
  }

  try {
    const res = await fetch(att.url);
    if (!res.ok) {
      return { ...base, note: `Could not fetch (${res.status})` };
    }

    if (looksTextual(att.type, att.name)) {
      const text = await res.text();
      return { ...base, text: truncate(text) };
    }

    if (att.type === "application/pdf" || att.name.toLowerCase().endsWith(".pdf")) {
      const buf = await res.arrayBuffer();
      const text = await parsePdf(buf);
      if (!text.trim()) {
        return { ...base, note: "PDF contained no extractable text (may be scanned images)." };
      }
      return { ...base, text: truncate(text) };
    }

    // Unknown binary — at least record presence + size.
    const size = res.headers.get("content-length");
    return {
      ...base,
      note: `Binary file (${att.type || "unknown type"}${size ? `, ${size} bytes` : ""}). Atlas can see the filename but not the contents.`,
    };
  } catch (err) {
    console.error("parse-attachment: fetch failed", att.name, err);
    return { ...base, note: "Failed to read this file." };
  }
}

export async function parseAttachments(atts: Attachment[]): Promise<ParsedAttachment[]> {
  if (!atts?.length) return [];
  return Promise.all(atts.map(parseAttachment));
}

/**
 * Render parsed attachments as a context block for the user message.
 * Returns null when nothing useful was extracted.
 */
export function renderAttachmentContext(parsed: ParsedAttachment[]): string | null {
  const textual = parsed.filter((p) => p.text || p.note);
  if (textual.length === 0) return null;

  const blocks = textual.map((p) => {
    const header = `### 📎 ${p.name}${p.type ? ` (${p.type})` : ""}`;
    if (p.text) {
      return `${header}\n\n\`\`\`\n${p.text}\n\`\`\``;
    }
    return `${header}\n\n_${p.note}_`;
  });

  return `\n\n---\n**Attached Source Material** — the operator shared these files for context:\n\n${blocks.join("\n\n")}\n---\n`;
}
