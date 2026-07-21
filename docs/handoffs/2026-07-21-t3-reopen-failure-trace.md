# T3 Reopen Failure — “What did slide 6 say?” Trace

**Date:** 2026-07-21  
**Scope:** Read-only investigation of the founder walkthrough failure.  
**No code fix in this document.**

## Intended behavior (confirmed)

With `ATTACHMENT_CONTINUITY_V2=1`, after a successful PowerPoint origin turn:

> “What did slide 6 say?”

must trigger relevance → historical resolve → PPTX re-download + re-extract → reinjection.  
**Reattachment is not expected.** This is not a prose-recall case.

## Observed behavior (founder)

1. Attach PPTX (refresh during attach)  
2. Eventually attaches; Atlas reads deck accurately (including slide 6 / notes)  
3. Later: “What did slide 6 say?” → Atlas cannot answer; asks to reattach  
4. Reattach → correct answer  

---

## Canonical follow-up pipeline (exact gates)

```
POST /api/nexus/chat  (no attachmentIds)
  │
  ├─[1] continuityV2 = (process.env.ATTACHMENT_CONTINUITY_V2 === "1")
  │     if false → SKIP all of T2/T3; legacy HARD RULE → “reattach”
  │
  ├─[2] Load dbMessages for body.conversationId
  │     if no conversationId → empty history → priorAttachmentRecords = []
  │
  ├─[3] loadPriorAttachmentsForMessages(user message ids from history)
  │     join message_attachments ON nexus_message_id / chat_message_id
  │     if nexus_message_id IS NULL → attachment invisible to T3
  │
  ├─[4] selectRelevantPriorAttachments("What did slide 6 say?", priors)
  │     SLIDE_OR_DECK matches → should select PPTX if priors non-empty
  │
  ├─[5] resolveAttachmentIdsForModel(selectedIds)
  │     requires uploadStatus=uploaded, processingStatus=understood,
  │     bytes downloadable, extract succeeds
  │
  └─[6] Inject textContent into model payload; mark content reopened in grounding
```

Key code:

- Flag: `artifacts/api-server/src/lib/attachmentGrounding.ts` (`=== "1"`)  
- Prior load + relevance + reopen: `artifacts/api-server/src/routes/nexus.ts` ~2904–3005  
- Relevance slide intent: `artifacts/api-server/src/lib/attachmentRelevance.ts` (`slide\s*\d+|…|powerpoint|pptx`)  
- Acceptance proof that “What did slide 6 say?” selects PPTX: `attachmentContinuity.acceptance.test.ts`

---

## Answers to the eight questions

### 1. Was `ATTACHMENT_CONTINUITY_V2=1` active?

**Cannot read the live production process env from this agent environment.**

Repo evidence:

- Flag is **opt-in only**: `process.env.ATTACHMENT_CONTINUITY_V2 === "1"`.
- **No** `.env`, Replit, Docker, YAML, or capabilities wiring sets this variable anywhere in the repository.
- `/api/capabilities` exposes `ATTACHMENTS_PERSISTENCE`, not continuity v2.

**If the flag was unset (default), the entire T3 path is skipped.**  
Follow-up hits the **legacy HARD RULE** (“NO ATTACHMENT WAS PROVIDED WITH THIS MESSAGE” / ask to drop the file in). That matches the observed “cannot answer — reattach” response exactly.

**This is the strongest code-deterministic explanation available without server logs.**  
If ops confirms the env var was set to `1` on the API that served the walkthrough, go to §2–8 below.

### 2. Did the origin PowerPoint have linkage / `model_injected_at` / bytes / conversationId?

**Not verifiable here without the session’s DB rows.** Required checks on the origin attachment row:

| Field | Required for T3 | Notes |
|---|---|---|
| `nexus_message_id` (Ask Atlas) | **Yes** — prior load joins on message ids in history | If NULL, model may still have read the file on origin (resolve runs *before* link), but follow-up **cannot see** the attachment |
| `conversation_id` | Should match follow-up `body.conversationId` | Mismatch → wrong/empty history → no priors |
| `upload_status = uploaded` | Yes for reopen | |
| `processing_status = understood` | Yes for reopen | Extract failure marks `failed` → reopen skipped |
| `model_injected_at` | **Not required for reopen selection** | Used for `priorAttachmentWasModelReceived` / analysis-recall honesty; relevance does not gate on it |
| Object bytes retrievable | Yes | download failure → skip |

**Refresh / incomplete-records hypothesis (possible, needs DB evidence):**

Order on origin send (`nexus.ts`):

1. `resolveAttachmentIdsForModel` (+ `markModelInjected`)  
2. … history / prompt …  
3. Insert user message + `linkAttachmentsToMessage`  
4. SSE stream / model answer  

So a **completed** accurate slide-level answer almost always means resolve already succeeded. Link is scheduled **before** the stream starts. A fully streamed correct origin answer therefore **usually** implies linkage was attempted.

However, refresh can still produce incomplete continuity if:

- Client remount dropped staged `attachmentId` and a **later** “successful” UX path differed; or  
- Client lost `conversationId` so follow-up loaded a **different** conversation than the one that owns the linked row; or  
- Link update failed / wrong ids while resolve still injected content (less common if insert+link throw).

**Evidence needed (SQL shape):**

```sql
-- Origin user messages in the conversation the UI was using:
SELECT id, role, left(content,80), conversation_id, created_at
FROM nexus_messages
WHERE conversation_id = '<ui_conversation_id>'
ORDER BY id;

-- Attachments for that user around the walkthrough time:
SELECT id, filename, upload_status, processing_status,
       nexus_message_id, conversation_id, model_injected_at,
       availability_status
FROM message_attachments
WHERE user_id = <id>
  AND filename ILIKE '%.pptx%'
ORDER BY created_at DESC;
```

Interpretation:

- `nexus_message_id` NULL + `model_injected_at` set → **readable on origin, invisible to T3** (strong refresh/incomplete-linkage signal).  
- `nexus_message_id` set but `conversation_id` ≠ follow-up conversation → **conversation split after remount**.  
- Both set + `understood` + uploaded → flag/relevance/resolve failure further down.

### 3. Did “What did slide 6 say?” trigger attachment relevance?

**Only if gate [1] and [3] passed** (`continuityV2 && priorAttachmentRecords.length > 0`).

If those passed: **yes**. The phrase matches `SLIDE_OR_DECK` (`slide\s*\d+`). Unit acceptance locks this.

If `priorAttachmentRecords` was empty: relevance is never meaningfully run for reopen (no candidates). Stop before selection.

### 4. Which historical attachment was selected?

**Unknown without logs.** Expected: the prior PPTX `attachmentId` / `publicRef` (e.g. `prior-1`).

Log line when reopen runs:

`nexus: historical attachments reopened via relevance`

Absence of that line on the follow-up request ⇒ selection empty or reopen block not entered.

### 5. Did re-resolution start?

Only after non-empty `toReopen` from relevance.  
Same log / `resolveAttachmentIdsForModel` call at `nexus.ts` ~2969.

### 6. Did download and extraction succeed?

Would appear as resolved entries appended to `allAttachments`, or as `skipped` reasons:

- `not_found_or_forbidden`
- `not_uploaded`
- `processing_failed` / `processing_unsupported` / `processing_not_ready`
- `download_failed`
- extract throw → row marked `failed`, skip

### 7. Was extracted content in the final model payload?

Only if step 6 resolved with `asText` + `textContent` and the Claude/Gemini inject loops included that attachment (`nexus.ts` ~6670 / ~6833).

### 8. Exact stop condition (ranked by likelihood from code + walkthrough shape)

| Rank | Stop condition | Matches “reattach” UX? | Refresh-related? |
|---|---|---|---|
| **1** | `ATTACHMENT_CONTINUITY_V2` ≠ `1` → legacy HARD RULE, no T3 | **Yes** | No |
| **2** | Flag on, but `priorAttachmentRecords.length === 0` (no `nexus_message_id` on origin row, or wrong/missing `conversationId` on follow-up) | **Yes** (grounding: no prior attachments) | **Often yes** |
| **3** | Priors present; relevance OK; re-resolve skipped (`processing_*`, download fail, extract fail) | Yes (content unavailable) | Unlikely unless origin extract left row `failed` |
| **4** | Reopen succeeded but model still refused | Unlikely if grounding shows content available | No |
| — | “Prose vs document” | **Rejected** for this question | — |

---

## Refresh separately

| Claim | Evidence |
|---|---|
| PPTX/Documents attach often hard-reloads | Documented in composer draft / staged-attachment comments |
| Hard reload clears staged File blobs + in-memory chips | `useStagedAttachments` soft map; IDB blobs disabled |
| Staging metadata written but **not** rehydrated into composer | `upsertStagingAttachmentMeta` only; `loadStagingAttachmentMeta` unused outside tests |
| Refresh can leave server finalize rows unlinked until a send with `attachmentIds` | True |
| Refresh can make origin **model-readable** while T3-invisible | **Possible iff** resolve/`model_injected_at` without durable `nexus_message_id` **or** follow-up conversationId ≠ origin conversationId |
| Refresh after a fully linked origin turn blocks T3 by itself | **No** — T3 reads DB, not client staging |

For this walkthrough: refresh is a **credible cause of stop #2** (incomplete linkage or conversation split). It is **not** an excuse to skip T3 when linkage + flag are intact. It does **not** make “What did slide 6 say?” a prose-only case.

---

## What to pull from the live session (minimal)

1. API process env: `ATTACHMENT_CONTINUITY_V2`  
2. Follow-up request log: `conversationId`, `attachmentIds` (should be empty), presence/absence of `historical attachments reopened via relevance`  
3. SQL for the PPTX row(s): `nexus_message_id`, `conversation_id`, `model_injected_at`, `upload_status`, `processing_status`  
4. Compare follow-up `conversationId` to attachment `conversation_id` and to the user message id that owns the grounded assistant reply  

---

## Conclusion

Under the stated T3 design, this failure is **a defect relative to expected behavior**, not expected prose fallback.

**Best-supported stop without live logs:** continuity v2 never entered (flag unset in deploy), OR it entered with **zero prior attachments loaded** (linkage / conversation identity), so relevance never selected the deck.

**Refresh:** investigate as a cause of incomplete origin continuity records or conversationId split — verify with the SQL above — not as a reason T3 should skip slide questions.

**No code changes in this investigation.** Next implementation step (only after confirming env + rows): make the flag visible in `/api/capabilities`, add reopen/selection structured logs on every follow-up, and harden origin linkage + conversationId survival across Documents remount.
