# Attachment Continuity & Provenance Regression — Investigation Report

**Date:** 2026-07-21  
**Scope:** Read-only. **No code fixes.**  
**Surfaces:** Ask Atlas + Workspace (canonical `POST /api/nexus/chat`)  
**Evidence:** Static end-to-end path trace + unit tests proving OutputGuard prior-turn denial  
**Live browser Tests A/B/C:** Blocked in this environment (no authenticated UI session). Outcomes below are **code-deterministic** predictions that match the newly reported runtime evidence.

---

## Executive verdict

Document ingestion on the canonical main composer path **works** (PDF + PPTX intermittently / when finalize succeeds). Attachment-to-message **linkage metadata persists**. Extracted document content **does not persist** and is **not re-injected** on later turns. Follow-up turns intentionally resolve **only** `body.attachmentIds` for the current request, then inject a **HARD ATTACHMENT GROUNDING** rule that states no attachment exists, plus an **OutputGuard** whose evidence set is current-turn-only. That combination causes Atlas to deny prior attachments and to retract / “fabrication-admit” its own earlier grounded analysis.

Refresh/remount during attach is a **real amplifier** (staged File blobs lost on hard reload; upload races; optimistic chips without IDs), but it is **not required** to produce the continuity failure. The continuity failure is architectural and occurs on a clean two-turn sequence with no remount.

**Hypothesis adjudication**

| Claim | Verdict |
|---|---|
| Bytes/extracted content reached the model on the original request | **Confirmed** when resolve succeeds (matches user evidence: accurate PPTX/PDF reads) |
| Refresh caused persisted history to lose attachment-to-message linkage | **Possible but secondary.** Linkage is written server-side before stream finish; surviving assistant text without model-visible provenance is explained without linkage loss |
| Assistant response survived while grounding evidence did not | **Confirmed** — assistant `content` is stored; extracted text / document blocks are never stored; history serializer is text-only |
| Next turn Atlas saw earlier claims but no historical attachment record and concluded fabrication | **Confirmed** — HARD RULE + OutputGuard current-turn-only evidence |

**First state item lost across a hard refresh during attach:** in-memory staged `File` blobs / `attachmentId` chips (`useStagedAttachments` module map + draft store intentionally do not persist File blobs). Typed composer text may survive via `sessionStorage`.

**First state item lost for model continuity (even without refresh):** current-turn document blocks / extracted text after the send-turn resolve completes — never written to DB.

---

## Architecture (what actually happens)

```
Turn N (with attachmentIds):
  upload finalize → message_attachments row (bytes in object storage)
  POST /api/nexus/chat { text, attachmentIds }
    → resolveAttachmentIdsForModel (download + extract OOXML / inject PDF)
    → inject into model contentParts  ← THIS TURN ONLY, IN MEMORY
    → insert nexus_messages.content = user text only
    → linkAttachmentsToMessage (FK / filename / mime / kind — NO extracted text)

Turn N+1 (no new files):
  → body.attachmentIds empty → resolve skipped
  → history = last 40 { role, content } strings; empty user → "[attachment]"
  → systemPrompt HARD RULE: "NO ATTACHMENT WAS PROVIDED WITH THIS MESSAGE"
  → OutputGuard evidence = [] → may rewrite “I can still see / based on the file…”
  → correction prose quotes the claim and says nothing was attached/readable
```

---

## Answers to the required investigation questions

### 1. How the attachment is associated with the user message when submitted

| Layer | File | Behavior |
|---|---|---|
| Stage/upload | `artifacts/atlas-frontend/src/hooks/useStagedAttachments.ts` | `addFiles` → upload queue |
| Upload | `artifacts/atlas-frontend/src/lib/attachments/uploadService.ts` | `request-upload` → PUT → `finalize` |
| Submit gate | `artifacts/atlas-frontend/src/hooks/useAtlasConversation.ts` ~208–293 | Only `status === "ready" && attachmentId` IDs are sent |
| Transport | `artifacts/atlas-frontend/src/hooks/useNexusChatStream.ts` ~381–578 | `POST /api/nexus/chat` with `{ text, attachmentIds }` |
| Link | `artifacts/api-server/src/routes/nexus.ts` ~3858–3867 → `attachmentResolve.ts` `linkAttachmentsToMessage` | Patches `nexus_message_id` / `chat_message_id` / `conversation_id` |

Optimistic chips use display `attachments[]`; **canonical transport is `attachmentIds` only**.

### 2. What attachment metadata is persisted with that message

Schema: `lib/db/src/schema/message_attachments.ts`.

Persisted: `id`, user/project/conversation, surface, message FKs, `filename`, `mimeType`, `sizeBytes`, `kind`, storage fields, upload/availability/`processingStatus`, library/expiry, `clientAttachmentId`, `messagePosition`, upload error fields.

**Not persisted:** extracted text, slide notes, page content, model-visible summaries, document content blocks.

User message row (`nexus_messages.content`) stores typed text only (often `""` for attachment-only sends).

### 3. Whether extracted PDF / DOCX / XLSX / PPTX content is persisted after the initial model request

**No.** Extraction is send-turn only in `resolveAttachmentIdsForModel` (`attachmentResolve.ts`):

- DOCX / PPTX / XLSX / CSV → `extractAttachment` → in-memory `textContent` (+ optional PPTX slide PNGs)
- PDF → native document / inlineData injection (not text-extracted into a column)
- No `extracted_text` column exists

Classification now marks PPTX/DOCX/XLSX/CSV as `understood` (`attachmentClassify.ts` ~109–114) because resolve extracts them — older “storage_only” docs are stale for these types.

### 4. What data is reconstructed when the next conversation turn is sent

`nexus.ts` ~2649–2867:

1. Load DB thread (`nexus_messages` or in-project `chat_messages`)
2. Map to `{ role, content }` only (last 40)
3. Empty user content → `"[attachment]"` placeholder
4. Resolve **only** current `body.attachmentIds`
5. Build system prompt + HARD ATTACHMENT GROUNDING from **this turn’s** resolve counts
6. Model messages = `[...conversationHistory, current user content]`

Client also sends text-only history (`useNexusChatStream.ts:448`), used only as a DB-empty fallback.

### 5. Whether prior messages retain attachment IDs / filenames / MIME / classifications / extracted text / summaries (for the model)

| Field | DB / link | Thread UI (`GET /api/nexus/thread`) | Next-turn **model** context |
|---|---|---|---|
| Attachment IDs | yes | yes (`id`) | **no** |
| Filename / MIME | yes | yes | **no** (unless prose) |
| Classification | yes | partial | **no** |
| Extracted text | **never** | no | **no** after turn N |
| Model-visible summary | no | no | assistant prose only if kept in `content` |

UI can still show chips after reopen (`home.tsx` now accepts `contentUrl` as well as `base64`). Chips ≠ model visibility.

### 6–7. Does `/api/nexus/chat` resolve only current `attachmentIds`? Are historical IDs excluded?

**Yes / yes.** Resolve runs only when `attachmentIds.length > 0` (`nexus.ts` ~2504–2557). Comments at ~6407–6430 state historical files must **not** be treated as attached this turn — intentional exclusion.

### 8. Does the conversation history serializer strip attachment metadata / document content?

**Yes.** History is `{ role, content }` strings only. No attachment arrays, IDs, MIME, or document blocks. Attachment-only users become `"[attachment]"`.

### 9–10. Output guards / system prompts when current message has no attachment; do they ignore earlier turns?

**Yes.**

HARD RULE (`nexus.ts` ~6415–6432) when `resolvedThisTurn === 0 && requestedThisTurn === 0`:

> HARD RULE — NO ATTACHMENT WAS PROVIDED WITH THIS MESSAGE.  
> Do NOT infer attachment presence from project context or conversation history.  
> If the user asks "can you see this?" — respond EXACTLY: "I don't see an attachment on this message — can you drop it in?"

OutputGuard (`attachmentOutputGuard.ts`):

- Evidence = this turn only (`ResolvedAttachmentInfo[]` from current resolve + skipped + vault/url)
- Post-stream `checkAttachmentClaims` + streaming `StreamingClaimGate`
- Correction (~421–428): *“I don't have access to any attachment in this message…”* and may quote the model’s claim as unsupported
- Unit test explicitly encodes the invariant: **“blocks claims about content from a prior attachment”** (`attachmentOutputGuard.test.ts` ~187–198)

### 11. Why Atlas is prompted/permitted to declare its earlier grounded response fabricated

Sequence:

1. Turn 1: file resolved → grounded assistant prose persisted.
2. Turn 2: no `attachmentIds` → HARD RULE attachmentCount 0; history still contains the grounded answer.
3. User asks “can you still see the PowerPoint / what did slide 6 say?”
4. Model either follows HARD RULE (“I don't see an attachment…”) or tries continuity (“based on the deck…”).
5. If it claims current access/perception, OutputGuard has **zero** `contentSuppliedToModel` → replaces output with a correction that quotes the claim and says nothing was attached/readable — **reads as a fabrication admission**.
6. When shown its earlier accurate analysis, the HARD RULE’s “HISTORICAL EVIDENCE, not files attached to this message” framing pushes the model to treat that prose as unverified rather than as grounded prior work.

### 12. Ask Atlas vs Workspace on follow-up turns

Same continuity gap. Both use `useAtlasConversation` → `useNexusChatStream` → `/api/nexus/chat`. Surface differs for build tooling (`surfaceContext`), not for attachment resolve / history / HARD RULE / OutputGuard.

`/api/chat` + `useChatStream` remain transitional/parallel and are **out of scope** for fixes in this investigation (per instructions).

---

## Refresh / remount investigation

### What can look like a “refresh”

| Trigger | Full navigation? | `window.location` change? | React remount only? | Auth revalidate? |
|---|---|---|---|---|
| Soft remount (ErrorBoundary / surface flip) | no | no | **yes** | no (unless query remount) |
| Android Documents / PPTX picker WebView kill | **yes** (hard reload) | may reset page-load timestamp; same route often | full tree | `/auth/me` on remount if query allows |
| Chunk-load error path | previously hard reload; now toast + lazy recovery (`__root.tsx`, `App.tsx`) | avoided when possible | possible | — |
| Confirmed 401 → `/auth/me` 401 | redirect to login | **yes** | — | yes (`install-api-fetch.ts`) |
| File-picker focus → projects refetch | historically loading flash | no | re-render | mitigated: `refetchOnWindowFocus: false` on auth + projects |

Code acknowledges hard reload as expected on Android Documents/PPTX:

- `composerDraftStore.ts` — typed input survives; **File blobs intentionally not persisted** (IDB disabled after WebView OOM)
- `home.tsx` ~1868–1901 — hydrate draft after hard reload; re-attach required for files
- `useStagedAttachments.ts` ~128–131 — soft-remount map survives ErrorBoundary; **full reload clears it**
- `ComposerActions.tsx` — long ghost-click shield for PPTX/Documents; `atlas-picker-return` resets chunk-reload suppression window

### Capture checklist answers (code-level)

1. **Full browser navigation** — only on hard reload / login redirect / explicit nav; soft remounts are React-only.
2. **`window.location` / document ID / page-load timestamp** — change on hard reload; not on soft remount.
3. **React tree / conversation remount** — yes on ErrorBoundary reset / surface flip / hard reload.
4. **Auth revalidated** — remount can refetch `/auth/me` depending on query options; focus refetch is disabled.
5. **401/403/404/409/500 before refresh** — attachment endpoints are **silent** for 401 (`install-api-fetch.ts` SILENT_401_PATTERNS includes `/api/attachments`) to avoid login wipe mid-compose; finalize can 404/409; resolve skips `not_uploaded` / `processing_not_ready`.
6. **Redirect to login / workspace** — only on confirmed session 401 (non-silent routes) or explicit flows.
7. **Composer attachment state in memory only** — **yes** for File blobs; soft map survives soft remount; hard reload loses staged IDs unless re-uploaded.
8. **Staged attachment ID survives refresh** — soft remount: yes (module map). Hard reload: **no**.
9. **User message persisted before/after finalize** — finalize must complete first for `ready` + `attachmentId`; message insert happens on send **after** client already has finalized IDs; then `linkAttachmentsToMessage`.
10. **Attachment linked to persisted user message** — yes when `attachmentIds` present on send (`nexus.ts` ~3858–3867).
11. **Assistant run continues server-side after browser refresh** — SSE client disconnect does not automatically cancel; response may still persist server-side; client may miss live stream and later refetch thread.
12. **Response restored how** — conversation/thread refetch / message list hydrate (not a dedicated SSE recovery path for Ask Atlas in the traced code).
13. **Restored user message lacks attachment metadata** — thread hydrates chips when `nexus_message_id` linked and `upload_status=uploaded`. If send raced before finalize / IDs missing / linkage never patched, chips missing while assistant text may still exist from a partial path. **Model history still lacks attachments even when chips hydrate.**
14. **Duplicate submissions** — submit guards exist (`submitInFlightRef`, stream busy); remount mid-flight can still produce duplicate UX attempts; handoff races documented historically.
15. **Optimistic chip without usable attachment** — yes possible: display metadata from staged files; send requires ready IDs, but UI can show converting/failed chips; blob preview can be revoked before durable `contentUrl` reconciliation (prior F5).

### First state item lost on hard refresh during attach

**Staged File blobs + in-flight upload controllers** (module memory cleared). Typed input may remain. Any `attachmentId` that finished finalize still exists **server-side** as an unlinked/pending row until a later send links it — but the client no longer has the ID in composer state after hard reload.

---

## Intermittent invoice (first send fail / second send success)

Most likely causes (ordered):

1. **Finalize / readiness race** — resolve requires `uploadStatus=uploaded` and `processingStatus=understood`. Send while pending → skip `processing_not_ready` / `not_uploaded` (`attachmentResolve.ts` ~161–207). Client gate requires `ready`, but remount/picker races can produce confusing UI (chip visible, send with empty/partial IDs, or second attempt after finalize).
2. **Hard refresh / soft remount mid-upload** — PUT aborted or finalize never completed; second attach succeeds.
3. **Download / storage miss** → `download_failed` / `not_found_or_forbidden` (logged; weak client signal).
4. **PDF size / model path flakiness** — PDF injected as native document/inlineData; oversize skip; Gemini→Claude fallthrough can look intermittent.
5. **Duplicate send / stale composer** — less primary than readiness, but possible around remount.

Not primarily “PDF ingestion broken” — user evidence of accurate second-send extraction plus PPTX success disproves that.

---

## Predicted outcomes for required Tests A / B / C

*(Live authenticated UI not available in this agent environment. Predictions are forced by the code paths above.)*

### Test A — PDF continuity

| Turn | Expected under current architecture |
|---|---|
| Attach PDF + summarize | If finalize+resolve succeed: accurate summary; user msg linked; extracted/PDF bytes **not** stored as text |
| Follow-up, no attach: “What was the total…?” | Model may answer from **assistant prose in history** if the total was stated; else deny. HARD RULE says no attachment this message. Provenance of “the invoice above” as a **file** is absent. OutputGuard may rewrite perception/retrieval claims |

### Test B — PowerPoint continuity

| Turn | Expected |
|---|---|
| Attach PPTX + review | Extractor returns slide text + speaker notes (`services/attachmentExtract/pptx.ts`); accurate review possible |
| Follow-up: “What did slide 6 say?” | Extracted text **not** available. Unless slide 6 content was copied into assistant history, model cannot re-read. HARD RULE + OutputGuard apply |

### Test C — explicit reference

| Question | Technically correct expected behavior **today** |
|---|---|
| “Can you still access the file I attached in the previous message?” | Under current architecture: Atlas **cannot re-access file bytes** on this turn. Correct product language should distinguish: **“No new attachment on this turn, but prior turn had file X and my earlier analysis said …”** |
| What Atlas actually does | HARD RULE forces: **“I don't see an attachment on this message — can you drop it in?”** — conflating “no new attachment” with “no prior attachment in this conversation.” |

---

## Per-turn evidence map (what to capture in a live run)

| Artifact | Turn N (attach) | Turn N+1 (no attach) |
|---|---|---|
| Stored user message | `nexus_messages` text (+ id) | new text-only row |
| Attachment linkage | `message_attachments.nexus_message_id` set | unchanged prior rows; none for new msg |
| Attachment IDs in request | present | absent |
| Conversation-history payload | prior text turns | includes assistant analysis text; user prior → `"[attachment]"` if empty |
| Current-turn attachment payload | resolved bytes/text | empty |
| Backend-resolved attachments | PDF/PPTX content | `[]` |
| Extracted document text | in-memory only | gone |
| System/guard instructions | HARD RULE with readable list | HARD RULE attachmentCount 0 |
| Final model content blocks | history strings + current user + docs | history strings + current user only |
| Persisted assistant response | grounded analysis | denial / OutputGuard correction |
| OutputGuard | evidence has content | evidence empty → may fire |

---

## Required final conclusions

1. **Document ingestion works?** **Yes** (when upload finalized + resolve succeeds). PDF and PPTX proven by runtime evidence + classify/extract code path.
2. **Attachment-to-message persistence works?** **Yes** for metadata/FK/storage linkage when `attachmentIds` are present on send.
3. **Historical attachment provenance survives later turns?** **Partially for UI** (thread chips if linked). **No for the model** (IDs/filenames/MIME not in history payload).
4. **Extracted document content survives later turns?** **No.**
5. **Current-turn-only guard causes denial of prior attachments?** **Yes** — HARD RULE + OutputGuard by design.
6. **Exact files responsible:**
   - `artifacts/api-server/src/routes/nexus.ts` — current-turn-only resolve; text-only history; HARD ATTACHMENT GROUNDING; OutputGuard wiring
   - `artifacts/api-server/src/lib/attachmentResolve.ts` — resolve + link (no extract persist)
   - `artifacts/api-server/src/lib/attachmentOutputGuard.ts` — current-turn evidence; prior-turn claim blocking
   - `artifacts/api-server/src/services/attachmentExtract/*` — send-turn extract only
   - `lib/db/src/schema/message_attachments.ts` — no extracted-text column
   - `artifacts/atlas-frontend/src/hooks/useNexusChatStream.ts` — sends only current `attachmentIds`; text-only client history
   - `artifacts/atlas-frontend/src/hooks/useAtlasConversation.ts` — submit ID merge
   - Remount amplifiers: `useStagedAttachments.ts`, `composerDraftStore.ts`, `ComposerActions.tsx`, `install-api-fetch.ts`, `hooks/useAuth.ts`, `routes/__root.tsx`
7. **Smallest possible correction** (do **not** apply yet):

   **Minimal prompt/guard fix (smallest behavioral fix):** In `nexus.ts` HARD ATTACHMENT GROUNDING and `attachmentOutputGuard.ts`, distinguish:
   - “No attachment on **this** message” vs
   - “Prior messages in this conversation **did** include attachments (list filename + message id from DB join) — you may cite **prior assistant analysis** and say you cannot re-open the file unless re-attached.”
   
   Stop forcing Exact “I don't see an attachment…” for questions about prior files. Stop OutputGuard from treating references to **already-persisted assistant analysis of a prior attachment** as unsupported perception, or pass prior-turn attachment **metadata** (not necessarily bytes) into guard evidence as `historical_metadata_only`.

   **Slightly larger but still small continuity fix:** When building `conversationHistory`, for prior user messages with linked `message_attachments`, append a short provenance line (filename, mime, attachment id, “content not re-injected”) instead of bare `"[attachment]"`, and optionally re-resolve / re-extract prior IDs within a cap. Re-injection is the only way Test B (“what did slide 6 say?”) works without relying on assistant prose.

Recommended order: (1) HARD RULE + OutputGuard wording/evidence distinction — stops false fabrication admissions; (2) history provenance metadata; (3) optional re-extract/re-inject for recent attachments.

---

## Unit-test evidence captured this session

```
pnpm exec vitest run src/lib/__tests__/attachmentOutputGuard.test.ts src/__tests__/attachmentExtract.test.ts
→ attachmentOutputGuard + attachmentExtract suites passed (part of 224 passed unit tests)
→ Explicit test: "blocks claims about content from a prior attachment"
→ PPTX extract tests cover slide text / notes path (rasterization best-effort stubbed)
```

---

## Out of scope (per instructions)

- No code changes / no production fix in this PR.
- Do not fix secondary `/api/chat` or `useChatStream` defects during this investigation.
