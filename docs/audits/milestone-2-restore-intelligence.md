# Milestone 2 — Restore Intelligence

**Status:** **OPEN** — commissioned 2026-07-22 after Milestone 1 close  
**Prerequisite:** [Milestone 1 — Restore the Conversation](./milestone-1-unbroken-conversation.md) **CLOSED**  
**Principle:** First determine why a capability Atlas was already designed to support failed to execute. Do **not** start by debating whether Ask Atlas should exist.

---

## Sequence

| # | Track | Mode | Status |
|---|-------|------|--------|
| **2.1** | Artifact Generation and Delivery | Read-only audit → then fix proven path | **Audit accepted**; `56eae70c` partial remediation on main; **fix wave started** (bucket persistence + Open deep-link) — [`milestone-2-1-artifact-generation-delivery-audit.md`](./milestone-2-1-artifact-generation-delivery-audit.md) |
| **2.2** | Workspace intelligence correctness | Evaluate Blueprint, Decisions, Insights, Objects, Flow, Satellite, Ledger for *right* information — not merely whether they populate | Blocked on 2.1 review |
| **2.3** | Intelligence differentiation | Determine whether Builder, Storyteller, Designer, and other lenses provide meaningfully different and useful thinking | After 2.2 |
| **2.4** | Natural conversation | Fewer unnecessary briefs, better intent recognition, appropriate follow-ups, less mechanical workspace behavior | After 2.3 |

---

## Today’s clean path

1. Finish PR #207 handoff acceptance (Milestone 1 closeout checklist).  
2. Mark **Restore the Conversation** complete.  
3. Commission **read-only** Artifact Generation & Delivery Audit (2.1).  
4. Review findings.  
5. Fix the proven generation/delivery path.  
6. Begin intelligence-quality testing (2.2+).

---

## Governing requirements (2.1)

> When Atlas generates an artifact in Ask Atlas, the artifact must appear in that conversation first. Storage in Global Files or a related Workspace is additional persistence—not a substitute for delivery.

> A link to a Workspace output must open the actual output or its destination state, not initiate a generic full-conversation handoff.

---

## 2.1 scope reminder

Make PPTX, XLSX, DOCX, image, and HTML creation **reliable and visible** from both conversation surfaces — after the audit proves where generation vs delivery vs routing fails.

---

## Explicit non-goals (for the 2.1 audit phase)

- No immediate product fixes during the read-only audit.  
- No debate on retiring Ask Atlas.  
- No detour into Continuity telemetry (`historicalReopenResolvedCount`).  
- No intelligence-quality work (2.2–2.4) before the artifact audit is reviewed.
