/**
 * Narrow server-side output guard for unsupported attachment perception and
 * retrieval claims.
 *
 * The guard is intentionally narrow: it only fires when ALL of these are true:
 *   1. The model made a claim that clearly references file/image/attachment content
 *   2. resolvedAttachmentCount === 0 (nothing reached the model this turn)
 *   3. No file-reading tool executed this turn
 *
 * This prevents false-positives on legitimate uses of similar phrasing
 * (e.g. "I can see why that's frustrating") while blocking the documented
 * trust failure: Atlas fabricating "I can see the screenshot" when none existed.
 */

export interface AttachmentEvidence {
  /** allAttachments.length + vault.imageBlocks.length + urlBlocks.length */
  resolvedAttachmentCount: number;
  /** Names of tools that actually ran this turn (populated by runNexusTool) */
  toolsExecutedThisTurn: ReadonlySet<string>;
}

export interface GuardResult {
  clean: boolean;
  /** Matched snippets (up to 120 chars each) for logging */
  violations: string[];
  /** Replacement prose to show/persist instead of the violated response */
  correction: string;
}

/**
 * Narrow perception/retrieval claim patterns.
 * Each pattern is anchored to file/image/attachment context to avoid
 * false-positives on unrelated prose.
 *
 * Covered claim types (per spec):
 *   - "I can see" + attachment context
 *   - "the screenshot shows"
 *   - "the attached file contains"
 *   - "I read/opened/pulled/checked the file"
 */
const PERCEPTION_PATTERNS: RegExp[] = [
  // "I can see" followed by attachment context within 100 chars
  /\bI\s+can\s+see\b.{0,100}(?:attach(?:ment|ed)?|screenshot|the\s+image|the\s+photo|the\s+file|your\s+(?:image|photo|file|screenshot))/i,

  // "the screenshot shows/reveals/displays/contains/looks like"
  /\bthe\s+screenshot\s+(?:shows?|reveals?|displays?|contains?|looks?\s+like|indicates?)\b/i,

  // "the attached file/image/document shows/contains/reveals/says/includes"
  /\bthe\s+attached?\s+(?:file|image|photo|document|screenshot)\s+(?:shows?|contains?|reveals?|says?|indicates?|has\b|includes?|displays?)/i,

  // "your attached X shows/contains/reveals/looks"
  /\byour\s+attached?\s+(?:file|image|photo|document|screenshot)\s+(?:shows?|contains?|reveals?|looks?|says?)/i,

  // Explicit retrieval: "I read/opened/pulled/checked the file" (exact user spec)
  /\bI\s+(?:read|open(?:ed)?|pull(?:ed)?|check(?:ed)?|review(?:ed)?|access(?:ed)?)\s+(?:the|your|this)\s+(?:file|attach\w*|screenshot|image|photo|document)/i,

  // "I see/can see in the image/screenshot"
  /\bI\s+(?:can\s+)?see\s+(?:in|on)\s+(?:the|your)\s+(?:image|screenshot|photo|attach\w*|file)/i,

  // "from the file/image/screenshot you shared/uploaded/sent/attached"
  /\bfrom\s+the\s+(?:file|image|screenshot|photo|attach\w+)\s+(?:you\s+)?(?:shared|uploaded|sent|provided|attached)/i,

  // "looking at the screenshot/image/attachment/file"
  /\blooking\s+at\s+(?:the|your)\s+(?:screenshot|image|photo|attach\w*|file)/i,

  // "based on the image/screenshot/file/attachment"
  /\bbased\s+on\s+(?:the|your)\s+(?:image|screenshot|photo|attach\w*|file)/i,

  // "the image/photo shows/contains/reveals/appears to/indicates"
  /\bthe\s+(?:image|photo)\s+(?:shows?|contains?|reveals?|appears?\s+to|indicates?|looks?\s+like)\b/i,
];

/**
 * Tools whose execution constitutes file-reading evidence.
 * If any of these ran this turn, claims about file content are supportable.
 */
const FILE_READ_TOOLS = new Set([
  "read_file",
  "read_reference_project_file",
  "list_reference_project_dir",
]);

function hasFileReadEvidence(toolsExecutedThisTurn: ReadonlySet<string>): boolean {
  for (const tool of FILE_READ_TOOLS) {
    if (toolsExecutedThisTurn.has(tool)) return true;
  }
  return false;
}

/** Return all pattern matches found in the text (up to one per pattern). */
function findViolations(text: string): string[] {
  const violations: string[] = [];
  for (const pattern of PERCEPTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      violations.push(match[0].slice(0, 120));
    }
  }
  return violations;
}

function buildCorrection(violations: string[]): string {
  const firstViolation = violations[0];
  const exampleLine = firstViolation
    ? `\n\n*(I said: "${firstViolation}${firstViolation.length >= 120 ? "…" : ""}" — but no attachment was present or readable in this message.)*`
    : "";
  return (
    `I don't have access to any attachment in this message — nothing was attached or readable in this turn.` +
    exampleLine +
    `\n\nIf you meant to include a file, please drop it into the next message and I'll work with it directly.`
  );
}

/**
 * Check model output for unsupported attachment perception or retrieval claims.
 *
 * Returns `{ clean: true }` when:
 *   - Supporting evidence exists (files reached the model OR a file-read tool ran), OR
 *   - No matching claims are found in the text.
 *
 * Returns `{ clean: false, violations, correction }` when unsupported claims
 * are found and no evidence supports them.
 */
export function checkAttachmentClaims(
  text: string,
  evidence: AttachmentEvidence,
): GuardResult {
  const hasEvidence =
    evidence.resolvedAttachmentCount > 0 ||
    hasFileReadEvidence(evidence.toolsExecutedThisTurn);

  if (hasEvidence) {
    return { clean: true, violations: [], correction: "" };
  }

  const violations = findViolations(text);

  if (violations.length === 0) {
    return { clean: true, violations: [], correction: "" };
  }

  return {
    clean: false,
    violations,
    correction: buildCorrection(violations),
  };
}
