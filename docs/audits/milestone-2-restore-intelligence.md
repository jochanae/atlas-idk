# Milestone 2 — Restore Intelligence

**Parent:** Milestone track (M1 closed → M2 in progress)  
**Status:** OPEN — **2.1 CLOSED · 2.2 CLOSED · 2.3 PLANNING · 2.4 NOT STARTED**  
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

**Closed:** 2026-07-22 (PR #208)

Ship and prove the Ask Atlas → generate → Open → Workspace path for PPTX and related deliverables.

**Evidence:** `docs/audits/milestone-2-1-artifact-generation.md`

---

### 2.2 — Workspace Intelligence Correctness — ✅ CLOSED

**Closed:** 2026-07-23  
**Board:** [`milestone-2-2-intelligence-correctness.md`](./milestone-2-2-intelligence-correctness.md)

Knowledge classification (K1–K6), surface integrity (S1–S5), handoff intelligence, Round 3 reasoning, and execution harden (#213–#217) accepted.

---

### 2.3 — Lens Differentiation — 🟡 PLANNING ← **NOW**

**Design doc:** [`milestone-2-3-lens-differentiation-design.md`](./milestone-2-3-lens-differentiation-design.md)

Prove Designer, Builder, and Storyteller produce meaningfully different outputs and reasoning for the **same question** on the same project — not three skins on one answer.

**Acceptance intent:** Same question → three different perspectives (experience / execution / meaning).

**Status:** Architecture review + lens constitution + evaluation battery drafted (**read-only**). No implementation until design accepted.

**Depends on:** 2.2 ✅

---

### 2.4 — Natural Conversation — ⬜ NOT STARTED

Conversation should feel like working with a capable collaborator, not a procedural assistant.

**Depends on:** 2.2 ✅ and 2.3 (distinct lenses).

---

## Sequence (current)

```
1   Unbroken Conversation     ✅ CLOSED
        ↓
2.1 Artifact generation       ✅ CLOSED
        ↓
2.2 Intelligence correctness  ✅ CLOSED
        ↓
2.3 Lens differentiation      🟡 PLANNING (design doc)  ← NOW
        ↓
2.4 Natural conversation      ⬜ NOT STARTED
```

Do not implement 2.3 behavior until the design doc is accepted. Do not start 2.4 until 2.3 proves distinct lens reasoning.

---

## Explicit non-goals for M2

- Debating whether Ask Atlas should exist
- Treating “panel has content” as success
- Infrastructure rabbit holes unrelated to understanding

---

## Status log

| Date | Event |
|------|-------|
| 2026-07-22 | M2 opened after M1 closed. 2.1 closed via PR #208. |
| 2026-07-22–23 | 2.2 evaluation, P2/P3, handoff seed, Round 3, execution PRs #213–#217. |
| 2026-07-23 | **2.2 CLOSED.** |
| 2026-07-23 | **2.3 planning** — design doc `milestone-2-3-lens-differentiation-design.md` (no code). |
