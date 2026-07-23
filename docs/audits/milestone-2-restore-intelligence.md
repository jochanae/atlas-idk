# Milestone 2 — Restore Intelligence

**Parent:** Milestone track (M1 closed → M2 open)  
**Status:** OPEN — 2.1 closed; **2.2 NOT CLOSED** (intelligence largely met; formal K/S scorecard + live post-#214 redeploy/smoke remain)  
**Branch / PR:** implementation work continues under `cursor/milestone-2-2-intelligence-correctness-df4c` / PR #209  
**Last updated:** 2026-07-22

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

### 2.2 — Workspace Intelligence Correctness — 🟡 OPEN (closeout gate)

**Board:** [`milestone-2-2-intelligence-correctness.md`](./milestone-2-2-intelligence-correctness.md)

**Status after Round 2 + P2/P3 + Round 3 + execution PRs (2026-07-23):**

| Check | Result |
|-------|--------|
| Blueprint | ✅ PASS |
| Ledger | ✅ Implemented Decisions-only — **formal S2 score pending** |
| Insights | ✅ Synthesis briefing landed — **formal S3 / K3 score pending** |
| Flow (P1) | ✅ PASS — Designer / Builder / Storyteller share project knowledge |
| Architectural reversal | ✅ PASS |
| Knowledge Classification (P2) | ✅ Implemented — **formal K1–K6 score pending** |
| Surface Integrity (P3) | ✅ Implemented — **formal S1–S5 score pending** |
| R1 handoff intelligence | ✅ User confirmed DNA / Objects / Decisions / lenses populated (#210) |
| Round 3 reasoning | ✅ STRONG PASS |
| Round 3 execution fixes | 🟡 Merged (#213–#217) — **live host still pre-#214** |

**Do not tag CLOSED yet.** Remaining close gate (see board § Closeout gate):

1. **G1** — Formal **K1–K6 + S1–S5** scorecard Pass  
2. **G2** — Redeploy so `apiProcessStartedAt` is after main `#217` (`51acaf50`+)  
3. **G3** — Post-redeploy smoke: brief file generation, no false ready claim, export UTF-8, PDF readable, Global Files detail

**Not required to close 2.2:** Ask Atlas existence debates; more Flow verification rounds; infra rabbit holes; resume-toast / resend-idempotency / soft handoff UX (deferred to 2.3 / UX).

---

### 2.3 — Lens Differentiation — ⬜ NOT STARTED

Prove Designer, Builder, and Storyteller produce meaningfully different outputs and reasoning for the same project — not three skins on one answer.

**Depends on:** 2.2 classification + surface integrity so lenses reason over the right knowledge types.

---

### 2.4 — Natural Conversation — ⬜ NOT STARTED

Conversation should feel like working with a capable collaborator, not a procedural assistant. Less “here’s what I did,” more insight, challenge, and synthesis.

**Depends on:** 2.2 (correct knowledge) and 2.3 (distinct lenses). Insights quality from 2.2 feeds this directly.

---

## Sequence (current)

```
2.1 Artifact generation     ✅ CLOSED
        ↓
2.2 Intelligence correctness
        ✅ Evaluation complete (Round 1 + Round 2 + Round 3 reasoning)
        ✅ P2/P3 + handoff seed + Round 3 execution fixes merged
        ⏳ CLOSE GATE: K1–K6/S1–S5 scorecard + redeploy past #214+ + G3 smoke
        ↓
2.3 Lens differentiation   ← same question → three different perspectives
        ↓
2.4 Natural conversation
```

Do not start 2.3/2.4 until 2.2 close gate (G1–G3) clears.

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
| 2026-07-23 | **Closeout assessment:** 2.2 **NOT CLOSED**. Open: formal K1–K6/S1–S5 scorecard; live redeploy past #214; G3 smoke. Deferred UX → 2.3 / later. |
