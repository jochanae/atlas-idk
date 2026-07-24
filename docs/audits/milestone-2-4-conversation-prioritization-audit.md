# Conversation Prioritization Audit

**Date:** 2026-07-24  
**Source:** Phase E production validation  
**Class:** Current-intent ranking — spans soft opening bias **and** hard T6 fail  
**Blocks launch claims?** T6 fail must be fixed before claiming pivot trust  
**Related:** [`milestone-2-4-phase-e-production-validation.md`](./milestone-2-4-phase-e-production-validation.md) · [`milestone-2-4-phase-e-t6-pivot-fail.md`](./milestone-2-4-phase-e-t6-pivot-fail.md)

---

## Observations

### Soft — opening bias (pricing resume)

| Fact | Detail |
|------|--------|
| History | Earlier attachment testing (Reveal deck, CoinsBloom document) |
| Later resume | “Help me think through the pricing strategy before we build anything.” |
| Opening | “Both files came through…” before discussing The Obsidian Ledger |
| Accuracy | Attachment reference was correct |
| Problem | It was no longer the highest-priority context |

### Hard — T6 pivot fail (Stripe Connect)

| Fact | Detail |
|------|--------|
| Pivot | “Actually, forget moderation… How should Stripe Connect work with ministries?” |
| Actual | “I don't have access to any attachment…” + “I started to claim…” |
| Problem | Stale attachment diagnostics replaced a complete current text request |

The model / guard path was not “wrong about files” — it **over-weighted** attachment state relative to current intent. Needed: **weighted memory** — active project and current intent outrank stale attachment context and attachment recovery copy.

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
| Context prioritization / current-intent routing | Broken file storage / upload pipeline |
| Weighted memory + quieter attachment guard | Stage-theater failure (T3 still PASS) |
| T6 production defect with clear acceptance criteria | Reason to reopen arrival / stage theater |

**Engineering note:** `attachmentOutputGuard` must quiet-strip unsupported claims and must not replace a whole non-attachment answer with attachment recovery copy. Never expose `I started to claim…`.
