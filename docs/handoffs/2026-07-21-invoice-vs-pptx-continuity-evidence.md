# Founder Walkthrough — Invoice vs PowerPoint Continuity (Evidence)

**Date:** 2026-07-21  
**Scope:** Read-only. No fix.  
**Question:** Does refresh/remount change attachment-continuity state in a way that explains why the invoice was recalled more naturally than the PowerPoint?

---

## Short answer

**Do not assume the refresh caused the recall difference.**

Two independent findings:

1. **Refresh can weaken continuity on the *origin attach/send* path** (client staging IDs lost; risk of send without `attachmentIds` / no linkage / no `model_injected_at`). That is real for PPTX/Documents hard reloads.
2. **Even after a clean successful origin turn, PDF and PPTX are not equal for *follow-up* continuity.** Invoice totals often survive in assistant prose (recall without reopen). Slide-level PPTX detail usually does not; follow-up needs relevance-gated reopen (re-download + re-extract). Extracted PPTX text is **not persisted**.

The observed pattern (invoice recalled; PPTX needed reattach for confidence) is **most consistent with (2)**. Refresh is a **plausible amplifier of attach friction**, not proven causation of the later recall gap after Atlas had already read the deck successfully.

---

## Side-by-side: what happens on a successful origin turn

| Step | Invoice (PDF) | PowerPoint (PPTX) |
|---|---|---|
| Classify | `kind=pdf`, `understood` | `kind=doc`, `understood` (extractable) |
| Model inject | Native PDF `document` / `inlineData` bytes | Extract text (+ optional slide PNGs) as text blocks |
| `model_injected_at` | Set on successful resolve | Set on successful extract+resolve |
| Link to user message | `linkAttachmentsToMessage` if `attachmentIds` present | Same |
| Extract persisted to DB? | N/A (bytes in object storage) | **No** — in-memory for that request only |
| `extractedContentExists` in provenance | always `false` today | always `false` today |
| Stored in `nexus_messages.content` | User text + later **assistant prose only** | Same — **not** the full extract |

Evidence:

- PDF vs extract branches: `artifacts/api-server/src/lib/attachmentResolve.ts`
- Claude PDF document vs text inject: `artifacts/api-server/src/routes/nexus.ts` (~6833–6861)
- `extractedContentExists: false`: `artifacts/api-server/src/lib/attachmentProvenanceQuery.ts`
- No `attachment_extracts` table in schema (persistence was planned, not shipped)

---

## Side-by-side: follow-up turn (no new attachment)

Shared V2 path (flag on):

1. Load prior rows linked to history message IDs  
2. Replace empty user turns with provenance blocks (`publicRef`, filename, `priorAttachmentWasModelReceived`, …)  
3. Relevance may select historical IDs to **re-resolve**  
4. Grounding discloses current vs prior vs content-available  

| Follow-up need | Invoice total | Slide / notes detail |
|---|---|---|
| Answer from assistant history alone | **Often yes** if `$231.00` was written in the origin reply | **Often no** — deck extract is large; reply is usually a summary |
| Needs reopen | Optional | Usually required for slide-specific claims |
| Relevance triggers | `invoice`, `total on the`, `pdf` | `slide N`, `deck`, `powerpoint`, `pptx`, `presentation` |
| Reopen work | Re-download PDF bytes → native document again | Re-download → **re-extract** every time (failure can mark row `failed`) |

Relevance: `artifacts/api-server/src/lib/attachmentRelevance.ts`

---

## What refresh/remount changes (and what it does not)

### Known PPTX/Documents behavior

Hard reload during native Documents/Office pick is acknowledged in:

- `composerDraftStore.ts` — typed text survives; **File blobs intentionally not persisted**
- `useStagedAttachments.ts` — soft remount map survives ErrorBoundary; **full reload clears it**
- `ghostClickShield.ts` / `ComposerActions.tsx` — longer shield for PPTX

### State lost vs survives

| State | Soft remount | Hard reload (Documents kill) |
|---|---|---|
| Staged File blobs | survive (module memory) | **lost** |
| Client `attachmentId` chips | survive | **lost** (module wiped) |
| Typed composer text | survive | survive (`sessionStorage`) |
| Server finalize row | unaffected | unaffected (may be unlinked) |
| `stagingPersistence` metadata | written after finalize | **written but never rehydrated into composer** (load only used in tests) |
| Linked message + `model_injected_at` after a **successful** send | unaffected | unaffected |
| Assistant prose after successful stream | unaffected | restored via thread refetch |

Critical T4 gap: `upsertStagingAttachmentMeta` runs on upload success (`useStagedAttachments.ts`), but **`loadStagingAttachmentMeta` has no production call site** — so hard reload does **not** restore ready chips from saved IDs today.

### Can refresh break continuity on a bad attach attempt?

**Yes.** If remount clears staged IDs before send:

- `attachmentIds` empty → no resolve → no `model_injected_at`
- no `linkAttachmentsToMessage`
- assistant might still answer from a later successful attempt, or from partial UX

That weakens **later** `priorAttachmentWasModelReceived` / provenance for that attempt.

### After Atlas already read the deck successfully?

If that successful turn included `attachmentIds`, resolve, link, and `model_injected_at`, **a later refresh does not erase those server rows**. Follow-up continuity then depends on history prose + relevance reopen — same as invoice — not on the earlier remount.

So: refresh explains **attach difficulty / possible incomplete origin attempts**; it does **not**, by itself, explain “successful PPTX read then weak later recall” better than the PDF/PPTX asymmetry above.

---

## Ranked explanations for the walkthrough

1. **Assistant-prose recall vs reopen need (strongest, refresh-independent)**  
   Invoice total lived in the prior Atlas reply → natural recall. Slide-level PPTX content usually did not → needs reopen or reattach.

2. **PDF vs PPTX reopen asymmetry (strong, refresh-independent)**  
   Same V2 reopen pipeline; PPTX must re-extract (not persisted); more failure modes; content less fully mirrored in history.

3. **Refresh as origin-turn amplifier (plausible, not proven for this session)**  
   PPTX remounts raise odds of incomplete attach attempts. If the *successful* read still linked + injected, this does not uniquely explain later recall weakness. Without DB/logs from the session, causation is unproven.

4. **Relevance / phrasing miss (possible)**  
   Follow-ups without slide/deck/powerpoint/prior-file cues select nothing to reopen.

5. **Incomplete staging recovery (real defect, secondary here)**  
   Explains why remount forces reattach UX; does not flip continuity bits after a clean linked inject.

---

## Direct answers

**Does refresh change any continuity state vs the invoice flow?**  
It can change **client staging / send readiness** during attach (PPTX more exposed). It does **not** change a different “continuity bit” for PPTX after a clean server-side linked inject. Invoice vs PPTX **follow-up** strength already differs without any refresh.

**Is there evidence refresh caused the recall difference?**  
**No causal proof from this codebase alone.** Correlation (PPTX refreshed; invoice did not) is expected from Documents/PPTX picker behavior. The recall difference is explained without that correlation.

**Useful null result:** After a successful grounded PPTX analysis that was linked and model-injected, later weakness is expected to look like “cannot reopen / need reattach for slide detail,” not fabrication — matching the improved T1 behavior you saw.

---

## What would prove refresh causation (if you want to check next)

On a live session with `atlas_adbg` / server logs, compare successful origin turns:

| Field | Invoice | PPTX (after eventual success) |
|---|---|---|
| Request `attachmentIds` present | ? | ? |
| `message_attachments.nexus_message_id` set | ? | ? |
| `model_injected_at` set | ? | ? |
| Follow-up: relevance selected ID? | ? | ? |
| Follow-up: historical reopen succeeded? | ? | ? |
| Was `$231` / slide text present in prior assistant `content`? | likely yes / likely partial |

If PPTX success row has link + `model_injected_at` and reopen was not selected or re-extract failed, refresh is **not** the follow-up cause. If the “successful read” turn lacks linkage/`model_injected_at`, refresh-induced incomplete send **is** implicated.

**No code changes in this investigation.**
