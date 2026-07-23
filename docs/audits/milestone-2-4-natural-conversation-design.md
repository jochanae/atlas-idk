# Milestone 2.4 — Natural Conversation Design

**Phase:** Design freeze (awaiting approval)  
**Date:** 2026-07-23  
**Status:** **DESIGN DRAFT** — no implementation  
**Prerequisite:** Milestone 2.3 CLOSED (lens differentiation)  
**Parent board:** [`milestone-2-restore-intelligence.md`](./milestone-2-restore-intelligence.md)  
**Repo HEAD at commission:** `a3e4460e` (`main`, post #223)

---

## Governing question

> Does this feel like continuing work with someone who already understands the project — or like operating a procedure?

**Natural Conversation** means Atlas (Joy) behaves like a capable collaborator already inside the work — not like a workflow engine, wizard, checklist, or phase coach.

Intelligence already exists (M1–2.3). This milestone governs **feel and flow**: how that intelligence shows up in interaction without ceremony, restart, or procedural scaffolding.

---

## 0. Scope clarification

| In scope | Out of scope (for this design) |
|----------|--------------------------------|
| Where conversational flow is controlled (client seeds, server prompts, health Mad Libs, resume chrome, handoff, artifacts honesty) | Rewriting prompts in this deliverable |
| Principles + acceptance criteria for natural collaboration | UI visual redesign / brand refresh |
| Evaluation battery for natural vs procedural | Changing the Lens Constitution (2.3 closed) |
| Phased implementation roadmap | Joy personality / witty voice pack |
| Absorbing deferred 2.2 UX that blocks natural feel | Side-by-side lens compare UI (optional later) |
| Aligning conflicting “continue vs re-intake” contracts | Ops-only 2.3 live redeploy battery |

**Relationship to prior milestones**

| Milestone | Proven | Not enough for natural |
|-----------|--------|------------------------|
| M1 | Memory continuity | Memory can still be wrapped in ceremony |
| 2.1 | Artifacts can ship | Generation claims can still lie or stall awkwardly |
| 2.2 | Knowledge correctness | Insights/health still stage-Mad-Lib; handoff still restarts |
| 2.3 | Three real perspectives | Soft “which perspective?” menus and lens chrome still perform |

---

## 1. Governing specification — Natural Conversation principles

Each principle has: **objective**, **examples**, **anti-patterns**, **acceptance criteria**.

### P1 — Continuity

**Objective:** Arrival, return, handoff, and refresh feel like the same conversation — never a new intake.

**Examples:**
- After Ask Atlas → Workspace, Joy continues the brief or decision mid-thought.
- Returning hours later, the first useful line references last substance (not “Welcome back”).
- Mid-thread perspective switch keeps facts; only reasoning posture changes (2.3 CONTINUITY preserved).

**Anti-patterns:**
- `"Acknowledge we're starting and ask what's first."`
- `"Continue from where we left off — acknowledge the handoff and propose the next concrete step."` as a forced ritual
- `"What are we building today?"` when project DNA already knows
- Synthetic “Welcome back” inside the transcript

**Acceptance:**
- Blind review of handoff + resume turns: a third party cannot tell a surface boundary occurred from the prose alone (unless the user asked to switch surfaces).
- Zero kickoff strings that instruct acknowledge / ask-what’s-first when prior context exists.

---

### P2 — Momentum

**Objective:** Each turn advances the actual work. Atlas does not pause for status theater.

**Examples:**
- Continues unfinished planning without re-listing what’s known.
- After interrupt, resumes the pending intent rather than restarting the plan.
- Changing your mind mid-plan updates the plan; does not reopen a wizard.

**Anti-patterns:**
- Commit threshold markers + “Where do you want to take it first?”
- CommitPill phase theater (`Shaping…` → `Packaging…` → `Opening…`) as the emotional center of the turn
- Home-handoff banner as a mandatory status report interrupt
- Empty-response canned hooks (`"Here's a comparison of the options:"`) that replace real prose

**Acceptance:**
- In scripted scenarios (handoff, interrupt, mind-change), ≥1 concrete work advance per assistant turn; no pure ceremony turns.
- No platform-injected user turn whose only job is to trigger an acknowledge ritual.

---

### P3 — Proportionate replies

**Objective:** Length, structure, and formality match the ask — not a fixed briefing template.

**Examples:**
- Short question → short answer.
- “Keep going” → continues last thread, not a four-section status dump.
- Overview asks may brief; micro-asks must not.

**Anti-patterns:**
- Forced Identity / Technical State / Recent Momentum / Unresolved Tensions on every focused-project turn
- Idea Mode phase cadence leaking into user-visible rhythm
- Essay-length strategy briefs when the user asked for one decision

**Acceptance:**
- Battery includes short/medium/long asks; over-structure fails Proportionate (reviewer checklist).
- Default Workspace reply is not a status report unless the user asked for status/overview.

---

### P4 — Honest execution

**Objective:** Words match system state. No fake progress, no overclaimed memory, no silent empty Outputs.

**Examples:**
- Claims a file only after generation succeeds.
- Renderer failure → one calm recovery line + usable fallback (not multi-format thrash).
- Distinguishes thread memory vs Workspace persistence truthfully.

**Anti-patterns:**
- `"Generating the brief now"` with empty Outputs after handoff
- Deliverable guard dumping claim excerpts as collaborative prose
- `"Preserved / full context next time"` when only partial tiers apply
- Build stalled → dump recovery work on the user with no continue path

**Acceptance:**
- Zero false “generated / ready / preserved” claims in battery transcripts.
- Interrupt/resend does not duplicate the user message (idempotent path).
- Renderer-unavailable scenario produces ≤1 user-visible recovery beat.

---

### P5 — Perspective without performance

**Objective:** Designer / Builder / Storyteller change reasoning content — not costume, menus, or badges.

**Examples:**
- Mid-conversation lens switch answers the same ask with a different job focus (2.3).
- Lens mentioned only if the user asks which perspective is active.

**Anti-patterns:**
- Closing with `"Which perspective? Designer / Builder / Storyteller"`
- Files panel chrome announcing `"designer lens"`
- Scenario exit ritual (`"Leaving Scenario mode"`) mid-flow
- Announcing `"answering as Builder"` unprompted

**Acceptance:**
- Continuity + mid-switch battery: no unsolicited perspective menus or lens badges required for understanding.
- 2.3 Constitution unchanged; this principle only removes performance chrome/copy.

---

### P6 — Human pacing

**Objective:** Atlas waits, refers back, and moves at the user’s tempo — not a stage machine’s.

**Examples:**
- Returning after hours: quiet restore + one useful continuation offer.
- Does not force five intake dimensions because Idea Mode says so.
- Lets silence / short replies stand; does not fill with process narration.

**Anti-patterns:**
- Genome/Portfolio `"Answer: ${q}"` / `"Start shaping your core idea…"` as the primary insight
- Manifest `"Joy still needs"` checklist as conversational driver
- Atlas Memory HUD stage narration (`Exploration` / `Shaping` / `Forming`)
- Tier-1 questionnaire chips when chat already answered the fields

**Acceptance:**
- Health/Insights “next action” is a synthesized observation or is absent — never stage Mad Lib homework.
- Cold open with known DNA never asks what we’re building.

---

### P7 — Restraint

**Objective:** Prefer silence, implication, and direct substance over acknowledgement, meta-narration, and scaffolding.

**Examples:**
- Identity rule already bans intake-wizard openings — client seeds must obey the same rule.
- Soft empty states; no capture-checklist voice (`"Not captured yet — Joy hasn't seen…"`).

**Anti-patterns:**
- Unnecessary acknowledgements (`"Got it, let me now…"`)
- Over-explaining internal CONV_STATE / ATLAS STATE labels to the user
- Artificial transitions (`"Okay — this is a project now."`)
- Unnecessary confirmations before continuing agreed work

**Acceptance:**
- Spot-check: assistant turns contain zero platform-instructed acknowledge verbs when context exists.
- Identity anti-ceremony rules and client/server kickoffs do not contradict (split-brain = fail).

---

### P8 — Trust

**Objective:** The user can rely on Atlas’s next move without managing the platform.

**Examples:**
- Handoff carries luggage (brief + next concrete task), not just a door.
- Resume restores the thread without asking the user to re-orient Atlas.
- Failures are owned (“I couldn’t finish that file”) with one recovery action.

**Anti-patterns:**
- Door without luggage (Workspace offered with no verified next task)
- Duplicate messages after interrupt forcing the user to clean up
- Conflicting handoff thresholds (soft bridge vs explicit-commit-only) producing awkward offers

**Acceptance:**
- Soft Continue-in-Workspace carries brief + next task (or explicit deferral reason).
- Trust battery scenarios (interrupt, renderer fail, handoff mid-work) leave the user with ≤1 recovery action.

---

### Recommended addition — P9 — Single arrival contract

**Objective:** Exactly one arrival posture across Ask Atlas → Workspace, greeting API, chat continuity blocks, and client seeds: **continue the work**.

**Examples:**
- Server handoff context and client opening message agree: no re-probe.
- Greeting endpoint never emits banned reopeners when PROJECT CONTEXT exists.

**Anti-patterns:**
- `chat.ts` SESSION CONTINUITY bans `"What are we building today?"` while `projects.ts` greeting still emits it
- Nexus handoff says don’t re-probe; workspace fallback asks what’s first

**Acceptance:**
- Trace matrix (Ask Atlas handoff, home handoff, cold Workspace open, resume): all paths share one arrival contract document; contradictions = fail.

---

## 2. Design audit — places that interrupt natural flow

Findings grouped by cluster. Not exhaustive of every string in the repo; exhaustive of **control points** that shape conversational feel. Path references are current as of commission HEAD.

### Cluster A — Handoff / kickoff / continuation (highest leverage)

| ID | Location | Interrupt |
|----|----------|-----------|
| A1 | `askAtlasHelpers.ts` — `HANDOFF_CONTINUATION_MESSAGE` | Forces acknowledge + propose-next ritual |
| A2 | `workspace.tsx` — `primeHomeHandoff` fallbacks | `"ask what's first"` / `"Acknowledge we're starting"` |
| A3 | `workspace.tsx` — commit-carryover auto-prompt | Injects scripted “show build structure” ask |
| A4 | `askAtlasHelpers.ts` — `buildAskAtlasHandoffSeed` | Meta-narrates transfer + “build” |
| A5 | `ChatStream.tsx` — CommitThresholdMarker / CommitGreetingBubble | Status ceremony + “where first?” |
| A6 | `workspace.tsx` — home-handoff banner (INT-38) | “Here’s what Joy mapped…” status interrupt |
| A7 | `CommitPill.tsx` | Phase theater + forced confirmation gate |
| A8 | `askAtlasHandoffContract.ts` — create-success instruction | Concierge script + mandatory Open Workspace |
| A9 | `askAtlasHandoffContract.ts` — surface contract | Two-sentence door-attendant close |
| A10 | `nexus.ts` — soft workspace bridge / Idea Mode thresholds | Checklist → offer Workspace; conflicting rules |

### Cluster B — Resume / interrupt / resend

| ID | Location | Interrupt |
|----|----------|-----------|
| B1 | `AskAtlasSurface.tsx` / `home.tsx` | Ephemeral `"Welcome back"` resume card |
| B2 | `atlas-voice.ts` | Empty-state `"Welcome back."` / `"What are we exploring today?"` |
| B3 | Auth screens | Welcome ceremony (auth-only — usually keep) |
| B4 | Nexus continuity + Edit & resend | Interrupt/resend can duplicate user message |
| B5 | `useBuildLifecycle.ts` | Stalled build → user must resend |

### Cluster C — Phase / stage / next-action scaffolding

| ID | Location | Interrupt |
|----|----------|-----------|
| C1 | `intelligence.ts` / `genome.ts` — `nextActionForStage` | `"Answer: ${q}"`, Shape/Think Mad Libs |
| C2 | `GenomeCard.tsx` | Stage bar + Next Action assignment |
| C3 | `PortfolioHealthDashboard.tsx` | Same Mad Lib on every card |
| C4 | `ManifestPanel.tsx` | `"Joy still needs"` checklist |
| C5 | `AtlasMemoryHUD.tsx` | Exploration/Shaping/Forming narration |
| C6 | `nexus.ts` — IDEA_MODE_POSTURE | Phase 1–4 arc (leaks cadence) |
| C7 | `nexus.ts` — CONV_STATE / shaping framework | Model optimizes for state machine |
| C8 | `nexus.ts` — ATLAS STATE injection | Discovers/Pressure Testing/… posture scripts |
| C9 | `nexus.ts` — focused-project briefing + lens offer | Status report + perspective menu |
| C10 | `projects.ts` — `GET /projects/:id/greeting` | `"What are we building today?"` |
| C11 | `DecisionGateCard.tsx` | `"Joy needs one decision before continuing"` |
| C12 | `workspace.tsx` — Plan→Build modal | Announces mode switch |
| C13 | `tier1Memory.ts` / workspace intake | Fixed wizard questions |

### Cluster D — Perspective performance

| ID | Location | Interrupt |
|----|----------|-----------|
| D1 | Soft “Which perspective?” close | Menu after overview |
| D2 | `FilesPanel.tsx` — `"{lens} lens"` | Chrome announces mode |
| D3 | Scenario leave sheet | Exit ritual |
| D4 | Lens Constitution CONTINUITY | OK if asked; risk of voluntary announce |

### Cluster E — Artifacts / outputs / honesty

| ID | Location | Interrupt |
|----|----------|-----------|
| E1 | `deliverableOutputGuard.ts` | Guard voice replaces collaborative prose |
| E2 | Generation claims vs empty Outputs | Fake progress / broken promise |
| E3 | Multi-format renderer fallback | Visible machinery thrash (deferred 2.2) |
| E4 | Persistence overclaim copy | “Full context preserved” dishonest |
| E5 | Essay-like strategy brief | Document dump vs living decision object |
| E6 | Soft Continue-in-Workspace without next task | Door without luggage |

### Cluster F — Split-brain contracts (platform contradicts itself)

| ID | Tension |
|----|---------|
| F1 | `atlasIdentity.ts` bans intake-wizard openings; client kickoffs demand acknowledge/ask-first |
| F2 | `chat.ts` SESSION CONTINUITY bans `"What are we building today?"`; greeting API emits it |
| F3 | Server handoff “don’t re-probe” vs client “ask what’s first” |
| F4 | BUILD HANDOFF “Just build it” vs discovery→brief handoffs |
| F5 | Empty-response recovery hooks inject canned scaffolding |
| F6 | Composer lens placeholders frame the user as filling a role prompt |

### Cluster G — Insights residue

| ID | Interrupt |
|----|-----------|
| G1 | Insights empty-state coachy instruction |
| G2 | DNA `"Not captured yet"` capture-checklist voice |
| G3 | Joy confidence scoreboard as first signal (secondary) |

---

## 3. Current-state inventory — flow control points

For each control point: **current → desired**, **owner**, **complexity**.

| Control point | Surfaces | Current behavior | Desired behavior | Owner | Complexity |
|---------------|----------|------------------|------------------|-------|------------|
| Handoff continuation seed | Ask Atlas → Workspace | Hidden user turn: acknowledge + propose next | Seed concrete next work from prior turn, or silent context + natural first reply | client (`askAtlasHelpers`, `handoffKickoff`) | Medium |
| Home-handoff fallbacks | Workspace | Ask what’s first | Continue brief/decision; never re-intake after shaped handoff | client (`workspace.tsx`) | Medium |
| Commit-carryover prompt | Workspace | Scripted build-structure ask | Continue last Ask Atlas ask | client | Medium |
| Legacy handoff seed copy | Handoff | “Continuing from Ask Joy… let’s build” | Pass context without announcing transfer | client | Low |
| Commit threshold UI | Workspace chat | Marker + greeting bubble | Quiet continuity; optional soft toast outside transcript | client (`ChatStream`) | Medium |
| Home-handoff banner | Workspace | Mapped-nodes status interrupt | Quiet land; details on demand | client | Low–Med |
| CommitPill phases | Ask Atlas | Shaping/Packaging/Opening theater | One calm CTA when ready | client | Medium |
| Create-success / surface contract | Ask Atlas | Concierge + PROJECT_READY ritual | Natural close; keep execution boundaries | prompts / nexus (`askAtlasHandoffContract`) | Medium |
| Soft bridge thresholds | Ask Atlas | Conflicting offer rules | Single threshold; bridge in user’s language | nexus prompts | High |
| Resume card | Ask Atlas | “Welcome back” + hint | Silent transcript restore; ambient hint without greeting ceremony | client | Low |
| Voice empty-state pools | Home | Welcome / exploring today | Quieter or none when thread exists | client | Low |
| Interrupt / resend | Ask Atlas + Workspace | Can duplicate user message | Idempotent continue / resubmit | nexus + client | High |
| Build stall recovery | Workspace | “Try resending” | Auto-resume or one-tap continue with intent | client / forge | Medium |
| `nextActionForStage` | Genome / Portfolio / Insights | Stage Mad Libs | Synthesized insight or omit | api-server (`genome`, `intelligence`) | Medium |
| Genome / Portfolio Next Action UI | Home / Genome | Assignment row | Insight line or hide | client | Low–Med |
| Manifest “Joy still needs” | Manifest | Checklist driver | Gaps only when user asks | client | Medium |
| Memory HUD stages | Ask Atlas | Stage narration | Invisible / signal-only | client | Low |
| Idea Mode arc / CONV_STATE | Ask Atlas | Phase script in prompts | Soft internal guidance; stop teaching phases to the model | nexus prompts | High |
| ATLAS STATE + briefing template | Workspace | Stage scripts + 4-block brief + lens menu | Evidence posture; answer the ask; no menu | nexus prompts | Medium |
| Project greeting API | Workspace cold open | “What are we building today?” | Continue from DNA/resume | api-server (`projects`) | Low |
| Decision gate card | Workspace | Blocks with gate chrome | Inline natural choice | client | Low |
| Plan→Build modal | Workspace | Announces mode switch | Seamless / quiet affordance | client | Medium |
| Tier-1 intake | Workspace | Fixed questionnaire | Infer; ask only true gaps | client + nexus | High |
| Perspective offer / lens chrome | Workspace / Files | Menu + badge | Reason; announce only if asked | prompts + client | Low |
| Scenario exit sheet | Workspace | Leave ritual | Lightweight toggle | client | Medium |
| Deliverable honesty guard | Chat | Replacement dump | Quiet strip + short recovery | nexus / forge | Medium |
| Generation ↔ Outputs sync | Ask Atlas → Workspace | Claim without file | Claim only on success; handoff carries generation | nexus + client | High |
| Renderer fallback | Outputs | Multi-format thrash | One recovery + inline fallback | forge | Medium |
| Persistence copy honesty | Ask Atlas | Overclaim tiers | Truthful tier language | prompts + client | Medium |
| Living brief structure | Outputs | Essay dump | Decisions / assumptions / risks / next decision | forge / prompts | Medium |
| Soft Continue-in-Workspace | Ask Atlas | Offer without next task | Brief + next concrete task | client + nexus | High |
| Empty-response hooks | Chat | Canned scaffolding | Prefer real model prose | nexus | Low |
| Composer placeholders | Workspace | Role-framed prompts | Neutral / continuity hint | client | Low |
| Insights / DNA empty copy | Insights | Coachy / “not captured” | Quiet absence | client | Low |

---

## 4. Evaluation battery

Objective tests. Score **Pass / Fail**. A scenario fails if any listed failure condition appears.

### Scoring dimensions (apply per scenario)

| Code | Dimension | Pass means |
|------|-----------|------------|
| N1 | Continuity | No re-intake / welcome / what’s-first when context exists |
| N2 | Momentum | Advances real work; no ceremony-only turn |
| N3 | Proportion | Reply scale matches ask |
| N4 | Honesty | Claims match system state |
| N5 | No performance | No unsolicited lens/phase/mode theater |
| N6 | Trust | ≤1 recovery action; luggage carried on handoff |

**Milestone bar (proposed):** All critical scenarios Pass; no N1 or N4 fails on critical set.

### Critical scenarios

#### T1 — Mid-thread resume (same session refresh)

| | |
|--|--|
| **Setup** | Active Ask Atlas or Workspace thread; refresh mid-work |
| **Expected** | Transcript restored; next reply continues substance; no “Welcome back” in transcript |
| **Failure** | Re-greeting; re-asking project purpose; synthetic resume assistant turn |

#### T2 — Returning after hours

| | |
|--|--|
| **Setup** | Known project DNA + last assistant turn hours ago; user returns |
| **Expected** | Quiet restore; first useful line references last substance or offers one continuation |
| **Failure** | `"What are we building today?"`; empty-state exploring ritual; intake restart |

#### T3 — Handoff during active work

| | |
|--|--|
| **Setup** | Ask Atlas mid-brief / mid-decision → Open Workspace |
| **Expected** | Continues that brief/decision; carries next concrete task; no acknowledge ritual |
| **Failure** | “What’s first?”; “acknowledge the handoff”; door without luggage; mapped-nodes interrupt as first beat |

#### T4 — Interrupted generation

| | |
|--|--|
| **Setup** | User stops a generating turn; then continues or resends |
| **Expected** | Idempotent path; continues intent or cleanly replaces; no duplicate user bubble |
| **Failure** | Duplicate messages; restart from zero; fake “still generating” |

#### T5 — Renderer unavailable

| | |
|--|--|
| **Setup** | Request format that fails rendering |
| **Expected** | One calm recovery + usable fallback; conversation continues |
| **Failure** | Multi-format thrash; long internal-error dump; false “file ready” |

#### T6 — Switching perspectives mid-conversation

| | |
|--|--|
| **Setup** | Same Workspace thread; Designer → Builder → Storyteller on related asks |
| **Expected** | Reasoning shifts; memory holds; no menu/announcement unless asked |
| **Failure** | “Which perspective?” close; lens badge required; continuity break |

#### T7 — Changing your mind halfway through planning

| | |
|--|--|
| **Setup** | User commits direction A, then pivots to B mid-plan |
| **Expected** | Updates plan/assumptions; does not reopen wizard or stage checklist |
| **Failure** | Re-runs intake; “Joy still needs” checklist drive; phase narration |

#### T8 — Editing an existing artifact

| | |
|--|--|
| **Setup** | User asks to revise a known Output |
| **Expected** | Edits that artifact; honest about success/failure |
| **Failure** | Generates a parallel untitled file while claiming edit; empty Outputs |

#### T9 — Continuing an unfinished project

| | |
|--|--|
| **Setup** | Cold open Workspace with rich DNA + unfinished thread |
| **Expected** | Leads with useful continuation; never pretends fresh start |
| **Failure** | Greeting Mad Lib; Tier-1 re-ask of known fields; ATLAS STATE lecture |

#### T10 — Soft Continue-in-Workspace (threshold)

| | |
|--|--|
| **Setup** | Ask Atlas reaches real commit momentum |
| **Expected** | Natural offer in user’s language; Open carries brief + next task |
| **Failure** | Awkward early/late offer from conflicting thresholds; empty Workspace kickoff |

### Supporting scenarios (non-blocking but scored)

| ID | Scenario | Expected | Failure |
|----|----------|----------|---------|
| S1 | Short ask (“yes, that”) | Short proportionate reply | Four-block briefing |
| S2 | Insights/Portfolio glance | Insight or quiet empty | `"Answer: …"` Mad Lib |
| S3 | Scenario mode leave | Lightweight toggle | Exit ceremony dialog as main beat |
| S4 | Build stall | One-tap continue / auto-resume | “Try resending” as only path |
| S5 | Decision needed | Inline natural choice | Gate card blocking chrome |

---

## 5. Roadmap (implementation phases)

> Complexity is technical surface/risk, not calendar time.  
> **Do not rewrite prompts until Phase 0 contracts are approved and Phase A inventory locks owners.**  
> **No implementation in this design deliverable.**

### Phase 0 — Design freeze ✅ (this document)

**Objective:** Approve principles, inventory, battery, phase order.  
**Dependencies:** 2.3 CLOSED.  
**Acceptance:** Human sign-off on §1 principles (incl. P9), §4 battery bar, §5 phase order, §6 non-goals.

### Phase A — Arrival contract (handoff + greeting + resume)

**Objective:** One arrival posture: continue the work. Kill acknowledge / what’s-first / banned reopeners at control points A1–A6, B1, C10, F1–F3.  
**Dependencies:** Phase 0.  
**Acceptance:** T2, T3, T9 Pass (N1/N2/N6). Trace matrix shows no split-brain between client seeds and server continuity.

### Phase B — Kill procedural scaffolding (stage Mad Libs + status theater)

**Objective:** Remove or reframe `nextActionForStage`, Genome/Portfolio next-action assignment voice, Memory HUD stage narration, Manifest-as-driver, unsolicited perspective menus (C1–C5, C9/D1, G1–G2).  
**Dependencies:** Phase A preferred (so scaffolding isn’t the only “next step” after a clean arrival).  
**Acceptance:** S2 Pass; Insights/health never emit `"Answer: …"` Mad Libs; T6 Pass on N5.

### Phase C — Honest execution (interrupt, outputs, renderer)

**Objective:** Idempotent interrupt/resend (B4); generation claims ↔ Outputs truth (E2/E6); quieter renderer fallback (E3); guard voice restraint (E1); persistence copy honesty (E4).  
**Dependencies:** Phase A for handoff luggage; can parallelize parts of B.  
**Acceptance:** T4, T5, T8, T10 Pass on N4/N6; zero false ready/generated claims in battery.

### Phase D — Prompt posture alignment (no new ontology)

**Objective:** Align Idea Mode / CONV_STATE / ATLAS STATE / focused briefing / soft bridge (C6–C8, A9–A10, F4–F5) with principles — **restraint and continuity**, not a new personality pack.  
**Dependencies:** Phase A contract language; Phase B so prompts aren’t fighting Mad Libs.  
**Acceptance:** T1, T7, S1 Pass on N3/N5/N7; identity and kickoffs no longer contradict.

### Phase E — Close 2.4

**Objective:** Full battery; parent board → 2.4 CLOSED; deferred leftovers listed; readiness for whatever follows M2.  
**Dependencies:** A–D.  
**Acceptance:** Critical T1–T10 meet bar; supporting S1–S5 reported; acceptance report published.

---

## 6. Deferred / non-goals

### Explicit non-goals for 2.4

- Joy personality / witty voice layer  
- Rewriting the Lens Constitution  
- Three knowledge graphs or auto-merge of lens answers  
- Full visual redesign of Workspace chrome  
- Debating whether Ask Atlas should exist  
- Treating “panel has content” as success  

### Carry-ins from 2.2 / 2.3 (in scope when they block natural feel)

| Item | Maps to |
|------|---------|
| Resume-after-refresh toast/card discipline | P1, B1, Phase A |
| Resend / interrupt idempotency | P4/P8, B4, Phase C |
| Quieter multi-format renderer fallback | P4, E3, Phase C |
| Living Product Strategy Brief structure | P3, E5, Phase C/D |
| “Preserved / full context” honesty | P4, E4, Phase C |
| Soft Continue-in-Workspace + kill “What’s first?” | P1/P8, A*, Phase A/C |
| Insights synthesis vs stage Mad Libs | P6, C1–C3, Phase B |

### Explicitly later (not 2.4 core)

- Side-by-side lens compare UI (2.3 Phase D deferral)  
- Full disagreement synthesis mode  
- 2.3 production live T1–T6 (ops redeploy — track separately)

---

## 7. Acceptance of *this* deliverable

| Requirement | Status |
|-------------|--------|
| Design document only | ✅ This file |
| No implementation code | ✅ |
| No prompt rewrites | ✅ |
| No UI redesign | ✅ |
| Governing definition expanded to principles | ✅ §1 |
| Audit of procedural interruptions | ✅ §2 |
| Current-state inventory with owners/complexity | ✅ §3 |
| Evaluation battery | ✅ §4 |
| Phased roadmap | ✅ §5 |

**Next (after approval):** Phase A implementation — arrival contract only. Do not begin Phase D prompt rewrites before A/B land.

---

## 8. Status log

| Date | Note |
|------|------|
| 2026-07-23 | Design draft created from product definition + codebase audit. Awaiting approval. |

---

## Related docs

| Doc | Role |
|-----|------|
| [`milestone-2-restore-intelligence.md`](./milestone-2-restore-intelligence.md) | M2 sequence |
| [`milestone-2-3-acceptance-report.md`](./milestone-2-3-acceptance-report.md) | Prior close; deferred UX → 2.4 |
| [`milestone-2-3-lens-differentiation-design.md`](./milestone-2-3-lens-differentiation-design.md) | Perspective without performance baseline |
| [`milestone-2-2-intelligence-correctness.md`](./milestone-2-2-intelligence-correctness.md) | Round 3 execution UX seed list |
| `artifacts/api-server/src/lib/atlasIdentity.ts` | Existing anti-ceremony identity (must not be contradicted) |
