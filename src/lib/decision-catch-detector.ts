/**
 * Decision-moment detector — client-side heuristic.
 *
 * NOTE: This is distinct from supabase/functions/_shared/decision-catch.ts.
 * That server-side detector looks for "Before you do —" + a quoted prior
 * committed entry (a true Decision Catch). This one is the lighter
 * client-side hint: scan a long Atlas message for decision-shaped language
 * so the UI can surface a CommitPrompt nudge.
 *
 * Ported from Axiom (artifacts/atlas/src/lib/DecisionCatchEngine.ts).
 * Atlas's `DecisionCatchPayload` requires an `against` entry that this
 * detector cannot synthesise from prose alone — so we return our own
 * narrow `DetectedDecisionMoment` shape. Callers map it into a
 * CommitPrompt or a CommitCard payload as appropriate.
 */

export interface DetectedDecisionMoment {
  v: 1;
  title: string;
  summary: string;
  severity: "blocker" | "decision";
  verb: "commit";
}

const DECISION_TRIGGERS = [
  "recommend",
  "decided",
  "going with",
  "the approach is",
  "this means",
  "locked in",
  "the fix is",
  "the pattern is",
  "the decision is",
  "we should",
  "i'd go with",
];

const BLOCKER_TRIGGERS = ["block", "must", "critical"];

function sentenceSplit(message: string): string[] {
  return message
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Detect a decision moment in assistant prose. Returns null when the
 * message is short or contains no decision-shaped language.
 */
export function detectDecisionMoment(
  message: string,
): DetectedDecisionMoment | null {
  const clean = message.trim();
  if (clean.length <= 150) return null;

  const lower = clean.toLowerCase();
  if (!DECISION_TRIGGERS.some((t) => lower.includes(t))) return null;

  const sentences = sentenceSplit(clean);
  const title = truncate(sentences[0] ?? clean, 80);
  const summary = truncate(sentences[1] ?? clean, 200);
  const severity = BLOCKER_TRIGGERS.some((t) => lower.includes(t))
    ? "blocker"
    : "decision";

  return { v: 1, title, summary, severity, verb: "commit" };
}
