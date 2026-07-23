export type CommitCardPayload = {
  v: 1;
  title: string;
  summary: string;
  severity: "blocker" | "decision";
  verb: "commit";
  mode?: "build_ready" | "decision";
  commitLabel?: string;
};

// Forward-looking decision language — Atlas is proposing something new
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

// Atlas is observing/summarizing existing context — not proposing a new decision
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
  // Aesthetic / design-language observations — Atlas noting existing context, not deciding
  "the aesthetic is already",
  "aesthetic is locked",
  "already locked in from",
  "the design language is",
  "design language is already",
];

// Atlas is evaluating the work — never a user-facing decision
// If the title candidate starts with one of these, suppress the card.
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

// User has explicitly signaled build intent — card should name the next step
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

// Atlas is asking a question or pushing back — do not show BUILD READY
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

const BLOCKER_TRIGGERS = ["block", "must", "critical"];

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

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Honesty-fallback / meta messages must never become BUILD READY card copy. */
const GUARD_FALLBACK_MARKERS = [
  "i haven't generated a downloadable file",
  "i tried to generate that file, but generation did not complete",
  "no file was actually produced this turn",
  "nothing ready to open or download",
];

export function detectDecisionMoment(
  atlasResponse: string,
  userMessage?: string,
): CommitCardPayload | null {
  const clean = atlasResponse.trim();
  if (clean.length <= 150) return null;
  if (isCodeHeavy(clean)) return null;

  const lower = clean.toLowerCase();
  const userLower = (userMessage ?? "").toLowerCase();

  // Deliverable-guard fallback is not a product decision / build-ready signal
  if (GUARD_FALLBACK_MARKERS.some((m) => lower.includes(m))) return null;

  // Atlas is summarizing/observing — not proposing a decision
  if (SUMMARY_SUPPRESSORS.some((s) => lower.includes(s))) return null;

  // BUILD READY: user explicitly requested initialization/build AND Atlas isn't pushing back
  const hasBuildIntent = BUILD_INTENT_TRIGGERS.some((t) => userLower.includes(t));
  const atlasPushingBack = PUSHBACK_SIGNALS.some((s) => lower.includes(s));

  if (hasBuildIntent && !atlasPushingBack && userMessage) {
    const sentences = sentenceSplit(clean);
    // Find the first sentence that isn't a self-evaluation opener
    const confirmSentence =
      sentences.find((s) => {
        const sl = s.toLowerCase();
        return !SELF_EVAL_OPENERS.some((e) => sl.startsWith(e));
      }) ??
      sentences[0] ??
      clean;

    return {
      v: 1,
      title: "Ready to initialize?",
      summary: truncate(confirmSentence, 200),
      severity: "decision",
      verb: "commit",
      mode: "build_ready",
      commitLabel: "Initialize",
    };
  }

  // Regular decision detection
  if (!DECISION_TRIGGERS.some((trigger) => lower.includes(trigger))) return null;

  const sentences = sentenceSplit(clean);

  // Find the sentence that actually contains the trigger — that's the decision
  const triggerSentence = sentences.find((s) => {
    const sl = s.toLowerCase();
    return DECISION_TRIGGERS.some((t) => sl.includes(t));
  });

  // Title candidate: the trigger sentence (not sentence[0], which is often Atlas's preamble)
  const titleCandidate = triggerSentence ?? sentences[0] ?? clean;
  const candidateLower = titleCandidate.toLowerCase();

  // Suppress if the title is a self-evaluation ("This is a sharp brief." etc.)
  if (SELF_EVAL_OPENERS.some((e) => candidateLower.startsWith(e))) return null;
  // Also suppress if it's an observation re-check on the specific candidate
  if (SUMMARY_SUPPRESSORS.some((s) => candidateLower.includes(s))) return null;

  // Summary: the sentence after the trigger, as supporting context
  const triggerIdx = triggerSentence ? sentences.indexOf(triggerSentence) : 0;
  const summarySource = sentences[triggerIdx + 1] ?? sentences[1] ?? clean;

  const title = truncate(titleCandidate, 80);
  const summary = truncate(summarySource, 200);
  const severity = BLOCKER_TRIGGERS.some((trigger) => lower.includes(trigger))
    ? "blocker"
    : "decision";

  return {
    v: 1,
    title,
    summary,
    severity,
    verb: "commit",
    mode: "decision",
  };
}
