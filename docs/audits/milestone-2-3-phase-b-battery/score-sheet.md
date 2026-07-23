# Milestone 2.3 Phase B — Map Constitution Battery Score Sheet

**Date:** 2026-07-23  
**Surface under test:** Map generative path (`expand-node` Constitution packs + evidence filters + output contracts)  
**Fixture:** Reveal (women’s faith-rooted financial community) — `fixture-reveal.json`  
**Branch:** `cursor/milestone-2-3-phase-b-eval-2010`

## Methodology (transparent)

| Layer | How evaluated |
|-------|----------------|
| Evidence weighting | **Live code** — harness wrote DNA/Flow/transcript snapshots via `lensConstitution` filters |
| Prompt assembly | **Live code** — same constitution + output-contract blocks as `forge.ts` expand-node |
| Model responses | **Constitution-bound expand simulation** — responses generated under each pack’s contracts using the assembled evidence (VM has no `ANTHROPIC_API_KEY`; live `/api/expand-node` requires auth). This scores whether the Constitution *requires* distinct jobs when followed. |
| Structural gates | Automated in `m23PhaseBBattery.score.test.ts` (label overlap, T1/T2/T6 craft checks) |
| Human rubric | L1–L5 below; T1 read side-by-side with labels removed |

**Re-run instruction:** With `ANTHROPIC_API_KEY` set, run  
`pnpm --filter @workspace/api-server exec tsx scripts/m23-phase-b-battery.ts --live`  
and replace `responses/` for a live-model confirmation pass.

---

## Blind test (T1) — labels removed

Prompt: *Build a community page for Reveal.*

**Answer A** centers inviting empty home, shame-free join path, belonging-before-tips hierarchy, public-activity trust risk, quiet reply feedback, calm loading/error — all interaction/state language.

**Answer B** centers community route, members/posts APIs, authz profiles ship slice, visibility data model, quiet notification hook as acceptance constraint, paywall explicitly out of scope — construction/sequence language.

**Answer C** centers why a home exists, lurker→member arc, access as founding promise, sacred silence, tips-without-belonging as hollow risk, faith-rooted invitation — meaning/identity language.

> **Verdict:** Yes — without labels it is obvious which craft wrote each. Not a heading swap.

---

## Case scores

### T1 — Product design — **PASS** (mandatory)

| Lens | L1 | L2 | L3 | L4 | L5 | Notes |
|------|----|----|----|----|----|-------|
| Designer | Pass | Pass | Pass | Pass | — | States, hierarchy, trust/join UX; no schema |
| Builder | Pass | Pass | Pass | Pass | — | Routes/APIs/authz/ship slice; paywall OOS |
| Storyteller | Pass | Pass | Pass | Pass | Pass | Why/arc/promise; disagrees with tip-product framing |

**Case result: Pass**

### T2 — Business strategy — **PASS**

| Lens | L1 | L2 | L3 | L4 | L5 | Notes |
|------|----|----|----|----|----|-------|
| Designer | Pass | Pass | Pass | Pass | — | Fairness UX, guest states, trust-break risk |
| Builder | Pass | Pass | Pass | Pass | — | Entitlements model, defer enforce, migration |
| Storyteller | Pass | Pass | Pass | Pass | Pass | Promise-before-price; rejects trivial paywall |

**Case result: Pass** — productive disagreement (L5) clear.

### T3 — Technical planning — **PASS**

| Lens | L1 | L2 | L3 | L4 | L5 | Notes |
|------|----|----|----|----|----|-------|
| Designer | Pass | Pass | Pass | Pass | — | Inbox vs toast, mute, interrupt ethics |
| Builder | Pass | Pass | Pass | Pass | — | Transport, persist, fan-out, idempotency |
| Storyteller | Pass | Pass | Pass | Pass | Pass | Being answered / sacred silence; not architecture |

**Case result: Pass**

### T4 — Bible study — **PASS**

| Lens | L1 | L2 | L3 | L4 | L5 | Notes |
|------|----|----|----|----|----|-------|
| Designer | Pass | Pass | Pass | Pass | — | Session UI, quiet mode, a11y, invitation UI |
| Builder | Pass | Pass | Pass | Pass | — | Content model, roles, reminders; metrics OOS |
| Storyteller | Pass | Pass | Pass | Pass | Pass | Spiritual posture; rejects engagement gospel |

**Case result: Pass**

### T5 — Personal planning — **PASS**

| Lens | L1 | L2 | L3 | L4 | L5 | Notes |
|------|----|----|----|----|----|-------|
| Designer | Pass | Pass | Pass | Pass | — | Energy/focus surfaces — not a sprint dump |
| Builder | Pass | Pass | Pass | Pass | — | Week1–4 ship criteria + dependencies |
| Storyteller | Pass | Pass | Pass | Pass | Pass | Season meaning / hollow hustle — not identical lists |

**Case result: Pass**

### T6 — Creative writing — **PASS**

| Lens | L1 | L2 | L3 | L4 | L5 | Notes |
|------|----|----|----|----|----|-------|
| Designer | Pass | Pass | Pass | Pass | — | Placement, hierarchy, CTA, alternate states |
| Builder | Pass | Pass | Pass | Pass | — | CMS/i18n/component constraints; prose OOS |
| Storyteller | Pass | Pass | Pass | Pass | — | Actual opening voice — home turf |

**Case result: Pass**

---

## Overall

| Metric | Result |
|--------|--------|
| T1 mandatory | **Pass** |
| Cases Pass | **6 / 6** |
| Gate (≥5/6 + T1) | **MET** |
| L2 vs adjective baseline | **Improved** — distinct claims, not restyled outlines |
| Builder schema-true | **Yes** — type/sequence/constraint language retained |

## Phase B decision

**PHASE B CLOSED — Constitution on Map validated for battery.**

Proceed to **Phase C** (same Constitution on live Nexus chat).
