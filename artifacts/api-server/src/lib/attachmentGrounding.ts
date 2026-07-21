/**
 * Attachment grounding — single canonical helper for T1/T2 signals.
 *
 * Feature flag ATTACHMENT_CONTINUITY_V2=1 enables expanded prompt/history
 * formatting. Callers always use these helpers; flag only changes output shape
 * inside this module (no parallel nexus pipeline).
 */

export function isAttachmentContinuityV2Enabled(): boolean {
  return process.env.ATTACHMENT_CONTINUITY_V2 === "1";
}

/** Server-side prior row (may include DB ids). Not for prompt injection as-is. */
export type PriorAttachmentRecord = {
  attachmentId: string;
  publicRef: string;
  filename: string;
  mimeType: string;
  kind: string;
  originatingMessageId: number;
  originatingMessageRef: string;
  uploadStatus: string;
  processingStatus: string;
  /** Row existed and was linked to a user message. */
  existed: boolean;
  /** Model successfully ingested content on the originating turn. */
  priorAttachmentWasModelReceived: boolean;
  extractedContentExists: boolean;
  bytesRetrievable: boolean;
};

export type AttachmentGroundingState = {
  currentTurnHasAttachments: boolean;
  currentTurnResolvedCount: number;
  conversationHasPriorAttachments: boolean;
  priorAttachments: PriorAttachmentRecord[];
  referencedPriorAttachmentAvailable: boolean;
  referencedPriorAttachmentContentAvailable: boolean;
  /** Aggregate: any prior was successfully ingested on its origin turn. */
  anyPriorAttachmentWasModelReceived: boolean;
};

export type BuildGroundingInput = {
  currentAttachmentIds: string[];
  currentResolvedCount: number;
  priorAttachments: PriorAttachmentRecord[];
  referencedPublicRefs: string[];
  contentReopenedPublicRefs: string[];
};

export function buildAttachmentGroundingState(
  input: BuildGroundingInput,
): AttachmentGroundingState {
  const priorAttachments = input.priorAttachments;
  const conversationHasPriorAttachments = priorAttachments.some((p) => p.existed);
  const refSet = new Set(input.referencedPublicRefs);
  const reopenSet = new Set(input.contentReopenedPublicRefs);

  const referenced = priorAttachments.filter((p) => refSet.has(p.publicRef));
  const referencedPriorAttachmentAvailable = referenced.some(
    (p) => p.existed && p.bytesRetrievable,
  );
  const referencedPriorAttachmentContentAvailable = referenced.some((p) =>
    reopenSet.has(p.publicRef),
  );

  return {
    currentTurnHasAttachments: input.currentAttachmentIds.length > 0,
    currentTurnResolvedCount: input.currentResolvedCount,
    conversationHasPriorAttachments,
    priorAttachments,
    referencedPriorAttachmentAvailable,
    referencedPriorAttachmentContentAvailable,
    anyPriorAttachmentWasModelReceived: priorAttachments.some(
      (p) => p.priorAttachmentWasModelReceived,
    ),
  };
}

/** Model-visible lines — no DB UUIDs or storage paths. */
function formatPriorLines(priors: PriorAttachmentRecord[]): string {
  return priors
    .map((p) => {
      return [
        `  - publicRef: ${p.publicRef}`,
        `    filename: ${p.filename}`,
        `    mimeType: ${p.mimeType}`,
        `    kind: ${p.kind}`,
        `    originatingMessageRef: ${p.originatingMessageRef}`,
        `    uploadStatus: ${p.uploadStatus}`,
        `    processingStatus: ${p.processingStatus}`,
        `    existed: ${p.existed}`,
        `    priorAttachmentWasModelReceived: ${p.priorAttachmentWasModelReceived}`,
        `    extractedContentExists: ${p.extractedContentExists}`,
        `    bytesRetrievable: ${p.bytesRetrievable}`,
      ].join("\n");
    })
    .join("\n");
}

export function formatGroundingPromptBlock(state: AttachmentGroundingState): string {
  const priorBlock =
    state.priorAttachments.length > 0
      ? `priorAttachments:\n${formatPriorLines(state.priorAttachments)}`
      : "priorAttachments: (none)";

  return `
--- ATTACHMENT GROUNDING (AUTHORITATIVE) ---
currentTurnHasAttachments: ${state.currentTurnHasAttachments}
currentTurnResolvedCount: ${state.currentTurnResolvedCount}
conversationHasPriorAttachments: ${state.conversationHasPriorAttachments}
anyPriorAttachmentWasModelReceived: ${state.anyPriorAttachmentWasModelReceived}
referencedPriorAttachmentAvailable: ${state.referencedPriorAttachmentAvailable}
referencedPriorAttachmentContentAvailable: ${state.referencedPriorAttachmentContentAvailable}
${priorBlock}

RULES:
1. Current-turn claims about seeing/reading a newly attached file require currentTurnResolvedCount > 0
   or referencedPriorAttachmentContentAvailable after an explicit reopen this turn.
2. You MAY state priorAttachments facts (filename, that the user attached them earlier).
3. You MAY say you analyzed a prior file only when that row has priorAttachmentWasModelReceived: true.
4. You MUST NOT claim you can reopen original contents unless referencedPriorAttachmentContentAvailable is true
   or current-turn content was injected.
5. You MUST NOT say no attachment ever existed when conversationHasPriorAttachments is true.
6. If the user asks whether you can still access a prior file: disclose provenance + content availability.
   Do not use a blanket "no attachment on this message" denial that erases prior provenance.
7. If conversationHasPriorAttachments is false AND currentTurnHasAttachments is false:
   then (and only then) deny attachment presence entirely.
--- END ATTACHMENT GROUNDING ---`.trim();
}

/**
 * Model-visible history replacement for empty attachment-only user turns.
 * Omits raw DB attachment UUIDs.
 */
export function formatHistoryProvenanceBlock(
  priors: PriorAttachmentRecord[],
): string {
  if (priors.length === 0) return "[attachment]";
  return `[Prior attachments for this user message]\n${formatPriorLines(priors)}`;
}

/** Assign stable public refs for a conversation window (backend map retains UUIDs). */
export function assignPublicRefs(
  rows: Array<Omit<PriorAttachmentRecord, "publicRef" | "originatingMessageRef"> & {
    publicRef?: string;
    originatingMessageRef?: string;
  }>,
): PriorAttachmentRecord[] {
  return rows.map((row, i) => ({
    ...row,
    publicRef: row.publicRef ?? `prior-${i + 1}`,
    originatingMessageRef:
      row.originatingMessageRef ?? `msg-${row.originatingMessageId}`,
  }));
}

/** Backend-only lookup: publicRef → attachmentId */
export function buildAttachmentIdMap(
  priors: PriorAttachmentRecord[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of priors) map.set(p.publicRef, p.attachmentId);
  return map;
}
