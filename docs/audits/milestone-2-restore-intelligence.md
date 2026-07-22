# Milestone 2 — Restore Intelligence

**Parent:** Milestone track (M1 closed → M2 open)  
**Status:** OPEN — 2.1 closed; 2.2 implementation landed, awaiting user regression  
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

### 2.2 — Workspace Intelligence Correctness — 🟡 IMPLEMENTATION LANDED → USER REGRESSION

**Board:** [`milestone-2-2-intelligence-correctness.md`](./milestone-2-2-intelligence-correctness.md)

**Status after Round 2 + P2/P3 implementation (2026-07-22):**

| Check | Result |
|-------|--------|
| Blueprint | ✅ PASS |
| Ledger | ✅ PASS (engineering noise fixed in P2/P3 — confirm in regression) |
| Insights | ✅ PASS (synthesis briefing landed — confirm in regression) |
| Flow (P1) | ✅ PASS — Designer / Builder / Storyteller share project knowledge |
| Architectural reversal | ✅ PASS |
| Knowledge Classification (P2) | ✅ Implemented — awaiting regression |
| Surface Integrity (P3) | ✅ Implemented (Ledger filter, Activity types, desktop Flow tab) — awaiting regression |

**Evaluation complete. Implementation landed.** Remaining:

**One user regression pass** against K1–K6 and S1–S5 closes 2.2.

**Not required to close 2.2:** Ask Atlas existence debates; more Flow verification rounds; infra rabbit holes.

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
        ✅ Evaluation complete (Round 1 + Round 2)
        ⏳ Implementation: Classification + Surface Integrity (+ Flow desktop discoverability)
        → then one user regression pass → CLOSE 2.2
        ↓
2.3 Lens differentiation
        ↓
2.4 Natural conversation
```

Do not start 2.3/2.4 until 2.2 implementation + regression close.

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
