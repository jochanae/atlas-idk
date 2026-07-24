# Milestone 2.4 Phase D — Prompt Posture (subtractive)

**Date:** 2026-07-24  
**Branch:** `cursor/milestone-2-4-phase-de-closeout-2010`  
**Design:** [`milestone-2-4-natural-conversation-design.md`](./milestone-2-4-natural-conversation-design.md)

---

## Thesis (locked)

> After A–C fixed arrival, stage theater, and honesty in the product, do the prompts teach the same posture — so the model defaults to collaborative work language without needing constant anti-workflow reminders?

**Method:** Subtractive prompt pass. Delete instructions wherever A–C already enforce the behavior. Do not replace deleted ceremony with new essays.

### Six locked posture principles (reinforce, don’t reinvent)

1. Continue the work  
2. Don’t narrate internal mechanics  
3. Work language > process language  
4. Be proportionate  
5. Be honest about uncertainty  
6. Avoid unnecessary ceremony  

---

## Scoped changes only

| ID | Action |
|----|--------|
| C6 | **Deleted** dead `IDEA_MODE_POSTURE` (Phase 1–4 arc never injected) |
| C7 | **Deleted** dead `NEXUS_SYSTEM_PROMPT` + `CONVERSATIONAL_EXPANSION_PROTOCOL` (THINK/SHAPE/COMMIT essays, soft-bridge Mad Libs). **Kept** minimal live `CONV_STATE` emit line for CommitPill gates only |
| C8 | **Deleted** live `ATLAS STATE` + posture scripts; DNA evidence retained |
| Briefing | **Removed** forced 4-block headings / opener label; overview = answer from evidence |
| shouldBrief chrome | **Stripped** “Joy should…” coaching; evidence numbers only |
| A9 | **Subtracted** concierge / two-sentence / door-attendant; gates kept |
| A10 | Soft-bridge conflict removed with dead shaping framework |
| F5 | Canned hooks → minimal anchors (`Options:` / `Questions:` / `Visual:`) |

---

## Prompt Independence Test (required)

**Question:** If we removed the remaining prompt reminders about ceremony, would A–C architecture still prevent workflow voice on arrival, stage Mad Libs, and false generation claims?

| Behavior | Carrier | Prompt-dependent? |
|----------|---------|-------------------|
| Continue-the-work arrival | Client seeds + greeting API (Phase A) | No |
| No Shape/Answer Mad Libs | `workLanguageNextAction` + UI omit (Phase B) | No |
| No false “file ready” | `deliverableOutputGuard` (Phase C) | No |
| Resend without duplicate | Thread truncate (Phase C) | No |
| Handoff luggage | `buildHandoffLuggageMessage` (Phase C) | No |
| CommitPill arming | Server `PROJECT_READY` / `CONV_STATE` parse | Minimal emit only |

**Pass condition:** Architecture carries A–C behaviors; prompts do not reintroduce phase arcs, soft-bridge Mad Libs, ATLAS STATE theater, or concierge scripts. Remaining prompt text is gates + evidence + the six principles — not a second workflow engine.

---

## Acceptance

- T1, T7, T11, S1 on N3/N5/N7  
- Blind read of replies: stranger cannot reconstruct internal stages  
- Prompt Independence Test Pass  

---

## Status

**CLOSED** for scoped subtractive pass — proceed to Phase E validation/closeout.
