/**
 * Shared decision-signal helpers for backend catch suppression.
 * Mirrors the frontend DecisionCatchEngine suppressors so commit cards
 * and catch cards do not stack on the same message.
 */

const SUMMARY_SUPPRESSORS = [
  "from what i can see",
  "from what i've seen",
  "from what i can tell",
  "looking at the project",
  "looking at your project",
  "the committed decisions",
  "committed decisions show",
  "what i can see",
  "as i understand",
  "here's a summary",
  "to summarize",
  "in summary",
  "reviewing your",
  "i've reviewed",
  "i've scanned",
  "based on the project",
  "based on what i",
  "here's what i found",
  "here's where we are",
  "here's what i know",
  "i can see that",
  "what we have so far",
  "the project shows",
  "the architecture shows",
  "based on the codebase",
  "as far as i can tell",
  "looking at what",
  "from the codebase",
  "the aesthetic is already",
  "aesthetic is locked",
  "already locked in from",
  "the design language is",
  "design language is already",
];

const DECISION_TRIGGERS = [
  "decided",
  "going with",
  "the approach is",
  "locked in",
  "the fix is",
  "the pattern is",
  "the decision is",
  "i'd go with",
  "we're going with",
  "we'll use",
  "we've decided",
  "let's use",
  "let's go with",
  "we'll go with",
];

const BUILD_INTENT_TRIGGERS = [
  "initialize",
  "initialize the project",
  "build it out",
  "build this out",
  "build out",
  "build it",
  "let's build",
  "go ahead and build",
  "start building",
  "kick it off",
  "start the project",
  "create the project",
  "set it up",
  "generate the",
  "scaffold",
];

const PUSHBACK_SIGNALS = [
  "before we build",
  "before building",
  "before i build",
  "not yet",
  "i'd push on",
  "the question i'd",
  "i want to understand",
  "what's your instinct",
  "what do you mean by",
  "can you clarify",
  "which of these",
  "which approach",
  "what would you",
  "one question",
  "a few questions",
];

const SELF_EVAL_OPENERS = [
  "this is a sharp",
  "this is a clear",
  "this is a well",
  "this is a good",
  "this is a strong",
  "this is a solid",
  "this is an interesting",
  "that's a sharp",
  "that's a clear",
  "that's a good",
  "that's a strong",
  "sharp brief",
  "well-shaped brief",
  "clear brief",
  "good brief",
];

const CODE_BLOCK_RE = /```[\s\S]{200,}?```/;

function isCodeHeavy(message: string): boolean {
  if (message.includes("FILE_EDIT_START")) return true;
  if (message.includes("ARTIFACT:")) return true;
  if (message.includes("LINE_PATCH_START")) return true;
  const codeBlocks: string[] = message.match(/```[\s\S]*?```/g) ?? [];
  const codeChars = codeBlocks.reduce((sum, b) => sum + b.length, 0);
  if (codeChars > message.length * 0.35) return true;
  if (CODE_BLOCK_RE.test(message)) return true;
  return false;
}

function sentenceSplit(message: string): string[] {
  return message
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** Atlas is summarizing/observing — not proposing a forward action. */
export function isSummaryObservation(assistantText: string): boolean {
  const lower = assistantText.trim().toLowerCase();
  return SUMMARY_SUPPRESSORS.some((s) => lower.includes(s));
}

/** Would the frontend render a CommitCard on this turn? */
export function wouldEmitCommitCard(assistantText: string, userText?: string): boolean {
  const clean = assistantText.trim();
  if (clean.length <= 150) return false;
  if (isCodeHeavy(clean)) return false;

  const lower = clean.toLowerCase();
  const userLower = (userText ?? "").toLowerCase();

  if (SUMMARY_SUPPRESSORS.some((s) => lower.includes(s))) return false;

  const hasBuildIntent = BUILD_INTENT_TRIGGERS.some((t) => userLower.includes(t));
  const atlasPushingBack = PUSHBACK_SIGNALS.some((s) => lower.includes(s));
  if (hasBuildIntent && !atlasPushingBack && userText) return true;

  if (!DECISION_TRIGGERS.some((trigger) => lower.includes(trigger))) return false;

  const sentences = sentenceSplit(clean);
  const triggerSentence = sentences.find((s) => {
    const sl = s.toLowerCase();
    return DECISION_TRIGGERS.some((t) => sl.includes(t));
  });
  const titleCandidate = triggerSentence ?? sentences[0] ?? clean;
  const candidateLower = titleCandidate.toLowerCase();

  if (SELF_EVAL_OPENERS.some((e) => candidateLower.startsWith(e))) return false;
  if (SUMMARY_SUPPRESSORS.some((s) => candidateLower.includes(s))) return false;

  return true;
}
