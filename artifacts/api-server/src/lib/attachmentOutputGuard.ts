/**
 * Narrow server-side output guard for unsupported attachment perception and
 * retrieval claims.
 *
 * Firing conditions (all must be true):
 *   1. The model made a claim that clearly references file/image/attachment content.
 *   2. The specific file named in the claim (by filename or MIME-type keyword) did NOT
 *      have its content supplied to the model this turn.
 *   3. No file-reading tool (read_file, read_reference_project_file,
 *      list_reference_project_dir) executed this turn.
 *
 * Per-attachment granularity: a readable PDF cannot authorize claims about a
 * storage-only PPTX in the same message. Each violation is checked against the
 * specific attachment it appears to target.
 */

export interface ResolvedAttachmentInfo {
  attachmentId: string;
  filename: string;
  mimeType: string;
  capability: "model_readable" | "storage_only" | "failed";
  /** True only when the file's content (base64 / text block) was injected into
   *  the model context for this turn. */
  contentSuppliedToModel: boolean;
}

export interface AttachmentEvidence {
  /** Per-attachment evidence for this turn only — resolved + skipped. */
  attachments: ResolvedAttachmentInfo[];
  /** Names of tools that actually ran this turn (populated by runNexusTool). */
  toolsExecutedThisTurn: ReadonlySet<string>;
}

export interface GuardResult {
  clean: boolean;
  /** Matched snippets (up to 120 chars each) for logging. */
  violations: string[];
  /** Replacement prose to show/persist instead of the violated response. */
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
 *   - direct filename references: "based on deck.pptx", "looking at slides.pptx"
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

  // Explicit retrieval: "I read/opened/pulled/checked the file" — extended with
  // common document-type nouns so "I read the spreadsheet" and "I opened the PDF" fire.
  /\bI\s+(?:read|open(?:ed)?|pull(?:ed)?|check(?:ed)?|review(?:ed)?|access(?:ed)?)\s+(?:the|your|this)\s+(?:file|attach\w*|screenshot|image|photo|document|spreadsheet|presentation|pdf|csv|slides?|deck)\b/i,

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

  // Direct filename reference: "based on deck.pptx", "looking at report.pdf",
  // "from slides.pptx", "in data.xlsx" — any supported file extension.
  /\b(?:based\s+on|looking\s+at|from|in)\s+[\w][\w.()\- ]*\.(?:pdf|docx?|pptx?|xlsx?|xls|csv|png|jpe?g|gif|webp|txt|md)\b/i,
];

/**
 * Tools whose execution constitutes file-reading evidence.
 * If any of these ran this turn, all file content claims are supportable.
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

/**
 * MIME-type keyword descriptors for identifying which attachment a claim targets.
 * Checked in order; first match wins.
 */
const MIME_KEYWORDS: Array<{
  pattern: RegExp;
  test: (mimeType: string, filename: string) => boolean;
}> = [
  {
    pattern: /\bspreadsheet\b|excel\b|\.xlsx?\b|\.csv\b|\bcsv\s+file\b/i,
    test: (m, n) =>
      m.includes("spreadsheet") ||
      m === "text/csv" ||
      n.endsWith(".xlsx") ||
      n.endsWith(".xls") ||
      n.endsWith(".csv"),
  },
  {
    pattern: /\bpptx\b|\.ppt\b|\bpowerpoint\b|\bpresentation\b|\bslides?\b/i,
    test: (m, n) =>
      m.includes("presentationml") ||
      n.endsWith(".pptx") ||
      n.endsWith(".ppt"),
  },
  {
    pattern: /\bdocx?\b|\bword\s+doc(?:ument)?\b/i,
    test: (m, n) =>
      m.includes("wordprocessingml") ||
      n.endsWith(".docx") ||
      n.endsWith(".doc"),
  },
  {
    pattern: /\bpdf\b/i,
    test: (m, n) => m === "application/pdf" || n.endsWith(".pdf"),
  },
  {
    pattern: /\bimage\b|\bscreenshot\b|\bphoto\b|\bpicture\b/i,
    test: (m) => m.startsWith("image/"),
  },
];

/**
 * Try to identify which specific attachment a violated claim is about.
 *
 * Resolution order:
 *   1. Exact filename match (case-insensitive) in the matched text.
 *   2. Basename-without-extension match (≥4 chars) to catch "report" matching "report.pdf".
 *   3. MIME-type keyword match (spreadsheet, pptx, pdf, image, …).
 *
 * Returns `null` when the claim is generic ("the attachment", "the file") and
 * cannot be mapped to a specific entry in the list.
 */
function findTargetedAttachment(
  matchedText: string,
  attachments: ResolvedAttachmentInfo[],
): ResolvedAttachmentInfo | null {
  if (attachments.length === 0) return null;

  const textLC = matchedText.toLowerCase();

  // 1. Exact filename
  for (const att of attachments) {
    if (textLC.includes(att.filename.toLowerCase())) return att;
  }

  // 2. Basename (no extension), minimum 4 chars to avoid short false matches
  for (const att of attachments) {
    const base = att.filename.toLowerCase().replace(/\.[^.]+$/, "");
    if (base.length >= 4 && textLC.includes(base)) return att;
  }

  // 3. MIME-type keyword
  for (const { pattern, test } of MIME_KEYWORDS) {
    if (pattern.test(matchedText)) {
      const match = attachments.find((a) =>
        test(a.mimeType, a.filename.toLowerCase()),
      );
      if (match) return match;
    }
  }

  return null;
}

function buildCorrection(violations: string[], blockedFiles: string[]): string {
  const firstViolation = violations[0];
  const followUp = `\n\nIf you'd like me to read the content, please re-attach the file in a new message and I'll work with it directly.`;

  if (blockedFiles.length > 0) {
    const named = blockedFiles.map((f) => `**${f}**`).join(", ");
    const isAre = blockedFiles.length === 1 ? "was" : "were";
    const itThem = blockedFiles.length === 1 ? "it" : "them";
    const violationNote = firstViolation
      ? `\n\n*(I said: "${firstViolation}${firstViolation.length >= 120 ? "…" : ""}" — but that file's content was not available to me.)*`
      : "";
    return (
      `I can see some files were included in this message, but ${named} ${isAre} stored without readable content reaching me — ` +
      `I can't make claims about what's inside ${itThem}.` +
      violationNote +
      followUp
    );
  }

  const violationNote = firstViolation
    ? `\n\n*(I said: "${firstViolation}${firstViolation.length >= 120 ? "…" : ""}" — but no attachment was present or readable in this message.)*`
    : "";
  return (
    `I don't have access to any attachment in this message — nothing was attached or readable in this turn.` +
    violationNote +
    `\n\nIf you meant to include a file, please drop it into the next message and I'll work with it directly.`
  );
}

/**
 * Check model output for unsupported attachment perception or retrieval claims.
 *
 * Per-attachment logic: when the violated claim names a specific file (by filename
 * or MIME-type keyword), only that file's evidence is checked. A readable PDF does
 * not authorize claims about a storage-only PPTX in the same message.
 *
 * Returns `{ clean: true }` when:
 *   - A file-reading tool ran this turn (all claims are supportable), OR
 *   - No matching claim patterns are found, OR
 *   - Every matched claim is supported by the targeted file's evidence.
 *
 * Returns `{ clean: false, violations, correction }` when at least one
 * unsupported, file-specific claim is found.
 */
export function checkAttachmentClaims(
  text: string,
  evidence: AttachmentEvidence,
): GuardResult {
  // Fast path: file-read tools ran → all claims are supportable regardless of
  // which attachment they mention.
  if (hasFileReadEvidence(evidence.toolsExecutedThisTurn)) {
    return { clean: true, violations: [], correction: "" };
  }

  const violations: string[] = [];
  const blockedFiles: string[] = [];

  for (const pattern of PERCEPTION_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    const matchedText = match[0].slice(0, 120);
    const targeted = findTargetedAttachment(matchedText, evidence.attachments);

    if (targeted !== null) {
      // Specific file identified — block only if THAT file's content wasn't supplied.
      if (!targeted.contentSuppliedToModel) {
        violations.push(matchedText);
        if (!blockedFiles.includes(targeted.filename)) {
          blockedFiles.push(targeted.filename);
        }
      }
    } else {
      // Generic claim (no specific file identified) — block if NO attachment
      // has content available.
      if (!evidence.attachments.some((a) => a.contentSuppliedToModel)) {
        violations.push(matchedText);
      }
    }
  }

  if (violations.length === 0) {
    return { clean: true, violations: [], correction: "" };
  }

  return {
    clean: false,
    violations,
    correction: buildCorrection(violations, blockedFiles),
  };
}
