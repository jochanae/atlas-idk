# Milestone 2.4 Phase C — Honest Execution

**Date:** 2026-07-24  
**Branch:** `cursor/milestone-2-4-phase-c-honest-execution-2010`  
**Design:** [`milestone-2-4-natural-conversation-design.md`](./milestone-2-4-natural-conversation-design.md)

---

## Objective

Words match system state. Interrupt/resend does not duplicate. Failures recover calmly. Handoff carries luggage.

---

## What changed

| ID | Change |
|----|--------|
| E1 | `deliverableOutputGuard` — quiet strip / short recovery; no claim dumps |
| E2 | Progressive “Generating…” caught in final reply without artifact; HARD RULE tightened |
| E3 | Sanitized `generation_failed` tool error; tool hop cap 6→4 |
| E4 | Softened “full context” UI + identity/MEMORY honesty coaching |
| E6 | `buildHandoffLuggageMessage` — Open Workspace seeds brief luggage |
| B4 | Edit & resend truncates thread at edited user turn (Ask Atlas + Workspace) |

---

## Boundaries (locked)

**Not in Phase C (Phase D):** Idea Mode arc, CONV_STATE teaching, ATLAS STATE posture scripts, soft-bridge threshold personality.

---

## Acceptance targets

| Scenario | Target |
|----------|--------|
| T4 Interrupted generation / resend | No duplicate user bubble after edit&resend truncate |
| T5 Renderer unavailable | Short recovery; no raw exception thrash |
| T8 Edit artifact claims | Guard quiet honesty when no file |
| T10 Soft Continue luggage | Kickoff includes brief when summary exists |
| N4 Honesty | Zero false ready/generated claims after guard |

---

## Tests

- `deliverableOutputGuard.test.ts`
- `threadResend.test.ts`
- `askAtlasHelpers.handoff.test.ts` (luggage)
- `workLanguageNextAction` unchanged (Phase B)

---

## Status

**IN PROGRESS** — landing Phase C.
