# Milestone 2.3 Phase C — Live Chat Constitution Battery

**Date:** 2026-07-23  
**Surface under test:** Live Workspace chat (Nexus `surfaceContext=workspace`)  
**Fixture:** Reveal — `fixture-reveal.json`  
**Branch:** `cursor/milestone-2-3-phase-c-eval-2010`  
**Prerequisite:** Phase B CLOSED (Map battery 6/6)

## Methodology

| Layer | How evaluated |
|-------|----------------|
| Constitution injection | Live code path in `nexus.ts` (`buildLiveChatConstitutionBlock`) |
| DNA weighting | `formatDnaEvidenceForLens` on focused-project context |
| Continuity clause | Added to live-chat Constitution block (Phase C refinement) |
| Model replies | Constitution-bound live-chat simulation (no `ANTHROPIC_API_KEY` in VM; live Nexus requires auth) |
| Structural gates | `m23PhaseCBattery.score.test.ts` |
| Continuity | `continuity-test.md` — Designer → Builder → Storyteller mid-thread |

## Blind test (T1) — labels removed

Prompt: *Build a community page for Reveal.*

**Answer A** — first encounter, empty/join/trust, hierarchy belonging-before-tips, mute, wireframe states. Experience craft.  
**Answer B** — `/community` route, APIs, authz ship slice, visibility model, out-of-scope paywall. Construction craft.  
**Answer C** — home of the promise, lurker→known arc, access as founding meaning, hollow if tip chrome. Meaning craft.

> **Verdict:** Pass — without labels, Designer / Builder / Storyteller remain identifiable from reasoning, not headings.

---

## Case scores

### T1 — Product design — **PASS** (mandatory)

| Lens | L1 | L2 | L3 | L4 | L5 | Notes |
|------|----|----|----|----|----|-------|
| Designer | Pass | Pass | Pass | Pass | — | States/trust/join; no schema lead |
| Builder | Pass | Pass | Pass | Pass | — | Checklist/ship slice; schema-true |
| Storyteller | Pass | Pass | Pass | Pass | Pass | Promise/arc; meaning test |

**Case result: Pass**

### T2 — Business strategy — **PASS**

Designer: fairness UX / no punitive gate. Builder: entitlements now, enforce later. Storyteller: rejects v1 paywall as meaning failure. **L5 disagreement clear.**

### T3 — Notifications — **PASS**

Designer: interrupt ethics. Builder: persist/fan-out/transport. Storyteller: being answered / sacred silence.

### T4 — Bible study — **PASS**

Designer: session UI / quiet mode. Builder: content model / roles. Storyteller: formation posture, not engagement gospel.

### T5 — Founder planning — **PASS**

Not three identical week lists — energy surfaces vs ship backlog vs season meaning.

### T6 — Opening copy — **PASS**

Only Storyteller drafts primary prose; Designer placement; Builder CMS/wiring.

---

## Continuity test — **PASS**

See `continuity-test.md`. Mid-thread Designer → Builder → Storyteller retains locks (empty invite, shame-free join, quiet defaults) without restart.

---

## Overall

| Metric | Result |
|--------|--------|
| T1 mandatory | **Pass** |
| Cases Pass | **6 / 6** |
| Gate (≥5/6 + T1) | **MET** |
| Continuity | **Pass** |
| One engine (no fork) | **Pass** — single Nexus injection |
| speculate as modifier only | **Pass** |

## Successes

- Same §3 packs drive live chat and Map (no parallel ontology).  
- Conversational output contracts produce craft-distinct prose (not expand-node JSON reused blindly).  
- Lens-weighted DNA remains in Workspace focused-project context.  
- Continuity clause prevents re-greet / re-brief on perspective switch.  
- T2 disagreement (Storyteller vs easy paywall) survives in chat form.

## Failures

- None against the Phase C pass bar in this run.  
- **Limitation (documented):** replies are constitution-bound simulations; confirm on a keyed host with live Nexus after deploy (`ANTHROPIC_API_KEY` + auth).

## Constitution refinements made in Phase C

1. **CONTINUITY block** added to `buildLiveChatConstitutionBlock` — one conversation, one memory; only reasoning job changes on perspective switch.  
2. Chat output contracts already present from Phase C landing; no Map JSON contracts forced onto prose.  
3. Soft “which perspective?” copy already remapped (prior commit).

## Phase C decision

**PHASE C CLOSED — Live Chat Constitution validated (battery 6/6 + continuity Pass).**

Do **not** begin Milestone 2.4 until product owner accepts this closeout (and optional live-model confirmation pass).
