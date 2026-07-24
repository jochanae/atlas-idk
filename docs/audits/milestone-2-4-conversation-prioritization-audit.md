# Conversation Prioritization Audit

**Date:** 2026-07-24  
**Source:** Phase E production validation (pricing prompt)  
**Class:** Response-planning refinement — **not** an attachment pipeline issue  
**Blocks 2.4?** **No**  
**Related:** [`milestone-2-4-phase-e-production-validation.md`](./milestone-2-4-phase-e-production-validation.md)

---

## Observation

During production testing, Joy referenced older attachment context before responding to the user’s current intent.

| Fact | Detail |
|------|--------|
| History | Earlier attachment testing (Reveal deck, CoinsBloom document) |
| Later resume | “Help me think through the pricing strategy before we build anything.” |
| Opening | “Both files came through…” before discussing The Obsidian Ledger |
| Accuracy | Attachment reference was correct |
| Problem | It was no longer the highest-priority context |

The model was not confused. It remembered too much **equally**. Needed: **weighted memory** — active project and current intent outrank stale but accurate details.

---

## Desired ranking (approx.)

When selecting conversational context for the opening of a response:

1. **Current workspace / project** (highest)
2. **Current user intent / question**
3. Recent project decisions
4. Recent conversation context
5. Outstanding unresolved items
6. Attachments **only if directly relevant** to the current request

Attachments should be surfaced proactively only when they materially affect the answer.

---

## Examples

**✅ Good**

User: Help me think through pricing.

Joy: Let’s continue with The Obsidian Ledger’s pricing strategy…

**❌ Less desirable**

> Both files came through…

…when the files are unrelated to the pricing discussion.

---

## Goal

Behave like a human collaborator.

Humans do not begin a new design discussion by mentioning unrelated documents received several messages ago. They answer the current work first, then reference attachments only if relevant.

---

## What this is / is not

| Is | Is not |
|----|--------|
| Context prioritization / response planning | Attachment pipeline bug |
| Weighted memory refinement | Stage-theater failure (T3 still PASS) |
| Fit for a later conversational-experience pass | Reason to reopen 2.4 architecture |

**No architectural changes required** to close Milestone 2.4.
