/**
 * Post-stream guard: Atlas must not claim a file was generated unless
 * generate_deliverable actually produced generatedArtifacts this turn.
 *
 * Milestone 2.4 Phase C — Honest execution (E1/E2):
 * Prefer quiet strip; short recovery without quoting false claims or dumping
 * internal process language.
 */

export interface DeliverableGuardEvidence {
  /** Successful generate_deliverable results pushed this turn. */
  generatedArtifactsCount: number;
  /** True when generate_deliverable was invoked this turn (ok or fail). */
  generateDeliverableAttempted?: boolean;
}

export interface DeliverableGuardResult {
  clean: boolean;
  violations: string[];
  correction: string;
}

/**
 * Success / readiness claims that require a real artifact.
 *
 * Do NOT match bare "open it" — discovery prose routinely uses that phrase.
 */
const DELIVERABLE_SUCCESS_PATTERNS: RegExp[] = [
  /\bI(?:'ve| have)\s+(?:created|generated|made|built|produced|prepared)\s+(?:a\s+|an\s+|your\s+|the\s+)?(?:spreadsheet|excel|xlsx|workbook|powerpoint|pptx|deck|slides?|presentation|document|docx|pdf|diagram|chart|file|download|brief|strategy\s+brief|product\s+brief)\b/i,
  /\bhere(?:'s| is)\s+your\s+(?:spreadsheet|excel|xlsx|workbook|powerpoint|pptx|deck|slides?|presentation|document|docx|pdf|diagram|chart|file|brief|strategy\s+brief|product\s+brief)\b/i,
  /\byour\s+(?:strategy\s+brief|product\s+brief|brief|spreadsheet|excel|xlsx|workbook|powerpoint|pptx|deck|presentation|document|docx|pdf|diagram|chart|file)\s+is\s+ready\b/i,
  /\b(?:the\s+)?(?:spreadsheet|excel|xlsx|workbook|powerpoint|pptx|deck|presentation|document|docx|pdf|diagram|chart|file|strategy\s+brief|product\s+brief|brief)\s+(?:is|are)\s+ready\b/i,
  /\bit(?:'s| is)\s+in\s+Outputs\b/i,
  /\bdownload\s+(?:it|the\s+file|the\s+spreadsheet|the\s+deck|the\s+document|the\s+brief)\b/i,
  /\bdownload\s+it\s+from\s+the\s+card\b/i,
  /\bopen\s+(?:the\s+)?(?:file|spreadsheet|deck|document|download|pptx|xlsx|docx|pdf|brief)\b/i,
  /\bI(?:'ve| have)\s+put\s+(?:it|the\s+file)\s+in\s+(?:Outputs|your\s+workspace|the\s+project)\b/i,
  /\bfile\s+(?:is\s+)?(?:ready|available)\s+(?:to\s+download|in\s+(?:this\s+)?conversation|as\s+a\s+card)\b/i,
  /\b(?:generated|created)\s+(?:successfully|the\s+(?:xlsx|pptx|docx|pdf|brief))\b/i,
  // Progressive claims that must not remain in the final reply without an artifact (E2).
  /\b(?:I(?:'m| am)\s+)?generat(?:ing)\s+(?:the\s+|your\s+|a\s+|an\s+)?(?:spreadsheet|excel|xlsx|workbook|powerpoint|pptx|deck|slides?|presentation|document|docx|pdf|diagram|chart|file|brief|strategy\s+brief|product\s+brief)\b/i,
  /\b(?:generating|creating)\s+(?:the\s+|your\s+)?(?:brief|strategy\s+brief|product\s+brief|file|deck|spreadsheet)\s+now\b/i,
];

const QUIET_ATTEMPTED_RECOVERY =
  "I couldn't finish that file — nothing to download yet. Want me to try again?";

const QUIET_UNATTEMPTED_RECOVERY =
  "I don't have a downloadable file from this turn yet. Ask if you'd like me to generate one.";

function findViolations(content: string): string[] {
  const hits: string[] = [];
  for (const re of DELIVERABLE_SUCCESS_PATTERNS) {
    const m = content.match(re);
    if (m?.[0]) hits.push(m[0].slice(0, 120));
  }
  return hits;
}

function buildFullReplacement(attempted: boolean): string {
  return attempted ? QUIET_ATTEMPTED_RECOVERY : QUIET_UNATTEMPTED_RECOVERY;
}

/** Drop sentences/paragraphs that contain a deliverable success claim. */
function stripClaimSpans(content: string): string {
  const blocks = content.split(/\n{2,}/);
  const keptBlocks: string[] = [];

  for (const block of blocks) {
    const sentences = block.split(/(?<=[.!?])\s+/);
    const kept = sentences.filter((s) => findViolations(s).length === 0);
    if (kept.length > 0) keptBlocks.push(kept.join(" "));
  }

  return keptBlocks.join("\n\n").trim();
}

/**
 * When prose claims a deliverable is ready but no artifact was produced:
 * - Tool was attempted → short recovery (failed generation)
 * - Tool was NOT attempted → strip claim spans; if nothing useful remains,
 *   short honesty note. Never leave "download from the card" with no card.
 */
export function checkDeliverableClaims(
  content: string,
  evidence: DeliverableGuardEvidence,
): DeliverableGuardResult {
  if (evidence.generatedArtifactsCount > 0) {
    return { clean: true, violations: [], correction: content };
  }

  const violations = findViolations(content);
  if (violations.length === 0) {
    return { clean: true, violations: [], correction: content };
  }

  const attempted = evidence.generateDeliverableAttempted === true;

  if (attempted) {
    return {
      clean: false,
      violations,
      correction: buildFullReplacement(true),
    };
  }

  // No tool call — strip false readiness claims without nuking discovery prose.
  const stripped = stripClaimSpans(content);
  // If almost nothing remains, the message was only a false readiness claim.
  if (!stripped || stripped.length < 24) {
    return {
      clean: false,
      violations,
      correction: buildFullReplacement(false),
    };
  }

  if (stripped === content.trim()) {
    // Patterns matched but sentence split failed to isolate — fall back.
    return {
      clean: false,
      violations,
      correction: buildFullReplacement(false),
    };
  }

  // Quiet strip — no footer that re-explains the machinery.
  return {
    clean: false,
    violations,
    correction: stripped,
  };
}
