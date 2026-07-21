# Attachment Continuity Fix Plan

**Date:** 2026-07-21  
**Status:** Plan only — **no code changes in this document’s accompanying work.**  
**Prerequisite:** Investigation accepted  
(`docs/handoffs/2026-07-21-attachment-continuity-provenance-investigation.md`)

This plan separates three defects that must not be conflated:

| Track | Name | Goal |
|---|---|---|
| **T1** | Truthfulness / provenance | Never confuse “no file on this turn” with “no prior file in this conversation”; never label grounded prior analysis as fabricated |
| **T2** | Document-content continuity | Answer follow-ups that need prior file content, under explicit relevance + caps |
| **T3** | Refresh / recovery | Survive Android Documents hard reload during pick/upload without silent loss or duplicate runs |

**Non-goal:** A prompt wording tweak alone is not a repair. T1 requires structured runtime signals + OutputGuard evidence changes. T2 requires a content-access policy. T3 is a separate client recovery defect.

---

## Three concerns (must stay distinct)

1. **Current-turn attachment presence** — Was a file attached / resolved on *this* request?
2. **Historical attachment provenance** — Did this conversation previously include attachments (IDs, names, MIME, linkage, prior model receipt)?
3. **Historical attachment content availability** — Can Atlas *reopen* original bytes or extracted text *now*, vs only remember prior analysis + metadata?

Atlas must disclose which of (2) and (3) apply. Allowed truthful statements:

- “You attached a PowerPoint earlier.”
- “I analyzed that PowerPoint in the previous turn.”
- “I cannot reopen its original contents in this turn.”

Still blocked: invented file presence/content when neither current-turn nor conversation-prior evidence exists.

---

## Track T1 — Guard and OutputGuard correction

### Exact current enforcement points

| Mechanism | File | Location | What it does wrong |
|---|---|---|---|
| HARD RULE (zero current attachments) | `artifacts/api-server/src/routes/nexus.ts` | ~6415–6432 | Sets `attachmentCount: 0` and says **“NO ATTACHMENT WAS PROVIDED WITH THIS MESSAGE”**, then: **“Do NOT infer attachment presence from … conversation history”**, and forces Exact: *“I don't see an attachment on this message — can you drop it in?”* |
| HARD RULE (skipped / resolved branches) | same | ~6433–6465 | Correct for *current-turn* readability; does not surface prior-turn provenance |
| History placeholder | same | ~2856–2864 | Empty user → `"[attachment]"` — no ID/filename/status |
| OutputGuard evidence | same | `getPerAttachmentEvidence` ~6826–6865 | Current-turn resolved/skipped/legacy/vault/url only |
| Perception patterns + correction | `artifacts/api-server/src/lib/attachmentOutputGuard.ts` | `PERCEPTION_PATTERNS` ~53–86; `buildCorrection` ~400–428; `checkAttachmentClaims` ~440+ | Current-turn-only; correction: *“no attachment was present or readable in this message”* / quotes claim as unsupported (reads as fabrication admission) |
| Unit invariant | `artifacts/api-server/src/lib/__tests__/attachmentOutputGuard.test.ts` | ~187–198 | Explicitly blocks prior-attachment references with empty evidence — **this invariant must be rewritten**, not preserved |

### Required runtime signals (authoritative, server-built)

Build once per `/api/nexus/chat` turn, inject into system prompt **and** pass into OutputGuard evidence:

```ts
type AttachmentGroundingState = {
  currentTurnHasAttachments: boolean;           // attachmentIds.length > 0 || legacy/vault/url
  currentTurnResolvedCount: number;
  conversationHasPriorAttachments: boolean;     // any linked row in conversation (excl. this turn’s new links if not yet written — use DB query by conversationId)
  priorAttachments: PriorAttachmentProvenance[]; // capped list for prompt + guard
  referencedPriorAttachmentIds: string[];       // from relevance selector (T2); may be empty on T1-only ship
  referencedPriorAttachmentAvailable: boolean;  // row exists, not expired, uploadStatus=uploaded
  referencedPriorAttachmentContentAvailable: boolean; // extracted text persisted OR re-resolve succeeded this turn
};
```

Prompt shape (replace the zero-attachment HARD RULE block):

```
--- ATTACHMENT GROUNDING (AUTHORITATIVE) ---
currentTurnHasAttachments: false
currentTurnResolvedCount: 0
conversationHasPriorAttachments: true
priorAttachments:
  - id: …
    filename: deck.pptx
    mimeType: …
    kind: doc
    originatingMessageId: …
    uploadStatus: uploaded
    processingStatus: understood
    modelReceivedOnOriginTurn: true
    extractedContentPersisted: false|true
    bytesRetrievable: true|false
referencedPriorAttachmentAvailable: false|true
referencedPriorAttachmentContentAvailable: false|true

RULES:
1. Current-turn claims about seeing/reading a file require currentTurnResolvedCount > 0
   (or referencedPriorAttachmentContentAvailable after an explicit re-open).
2. You MAY state priorAttachments facts and that you analyzed them on the originating turn.
3. You MUST NOT claim you can reopen original contents unless
   referencedPriorAttachmentContentAvailable is true OR current-turn content was injected.
4. You MUST NOT say no attachment ever existed when conversationHasPriorAttachments is true.
5. If the user asks “can you see/access the file I attached earlier?”:
   answer with provenance + content-availability, not the old Exact denial string.
6. If conversationHasPriorAttachments is false AND currentTurnHasAttachments is false:
   then (and only then) deny attachment presence entirely.
--- END ATTACHMENT GROUNDING ---
```

### Smallest OutputGuard changes

1. Extend `AttachmentEvidence`:

```ts
attachments: ResolvedAttachmentInfo[];          // current turn (unchanged semantics)
priorAttachments: PriorAttachmentProvenance[];  // metadata-only unless content reopened
contentReopenedAttachmentIds: Set<string>;      // IDs whose content was injected this turn
toolsExecutedThisTurn: ReadonlySet<string>;
```

2. Claim classification (replace binary “any content this turn”):

| Claim class | Example | Allowed when |
|---|---|---|
| Current-turn perception | “I can see the file you just attached” | current-turn `contentSuppliedToModel` |
| Historical provenance | “You attached deck.pptx earlier” | matching `priorAttachments` |
| Historical analysis recall | “In the previous turn I analyzed that deck” | prior `modelReceivedOnOriginTurn` **or** assistant history already contains that analysis; **do not** treat as fabrication |
| Current reopen | “Slide 6 says …” (as live re-read) | `contentReopenedAttachmentIds` or current-turn content |
| Invented presence | “I can see the PDF you attached” with no prior/current | **block** |

3. Rewrite `buildCorrection` so it never implies the model invented prior grounded work. Prefer:

   - “I can’t reopen that file’s contents in this turn. You did attach **X** earlier; my earlier analysis said …”
   - not: “*(I said … — but no attachment was present)*”

4. Soften/split `PERCEPTION_PATTERNS` so phrases like “you attached earlier” / “in the previous message” are validated against `priorAttachments`, not treated as current-turn perception.

### Files (T1)

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/nexus.ts` | Replace HARD RULE block; load prior attachment provenance for `conversationId` / session; pass expanded evidence into guard |
| `artifacts/api-server/src/lib/attachmentOutputGuard.ts` | Evidence model, claim classes, correction copy |
| `artifacts/api-server/src/lib/__tests__/attachmentOutputGuard.test.ts` | New cases for allowed provenance / blocked invention / no fabrication admission |
| New helper (preferred) | `artifacts/api-server/src/lib/attachmentGrounding.ts` — build `AttachmentGroundingState` from DB + resolve results (keeps `nexus.ts` thinner) |

### Schema (T1)

**None required** if provenance is joined from existing `message_attachments` + `nexus_messages` / `chat_messages`. Optional boolean `model_received_on_origin_turn` can be inferred: `processingStatus === 'understood' && uploadStatus === 'uploaded'` at link time was true for successful inject; for accuracy add later in T2:

- `model_injected_at timestamptz null` on `message_attachments` (set when resolve succeeds on origin turn)

### Tests (T1)

- Guard: prior metadata claims allowed; current perception blocked without content; invention blocked when no prior/current.
- Integration-ish unit: grounding builder returns `conversationHasPriorAttachments` from fixture rows.
- Prompt snapshot/string test: zero-current + prior-present does **not** contain Exact “I don't see an attachment on this message”.
- Regression: still blocks hallucinated screenshots when neither prior nor current exists.

### Rollout / rollback (T1)

- Ship behind flag `ATTACHMENT_GROUNDING_V2=1` (env) default on in staging, off then on in prod.
- Rollback: flag off restores old HARD RULE + old guard evidence (known-bad continuity, safe revert).
- **No migration** if inference-only; if `model_injected_at` added, column is nullable — rollback is ignore column.

---

## Track T2 — Historical provenance (model-visible history)

### Problem

`conversationHistory` maps to `{ role, content }` only; attachment-only users become `"[attachment]"`.

### Required model-visible provenance (no secrets)

For each prior user message with linked attachments, replace bare placeholder with a structured block (text is fine; keep role/content string API for Anthropic/Gemini compatibility):

```
[Prior attachments for this user message]
- attachmentId: <uuid>
  filename: invoice.pdf
  mimeType: application/pdf
  kind: pdf
  originatingMessageId: <nexus|chat message id>
  uploadStatus: uploaded
  processingStatus: understood
  modelReceivedOnOriginTurn: true|false|unknown
  extractedContentExists: true|false
  bytesRetrievable: true|false
```

**Never** include: `storageBucket`, `storagePath`, signed URLs, tokens, raw GCS object names.

### Implementation

1. When loading history in `nexus.ts` (~2649–2867), batch-query `message_attachments` by `nexusMessageId` / `chatMessageId` for the history window (same join pattern as thread hydrate ~2124–2164).
2. Build provenance via shared helper (reuse T1 `PriorAttachmentProvenance`).
3. Cap: last **N=10** prior attachments in the 40-message window, or **2 KB** provenance text — whichever first.
4. Thread UI serializer unchanged for chips; provenance is **model path only** (optional: mirror summary fields on thread JSON later — not required for T2).

### Schema fields for provenance accuracy (minimal)

Add to `message_attachments` (nullable, additive):

| Column | Type | Purpose |
|---|---|---|
| `model_injected_at` | `timestamptz null` | Set when origin-turn resolve injected content |
| `extract_status` | `text null` (`none` \| `persisted` \| `failed` \| `not_applicable`) | Whether extract artifact exists |
| `extract_char_count` | `integer null` | For caps / UI honesty |
| `bytes_retrievable` | optional computed at read time | Prefer **computed**: `uploadStatus=uploaded && availabilityStatus∈{active,expiring,library} && !expired` — no column required |

Migration: additive nullable columns via existing `ensureColumns` pattern in `artifacts/api-server/src/index.ts` **or** drizzle migration — follow repo convention for `message_attachments`. No destructive UPDATE/DELETE.

### Files (T2)

| File | Change |
|---|---|
| `lib/db/src/schema/message_attachments.ts` | New nullable columns |
| `artifacts/api-server/src/lib/attachmentResolve.ts` | Set `model_injected_at` / `extract_status` on successful inject path (or from nexus after resolve) |
| `artifacts/api-server/src/routes/nexus.ts` | History assembly uses provenance helper |
| `artifacts/api-server/src/lib/attachmentGrounding.ts` (new) | Format provenance lines; shared with T1 |
| Tests | History formatter unit tests; ensure no storage paths leak |

### Rollout / rollback (T2)

- Can ship with T1 (recommended same PR series, after T1 flag proven).
- Rollback: stop appending provenance blocks (flag); columns remain unused.

---

## Track T3 — Historical content access (follow-up questions)

### Options compared

| Option | Supports “invoice total / slide 6 / compare to new file”? | Cost / risk | Notes |
|---|---|---|---|
| **1. Persist extracted document text** | Yes for text-extractable types; PDF needs text extract or summary | Storage + PII retention; must cap size | Best for PPTX/DOCX/XLSX/CSV; PDF today is native document inject — needs `pdf-parse` or store page text at origin turn |
| **2. Re-resolve historical attachment ID when explicitly referenced** | Yes if bytes still retrievable | Latency + token spikes; must gate | Reuses `resolveAttachmentIdsForModel`; no new blob store |
| **3. Persist document summary/index** | Partial (totals if in summary; slide 6 maybe not) | Smaller storage; lossy | Good complement, insufficient alone for slide-level |
| **4. Require reattachment when bytes unavailable** | Yes only after user re-attaches | Honest UX; poor continuity | Needed as **failure path**, not primary |

### Recommendation (smallest safe)

**Hybrid: 2 primary + 1 opportunistic + 4 fallback.**

1. **On origin turn (when resolve already extracts):** persist extracted text artifact (Option 1) for extractable types and for PDF if/when text is obtained — **capped** (`EXTRACT_TEXT_BYTE_CAP` = 500 KB already exists).
2. **On follow-up:** relevance selector decides whether to reopen; prefer **persisted extract**; if missing but `bytesRetrievable`, **re-resolve** that ID (Option 2).
3. If neither works: disclose provenance + ask to re-attach (Option 4). Do **not** invent slide/invoice content from memory unless it appears in prior **assistant** message text (allowed as “my earlier analysis said…”, clearly labeled).

Do **not** auto-inject every prior attachment every turn.

### Relevance selection

Trigger reopen only when **any** of:

- User message references a prior filename / “the powerpoint / invoice / spreadsheet / slides / attachment above / earlier / previous”.
- Heuristic: attachment nouns + temporal deixis (“above”, “earlier”, “last file”).
- Explicit compare: current-turn attachment + “compare … earlier”.
- Optional: Whisper/intent hint later — not required for v1.

Selection order:

1. Explicit filename / extension match in prior list.
2. Most recent prior attachment of matching kind (pdf / doc / spreadsheet).
3. Most recent prior attachment overall.
4. Cap **K=2** reopened historical attachments per turn (+ all current-turn IDs).

### Size / token limits

Reuse existing caps:

- `ATTACHMENT_MAX_COUNT` (10) includes current + reopened.
- `ATTACHMENT_MAX_MESSAGE_BYTES` (50 MB) for byte downloads.
- `EXTRACT_TEXT_BYTE_CAP` (500 KB) per extract; additional **per-turn historical inject budget** e.g. **200 KB** text total for reopened extracts.
- `PPTX_SLIDE_CAP` / `EXTRACT_IMAGE_BLOCK_CAP` unchanged; **do not** re-rasterize slides on reopen unless text missing (CPU heavy).

### Failure behavior

| Failure | Model signal | User-visible |
|---|---|---|
| Not referenced / not selected | provenance only | none |
| Selected, extract miss, re-resolve fail | `referencedPriorAttachmentContentAvailable: false` | Atlas says cannot reopen; offers re-attach |
| Expired / library-only policy deny | same | same |
| Over budget | inject truncated extract + warning line | “opened first N slides / truncated” |

### Persist shape (Option 1 detail)

Prefer **separate table** (keeps `message_attachments` lean, easier retention):

```ts
// attachment_extracts
id uuid PK
attachment_id uuid FK → message_attachments ON DELETE CASCADE
format text          // pptx|docx|xlsx|csv|pdf|text
text text            // capped
stats jsonb          // slides, sheets, truncated, …
created_at timestamptz
```

Write after successful `extractAttachment` inside `resolveAttachmentIdsForModel` (or immediately after in nexus). Idempotent upsert on `attachment_id`.

PDF: if only native document inject today, either:

- run lightweight text extract once at origin turn and persist, or
- on reopen re-download and inject native document again (Option 2 for PDF bytes).

Recommend: **persist text when extractable; for PDF reopen via re-resolve bytes** until PDF text extract is reliable.

### Compare flow (“spreadsheet earlier + new one”)

- Current-turn IDs resolve as today.
- Relevance selects prior spreadsheet ID → inject persisted extract or re-resolve.
- Guard marks both current and reopened IDs as content-available.

### Files (T3)

| File | Change |
|---|---|
| New schema `attachment_extracts` | Persist capped text |
| `attachmentResolve.ts` | Upsert extract; export `resolveAttachmentIdsForModel` for historical IDs |
| New `attachmentRelevance.ts` | Select historical IDs from user text + prior list |
| `nexus.ts` | Merge selected historical IDs into resolve **after** relevance; set grounding flags; inject; **do not** treat historical IDs as “user attached this message” in UI ack |
| `attachmentOutputGuard.ts` | `contentReopenedAttachmentIds` |
| Tests | Relevance unit tests; reopen inject; over-budget truncate; deny when unavailable |

### Rollout / rollback (T3)

- Flag `ATTACHMENT_HISTORICAL_REOPEN=1`.
- Ship **after** T1 (truthfulness) so reopen failures don’t look like fabrication.
- Rollback: flag off → provenance-only behavior; extracts table can remain.

---

## Track T4 — Refresh / reload recovery (separate defect)

### Exact trigger (best current evidence)

Not a deliberate `location.reload()` on attach. Observed “refresh” during document pick/upload is primarily:

1. **Android Documents / Office picker WebView kill** — cold start after picker (`composerDraftStore.ts`, `ghostClickShield.ts` comments; `atlas-picker-pending` in sessionStorage).
2. Secondary amplifiers: chunk-load recovery (`routes/__root.tsx`), confirmed 401 → login (`install-api-fetch.ts`), ErrorBoundary soft remount (`App.tsx` + `useStagedAttachments` soft memory).

Plan assumes (1) is the primary user-reported trigger; instrument to confirm before large UX changes.

### State lost vs survives

| State | Soft remount | Hard reload (Documents kill) |
|---|---|---|
| Typed composer input | yes (module + sessionStorage) | **yes** (sessionStorage) |
| Staged `File` blobs | yes (`softMemoryBySurface`) | **no** (IDB blob persist disabled — OOM) |
| Client staged IDs / preview URLs | yes | **no** |
| Server rows after `request-upload` | yes | **yes** (orphan until linked/expired) |
| Server rows after `finalize` | yes | **yes** (`uploadStatus=uploaded`) |
| Optimistic thread message | in-memory | **lost** until refetch |
| In-flight SSE | connection drop | client loses stream; server may still finish |
| Persisted assistant message | yes | yes (after server finish) |

**First item lost on hard reload:** staged File blobs + client knowledge of `attachmentId`.

### Recovery design

1. **Persist staging metadata (not File bytes) to sessionStorage** after `request-upload` returns an ID:
   - `{ clientAttachmentId, attachmentId, filename, mimeType, sizeBytes, uploadStatus, conversationId, surface }`
2. On boot / Ask Atlas mount: if metadata says `pending_upload` or `uploaded` and not yet linked, **reconcilation UI**:
   - Poll `GET /api/attachments/:id` (or small `GET /api/attachments/staging?conversationId=` — new, auth-scoped) 
   - If finalized: show chip as ready **without** File blob (no preview or generic icon)
   - If pending: show “Upload interrupted — tap to retry” (needs File → user must re-pick)
3. **Finalized server IDs are recoverable** — yes, if client stored the UUID or lists unlinked uploads for this user/conversation within a short TTL.
4. **Pending user message / run after reload:** if send never left the client, no message. If send started and server persisted user+assistant, thread refetch restores messages; linkage present if `attachmentIds` were on the request. If upload finished but send never happened, only staging recovery applies.
5. **Duplicate sends:** keep `submitInFlightRef` + stream busy; add **idempotency key** on `POST /api/nexus/chat` (client-minted `clientMessageId`) so remount retry doesn’t double-insert. Server dedupe window ~2 minutes on `(userId, clientMessageId)`.
6. **Failed upload visibility:** chip `failed` + toast already partial; ensure staging recovery surfaces `uploadErrorMessage` / finalize errors; never show optimistic “ready” without server `uploaded`.

### Instrumentation (required before claiming T4 fixed)

Use existing `attachDebugLog` / `__atlas_chunk_reload__`:

- Log `page_beforeunload` reason class, `picker_pending`, navigation vs soft remount, whether `attachmentId` was in sessionStorage.
- Confirm whether `window.location` href changes or only React remount.

### Files (T4)

| File | Change |
|---|---|
| `artifacts/atlas-frontend/src/lib/composerDraftStore.ts` or new `stagingPersistence.ts` | Persist attachment metadata (not bytes) |
| `artifacts/atlas-frontend/src/hooks/useStagedAttachments.ts` | Hydrate from metadata; retry UX |
| `artifacts/atlas-frontend/src/pages/home.tsx` / workspace composer mount | Call hydrate |
| `artifacts/api-server/src/routes/attachments.ts` | Optional list-unlinked/staging endpoint; get-by-id status |
| `artifacts/api-server/src/routes/nexus.ts` | Optional `clientMessageId` idempotency |
| `artifacts/atlas-frontend/src/hooks/useNexusChatStream.ts` | Send idempotency key; refetch thread after reload if conversationId known |
| E2E | `e2e/attach-pptx-ghost-click.spec.ts` extended; hard-reload staging recovery test |

### Schema (T4)

None strictly required. Optional: index on `(user_id, conversation_id, upload_status)` for staging list. Avoid resurrecting destructive startup `DELETE` of null-parent rows without protecting `pending_upload`/`uploaded` (known hazard from prior investigation).

### Rollout / rollback (T4)

- Independent flag `ATTACHMENT_STAGING_RECOVERY=1`.
- Rollback: stop reading/writing staging metadata; uploads still work on clean path.

---

## Rollout order (mandatory)

```
Phase 0  Instrumentation confirm for T4 trigger (logging only)
Phase 1  T1 Truthfulness/provenance signals + OutputGuard  ← ships first
Phase 2  T2 History provenance blocks (may land with Phase 1)
Phase 3  T3 Persist extracts + relevance reopen
Phase 4  T4 Staging recovery + send idempotency
```

**Do not** ship Phase 3 without Phase 1 — reopen failures would still be narrated as fabrication under the old HARD RULE.

**Do not** call the system repaired after Phase 1 alone — Phase 1 stops false denials; Phase 3 is required for “what did slide 6 say?” when the answer was not already in assistant prose.

### Definition of done

| Test | Phase that makes it pass |
|---|---|
| C: “Can you still access the file…?” → distinguishes no-current vs prior-existed vs cannot-reopen | **1 (+2)** |
| A: invoice total if stated in prior assistant text | 1 (recall) |
| A: invoice total if only in PDF and not in prior prose | **3** |
| B: slide 6 content | **3** |
| Compare earlier sheet + new sheet | **3** |
| Android Documents hard reload mid-pick keeps finalized ID chip / clear failure | **4** |
| No duplicate user messages on retry after reload | **4** |

### Ask Atlas vs Workspace

Same backend grounding/reopen path. Apply composer staging recovery on both `useStagedAttachments` surfaces (`ask-atlas` and `workspace`). Do **not** fold `/api/chat` / `useChatStream` fixes into this work unless a surface still sends there.

---

## Rollback boundaries (summary)

| Phase | Rollback unit | Data risk |
|---|---|---|
| T1 | Feature flag | None |
| T2 | Flag / stop injecting provenance text; nullable columns harmless | None |
| T3 | Flag; stop reading `attachment_extracts` | Stored extracts retained until TTL job |
| T4 | Flag; clear sessionStorage schema version | None |

---

## Explicit non-fixes (this program)

- Prompt-only edit without structured signals / guard evidence changes.
- Auto-inject all historical attachments every turn.
- Re-enable IDB File blob persistence (known WebView OOM).
- Fixing secondary `/api/chat` / `useChatStream` defects as part of “attachment continuity repaired.”
- Exposing storage paths or signed URLs in model context.

---

## Implementation checklist (when coding begins)

1. [ ] `attachmentGrounding.ts` + HARD RULE rewrite + flag  
2. [ ] OutputGuard evidence/claim classes + tests (rewrite prior-attachment cases)  
3. [ ] History provenance join + formatter + leak tests  
4. [ ] `attachment_extracts` migration + upsert from resolve  
5. [ ] Relevance selector + historical resolve merge + caps  
6. [ ] Staging metadata persistence + hydrate + status API  
7. [ ] `clientMessageId` idempotency  
8. [ ] Live matrix: Tests A/B/C on Ask Atlas + Workspace; Android Documents hard-reload case  
9. [ ] Update `docs/architecture/attachment-ownership.md` after behavior lands  

**No code changes in the plan-acceptance step.**
