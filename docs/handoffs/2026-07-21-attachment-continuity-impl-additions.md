# Attachment Continuity — Approved Implementation Additions

**Date:** 2026-07-21  
**Status:** Implementation approved with additions below.  
**Base plan:** `docs/handoffs/2026-07-21-attachment-continuity-fix-plan.md`

## Approved additions (binding)

1. **`priorAttachmentWasModelReceived`**  
   Explicit boolean on prior provenance and grounding state.  
   Distinguishes “file existed / was linked” from “model successfully ingested content on the originating turn.”

2. **Existence ≠ successful model ingestion**  
   Never treat `uploadStatus=uploaded` alone as proof the model read the file.  
   Use `priorAttachmentWasModelReceived` / `model_injected_at` (or equivalent) for ingestion truth.

3. **Real database IDs backend-only where possible**  
   Model-visible provenance and prompts use opaque `publicRef` / filename / kind.  
   UUID `attachmentId` and numeric message PKs stay in a server-side ref map for resolve/reopen.  
   Do not put raw storage paths or DB UUIDs in system-prompt/history blocks when a public ref suffices.

4. **Define relevance selection before building T3**  
   Ship and lock `attachmentRelevance` (API + acceptance tests) before extract persistence / reopen wiring.

5. **Version and label truncated extracts**  
   Every persisted/injected extract carries `extractVersion` and, when truncated, an explicit label  
   (e.g. `[attachment extract v1 — truncated to budget]`).

6. **Idempotency across the complete message/run lifecycle**  
   Deduplicate on client-minted key for: user message insert → attachment link → model run → assistant persist → done.  
   Not only the HTTP entrypoint.

7. **One canonical pipeline**  
   Feature flags (`ATTACHMENT_CONTINUITY_V2`) branch inside shared helpers used by `/api/nexus/chat`.  
   No parallel chat handler, no duplicate resolve path, no second OutputGuard.

8. **Lock acceptance tests before the first production code change**  
   Acceptance suite committed first; implementation follows to turn it green.

## Signal set (authoritative)

```
currentTurnHasAttachments
currentTurnResolvedCount
conversationHasPriorAttachments
priorAttachmentWasModelReceived   // per prior row + aggregate “any”
referencedPriorAttachmentAvailable
referencedPriorAttachmentContentAvailable
```

## Rollout unchanged

T1 → T2 → T3 (relevance first) → T4, single pipeline, flag-gated.
