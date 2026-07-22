/**
 * Post-stream guard: Atlas must not claim a file was generated unless
 * generate_deliverable actually produced generatedArtifacts this turn.
 *
 * Mirrors the attachment output-guard pattern (replace + correction SSE).
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

/** Success / readiness claims that require a real artifact. */
const DELIVERABLE_SUCCESS_PATTERNS: RegExp[] = [
  /\bI(?:'ve| have)\s+(?:created|generated|made|built|produced|prepared)\s+(?:a\s+|an\s+|your\s+|the\s+)?(?:spreadsheet|excel|xlsx|workbook|powerpoint|pptx|deck|slides?|presentation|document|docx|pdf|diagram|chart|file|download)\b/i,
  /\bhere(?:'s| is)\s+your\s+(?:spreadsheet|excel|xlsx|workbook|powerpoint|pptx|deck|slides?|presentation|document|docx|pdf|diagram|chart|file)\b/i,
  /\b(?:the\s+)?(?:spreadsheet|excel|xlsx|workbook|powerpoint|pptx|deck|presentation|document|docx|pdf|diagram|chart|file)\s+(?:is|are)\s+ready\b/i,
  /\bit(?:'s| is)\s+in\s+Outputs\b/i,
  /\b(?:download|open)\s+(?:it|the\s+file|the\s+spreadsheet|the\s+deck|the\s+document)\b/i,
  /\bI(?:'ve| have)\s+put\s+(?:it|the\s+file)\s+in\s+(?:Outputs|your\s+workspace|the\s+project)\b/i,
  /\bfile\s+(?:is\s+)?(?:ready|available)\s+(?:to\s+download|in\s+(?:this\s+)?conversation|as\s+a\s+card)\b/i,
  /\b(?:generated|created)\s+(?:successfully|the\s+(?:xlsx|pptx|docx|pdf))\b/i,
];

function findViolations(content: string): string[] {
  const hits: string[] = [];
  for (const re of DELIVERABLE_SUCCESS_PATTERNS) {
    const m = content.match(re);
    if (m?.[0]) hits.push(m[0].slice(0, 120));
  }
  return hits;
}

function buildCorrection(violations: string[], attempted: boolean): string {
  const claim =
    violations[0] != null
      ? `\n\n*(I started to claim: "${violations[0]}${violations[0].length >= 120 ? "…" : ""}" — no file was actually produced this turn.)*`
      : "";

  if (attempted) {
    return (
      `I tried to generate that file, but generation did not complete successfully — so there is nothing to download yet.` +
      claim +
      `\n\nTell me if you'd like me to try again, or adjust what the file should include.`
    );
  }

  return (
    `I haven't generated a downloadable file in this turn yet — so there is nothing ready to open or download.` +
    claim +
    `\n\nIf you still want that file, ask me again and I'll call the generator this turn.`
  );
}

/**
 * When prose claims a deliverable is ready but no artifact was produced,
 * replace the response with an honest failure note.
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

  return {
    clean: false,
    violations,
    correction: buildCorrection(
      violations,
      evidence.generateDeliverableAttempted === true,
    ),
  };
}
