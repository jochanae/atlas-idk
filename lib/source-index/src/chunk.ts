export type TextChunk = {
  chunkIndex: number;
  lineStart: number;
  lineEnd: number;
  content: string;
};

const DEFAULT_WINDOW = 40;
const DEFAULT_OVERLAP = 10;

/**
 * Chunk text into ~40-line windows with 10-line overlap (1-indexed lines).
 */
export function chunkText(
  content: string,
  options?: { windowLines?: number; overlapLines?: number },
): TextChunk[] {
  const windowLines = options?.windowLines ?? DEFAULT_WINDOW;
  const overlapLines = options?.overlapLines ?? DEFAULT_OVERLAP;
  const step = Math.max(1, windowLines - overlapLines);
  const lines = content.split("\n");
  if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) return [];

  const chunks: TextChunk[] = [];
  let chunkIndex = 0;
  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(lines.length, start + windowLines);
    const slice = lines.slice(start, end);
    chunks.push({
      chunkIndex,
      lineStart: start + 1,
      lineEnd: end,
      content: slice.join("\n"),
    });
    chunkIndex++;
    if (end >= lines.length) break;
  }
  return chunks;
}
