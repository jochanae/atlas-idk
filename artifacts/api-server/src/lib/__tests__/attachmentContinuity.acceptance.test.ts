/**
 * ACCEPTANCE CONTRACT — Attachment continuity (locked before implementation).
 *
 * These tests define required behavior for T1–T4. They import the canonical
 * helper modules that implementation must provide. Do not weaken assertions
 * to match legacy HARD RULE / current-turn-only OutputGuard behavior.
 *
 * Continuity V2 is ON by default; ATTACHMENT_CONTINUITY_V2=0 is the kill
 * switch. Helpers below define the required semantics (no parallel pipeline).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildAttachmentGroundingState,
  formatGroundingPromptBlock,
  formatHistoryProvenanceBlock,
  type PriorAttachmentRecord,
} from "../attachmentGrounding";
import {
  checkAttachmentClaims,
  type AttachmentEvidence,
  type PriorAttachmentGuardInfo,
} from "../attachmentOutputGuard";
import {
  selectRelevantPriorAttachments,
  type PriorAttachmentCandidate,
} from "../attachmentRelevance";
import {
  EXTRACT_VERSION,
  labelExtractForModel,
  type ExtractPayload,
} from "../attachmentExtractStore";
import {
  beginTurnIdempotency,
  completeTurnIdempotency,
  findTurnIdempotency,
  type TurnIdempotencyRecord,
} from "../attachmentTurnIdempotency";

const PRIOR_PPTX: PriorAttachmentRecord = {
  attachmentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  publicRef: "prior-1",
  filename: "deck.pptx",
  mimeType:
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  kind: "doc",
  originatingMessageId: 42,
  originatingMessageRef: "msg-42",
  uploadStatus: "uploaded",
  processingStatus: "understood",
  existed: true,
  priorAttachmentWasModelReceived: true,
  extractedContentExists: false,
  bytesRetrievable: true,
};

const PRIOR_EXISTED_NOT_INGESTED: PriorAttachmentRecord = {
  ...PRIOR_PPTX,
  publicRef: "prior-2",
  attachmentId: "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee",
  filename: "scan.pdf",
  mimeType: "application/pdf",
  kind: "pdf",
  originatingMessageId: 41,
  originatingMessageRef: "msg-41",
  priorAttachmentWasModelReceived: false,
  processingStatus: "understood",
  bytesRetrievable: true,
};

describe("acceptance: attachment grounding signals (T1)", () => {
  it("exposes separate current-turn vs conversation-prior vs content-availability signals", () => {
    const state = buildAttachmentGroundingState({
      currentAttachmentIds: [],
      currentResolvedCount: 0,
      priorAttachments: [PRIOR_PPTX],
      referencedPublicRefs: [],
      contentReopenedPublicRefs: [],
    });

    expect(state.currentTurnHasAttachments).toBe(false);
    expect(state.currentTurnResolvedCount).toBe(0);
    expect(state.conversationHasPriorAttachments).toBe(true);
    expect(state.priorAttachments[0]?.priorAttachmentWasModelReceived).toBe(true);
    expect(state.referencedPriorAttachmentAvailable).toBe(false);
    expect(state.referencedPriorAttachmentContentAvailable).toBe(false);
  });

  it("distinguishes existence from successful model ingestion", () => {
    const state = buildAttachmentGroundingState({
      currentAttachmentIds: [],
      currentResolvedCount: 0,
      priorAttachments: [PRIOR_EXISTED_NOT_INGESTED],
      referencedPublicRefs: ["prior-2"],
      contentReopenedPublicRefs: [],
    });

    expect(state.conversationHasPriorAttachments).toBe(true);
    expect(state.priorAttachments[0]?.existed).toBe(true);
    expect(state.priorAttachments[0]?.priorAttachmentWasModelReceived).toBe(false);
    expect(state.referencedPriorAttachmentAvailable).toBe(true);
    expect(state.referencedPriorAttachmentContentAvailable).toBe(false);
  });

  it("prompt block never equates no-current with no-prior, and omits raw DB UUIDs", () => {
    const state = buildAttachmentGroundingState({
      currentAttachmentIds: [],
      currentResolvedCount: 0,
      priorAttachments: [PRIOR_PPTX],
      referencedPublicRefs: [],
      contentReopenedPublicRefs: [],
    });
    const block = formatGroundingPromptBlock(state);

    expect(block).toMatch(/currentTurnHasAttachments:\s*false/);
    expect(block).toMatch(/conversationHasPriorAttachments:\s*true/);
    expect(block).toMatch(/priorAttachmentWasModelReceived:\s*true/);
    expect(block).not.toMatch(/NO ATTACHMENT WAS PROVIDED WITH THIS MESSAGE/i);
    expect(block).not.toMatch(/Do NOT infer attachment presence from.*conversation history/i);
    expect(block).not.toContain(PRIOR_PPTX.attachmentId);
    expect(block).toContain("prior-1");
    expect(block).toContain("deck.pptx");
  });

  it("allows reopen content flag when content was re-injected this turn", () => {
    const state = buildAttachmentGroundingState({
      currentAttachmentIds: [],
      currentResolvedCount: 0,
      priorAttachments: [PRIOR_PPTX],
      referencedPublicRefs: ["prior-1"],
      contentReopenedPublicRefs: ["prior-1"],
    });
    expect(state.referencedPriorAttachmentAvailable).toBe(true);
    expect(state.referencedPriorAttachmentContentAvailable).toBe(true);
  });
});

describe("acceptance: OutputGuard provenance vs perception (T1)", () => {
  function evidence(partial: Partial<AttachmentEvidence> = {}): AttachmentEvidence {
    return {
      attachments: [],
      priorAttachments: [],
      contentReopenedAttachmentIds: new Set(),
      toolsExecutedThisTurn: new Set(),
      ...partial,
    };
  }

  const priorGuard: PriorAttachmentGuardInfo = {
    publicRef: "prior-1",
    filename: "deck.pptx",
    mimeType: PRIOR_PPTX.mimeType,
    existed: true,
    priorAttachmentWasModelReceived: true,
    contentAvailableThisTurn: false,
  };

  it("allows stating a prior PowerPoint was attached", () => {
    const result = checkAttachmentClaims(
      "You attached a PowerPoint earlier.",
      evidence({ priorAttachments: [priorGuard] }),
    );
    expect(result.clean).toBe(true);
  });

  it("allows stating prior analysis when model received it on origin turn", () => {
    const result = checkAttachmentClaims(
      "I analyzed that PowerPoint in the previous turn.",
      evidence({ priorAttachments: [priorGuard] }),
    );
    expect(result.clean).toBe(true);
  });

  it("allows disclosing cannot reopen original contents this turn", () => {
    const result = checkAttachmentClaims(
      "I cannot reopen its original contents in this turn.",
      evidence({ priorAttachments: [priorGuard] }),
    );
    expect(result.clean).toBe(true);
  });

  it("still blocks invented current-turn perception when nothing exists", () => {
    const result = checkAttachmentClaims(
      "I can see the image you uploaded — it looks like a login form.",
      evidence(),
    );
    expect(result.clean).toBe(false);
  });

  it("does not narrate grounded prior analysis as fabricated", () => {
    const result = checkAttachmentClaims(
      "Based on the file you attached earlier, slide 1 is a title slide.",
      evidence({ priorAttachments: [priorGuard] }),
    );
    // Without content reopen, live content claims about slides may be blocked,
    // but correction must not imply the prior analysis was invented.
    if (!result.clean) {
      expect(result.correction).not.toMatch(/no attachment was present/i);
      expect(result.correction).not.toMatch(/fabricat/i);
      expect(result.correction).toMatch(/cannot reopen|earlier|previous|prior/i);
    }
  });

  it("INT-12: allows slide content claims when prior deck was reopened this turn", () => {
    const reopened: PriorAttachmentGuardInfo = {
      ...priorGuard,
      contentAvailableThisTurn: true,
    };
    // Perception phrasing that is NOT a provenance-only disclosure.
    const claim = "Looking at the file, slide 5 covers the family tech day agenda.";
    const blockedWithoutReopen = checkAttachmentClaims(
      claim,
      evidence({ priorAttachments: [priorGuard] }),
    );
    expect(blockedWithoutReopen.clean).toBe(false);

    const allowedWithReopen = checkAttachmentClaims(
      claim,
      evidence({
        priorAttachments: [reopened],
        contentReopenedAttachmentIds: new Set([PRIOR_PPTX.attachmentId]),
      }),
    );
    expect(allowedWithReopen.clean).toBe(true);
  });

  it("blocks analysis-recall when prior existed but was not model-received", () => {
    const notReceived: PriorAttachmentGuardInfo = {
      ...priorGuard,
      priorAttachmentWasModelReceived: false,
      filename: "scan.pdf",
    };
    const result = checkAttachmentClaims(
      "I analyzed that PDF in the previous turn.",
      evidence({ priorAttachments: [notReceived] }),
    );
    expect(result.clean).toBe(false);
  });
});

describe("acceptance: history provenance formatting (T2)", () => {
  it("replaces bare [attachment] with structured provenance and omits DB UUIDs", () => {
    const text = formatHistoryProvenanceBlock([PRIOR_PPTX]);
    expect(text).not.toBe("[attachment]");
    expect(text).toContain("deck.pptx");
    expect(text).toContain("prior-1");
    expect(text).toMatch(/priorAttachmentWasModelReceived:\s*true/);
    expect(text).not.toContain(PRIOR_PPTX.attachmentId);
    expect(text).not.toMatch(/storagePath|storageBucket|gcs|gs:\/\//i);
  });
});

describe("acceptance: relevance selection before T3 reopen (T3-pre)", () => {
  const candidates: PriorAttachmentCandidate[] = [
    {
      publicRef: "prior-1",
      attachmentId: PRIOR_PPTX.attachmentId,
      filename: "deck.pptx",
      mimeType: PRIOR_PPTX.mimeType,
      kind: "doc",
    },
    {
      publicRef: "prior-2",
      attachmentId: PRIOR_EXISTED_NOT_INGESTED.attachmentId,
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      kind: "pdf",
    },
    {
      publicRef: "prior-3",
      attachmentId: "11111111-2222-3333-4444-555555555555",
      filename: "budget.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      kind: "spreadsheet",
    },
  ];

  it("selects nothing when the user does not reference a prior attachment", () => {
    const result = selectRelevantPriorAttachments({
      userMessage: "What should we build next?",
      priorAttachments: candidates,
      maxCount: 2,
    });
    expect(result.selectedAttachmentIds).toEqual([]);
  });

  it("selects the PowerPoint when the user asks about slide content", () => {
    const result = selectRelevantPriorAttachments({
      userMessage: "What did slide 6 say?",
      priorAttachments: candidates,
      maxCount: 2,
    });
    expect(result.selectedAttachmentIds).toContain(PRIOR_PPTX.attachmentId);
    expect(result.selectedAttachmentIds.length).toBeLessThanOrEqual(2);
  });

  it("INT-12: selects prior deck for “Look at slide 5 again” with no new attach", () => {
    const result = selectRelevantPriorAttachments({
      userMessage: "Look at slide 5 again",
      priorAttachments: candidates,
      maxCount: 2,
    });
    expect(result.selectedAttachmentIds).toEqual([PRIOR_PPTX.attachmentId]);
    expect(result.selectedPublicRefs).toEqual(["prior-1"]);
  });

  it("selects the invoice PDF for total questions", () => {
    const result = selectRelevantPriorAttachments({
      userMessage: "What was the total on the invoice I attached above?",
      priorAttachments: candidates,
      maxCount: 2,
    });
    expect(result.selectedAttachmentIds).toContain(
      PRIOR_EXISTED_NOT_INGESTED.attachmentId,
    );
  });

  it("selects prior spreadsheet when comparing to a new attachment", () => {
    const result = selectRelevantPriorAttachments({
      userMessage: "Compare the spreadsheet I attached earlier with this new one.",
      priorAttachments: candidates,
      maxCount: 2,
    });
    expect(result.selectedAttachmentIds).toContain(candidates[2]!.attachmentId);
  });

  it("never returns more than maxCount", () => {
    const result = selectRelevantPriorAttachments({
      userMessage: "Look at the powerpoint, the invoice, and the spreadsheet I attached earlier.",
      priorAttachments: candidates,
      maxCount: 2,
    });
    expect(result.selectedAttachmentIds.length).toBeLessThanOrEqual(2);
  });
});

describe("acceptance: versioned truncated extracts (T3)", () => {
  it("labels extracts with version and truncation marker", () => {
    const full: ExtractPayload = {
      text: "hello world",
      extractVersion: EXTRACT_VERSION,
      truncated: false,
      format: "pptx",
    };
    const truncated: ExtractPayload = {
      text: "hello",
      extractVersion: EXTRACT_VERSION,
      truncated: true,
      format: "pptx",
      truncationReason: "per_turn_budget",
    };
    expect(labelExtractForModel(full)).toContain(`v${EXTRACT_VERSION}`);
    expect(labelExtractForModel(full)).not.toMatch(/truncated/i);
    expect(labelExtractForModel(truncated)).toMatch(/truncated/i);
    expect(labelExtractForModel(truncated)).toContain(`v${EXTRACT_VERSION}`);
  });
});

describe("acceptance: turn lifecycle idempotency (T4)", () => {
  const store = new Map<string, TurnIdempotencyRecord>();

  beforeEach(() => store.clear());
  afterEach(() => store.clear());

  it("deduplicates across user message, link, run, and assistant persist phases", () => {
    const key = {
      userId: 7,
      clientMessageId: "client-msg-abc",
    };

    const first = beginTurnIdempotency(store, {
      ...key,
      conversationId: "conv-1",
      phase: "accepted",
    });
    expect(first.created).toBe(true);
    expect(first.record.phase).toBe("accepted");

    const second = beginTurnIdempotency(store, {
      ...key,
      conversationId: "conv-1",
      phase: "accepted",
    });
    expect(second.created).toBe(false);
    expect(second.record.clientMessageId).toBe("client-msg-abc");

    completeTurnIdempotency(store, key, {
      phase: "user_persisted",
      userMessageId: 100,
    });
    completeTurnIdempotency(store, key, {
      phase: "attachments_linked",
    });
    completeTurnIdempotency(store, key, {
      phase: "run_started",
      runId: "run-1",
    });
    completeTurnIdempotency(store, key, {
      phase: "assistant_persisted",
      assistantMessageId: 101,
    });
    completeTurnIdempotency(store, key, {
      phase: "done",
    });

    const found = findTurnIdempotency(store, key);
    expect(found?.phase).toBe("done");
    expect(found?.userMessageId).toBe(100);
    expect(found?.assistantMessageId).toBe(101);
    expect(found?.runId).toBe("run-1");
  });
});
