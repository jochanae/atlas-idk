# Milestone 2 — Restore Intelligence

**Parent:** Milestone track (M1 closed → M2 in progress)  
**Status:** OPEN — **2.1 CLOSED · 2.2 CLOSED · 2.3 NOT STARTED · 2.4 NOT STARTED**  
**Last updated:** 2026-07-23

---

## What this milestone is about

M1 restored **conversation continuity** — Atlas remembers what was said across sessions.

M2 restores **intelligence** — Atlas uses that memory to understand work, generate artifacts, and reason across surfaces.

This is not a UI milestone. Panels existing and looking populated is not success. Success is:

1. Artifacts that reflect the actual conversation
2. Workspace knowledge that is correctly classified and surface-accurate
3. Lens behavior that is distinct and useful
4. Conversation that feels natural, not procedural

---

## The governing question

> Did Atlas actually understand the conversation?

Not: Did the UI survive?  
Not: Did something render?

---

## Sub-milestones

### 2.1 — Artifact Generation & Delivery — ✅ CLOSED

**Closed:** 2026-07-22 (PR #208 → `main` `d0b923d1`)

Ship and prove the Ask Atlas → generate → Open → Workspace path for PPTX and related deliverables. Conversation-first; no forced project creation for deliverable-only turns.

**What closed it:** generate_deliverable on home + Atlas Files bucket; Open deep-link; PROJECT_READY suppression for deliverable-only; prose honesty; Open forces All Outputs.

**Evidence:** `docs/audits/milestone-2-1-artifact-generation.md`

---

### 2.2 — Workspace Intelligence Correctness — ✅ CLOSED

**Closed:** 2026-07-23  
**Board:** [`milestone-2-2-intelligence-correctness.md`](./milestone-2-2-intelligence-correctness.md)

| Check | Result |
|-------|--------|
| Blueprint | ✅ PASS |
| Ledger | ✅ PASS (Decisions-only) |
| Insights | ✅ PASS (synthesis) |
| Flow (P1) | ✅ PASS — Designer / Builder / Storyteller share project knowledge |
| Architectural reversal | ✅ PASS |
| Knowledge Classification (P2) | ✅ PASS (K1–K6) |
| Surface Integrity (P3) | ✅ PASS (S1–S5) |
| R1 handoff intelligence | ✅ PASS (#210) |
| Round 3 reasoning | ✅ STRONG PASS |
| Round 3 execution | ✅ PASS (#213–#217; live post-#217) |

**Deferred to 2.3 / UX** (see 2.2 board § Deferred): resume toast, resend idempotency, format-fallback UX, living brief structure, “preserved” copy, soft Continue-in-Workspace, transfer “What’s first?”, **lens differentiation**.

---

### 2.3 — Lens Differentiation — ⬜ NOT STARTED ← **NEXT**

Prove Designer, Builder, and Storyteller produce meaningfully different outputs and reasoning for the **same question** on the same project — not three voices on one answer.

**Acceptance intent (user):** Same question → three different perspectives.

**Depends on:** 2.2 classification + surface integrity (✅ met).

**Carries forward from 2.2:** deeper lens differentiation is the primary work; transfer/resume UX may be scheduled alongside or into 2.4.

---

### 2.4 — Natural Conversation — ⬜ NOT STARTED

Conversation should feel like working with a capable collaborator, not a procedural assistant. Less “here’s what I did,” more insight, challenge, and synthesis.

**Depends on:** 2.2 (correct knowledge) ✅ and 2.3 (distinct lenses).

**Likely absorbs:** living brief structure, softer handoff continuity, truthfulness copy, resume UX.

---

## Sequence (current)

```
1   Unbroken Conversation     ✅ CLOSED
        ↓
2.1 Artifact generation       ✅ CLOSED
        ↓
2.2 Intelligence correctness  ✅ CLOSED  (2026-07-23)
        ↓
2.3 Lens differentiation      ⬜ NOT STARTED  ← NEXT
        ↓
2.4 Natural conversation      ⬜ NOT STARTED
```

Start **2.3** now. Do not start 2.4 until 2.3 proves distinct lens reasoning.

---

## Explicit non-goals for M2

- Debating whether Ask Atlas should exist
- Treating “panel has content” as success
- More evaluation rounds before Classification / Surface Integrity land
- Infrastructure rabbit holes unrelated to understanding

---

## Status log

| Date | Event |
|------|-------|
| 2026-07-22 | M2 opened after M1 closed (`95e6f309`). |
| 2026-07-22 | 2.1 closed via PR #208 (`d0b923d1`). |
| 2026-07-22 | 2.2 Round 1: Blueprint PASS; Ledger/Insights PARTIAL; Flow discoverability gap; Classification FAIL. |
| 2026-07-22 | 2.2 Round 2 user evaluation **complete**: Flow PASS; architectural reversal PASS; Classification FAIL; Surface Integrity PARTIAL. Evaluation stops; implementation begins. |
| 2026-07-22 | P2/P3 landed; #210 handoff seed; #211/#212 deliverable-guard harden. |
| 2026-07-23 | Round 3 Ask Atlas reasoning STRONG PASS; execution MIXED. #213 remount; #214 brief deliverable; #215 honesty/export; #216 PDF theme; #217 Global Files. |
| 2026-07-23 | Live redeployed (`apiProcessStartedAt: 2026-07-23T21:59:52Z`). |
| 2026-07-23 | **2.2 CLOSED** — acceptance gates passed. Next: **2.3 Lens Differentiation**. |
