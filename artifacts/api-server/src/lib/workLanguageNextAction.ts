/**
 * Milestone 2.4 Phase B — Kill Stage Theater.
 * Replacement rule: preserve work language; delete process language.
 *
 * Returns a real open question / constraint as an observation, or empty.
 * Never emits stage Mad Libs ("Answer:", "Start shaping…", homework voice).
 */
export function workLanguageNextAction(
  openQuestions: string[],
  constraints: string[],
): string {
  const q = openQuestions[0]?.trim();
  if (q) return q;
  const c = constraints[0]?.trim();
  if (c) return c;
  return "";
}
