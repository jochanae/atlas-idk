# Milestone 2 — Restore Intelligence

**Parent:** Milestone track (M1 closed → M2 closed for intelligence sub-track)  
**Status:** **M2 SUB-TRACK CLOSED** — **2.1 CLOSED · 2.2 CLOSED · 2.3 CLOSED · 2.4 CLOSED**  
**Last updated:** 2026-07-24

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

### 2.3 — Lens Differentiation — ✅ CLOSED

**Closed:** 2026-07-23  
**Design doc:** [`milestone-2-3-lens-differentiation-design.md`](./milestone-2-3-lens-differentiation-design.md)  
**Acceptance:** [`milestone-2-3-acceptance-report.md`](./milestone-2-3-acceptance-report.md) · **Phase D:** [`milestone-2-3-phase-d-production.md`](./milestone-2-3-phase-d-production.md)

Prove Designer, Builder, and Storyteller produce meaningfully different outputs and reasoning for the **same question** on the same project — not three skins on one answer.

**Acceptance intent:** Same question → three different perspectives (experience / execution / meaning).

**Status:** Phases 0–E **CLOSED**. Map + chat batteries 6/6. Live authenticated prod T1–T6 deferred until Constitution redeploy (ops).

**Depends on:** 2.2 ✅

---

### 2.4 — Natural Conversation — ✅ CLOSED

**Closed:** 2026-07-24  
**Design doc:** [`milestone-2-4-natural-conversation-design.md`](./milestone-2-4-natural-conversation-design.md)  
**Acceptance:** [`milestone-2-4-acceptance-report.md`](./milestone-2-4-acceptance-report.md)

Conversation should feel like working with a capable collaborator already inside the work — not a workflow engine, wizard, checklist, or phase coach.

**Governing question:** Does this feel like continuing work with someone who already understands the project — or like operating a procedure?

**Governing rule (P9):** One arrival experience — continue the work — across refresh, handoff, Workspace open, return, and resume.

**Status:** Phases 0–E **CLOSED** (`#224`–`#227` + D/E closeout). Production validation: **T1–T5 PASS** (preserve); **T6 FAIL** ([evidence](./milestone-2-4-phase-e-t6-pivot-fail.md)). Remaining ops: T6 retest + Flow-surface arrival + T7–T11.

**Depends on:** 2.2 ✅ and 2.3 ✅ (distinct lenses).

**Production evidence:** [`milestone-2-4-phase-e-production-validation.md`](./milestone-2-4-phase-e-production-validation.md)

---

## Sequence (current)

```
1   Unbroken Conversation     ✅ CLOSED
        ↓
2.1 Artifact generation       ✅ CLOSED
        ↓
2.2 Intelligence correctness  ✅ CLOSED
        ↓
2.3 Lens differentiation      ✅ CLOSED
        ↓
2.4 Natural conversation      ✅ CLOSED
```

**M2 intelligence sub-track CLOSED** (2.1–2.4). Ops: finish 2.4 live battery (T1–T5 PASS; **T6 FAIL open**; Flow + T7–T11) before launch / pivot-trust claims.
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
| 2026-07-23 | **2.3 planning** — design doc drafted. |
| 2026-07-23 | **2.3 approvals** — Constitution, eval battery, scope (Map + live chat plumbing → Map Constitution → live chat). |
| 2026-07-23 | **2.3 naming signed off** — Designer/Builder/Storyteller; Flow → Storyteller; Scenario = speculate modifier; Flow = Map surface; AtlasLens rename; one-sentence contracts. Phase A unblocked. |
| 2026-07-23 | **2.3 Phase A PASS** — one perspective pipeline (UI → Nexus meta → Map sync). No behavioral differentiation. |
| 2026-07-23 | **2.3 Phase B landing** — Constitution packs + evidence filters + expand-node output contracts; Map-bound Flow chat constitution. Battery eval still open. |
| 2026-07-23 | **2.3 Phase B CLOSED** — Map battery 6/6 Pass (T1 mandatory Pass). Blind test: labels removable. |
| 2026-07-23 | **2.3 Phase C landing** — Nexus Workspace injects live-chat Constitution + lens-weighted DNA. |
| 2026-07-23 | **2.3 Phase C CLOSED** — live-chat battery 6/6 Pass, T1 Pass, continuity Pass; CONTINUITY clause added. |
| 2026-07-23 | **2.3 Phase D CLOSED** — production probe + disagreement + cross-project scenarios ([phase-d](./milestone-2-3-phase-d-production.md)); live authenticated T1–T6 deferred (deploy lag). |
| 2026-07-23 | **2.3 Phase E CLOSED** — [acceptance report](./milestone-2-3-acceptance-report.md). **Milestone 2.3 CLOSED.** Milestone **2.4** ready for planning (redeploy caveat). |
| 2026-07-23 | **2.4 design draft** — [natural conversation design](./milestone-2-4-natural-conversation-design.md): principles, audit, inventory, battery, phased roadmap. Awaiting approval; no implementation yet. |
| 2026-07-23 | **2.4 design APPROVED** — P1–P10 (P9 governing, P10 Invisible Mechanics); T1–T11; roadmap A→E. Phase A unblocked. |
| 2026-07-24 | **2.4 Phase A CLOSED** (`#225`). Phase B thesis locked (work language / delete process language + Blind Read Test); Phase B started. |
| 2026-07-24 | **2.4 Phase B CLOSED** (`#226`). Phase C Honest Execution started. |
| 2026-07-24 | **2.4 Phase C CLOSED** (`#227`). Phase D subtractive prompt posture + Phase E closeout. **Milestone 2.4 CLOSED.** |
