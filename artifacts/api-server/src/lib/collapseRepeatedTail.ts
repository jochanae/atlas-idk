/**
 * Collapse duplicated trailing content in streamed assistant text.
 *
 * Seen in Ask Atlas when a closing question is appended twice with no
 * separator (model/stream finalize glitch), e.g.:
 *   "...how she finds it first?...how she finds it first?"
 */

export function collapseRepeatedTail(text: string): string {
  if (!text || text.length < 80) return text;

  // Collapse consecutive identical paragraphs.
  const paras = text.split(/\n{2,}/);
  const dedupedParas: string[] = [];
  for (const p of paras) {
    const prev = dedupedParas[dedupedParas.length - 1];
    if (prev != null && prev.trim() === p.trim()) continue;
    dedupedParas.push(p);
  }
  let result = dedupedParas.join("\n\n");

  // Exact back-to-back duplicate of the trailing slice.
  const max = Math.min(Math.floor(result.length / 2), 600);
  for (let len = max; len >= 40; len--) {
    const a = result.slice(-len * 2, -len);
    const b = result.slice(-len);
    if (a === b) return result.slice(0, -len);
  }

  // Same trailing slice repeated with only whitespace between copies.
  for (let len = max; len >= 40; len--) {
    const b = result.slice(-len);
    // Find where the first copy would end if mid is whitespace-only.
    for (let midLen = 0; midLen <= 8; midLen++) {
      const firstEnd = result.length - len - midLen;
      if (firstEnd < len) break;
      const mid = result.slice(firstEnd, firstEnd + midLen);
      if (mid.trim() !== "") continue;
      const a = result.slice(firstEnd - len, firstEnd);
      if (a === b) return result.slice(0, firstEnd);
    }
  }

  return result;
}
