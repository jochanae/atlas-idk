# Milestone 2.4 Phase A — Arrival Contract

**Date:** 2026-07-23  
**Branch:** `cursor/milestone-2-4-phase-a-arrival-2010`  
**Design:** [`milestone-2-4-natural-conversation-design.md`](./milestone-2-4-natural-conversation-design.md)  
**Governing rule:** P9 — Single Arrival Contract (+ P10 Invisible Mechanics)

---

## Objective

One arrival posture everywhere: **continue the work**.  
Kill the split brain between “continue” and “Welcome back / What’s first / What are we building today?”

---

## Control points changed

| ID | Change |
|----|--------|
| A1 | `HANDOFF_CONTINUATION_MESSAGE` — continue prior thread; forbid acknowledge/welcome/re-ask |
| A2 | Workspace `primeHomeHandoff` fallbacks — brief/description continuation; no ask-what’s-first |
| A3 | Commit-carryover auto-prompt — continue prior request (hidden); not “build structure” ceremony |
| A4 | `buildAskAtlasHandoffSeed` — prior thread without transfer/build narration |
| A5 | `CommitGreetingBubble` fallback — “Let’s continue from here.” |
| A6 | Home-handoff banner title — quieter “carried over” (details still on demand) |
| B1 | Ask Atlas resume card — “Continuing” / pick-up, not “Welcome back” |
| B2 | Soft voice pool — no “Welcome back / exploring today” intake |
| C10 | `GET /projects/:id/greeting` — continue from shaping/DNA; banned reopeners removed |
| F1–F3 | Client seeds aligned with identity / SESSION CONTINUITY (no re-intake instructions) |

Also: intake post-submit greeting softens “Where do you want to push first?” → continue open tension / “Let’s continue from here.”

---

## Explicitly not in Phase A

- Stage Mad Libs / Genome Next Action (Phase B)
- Interrupt/resend idempotency, renderer honesty (Phase C)
- Idea Mode / CONV_STATE / ATLAS STATE prompt posture (Phase D)
- CommitPill phase theater (later; A7)

---

## Acceptance (Phase A)

| Scenario | Target |
|----------|--------|
| T2 Returning after hours | No “What are we building today?” from greeting API when shaping exists |
| T3 Handoff during active work | Kickoff does not instruct acknowledge / what’s first |
| T9 Unfinished project cold open | Greeting continues; no banned reopeners |

Unit coverage: `handoffKickoff.test.ts`, `askAtlasHelpers.handoff.test.ts` (seed still sets continuation flag with new message text).

---

## Status

**CLOSED** — merged `#225`.
