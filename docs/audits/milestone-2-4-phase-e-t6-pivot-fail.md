# Production Validation — T6 Failed

**Date:** 2026-07-24  
**Workspace:** SanctumIQ → Reveal (rename accepted mid-thread)  
**Result:** T6 — Mid-conversation pivot ❌ **FAIL**  
**Parent evidence:** [`milestone-2-4-phase-e-production-validation.md`](./milestone-2-4-phase-e-production-validation.md)  
**Design-battery map:** Production T6 ≈ design **T11** (interrupt/pivot); related to T7 mind-change

---

## Test

Conversation:

1. User introduced community moderation.
2. Joy correctly asked whether Reveal was a rename or a concept change. *(good — preserve)*
3. User interrupted with a clear pivot:

> Actually, forget moderation for a second. I just thought of something. How should Stripe Connect work with ministries?

---

## Actual result

Joy did **not** answer the Stripe Connect question.

It responded with:

> I don't have access to any attachment in this message…

It also exposed an internal correction:

> I started to claim…

---

## Expected result

Joy should immediately follow the new direction and discuss Stripe Connect for ministries.

Example:

> For ministries, Stripe Connect should let each organization connect its own Stripe account so donations and subscription revenue go directly to that ministry…

No attachment was requested or implied.

---

## Classification

| | |
|--|--|
| Scenario | Mid-conversation pivot |
| Verdict | ❌ **FAIL** |
| Knowledge / Stripe issue? | **No** |
| Attachment pipeline broken? | **No** — no attachment on this message |
| Correct frame | **Current-intent routing / stale attachment-context override** |

The newest user message clearly contains a complete text request.  
No attachment dependency exists.  
Older attachment state must not intercept or replace the answer.  
Current text intent must outrank stale attachment diagnostics.

### Additional issue (P10)

Exposing `I started to claim…` violates **Invisible Mechanics**. Never show internal correction / hidden reasoning language in the user-facing response.

---

## Code owner (for fix)

| Path | Role |
|------|------|
| `artifacts/api-server/src/lib/attachmentOutputGuard.ts` | Post-stream + streaming claim gate; `buildCorrection` emitted both failure strings |
| `artifacts/api-server/src/routes/nexus.ts` | Applies guard replacement + `correction` SSE |

Likely failure mode: unsupported (or false-positive) attachment claim scanning replaced the **entire** turn with attachment recovery copy, swallowing the Stripe answer. Streaming gate previously also stopped further tokens after a mid-stream correction.

---

## Acceptance criteria

After a conversational pivot:

1. Joy answers the newest request immediately.
2. It does not insist on finishing the previous topic.
3. It does not surface stale attachment state unless the new request depends on an attachment.
4. It does not expose internal correction or hidden reasoning language.

---

## Preserve from the same thread

The rename exchange was good: Joy noticed “Reveal” did not match workspace identity, accepted the correction, and carried the rename forward. Do not regress that.
