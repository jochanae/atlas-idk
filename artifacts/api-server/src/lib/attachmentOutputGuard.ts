/**
 * Narrow server-side output guard for unsupported attachment perception and
 * retrieval claims.
 *
 * Two enforcement layers:
 *
 *   1. StreamingClaimGate — intercepts token emission in real-time.
 *      When the in-progress sentence begins matching a trigger prefix, the gate
 *      holds that sentence until it completes, then validates it.  If the claim
 *      is unsupported the sentence is replaced by a correction SSE; otherwise
 *      it is released normally.  Normal (non-claim) text streams immediately
 *      after a CLAIM_LOOKAHEAD holdback window.
 *
 *   2. checkAttachmentClaims (post-stream) — runs in finishStream on the full
 *      response.  Catches anything the streaming gate missed (e.g. a sentence
 *      that straddled the end of the stream without a boundary, or a turn that
 *      skipped the streaming path).
 *
 * Per-attachment granularity: a readable PDF cannot authorize claims about a
 * storage-only PPTX in the same message.
 */

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface ResolvedAttachmentInfo {
  attachmentId: string;
  filename: string;
  mimeType: string;
  capability: "model_readable" | "storage_only" | "failed";
  /** True only when the file's content was injected into the model context. */
  contentSuppliedToModel: boolean;
}

/** Prior-turn provenance for the guard (no requirement that content is reopened). */
export interface PriorAttachmentGuardInfo {
  publicRef: string;
  filename: string;
  mimeType: string;
  existed: boolean;
  /** Model successfully ingested content on the originating turn. */
  priorAttachmentWasModelReceived: boolean;
  /** True when this turn re-injected that prior file's content. */
  contentAvailableThisTurn: boolean;
}

export interface AttachmentEvidence {
  /** Per-attachment evidence for this turn only — resolved + skipped. */
  attachments: ResolvedAttachmentInfo[];
  /**
   * Prior-turn attachment provenance in this conversation.
   * Optional for backward compatibility; treat missing as [].
   */
  priorAttachments?: PriorAttachmentGuardInfo[];
  /**
   * Backend attachment IDs whose content was reopened/injected this turn
   * (historical reopen). Optional; treat missing as empty.
   */
  contentReopenedAttachmentIds?: ReadonlySet<string>;
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

// ── Post-stream patterns ───────────────────────────────────────────────────────
// Each pattern is anchored to file/image/attachment context to avoid
// false-positives on unrelated prose.

const PERCEPTION_PATTERNS: RegExp[] = [
  // "I can see" followed by attachment context within 100 chars
  /\bI\s+can\s+see\b.{0,100}(?:attach(?:ment|ed)?|screenshot|the\s+image|the\s+photo|the\s+file|your\s+(?:image|photo|file|screenshot))/i,

  // "the screenshot shows/reveals/displays/contains/looks like"
  /\bthe\s+screenshot\s+(?:shows?|reveals?|displays?|contains?|looks?\s+like|indicates?)\b/i,

  // "the attached file/image/document shows/contains/…"
  /\bthe\s+attached?\s+(?:file|image|photo|document|screenshot)\s+(?:shows?|contains?|reveals?|says?|indicates?|has\b|includes?|displays?)/i,

  // "your attached X shows/contains/…"
  /\byour\s+attached?\s+(?:file|image|photo|document|screenshot)\s+(?:shows?|contains?|reveals?|looks?|says?)/i,

  // Explicit retrieval — extended with document-type nouns
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

  // Direct filename reference: "based on deck.pptx", "looking at report.pdf"
  /\b(?:based\s+on|looking\s+at|from|in)\s+[\w][\w.()\- ]*\.(?:pdf|docx?|pptx?|xlsx?|xls|csv|png|jpe?g|gif|webp|txt|md)\b/i,
];

/**
 * INT-39: slide-index / deck-section order claims require reopened (or current-turn)
 * deck content. Freeform order prose often never matches PERCEPTION_PATTERNS.
 */
const SLIDE_ORDER_CLAIM_PATTERNS: RegExp[] = [
  /\bslide\s*\d+\b.{0,80}\b(?:before|after|follows?|precedes?)\b/i,
  /\b(?:before|after|follows?|precedes?)\b.{0,80}\bslide\s*\d+\b/i,
  /\b(?:pricing|takeaway|challenge|journey|closing)\b.{0,60}\b(?:comes?\s+)?(?:before|after)\b.{0,60}\b(?:pricing|takeaway|challenge|journey|closing|slide)\b/i,
  /\b(?:pricing|takeaway|challenge|journey|closing)\b.{0,40}\bis\s+(?:before|after)\b/i,
  /\b(?:deck|presentation|powerpoint|pptx)\b.{0,80}\b(?:order|sequence|before|after)\b/i,
];

// ── Streaming gate trigger patterns ───────────────────────────────────────────
// BROADER than PERCEPTION_PATTERNS — fire early (on the trigger prefix) so we
// can hold the rest of the sentence before validating.  False-positive holds are
// validated away and released without any visible effect.

const TRIGGER_PATTERNS: RegExp[] = [
  /\bI\s+can\s+see\b/i,
  /\bthe\s+screenshot\b/i,
  /\bthe\s+attach\w*/i,
  /\byour\s+attach\w*/i,
  /\bI\s+(?:read|open(?:ed)?|pull(?:ed)?|check(?:ed)?|review(?:ed)?|access(?:ed)?)\s+(?:the|your|this)\b/i,
  /\bI\s+(?:can\s+)?see\s+(?:in|on)\s+(?:the|your)\b/i,
  /\bfrom\s+the\s+(?:file|image|screenshot|photo|attach\w*)\b/i,
  /\blooking\s+at\s+(?:the|your)\b/i,
  /\bbased\s+on\s+(?:the|your)\b/i,
  /\bbased\s+on\s+[\w][\w.()\- ]*\.(?:pdf|docx?|pptx?|xlsx?|xls|csv|png|jpe?g|gif|webp)\b/i,
  /\blooking\s+at\s+[\w][\w.()\- ]*\.(?:pdf|docx?|pptx?|xlsx?|xls|csv|png|jpe?g|gif|webp)\b/i,
  /\bthe\s+(?:image|photo)\b/i,
];

/**
 * How many chars to hold back from the IMAGE_GEN-safe window when no trigger
 * is found yet.  Must be ≥ the length of the longest trigger phrase so that a
 * phrase arriving split across tokens is never emitted before detection.
 */
export const CLAIM_LOOKAHEAD = 32;

// ── Utility exports (used by nexus.ts gate integration) ──────────────────────

/**
 * Return the index of the earliest trigger-phrase match in `text`, or -1.
 */
export function findEarliestTrigger(text: string): number {
  let earliest = -1;
  for (const pattern of TRIGGER_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.index !== undefined) {
      if (earliest === -1 || match.index < earliest) {
        earliest = match.index;
      }
    }
  }
  return earliest;
}

/**
 * Find the first sentence-ending position in `text`.
 * Returns the index AFTER the terminal character, or -1 if no boundary found.
 *
 * Excludes periods that look like file-extension boundaries (e.g. "deck.pptx ").
 */
export function findSentenceBoundary(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") return i + 1;
    if (ch === "!" || ch === "?") {
      const next = text[i + 1] ?? "";
      if (next === " " || next === "\n" || next === "") return i + 1;
    }
    if (ch === ".") {
      const next = text[i + 1] ?? "";
      if (next === " " || next === "\n" || next === "") {
        // Skip extension-like patterns: "deck.pptx " → 2-4 alpha chars + space/end
        if (/^\w{2,4}(?:\s|$)/.test(text.slice(i + 1))) continue;
        return i + 1;
      }
    }
  }
  return -1;
}

// ── Streaming claim gate ──────────────────────────────────────────────────────

export interface StreamingGateOutput {
  /** Advance emitPtr to this position. */
  newEmitPtr: number;
  /** Characters to send to the client right now (may be empty). */
  toEmit: string;
  /** If non-null: emit a correction SSE and stop streaming further tokens. */
  correctionContent: string | null;
}

/**
 * Per-request streaming claim gate.  Instantiate once at the start of each
 * response; call process() from flushNexusText on every token batch; call
 * flush() when the stream ends to release any trailing held text.
 *
 * Evidence is passed by reference so toolsExecutedThisTurn stays live as tools
 * run during streaming.
 */
export class StreamingClaimGate {
  /** Position in fullText where holding started (-1 = not holding). */
  private holdFrom = -1;
  /** Start of the current sentence in fullText (for full-sentence validation). */
  private sentenceStart = 0;
  /** True once a mid-stream correction has been emitted. */
  private correctionFired = false;

  private readonly evidence: AttachmentEvidence;

  constructor(evidence: AttachmentEvidence) {
    this.evidence = evidence;
  }

  get hasFired(): boolean {
    return this.correctionFired;
  }

  /**
   * Process the current fullText against the IMAGE_GEN-safe window [emitPtr, safeEnd).
   *
   * NOT holding → scan for trigger phrases; hold from earliest trigger.
   * Holding → wait for sentence boundary; validate; release or correct.
   */
  process(fullText: string, emitPtr: number, safeEnd: number): StreamingGateOutput {
    // Once a correction has fired, swallow all remaining tokens silently.
    if (this.correctionFired) {
      return { newEmitPtr: safeEnd, toEmit: "", correctionContent: null };
    }

    // ── Not holding ──────────────────────────────────────────────────────────
    if (this.holdFrom === -1) {
      // Search the full unprocessed window (including IMAGE_GEN lookahead) for
      // a trigger phrase so we never emit a trigger that arrived split.
      const searchText = fullText.slice(emitPtr);
      const triggerIdx = findEarliestTrigger(searchText);

      if (triggerIdx !== -1) {
        const absoluteTrigger = emitPtr + triggerIdx;
        // Clamp to safeEnd so we never venture into the IMAGE_GEN lookahead zone.
        const holdAt = Math.min(absoluteTrigger, safeEnd);
        this.holdFrom = holdAt;
        return {
          newEmitPtr: holdAt,
          toEmit: fullText.slice(emitPtr, holdAt),
          correctionContent: null,
        };
      }

      // No trigger — apply CLAIM_LOOKAHEAD holdback so split phrases never slip through.
      const claimSafeEnd = Math.min(
        safeEnd,
        Math.max(emitPtr, fullText.length - CLAIM_LOOKAHEAD),
      );
      return {
        newEmitPtr: claimSafeEnd,
        toEmit: fullText.slice(emitPtr, claimSafeEnd),
        correctionContent: null,
      };
    }

    // ── Holding ───────────────────────────────────────────────────────────────
    const heldText = fullText.slice(this.holdFrom);
    const boundaryOffset = findSentenceBoundary(heldText);

    if (boundaryOffset === -1) {
      // Sentence not complete yet — keep accumulating.
      return { newEmitPtr: emitPtr, toEmit: "", correctionContent: null };
    }

    const sentenceEnd = this.holdFrom + boundaryOffset;
    const fullSentence = fullText.slice(this.sentenceStart, sentenceEnd);
    const guardResult = checkAttachmentClaims(fullSentence, this.evidence);

    const prevEmitPtr = emitPtr;
    this.holdFrom = -1;
    this.sentenceStart = sentenceEnd;

    if (guardResult.clean) {
      return {
        newEmitPtr: sentenceEnd,
        toEmit: fullText.slice(prevEmitPtr, sentenceEnd),
        correctionContent: null,
      };
    }

    this.correctionFired = true;
    return {
      newEmitPtr: sentenceEnd,
      toEmit: "",
      correctionContent: guardResult.correction,
    };
  }

  /**
   * Flush any remaining held text at stream end (called once before finishStream).
   * finishStream re-validates the complete response independently.
   */
  flush(fullText: string, emitPtr: number): StreamingGateOutput {
    if (this.correctionFired) {
      return { newEmitPtr: fullText.length, toEmit: "", correctionContent: null };
    }
    if (this.holdFrom === -1) {
      // Emit the IMAGE_GEN-lookahead tail (no trigger was active).
      const tail = fullText.slice(emitPtr);
      return { newEmitPtr: fullText.length, toEmit: tail, correctionContent: null };
    }
    // There is held text; treat stream end as a sentence boundary and validate.
    const fullSentence = fullText.slice(this.sentenceStart);
    const guardResult = checkAttachmentClaims(fullSentence, this.evidence);
    this.holdFrom = -1;

    if (guardResult.clean) {
      return {
        newEmitPtr: fullText.length,
        toEmit: fullText.slice(emitPtr),
        correctionContent: null,
      };
    }
    this.correctionFired = true;
    return {
      newEmitPtr: fullText.length,
      toEmit: "",
      correctionContent: guardResult.correction,
    };
  }
}

// ── Per-attachment evidence helpers ──────────────────────────────────────────

/** Tools whose execution constitutes file-reading evidence. */
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

/** MIME-type keyword descriptors for identifying a targeted attachment. */
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
      m.includes("presentationml") || n.endsWith(".pptx") || n.endsWith(".ppt"),
  },
  {
    pattern: /\bdocx?\b|\bword\s+doc(?:ument)?\b/i,
    test: (m, n) =>
      m.includes("wordprocessingml") || n.endsWith(".docx") || n.endsWith(".doc"),
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
 * Try to identify which specific attachment a violated claim targets.
 * Returns null for generic claims ("the attachment", "the file") that cannot
 * be mapped to a specific entry.
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

  // 2. Basename (no extension), minimum 4 chars
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

function buildCorrection(
  violations: string[],
  blockedFiles: string[],
  readableFiles: string[],
  priorAttachments: PriorAttachmentGuardInfo[],
): string {
  const firstViolation = violations[0];
  const followUp = `\n\nIf you'd like me to read the content, please re-attach the file in a new message and I'll work with it directly.`;
  const priorNames = priorAttachments
    .filter((p) => p.existed)
    .map((p) => p.filename);
  const priorNote =
    priorNames.length > 0
      ? ` You did attach ${priorNames.map((n) => `**${n}**`).join(", ")} earlier in this conversation, but I cannot reopen ${priorNames.length === 1 ? "its" : "their"} original contents in this turn.`
      : "";

  if (blockedFiles.length > 0) {
    const named = blockedFiles.map((f) => `**${f}**`).join(", ");
    const isAre = blockedFiles.length === 1 ? "was" : "were";
    const itThem = blockedFiles.length === 1 ? "it" : "them";
    const violationNote = firstViolation
      ? `\n\n*(I started to claim: "${firstViolation}${firstViolation.length >= 120 ? "…" : ""}" — that file's content is not available to me in this turn.)*`
      : "";
    const readableNote =
      readableFiles.length > 0
        ? ` I can see ${readableFiles.map((f) => `**${f}**`).join(", ")} in this message.`
        : "";
    return (
      `I can see some files were included in this message, but ${named} ${isAre} stored without readable content reaching me —` +
      readableNote +
      ` I can't make claims about what's inside ${itThem}.` +
      priorNote +
      violationNote +
      followUp
    );
  }

  if (priorNames.length > 0) {
    const violationNote = firstViolation
      ? `\n\n*(I started to claim: "${firstViolation}${firstViolation.length >= 120 ? "…" : ""}" — I cannot reopen that file's contents in this turn.)*`
      : "";
    return (
      `I cannot reopen the original file contents in this turn.` +
      priorNote +
      violationNote +
      followUp
    );
  }

  const violationNote = firstViolation
    ? `\n\n*(I started to claim: "${firstViolation}${firstViolation.length >= 120 ? "…" : ""}" — but no attachment was present or readable in this message.)*`
    : "";
  return (
    `I don't have access to any attachment in this message — nothing was attached or readable in this turn.` +
    violationNote +
    `\n\nIf you meant to include a file, please drop it into the next message and I'll work with it directly.`
  );
}

/** Provenance / availability disclosures that are allowed without current-turn bytes. */
const PROVENANCE_ALLOW_PATTERNS: RegExp[] = [
  /\byou\s+attached\b/i,
  /\battached\s+(?:a|an|the)\s+.+\s+earlier\b/i,
  /\bin\s+the\s+previous\s+turn\b/i,
  /\bI\s+analyzed\s+that\b/i,
  /\bcannot\s+reopen\b/i,
  /\bcan'?t\s+reopen\b/i,
  /\boriginal\s+contents\s+in\s+this\s+turn\b/i,
];

function isAllowedProvenanceClaim(
  text: string,
  priorAttachments: PriorAttachmentGuardInfo[],
): boolean {
  if (priorAttachments.length === 0) return false;
  if (!PROVENANCE_ALLOW_PATTERNS.some((p) => p.test(text))) return false;

  // Analysis-recall requires successful model ingestion on the origin turn.
  if (/\bI\s+analyzed\b/i.test(text)) {
    return priorAttachments.some((p) => p.priorAttachmentWasModelReceived);
  }
  return priorAttachments.some((p) => p.existed);
}

// ── Main post-stream validator ────────────────────────────────────────────────

/**
 * Check model output for unsupported attachment perception or retrieval claims.
 *
 * Per-attachment: when the claim names a specific file (by filename or MIME
 * keyword), only that file's evidence is checked.  A readable PDF does NOT
 * authorise claims about a storage-only PPTX in the same message.
 */
export function checkAttachmentClaims(
  text: string,
  evidence: AttachmentEvidence,
): GuardResult {
  // Fast path: any file-reading tool ran → all claims are supportable.
  if (hasFileReadEvidence(evidence.toolsExecutedThisTurn)) {
    return { clean: true, violations: [], correction: "" };
  }

  const priorAttachments = evidence.priorAttachments ?? [];
  const reopened = evidence.contentReopenedAttachmentIds ?? new Set<string>();

  // Provenance / non-reopen disclosures are allowed when prior rows exist.
  if (isAllowedProvenanceClaim(text, priorAttachments)) {
    return { clean: true, violations: [], correction: "" };
  }

  // Explicit false analysis-recall: file existed but was never model-ingested.
  if (
    /\bI\s+analyzed\b/i.test(text) &&
    priorAttachments.some((p) => p.existed) &&
    !priorAttachments.some((p) => p.priorAttachmentWasModelReceived) &&
    !hasFileReadEvidence(evidence.toolsExecutedThisTurn)
  ) {
    return {
      clean: false,
      violations: ["I analyzed"],
      correction: buildCorrection(
        ["I analyzed"],
        [],
        [],
        priorAttachments,
      ),
    };
  }

  const violations: string[] = [];
  const blockedFiles: string[] = [];

  const hasCurrentContent =
    evidence.attachments.some((a) => a.contentSuppliedToModel) ||
    priorAttachments.some((p) => p.contentAvailableThisTurn) ||
    reopened.size > 0;

  const hasPriorDeck = priorAttachments.some(
    (p) =>
      p.existed &&
      (/\.pptx?$/i.test(p.filename) ||
        /presentation|powerpoint/i.test(p.mimeType) ||
        /\b(slide|deck|pricing|challenge)\b/i.test(p.filename)),
  );

  for (const pattern of PERCEPTION_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    const matchedText = match[0].slice(0, 120);
    const targeted = findTargetedAttachment(matchedText, evidence.attachments);

    if (targeted !== null) {
      // Specific current-turn file — block only if THAT file had no content.
      if (!targeted.contentSuppliedToModel && !reopened.has(targeted.attachmentId)) {
        violations.push(matchedText);
        if (!blockedFiles.includes(targeted.filename)) {
          blockedFiles.push(targeted.filename);
        }
      }
    } else {
      // Generic / prior-oriented perception claim.
      if (!hasCurrentContent) {
        violations.push(matchedText);
      }
    }
  }

  // INT-39: block unsupported slide-order / section-order claims when no deck
  // content was supplied this turn (even if perception phrasing was soft).
  if (!hasCurrentContent && (hasPriorDeck || priorAttachments.some((p) => p.existed))) {
    for (const pattern of SLIDE_ORDER_CLAIM_PATTERNS) {
      const match = text.match(pattern);
      if (!match) continue;
      violations.push(match[0].slice(0, 120));
      break;
    }
  }

  if (violations.length === 0) {
    return { clean: true, violations: [], correction: "" };
  }

  const readableFiles = evidence.attachments
    .filter(
      (a) =>
        a.contentSuppliedToModel &&
        !a.filename.match(/^vault_image_|^url_screenshot_/) &&
        !blockedFiles.includes(a.filename),
    )
    .map((a) => a.filename);

  return {
    clean: false,
    violations,
    correction: buildCorrection(
      violations,
      blockedFiles,
      readableFiles,
      priorAttachments,
    ),
  };
}
