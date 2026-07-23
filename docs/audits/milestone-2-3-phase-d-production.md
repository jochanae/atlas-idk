# Milestone 2.3 Phase D — Production validation & disagreement

**Date:** 2026-07-23  
**Branch:** `cursor/milestone-2-3-phase-de-closeout-2010`  
**Prerequisite:** Phase B CLOSED · Phase C CLOSED · code on `main` (#220–#222)

---

## 1. Production probe (live host)

| Check | Result |
|-------|--------|
| Host | `https://axiomatlas.replit.app` (also `axiomsystem.app`) |
| `GET /api/capabilities` | 200 |
| `apiProcessStartedAt` | `2026-07-23T21:59:52.467Z` |
| Constitution on `main` | Merged via #220 (Map), #221 (B close + C inject), #222 (C battery) — merge times ~23:16–23:39 UTC |
| Deploy lag | **YES** — process start is **~1.5–2h before** Constitution merges → **production is still serving pre-Constitution build** |
| `POST /api/expand-node` (unauth) | `Authentication required` |
| `GET /api/auth/dev-test-login` | 404 (correctly blocked in production) |
| Agent VM `ANTHROPIC_API_KEY` | Missing |
| Authenticated live Nexus session | Not available in this agent environment |

### Verdict — live-model battery on production

**BLOCKED** until ops redeploys `main` and an authenticated session can call Nexus / expand-node.

This is an **implementation / ops defect** (deploy lag), **not** a Constitution refinement.

### Post-redeploy live retest protocol

1. Redeploy API from current `main` (includes `lensConstitution` + Nexus injection).  
2. Confirm `apiProcessStartedAt` is **after** merge of #222 (`0e0355be` / 2026-07-23T23:39Z).  
3. Sign in as real user; open Workspace on Reveal (or equivalent).  
4. For each of Designer / Builder / Storyteller, run T1–T6 prompts (identical text).  
5. Blind-score T1; require T1 Pass + ≥5/6.  
6. Continuity: Designer → Builder → Storyteller mid-thread without restart.  
7. Attach transcripts to this folder as `live-responses/`.

Until that protocol completes, production live confirmation remains **deferred** (see Phase E).

---

## 2. Disagreement & compare (Phase D design objective)

Using Phase B (Map) + Phase C (chat) battery evidence — same Constitution, already scored.

### T2 — Should Reveal charge for community access in v1?

| Lens | Center | Tension |
|------|--------|---------|
| Designer | Fairness UX; no punitive mid-join gate | Protects first experience |
| Builder | Model entitlements now; defer enforce | Easy to implement paywall later |
| Storyteller | **Rejects v1 paywall** as meaning failure | Access is founding promise |

**L5:** Productive disagreement — Storyteller refuses what Builder finds cheap to stub. No auto-merge. **Pass.**

### T3 — Real-time reply notifications

| Lens | Center | Tension |
|------|--------|---------|
| Designer | Interrupt ethics; inbox vs toast; mute | Noise harms trust |
| Builder | Persist, fan-out, SSE/WS, idempotency | Transport specificity |
| Storyteller | Being answered / sacred silence | Not an architecture doc |

**L5:** Designer + Storyteller align against engagement spam; Builder still owns transport. **Pass.**

---

## 3. Cross-project scenario analysis

Same Constitution applied to three Axiom-shaped projects. These are **reasoning scenarios** (how each lens should weight evidence), not live prod transcripts (blocked — §1).

### Reveal (faith-rooted women’s financial community)

| Prompt | Designer | Builder | Storyteller |
|--------|----------|---------|-------------|
| Community page | Empty/join/trust states | Routes/APIs/authz slice | Home of the promise; lurker→known |
| Paywall v1 | Fairness / no punitive gate | Entitlements model, defer enforce | Reject door charge |

**Differentiation:** Already proven in B/C batteries (6/6 each).

### CoinsBloom (consumer / growth product archetype)

| Prompt | Designer should own | Builder should own | Storyteller should own |
|--------|---------------------|--------------------|------------------------|
| “Add a rewards home” | Streak anxiety, empty/claimed states, clarity of next action | Points ledger schema, grant idempotency, fraud bounds | What “blooming” means; reward vs hollow dopamine |
| “Should we push daily notifications?” | Interrupt load, mute, quiet hours | Push pipeline, prefs, delivery failure | Ritual vs spam; when silence serves the brand |

**Expected disagreement:** Storyteller may resist Builder’s “easy daily push” if it hollows calm growth narrative.

### Women’s Financial Community (founding / formation archetype — overlapping Reveal DNA)

| Prompt | Designer | Builder | Storyteller |
|--------|----------|---------|-------------|
| “Design onboarding for money circle” | Shame-free steps, privacy affordances | Cohort/member roles, schedule jobs | Belonging before tips; formation arc |
| “Charge for accountability partners?” | Perceived fairness of pairing UX | Entitlements + matching rules | Whether paid accountability serves or sells trust |

**Expected disagreement:** Same pattern as Reveal T2 — meaning vs implementability.

### Cross-project conclusion

Constitution generalizes: same three jobs, different evidence weights per project DNA. No fourth ontology required. Live confirmation pending redeploy (§1).

---

## 4. Constitution refinements vs implementation defects

| Item | Type | Action |
|------|------|--------|
| Production still on `apiProcessStartedAt` 21:59Z (pre-#220) | **Implementation / ops defect** | Redeploy `main`; re-run live protocol |
| No agent auth / no `ANTHROPIC_API_KEY` in eval VM | **Environment limitation** | Founder runs live protocol in signed-in Workspace |
| CONTINUITY clause (Phase C) | **Constitution refinement** (accepted) | Keep |
| Chat vs Map output contracts (prose vs expand JSON) | **Constitution refinement** (accepted) | Keep — same §3, surface-appropriate contracts |
| Soft “which perspective?” copy remap | **Product copy** | Keep |
| Side-by-side compare UI | **Deferred** (Phase D thin = documented tension; full UI → later) | Not blocking 2.3 |

---

## 5. Phase D status

| Objective | Status |
|-----------|--------|
| Disagreement / compare (T2/T3 L5) | **Pass** (documented from B/C) |
| Cross-project scenario differentiation | **Pass** (analysis) |
| Live production T1–T6 with live model | **Blocked** — deploy lag + auth |
| Refinements vs defects logged | **Done** |

**Phase D closed for documentation & disagreement gates.**  
**Live production battery** carried as deferred ops confirmation (does not reopen Constitution design).
