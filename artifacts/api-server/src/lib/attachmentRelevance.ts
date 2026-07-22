/**
 * Relevance selection for historical attachment reopen (T3-pre).
 *
 * Defined and tested before extract persistence / reopen wiring.
 * Returns backend attachmentIds for resolve; callers map to publicRef separately.
 */

export type PriorAttachmentCandidate = {
  publicRef: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  kind: string;
};

export type RelevanceResult = {
  selectedAttachmentIds: string[];
  selectedPublicRefs: string[];
  reasons: string[];
};

const TEMPORAL =
  /\b(?:earlier|above|previous|prior|last|before|attached\s+(?:above|earlier|previously)|you\s+attached)\b/i;

const SLIDE_OR_DECK =
  /\b(?:slide\s*\d+|slides?|deck|powerpoint|pptx|presentation)\b/i;

/** INT-39: section/order follow-ups that imply the prior deck without saying "slide". */
const DECK_SECTION_OR_ORDER =
  /\b(?:pricing|takeaway|challenge|journey|closing|agenda|title\s+slide|appendix)\b/i;

const DECK_ORDER_RELATION =
  /\b(?:before|after|comes?\s+before|comes?\s+after|follow(?:s|ing)?|precedes?|order|sequence|between)\b/i;

const INVOICE_OR_PDF =
  /\b(?:invoice|total\s+on\s+the|pdf)\b/i;

const SPREADSHEET =
  /\b(?:spreadsheet|excel|xlsx|csv|workbook|sheet)\b/i;

const GENERIC_PRIOR_FILE =
  /\b(?:the\s+(?:file|attachment|document)\s+(?:i\s+)?(?:attached|sent|shared|uploaded)|attached\s+(?:above|earlier)|still\s+access\s+the\s+file)\b/i;

function isDeckCandidate(c: PriorAttachmentCandidate): boolean {
  const name = c.filename.toLowerCase();
  return (
    c.kind === "doc" ||
    name.endsWith(".pptx") ||
    name.endsWith(".ppt") ||
    c.mimeType.includes("presentation")
  );
}

export function hasDeckOrderFollowUpIntent(message: string): boolean {
  return DECK_SECTION_OR_ORDER.test(message) && DECK_ORDER_RELATION.test(message);
}

function scoreCandidate(
  message: string,
  c: PriorAttachmentCandidate,
): { score: number; reason: string } {
  const msg = message.toLowerCase();
  const name = c.filename.toLowerCase();
  const base = name.replace(/\.[^.]+$/, "");
  let score = 0;
  const reasons: string[] = [];

  if (msg.includes(name) || (base.length >= 4 && msg.includes(base))) {
    score += 100;
    reasons.push("filename_match");
  }

  const wantsDeck = SLIDE_OR_DECK.test(message);
  const wantsDeckOrder = hasDeckOrderFollowUpIntent(message);
  const wantsInvoice = INVOICE_OR_PDF.test(message);
  const wantsSheet = SPREADSHEET.test(message);
  const temporal = TEMPORAL.test(message) || GENERIC_PRIOR_FILE.test(message);

  if (wantsDeck && isDeckCandidate(c)) {
    score += 50;
    reasons.push("deck_or_slide_intent");
  }
  if (wantsDeckOrder && isDeckCandidate(c)) {
    score += 55;
    reasons.push("deck_section_order_intent");
  }
  if (wantsInvoice && (c.kind === "pdf" || name.endsWith(".pdf") || c.mimeType === "application/pdf" || name.includes("invoice"))) {
    score += 50;
    reasons.push("invoice_or_pdf_intent");
  }
  if (
    wantsSheet &&
    (c.kind === "spreadsheet" ||
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      name.endsWith(".csv") ||
      c.mimeType.includes("spreadsheet") ||
      c.mimeType === "text/csv")
  ) {
    score += 50;
    reasons.push("spreadsheet_intent");
  }

  if (temporal && score === 0) {
    // Weak generic prior reference — prefer most recent later via stable order.
    score += 5;
    reasons.push("temporal_or_generic_prior");
  }

  return { score, reason: reasons.join(",") || "none" };
}

/**
 * Select up to maxCount prior attachments to reopen.
 * Candidates should be ordered most-recent-first.
 */
export function selectRelevantPriorAttachments(params: {
  userMessage: string;
  priorAttachments: PriorAttachmentCandidate[];
  maxCount?: number;
}): RelevanceResult {
  const maxCount = params.maxCount ?? 2;
  const message = params.userMessage.trim();
  if (!message || params.priorAttachments.length === 0) {
    return { selectedAttachmentIds: [], selectedPublicRefs: [], reasons: [] };
  }

  const scored = params.priorAttachments.map((c, index) => {
    const { score, reason } = scoreCandidate(message, c);
    // Slight recency bias (earlier in list = more recent).
    const withRecency = score > 0 ? score + Math.max(0, 3 - index) : 0;
    return { c, score: withRecency, reason };
  });

  const positive = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // Require a meaningful signal: temporal/generic alone (score ~5-8) is enough
  // only when the message clearly references a prior file; pure chat stays empty.
  // INT-39: section/order follow-ups ("does pricing come after the challenge?")
  // must reopen the prior deck — relevance is whole-file, not per-slide.
  const hasStrongIntent =
    SLIDE_OR_DECK.test(message) ||
    hasDeckOrderFollowUpIntent(message) ||
    INVOICE_OR_PDF.test(message) ||
    SPREADSHEET.test(message) ||
    GENERIC_PRIOR_FILE.test(message) ||
    /\.(pptx?|pdf|docx?|xlsx?|csv)\b/i.test(message);

  if (!hasStrongIntent) {
    return { selectedAttachmentIds: [], selectedPublicRefs: [], reasons: [] };
  }

  const selected = positive.slice(0, maxCount);
  return {
    selectedAttachmentIds: selected.map((s) => s.c.attachmentId),
    selectedPublicRefs: selected.map((s) => s.c.publicRef),
    reasons: selected.map((s) => `${s.c.publicRef}:${s.reason}`),
  };
}
