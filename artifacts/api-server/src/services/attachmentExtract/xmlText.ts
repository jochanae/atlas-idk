/** Decode common XML entities in OOXML text runs. */
export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

/**
 * Collect text from XML elements matching `textTagRe`, splitting on
 * `paraEndTag` to preserve paragraph / line structure.
 */
export function xmlToLines(
  xml: string,
  paraEndTag: string,
  textTagRe: RegExp,
): string {
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

/** Numeric sort for slide1.xml / sheet2.xml style paths. */
export function sortByTrailingNumber(paths: string[]): string[] {
  return [...paths].sort((a, b) => {
    const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0", 10);
    const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0", 10);
    return na - nb;
  });
}
