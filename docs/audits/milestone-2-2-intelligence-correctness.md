# Milestone 2.2 — Workspace Intelligence Correctness

**Phase:** Evaluation audit (quality of understanding — **not** infrastructure)  
**Date:** 2026-07-22  
**Repo HEAD at commission:** `d0b923d1` (`main`, post PR #208)  
**Status:** **CLOSED** — 2026-07-23  
**Closed by:** User confirmation that acceptance gates (K1–K6 / S1–S5 + post-redeploy execution smoke) passed. Live host `apiProcessStartedAt: 2026-07-23T21:59:52Z` (post-#217).  
**Checklist:** P1 Verify Flow ✅ · P2/P3 ✅ · Round 2 ✅ · R1 intelligence transfer ✅ · Round 3 reasoning ✅ STRONG PASS · Round 3 execution (#213–#217) ✅ · K1–K6 / S1–S5 ✅  
**Board:** [`milestone-2-restore-intelligence.md`](./milestone-2-restore-intelligence.md)  
**Prerequisite:** Milestone 2.1 deliverable contract landed (PR #208)  
**Next:** Milestone **2.3 — Lens Differentiation**

---

## Mindset shift

| Milestone | Question |
|-----------|----------|
| **1 — Unbroken Conversation** | Did the conversation *survive*? |
| **2.1 — Artifact Delivery** | If Atlas says it generated something, did the user *receive and open* it? |
| **2.2 — Intelligence Correctness** | Did Atlas actually *understand* the conversation? |

This phase validates the **quality of Atlas’s thinking** and whether each intelligence surface earns its place. It is **not** another infrastructure project.

**Success metric:**

> Atlas reliably extracts knowledge from the conversation in a way that is accurate, useful, and meaningfully different across its intelligence surfaces.

**Governing addition (Round 1 finding):**

> **Knowledge Classification:** Atlas must distinguish between Ideas, Decisions, Insights, Questions, and Engineering Events. A product architect shouldn't have to mentally separate those after the fact—the system should do it automatically.

**Fail condition:** Panels populate with generic, duplicated, invented, or abandoned content that would not convince a human Atlas tracked the conversation’s commitments and forks — or that forces the user to re-classify Ideas vs Decisions vs engineering noise by hand.

---

## Explicit non-goals

- SSE reliability, extraction fire-and-forget survival, auth, Cloud Run  
- Artifact generation/delivery (closed in 2.1)  
- Whether Ask Atlas should exist  
- Source-index / repo intelligence infrastructure  
- Redesigning Outputs, Master Map chrome, or panel layout for its own sake  

If a finding requires a small correctness fix to *pass an acceptance criterion*, that fix is in scope. “Make extraction more reliable at scale” is not.

---

## Architecture (inspection map)

Intelligence is captured mainly **after** workspace turns (fire-and-forget extractors), then projected into panels:

| Surface | Primary store | Population path | Inspect here |
|---------|---------------|-----------------|--------------|
| **Blueprint** | `application_models` + `project_dna` | Per-turn AM extraction (~5s UI refresh) | Right tab → Blueprint → Spec / Data / Soul |
| **Decisions** | `entries` (`type=Decision`) + decision artifacts | Nexus DECISION drafts, user commit, catch cards, genome objects | Ledger; Blueprint → Decisions |
| **Insights** | Composed `GET /intelligence` (+ genome DNA) | Client template briefing over DNA/health/entries — **not** a dedicated insight extractor | Insights tab |
| **Flow** | `projects.nodeState` (strategic); `project_flow_canvas` (AM projection) | FLOW_NODE, hydrate, Forge, AM sync | Flow Map / Designer — see P1 for how to open |
| **Objects** | Same `entries` table, typed | Genome `objects[]` → often auto-committed | Blueprints → Objects |
| **Satellite** | Portfolio Master Map / Flow goal satellites | Portfolio orbit — weak turn-level understanding signal | `/map` or Flow satellites |
| **Ledger** | Full `entries` UI | Broader than Decisions (blockers, parked, etc.) | Ledger tab |
| **Activity** | Intended home for engineering events | Sync/build/commit history | Activity / timeline (once Surface Integrity lands) |

**Naming traps for evaluators:**

1. “Blueprint” may mean the **live Application Model panel** (2.2 target) or a **one-shot JSON snapshot** (`POST /blueprint`). Prefer the AM panel.  
2. **Insights panel** ≠ genome `Insight` objects on ObjectBoard.  
3. **Two Flow stores** — strategic `nodeState` vs AM `project_flow_canvas`.  
4. **Two lens systems** — workspace chat lenses (Flow/Build/Look/Scenario) vs Map UI lenses (Designer/Builder/Storyteller).  
5. On desktop, the Flow tab is currently **hidden** from the right rail even though the panel mounts when selected.

---

## Evaluation protocol

### Setup

Use **rich** conversations — the same kind already used for Atlas / Reveal work — not tiny prompts.

Aim for a thread that includes:

- Explicit goals and constraints  
- At least one **abandoned** idea  
- At least one **committed** decision  
- At least one **reversal** (“we changed our minds”)  
- A **topic pivot** or parallel branch  

After substantive turns, wait ~5–10s for fire-and-forget extraction before inspecting panels.

### After each conversation — inspect

1. Blueprint (Spec / Data / Soul)  
2. Decisions / Ledger  
3. Insights  
4. Flow (Designer, then Builder + Storyteller) — open via `?view=flow` or Insights if the tab is hidden  
5. Knowledge Classification across those surfaces  
6. Every relevant lens (chat lenses if used; Map lenses always)

### Five questions (always)

1. What did Atlas understand **correctly**?  
2. What did it **miss**?  
3. What did it **invent**?  
4. What was genuinely **helpful**?  
5. What would I **actually use**?

### Pass / fail shorthand

- **Pass:** Contents would convince a human Atlas tracked commitments and forks.  
- **Fail:** Populated but generic, duplicated, inventing, retaining abandoned ideas, treating brainstorming as decision, or mixing engineering events into product knowledge.

---

## 0. Knowledge Classification (cross-cutting)

**Question:** Does Atlas put each piece of knowledge in the right bucket — or does the user have to untangle Ideas, Decisions, and engineering noise after the fact?

Round 1 showed the biggest gap is **not a crash** — it is **classification**. Atlas currently mixes kinds of knowledge into overlapping surfaces (especially Ledger / Objects).

### First-class knowledge types

| Type | Meaning | Example from Round 1 |
|------|---------|----------------------|
| **Idea** | Hypothesis, concept, emerging principle | Continuity is the product; Ask Atlas is the on-ramp; momentum must transfer, not restart |
| **Decision** | Explicitly committed | Artifact persistence is required; automatic promotion when work becomes consequential |
| **Insight** | Synthesized understanding not directly stated | Ask Atlas ↔ Workspace boundary depends on **persistence**, not capability |
| **Question** | Unresolved architectural uncertainty | What problem does Ask Atlas solve for whom? |
| **Engineering Event** | Implementation / build activity — not product knowledge | “Tier 1 field updated”; Blueprint regenerated; Manifest synced |

**Promotion rule:** A single object must not drift between categories unless **explicitly promoted** (e.g. an Idea later becomes a Decision). Silent reclassification is a fail.

### Acceptance criteria

| # | Criterion | Pass if… |
|---|-----------|----------|
| K1 | Ideas stay ideas | Explored principles are not auto-committed as Decisions |
| K2 | Decisions are commitments only | Ledger Decisions are things the user (or an explicit commit path) actually locked |
| K3 | Insights are synthesized | Insights elevate a non-obvious pattern — not stage/status procedure |
| K4 | Questions remain open | Unresolved framing is not written as settled truth in Spec/Ledger |
| K5 | Engineering events stay out of product knowledge | Activity like “Tier 1 field updated” lives in **Activity** — **not** the architectural Ledger |
| K6 | Promotion is explicit | Category changes only via an explicit promote path (Idea → Decision, etc.) |

**Product bar:** A product architect should not have to mentally separate these after the fact — the system should do it automatically. Until K1–K6 pass, Atlas feels like a sophisticated note-taker rather than an architectural partner.

---

## 0b. Surface Integrity (after classification)

Once knowledge types exist, each surface owns **one** responsibility — no leakage:

| Surface | Owns |
|---------|------|
| **Blueprint** | Stable project identity (Purpose, Identity, Audience, Manifest, Vision) |
| **Ledger** | **Decisions only** |
| **Insights** | Synthesized observations |
| **Flow** | Relationships between concepts |
| **Activity** | Engineering events, syncs, builds, commits |

This removes Round 1’s leakage where implementation details appeared alongside architectural knowledge.

### Acceptance criteria

| # | Criterion | Pass if… |
|---|-----------|----------|
| S1 | Blueprint = identity | Spec/Soul hold stable product identity — not activity logs |
| S2 | Ledger = Decisions only | No Engineering Events in Ledger |
| S3 | Insights = synthesis | No pure stage/procedure Mad Libs as Insights |
| S4 | Flow = relationships | Graph connects concepts — not a linear chat transcript |
| S5 | Activity = engineering | Tier-1 updates / syncs / builds land here, not in Ledger |

---

## 1. Blueprint

**Question:** Did Atlas extract the actual plan?

### Acceptance criteria

| # | Criterion | Pass if… |
|---|-----------|----------|
| B1 | Goals, not topics | Spec shows outcomes/constraints/purpose as commitments — not a topic tag cloud |
| B2 | Dependencies | Data/structure reflects real relationships (pages, entities, edges that match the plan) |
| B3 | Evolves with conversation | Later turns update Spec/Data meaningfully within ~10s |
| B4 | No abandoned ideas | Dropped directions do **not** linger as if still in plan |
| B5 | Catches new commitments | Newly decided direction appears in Spec/Data (or is clearly reflected via Ledger bridge) — not only in chat |

### Known quality risks (code evidence)

- AM merge is largely **accumulate-only** — arrays append / Set-union; weak delete path for abandoned ideas (`applicationModelExtraction` merge behavior).  
- Extractor does not treat “we decided X” as first-class Decision; may miss commitments unless Ledger/genome bridge catches them.  
- Relationship → flow sync can miswire edges.

### Inspection path

Right Blueprint → **Spec** (purpose, outcomes, constraints) → **Data** / pages → **Soul** (principles). Compare to transcript after an abandon + a commit.

---

## 2. Decisions

**Question:** Did Atlas remember what was actually decided?

### Acceptance criteria

| # | Criterion | Pass if… |
|---|-----------|----------|
| D1 | Explicit decisions | Ledger records clear commitments from the thread |
| D2 | Not brainstorming | Exploratory options are not committed as decisions |
| D3 | Records reversals | “We changed our minds” shows as deviation / SHIFTED / supersede — not a silent overwrite |
| D4 | No duplicates | Same commitment is not listed multiple times |
| D5 | Chronological | Order matches when decisions were made |

### Known quality risks

- Phrase/heuristic DECISION surface can false-positive.  
- Genome can auto-commit typed Decision **objects** without user confirm.  
- Resolved Flow nodes may create generic `"{nodeId} — decided"` entries.  
- Reversal catch needs prior committed + embedding overlap — may miss soft reversals.  
- Title-only dedupe → near-duplicates survive.

### Inspection path

Ledger tab (committed vs parked) → SHIFTED / override badges → Blueprint → Decisions for structured artifacts → Objects filtered to Decision.

---

## 3. Insights

**Question:** Did Atlas contribute something useful?

An insight is **not** a summary and **not** a restatement. It should make you think: *“I hadn’t noticed that.”*

### Acceptance criteria

| # | Criterion | Pass if… |
|---|-----------|----------|
| I1 | Not summary/restatement | Briefing is not Mad Libs over stage/momentum/decision-count |
| I2 | Finds patterns | Surfaces a non-obvious pattern from *this* conversation |
| I3 | Connects related work | Links threads, prior decisions, or constraints usefully |
| I4 | Identifies risks | Names a real risk grounded in the chat |
| I5 | Suggests opportunities | Names a real opportunity grounded in the chat |
| I6 | Avoids generic | DNA wedge/differentiator (and briefing) sound specific to this project |

### Known quality risks

- Insights **panel** is largely a **composed template** over DNA + health + entries — no dedicated “novel insight” extractor.  
- Cross-conversation synthesis for the panel is weak.  
- Genome `Insight` objects are a separate channel — do not score the panel by ObjectBoard alone.

### Inspection path

Insights tab Atlas Summary → ask whether any line is non-obvious → compare DNA fields to chat specificity.

---

## 4. Flow

**Question:** Does this represent how the conversation actually unfolded — as a **reasoning graph**, not a conversation transcript?

### Acceptance criteria

| # | Criterion | Pass if… |
|---|-----------|----------|
| F1 | Major branches / root promise | Founding promise appears as a **root** concept |
| F2 | Principles branch from promise | Principles are children of the promise — not a flat list |
| F3 | Questions branch from principles | Open uncertainties hang off the right parents |
| F4 | No invented / duplicate nodes | No fabricated satellites; no duplicate concepts |
| F5 | Timeline / structure feels accurate | Graph reflects real forks — not a linear chat dump |

### Known quality risks

- Hydrate with thin/no history can still invent “plausible” satellites.  
- FLOW_NODE ids are timestamped → duplicate concepts across turns.  
- Storyteller chapters are **status** narrative, not a true chronological timeline.  
- Confirm whether you are on strategic `nodeState` Map vs AM canvas projection.  
- **Desktop discoverability:** Flow tab is filtered out of the right rail; open via `?view=flow` or Insights.

### Inspection path

Open Flow via `?view=flow` or Insights → Open the Flow Map → Designer. Then Builder + Storyteller for the same graph.

---

## 5. Lens quality

**Question:** What unique perspective does this lens provide that another does not?

Spend the most evaluation time here. If two lenses produce nearly identical responses with different headings, they need more differentiation (feeds Milestone **2.3**).

### Workspace chat lenses

| Lens | Must uniquely own |
|------|-------------------|
| **Flow** (think-through) | Exploration, implications, clarifying questions — not code writes |
| **Build** | Implementation, sequencing, file edits when building |
| **Look** | UX, layout, interaction, visual tokens |
| **Scenario** | Speculative what-if; **no** commitment / memory side effects |

### Flow Map lenses (same `nodeState`, different jobs)

| Lens | Must uniquely own |
|------|-------------------|
| **Designer** | Spatial experience / graph layout |
| **Builder** | Type-grouped implementation schema (“what to build next”) |
| **Storyteller** | Narrative chapters (why this exists) — not a restyled Builder list |

### Acceptance criteria

| # | Criterion | Pass if… |
|---|-----------|----------|
| L1 | Distinct job | Each lens answers a different question |
| L2 | Distinct output | Content/structure differs — not the same prose with a new title |
| L3 | Useful alone | You would pick that lens on purpose for a real task |

### Inspection path

Same rich question under Flow vs Build vs Look (chat). Same project Map under Designer / Builder / Storyteller. Score L1–L3.

---

## Objects, Satellite, Ledger (secondary)

Evaluate only insofar as they affect understanding:

| Surface | 2.2 relevance |
|---------|----------------|
| **Objects** | Watch for brainstorm auto-committed as Decision/Goal noise |
| **Satellite** | Portfolio navigation — low weight for turn understanding |
| **Ledger** | Primary home for Decisions criteria; also check non-decision clutter |
| **Activity** | Intended home for Engineering Events once Surface Integrity lands |

---

## Scorecard template (per conversation)

Copy per evaluation run:

```text
Project / conversation:
Date:
Evaluator:

Knowledge:  K1_ K2_ K3_ K4_ K5_ K6_   Notes:
Surfaces:   S1_ S2_ S3_ S4_ S5_   Notes:
Blueprint:  B1_ B2_ B3_ B4_ B5_   Notes:
Decisions:  D1_ D2_ D3_ D4_ D5_   Notes:
Insights:   I1_ I2_ I3_ I4_ I5_ I6_   Notes:
Flow:       F1_ F2_ F3_ F4_ F5_   Notes:
Lenses:     L1_ L2_ L3_   Notes:

Five questions:
1. Understood correctly:
2. Missed:
3. Invented:
4. Genuinely helpful:
5. Would actually use:

Overall 2.2 (this run): Pass / Fail / Mixed
```

Mark `_` as `P` / `F` / `N` (n/a).

---

## Round 1 — Founding principles conversation (2026-07-22)

**Why this is a good first test:** It is not a crash/UI check. It asks whether Atlas extracts the *right* knowledge from a strategic founding dialogue — exactly the 2.2 question.

### Transcript ground truth (what was actually said)

| Turn | Content |
|------|---------|
| User | Wants to think through the future of Atlas |
| Atlas | Challenges nested/circular framing — defining Ask Atlas’s job before locking the problem/for-whom |
| User | **Founding statement:** built Atlas to stop starting over on complex ideas; wants AI that stays across days/weeks/months — remembering decisions, tracking progress, challenging thinking, idea → real without losing context. Not just conversations: **continuity, momentum, and execution** |
| Atlas | Treats that as the clearest founding statement; says it resolves foundational (not all) questions |
| User | Asks for **three product principles that must never be violated**, plus which current feature/assumption is **most at risk** of violating them |
| Atlas | Begins answering from what the user *actually* told it — not a product doc |

### Knowledge Atlas should now hold (evaluation targets)

| Kind | Expected capture |
|------|------------------|
| **Goal / purpose** | Continuity + momentum + execution over multi-session complex work — not “better answers” |
| **Founding constraint** | Must not lose context as projects evolve |
| **Anti-goal** | One-shot Q&A / start-over chatbots |
| **Open decision (in progress)** | Three non-negotiable product principles (user asked; Atlas answering) |
| **Risk prompt** | Which current feature/assumption most threatens those principles |
| **Meta challenge (Atlas→user)** | Don’t define Ask Atlas’s job before the problem/for-whom is locked |

Round 1 is **incomplete** for full B4/D3 coverage (no abandoned idea or explicit reversal yet) — that is fine. Score what *is* present; extend the thread for abandon + reversal in Round 2.

### Inspection checklist (completed)

1. **Blueprint → Spec / Soul** — ✅ Purpose, Audience, Identity, Wedge, Manifest converge on **continuity across time** (goals, not topics).  
2. **Ledger** — ⚠️ Architectural commitments present (“Artifact persistence model required”) **and** engineering noise (“Tier 1 field updated”) in the same bucket.  
3. **Insights** — ⚠️ Better than before, still procedural (“Shape phase”, “Answer this next”); missing the real insight: Ask Atlas ↔ Workspace boundary depends on **persistence**, not capability.  
4. **Flow / Designer** — ❌ Not in screenshots — still needs verification.  
5. **Knowledge classification** — ❌ Ideas / Decisions / Engineering Events mixed (see §0).

### Five questions — Round 1 (scored)

1. **Understood correctly:** Continuity across time as core promise; Spec/Soul converged on it.  
2. **Missed:** Persistence-vs-capability boundary as a first-class Insight; clean separation of knowledge kinds.  
3. **Invented / polluted:** Engineering events (“Tier 1 field updated”) treated as Ledger product knowledge.  
4. **Genuinely helpful:** Blueprint no longer a conversation summary — architectural Spec forming.  
5. **Would actually use:** Spec/Soul yes; Ledger only after engineering noise is removed; Insights not yet.

### Scorecard — Round 1 (filled)

| Surface | Result | Notes |
|---------|--------|-------|
| **Blueprint (Spec / Soul)** | **PASS** | Not a conversation summary. Purpose, Audience, Identity, Wedge, Manifest converge on continuity across time. |
| **Ledger** | **PARTIAL PASS** | Good architectural commitments (“Artifact persistence model required”); also committed implementation noise (“Tier 1 field updated”) — belongs in engineering history, not the architectural ledger. |
| **Insights** | **PARTIAL PASS** | Still too procedural (project state / “Shape phase” / “Answer this next”). Real insight — Ask Atlas ↔ Workspace boundary depends on **persistence**, not capability — not elevated. |
| **Flow / Designer** | **NOT VERIFIED** | No Designer/Flow graph in screenshots. Cannot tell reasoning graph vs linear conversation. |
| **Knowledge Classification** | **FAIL (cross-cutting)** | Ideas, Decisions, and Engineering Events mixed in one bucket. |

```text
Project / conversation: Atlas future / founding principles
Date: 2026-07-22
Evaluator: Jo (screenshot review)

Blueprint:  B1P B2N B3P B4N B5P   Notes: Continuity converged across Spec/Soul fields.
Decisions:  D1P D2F D3N D4_ D5_   Notes: Real commits present; engineering events violate D2/K5.
Insights:   I1F I2F I3N I4F I5_ I6_   Notes: Procedural state ≠ synthesis; persistence-boundary insight missing.
Flow:       F1_ F2_ F3N F4_ F5_   Notes: NOT VERIFIED — open Designer next.
Lenses:     L1N L2N L3N   Notes: Deferred.
Knowledge:  K1_ K2F K3F K4_ K5F   Notes: Classification is the primary Round 1 finding.

Overall 2.2 (this run): Mixed — Blueprint strong; Ledger/Insights partial; Flow unverified; Classification fail
```

### Round 1 verdict

| Layer | Result |
|-------|--------|
| **In-chat intelligence** | Strong |
| **Blueprint extraction** | **PASS** — better shape than the agent checklist expected |
| **Ledger** | **PARTIAL** — right architecture mixed with engineering history |
| **Insights** | **PARTIAL** — procedural, missing the persistence-boundary insight |
| **Flow** | **PASS** (Round 2) — see validation report |
| **Root issue** | **Classification**, not a crash — Ideas / Decisions / Insights / Questions / Engineering Events must be separated automatically |

**Next:** ~~Observe / validate~~ → **implement P2 + P3** → one final regression pass to close 2.2.

---

## Round 2 Validation Report (2026-07-22)

**Objective:** Validate whether Atlas can handle an architectural reversal inside a live Workspace conversation and propagate change across project intelligence surfaces — and complete P1 Flow verification.

### Scenario

Challenged an existing architectural assumption:

> Ask Atlas should not always be the on-ramp. A user who already knows they're starting a long-term project should be able to begin directly in a Workspace.

Atlas did **not** simply agree. It challenged the proposal, explored architectural consequences, identified that this changes the Ask Atlas ↔ Workspace distinction, proposed a cleaner model based on **commitment and persistence** rather than workflow, and raised a new unresolved UX question: “Where should a new user start?”

### Findings

| Area | Result | Notes |
|------|--------|-------|
| **Conversation intelligence** | **PASS** | Reasoned through implications instead of agreeing; architectural thinking |
| **Knowledge evolution** | **PASS** | Evolved the architecture rather than replacing it; preserved prior context |
| **Flow (Axiom Flow)** | **PASS** | Real Workspace surface; verified via Insights → Open Flow, Map, Designer / Builder / Storyteller. Graph centered on: Atlas stays with you; Ask Atlas owns on-ramp; Workspace owns committed work; Promotion; Artifact persistence; Product principles; Active risks. No fabricated concepts. Possible duplicate: “Three non-negotiable product principles” appears twice in Builder |
| **Storyteller** | **PASS** | Coherent architectural narrative — not a chat summary |
| **Builder** | **PASS** | Organized into requirements / decisions / priorities / blockers — execution spec, not another chat |
| **Blueprint** | **PASS** | Validated (Round 1 + Round 2 continuity) |
| **Ledger** | **PASS (with issue)** | Architectural decisions present; engineering events still mixed in |
| **Insights** | **PASS (with issue)** | Present; still too procedural — needs stronger synthesized insights |
| **Architectural reversal** | **PASS** | Challenged change, reasoned consequences, proposed alternative, preserved context |
| **Knowledge Classification** | **FAIL** | Objects still need stronger Idea / Decision / Insight / Question / Engineering Event separation; promotion must be explicit |
| **Surface Integrity** | **PARTIAL** | Flow functions correctly; desktop discoverability still weak (hidden from normal Workspace tabs) |

### Important architectural discovery (not committed)

This conversation produced a new **hypothesis** (still an Idea / architectural discussion — do **not** treat as Decision until explicitly accepted):

| Current model | Possible improved model |
|---------------|-------------------------|
| Ask Atlas → Workspace | Temporary conversational memory → Persistent project memory |

### Recommendation

Stop creating new evaluation tests. Remaining 2.2 work is **implementation**, not exploration:

1. **Knowledge Classification** (P2)  
2. **Surface Integrity** (P3)  
3. **Desktop discoverability of Flow** (product chrome under Surface Integrity, if accepted)

After those land: **one final regression pass** to close Milestone 2.2.

---

## Closeout checklist (current)

| Step | Mode | Status |
|------|------|--------|
| **P1** Verify Flow | Observation | ✅ **PASS** |
| **Round 2** validation | Validation | ✅ **COMPLETE** |
| **P2** Knowledge Classification | Correction / implementation | ✅ **Implemented** — awaiting regression |
| **P3** Surface Integrity | Correction / implementation | ✅ **Implemented** (incl. desktop Flow tab) — awaiting regression |
| Final regression | Validation | ✅ **CLOSED** — acceptance gates passed (2026-07-23); deferred UX carried to 2.3 |

### Final regression — Scenario R1 (2026-07-22)

**Ask Atlas → Workspace Continuity (CommunityBridge)**

| Check | Result | Notes |
|-------|--------|-------|
| Discovery conversation | ✅ PASS | Six foundational dimensions locked; architectural quality strong |
| Handoff (project create + Open Workspace) | ⚠️ PARTIAL | Project created; chat continued in Workspace (session 312) |
| Knowledge → Insights DNA | ❌ FAIL | Purpose/Audience/Wedge/Stack all “Not captured yet” |
| Knowledge → Objects | ❌ FAIL | 0 objects |
| Knowledge → Ledger | ❌ FAIL (expected under P3 until seed) | Empty Activity — committed Decisions only by design |
| Outputs | N/A | Empty is fine for exploratory discovery (no deliverable) |
| Progress | 3% | Consistent with empty DNA + no committed entries |

**Root cause (code):** Handoff preserved **transcript + Resume** only. Canonical Open Workspace path (`handleHandoff` → `append-thread`) did **not** flush Tier1 → DNA, did **not** run genome extraction, and Nexus Workspace never called AM extract. Continuity ≠ intelligence projection.

**Fix:** `seedIntelligenceAfterHandoff` on `append-thread`, `create_project`, and `/nexus/handoff` — Tier1 flush + DNA seed + forced genome extraction. Client now passes Ask Atlas `conversationId` into `append-thread`.

**Re-test after deploy:** Open Workspace from a rich Ask Atlas thread → within ~10s Insights DNA and Objects should populate. Ledger stays Decisions-only (P3) until explicit commits.

### Final regression — Workspace response replacement (2026-07-22, post #210)

**Separate from handoff seed.** Observed on Workspace DECIDE turn (Aura Focus Timer):

1. Atlas streamed a correct discovery conclusion (“foundation locked”).
2. That content vanished from live chat.
3. Persisted/exported assistant message became the deliverable honesty fallback:  
   `I haven't generated a downloadable file in this turn yet…` with claim excerpt `"open it"`.
4. DNA/Objects stayed empty afterward; Changes timeline still showed the turn.

**Root cause:** `deliverableOutputGuard` treated bare `\bopen it\b` as a false file-generation claim and emitted SSE `correction`, replacing the entire streamed discovery response. No file was requested.

**Fix (#211):** tighten patterns — remove bare `open it`.  
**Follow-up (PulseDesk):** #211 alone was insufficient while envs lagged / residual matches remained. Harden: **full response replace only when `generate_deliverable` was actually invoked this turn.** Otherwise keep original prose. Also suppress BUILD READY cards whose summary is the honesty-fallback text.

**Implication for R1:** Do not score DNA/Objects FAIL from a run whose assistant turn was corrupted by this guard. Re-run R1 only after this harden lands on the testing host (confirm `apiProcessStartedAt` is post-merge).

### P1 — Verify Flow (PASS)

Confirmed:

- Flow exists as a real Workspace surface (`FlowPanel` / `AxiomFlow`)  
- Reads `projects.nodeState`  
- Designer, Builder, and Storyteller use the same project knowledge  
- Graph reflects the Workspace conversation (founding promise, on-ramp, committed work, promotion, persistence, principles, risks)  
- No fabricated concepts observed  
- One possible duplicate in Builder (“Three non-negotiable product principles”)  

**Discoverability note (not a P1 fail):** On desktop, Flow remains filtered from the right-rail tab bar; access via Insights → Open Flow / Map / `?view=flow`. Fix under P3 if product wants it in the normal tab strip.

### P2 — Knowledge Classification (implemented)

| | |
|--|--|
| **Status** | ✅ Implemented — awaiting regression |
| **Goal** | First-class types + explicit promotion (see §0) |

Landed:

- Schema: `Question`, `EngineeringEvent` on `object_type`  
- Writers retargeted: Tier-1 / capacity / verify / artifact / repo-scan / flow-resolve → `EngineeringEvent`  
- Genome extract: Decisions & Questions park (no silent Decision commit); receipt auto-promote removed  
- Explicit promote: `POST /entries/:id/promote` + ObjectBoard / ParkingLot affordances  
- PATCH strips silent `type` drift  

### P3 — Surface Integrity (implemented)

| | |
|--|--|
| **Status** | ✅ Implemented — awaiting regression |
| **Goal** | One responsibility per surface (see §0b) + desktop Flow discoverability |

| Surface | Owns | Change |
|---------|------|--------|
| Blueprint | Stable project identity | unchanged contract |
| Ledger | Decisions only | state + LedgerPanel + ledger page filter `type === Decision` |
| Insights | Synthesized observations | briefing prefers purpose/wedge/differentiator/Insight objects |
| Flow | Relationships between concepts | unchanged; desktop tab restored |
| Activity | Engineering events | activity feed labels `engineering_event` separately |

Desktop Flow tab: right-rail no longer filters out `map`.

---

## Recommended sequence

1. ~~Round 1 conversation + scorecard~~ — done.  
2. ~~P1 Verify Flow~~ — **PASS**.  
3. ~~Round 2 validation (reversal + lens surfaces)~~ — **COMPLETE**.  
4. ~~Implement P2~~ — Knowledge Classification (K1–K6).  
5. ~~Implement P3~~ — Surface Integrity (S1–S5) + desktop Flow discoverability.  
6. ~~**Final regression**~~ — ✅ CLOSED 2026-07-23 (gates passed; live post-#217).  
7. **Next:** Milestone **2.3 — Lens Differentiation**.

---

## Closeout — **2.2 CLOSED** (2026-07-23)

Governing close rule (parent board): **one user regression pass against K1–K6 and S1–S5** closes 2.2 — **met**.

Live host at close: `apiProcessStartedAt: 2026-07-23T21:59:52Z` (after #217 / `51acaf50`).

### Delivered

| Item | Evidence |
|------|----------|
| P1 Flow | Round 2 PASS — Designer / Builder / Storyteller share project knowledge |
| Round 2 architectural reversal | PASS |
| Blueprint / conversation intelligence | Round 1–2 PASS; Round 3 Ask Atlas reasoning **STRONG PASS** |
| P2 Knowledge Classification | Implemented + acceptance gates passed (K1–K6) |
| P3 Surface Integrity | Implemented + acceptance gates passed (S1–S5) |
| R1 handoff intelligence seed | #210; DNA / Objects / Decisions / Builder / Story / Map populated |
| Remount recovery | #213 |
| Deliverable honesty / export / dupe collapse | #215 |
| Product-brief → generate_deliverable | #214 |
| PDF/DOCX dark-page theme | #216 |
| Global Files mobile detail | #217 |

### Deferred from 2.2 → carry forward

| Item | Target |
|------|--------|
| Resume-after-refresh as toast/card (not transcript “Welcome back…”) | UX / 2.4 adjacency |
| Resend / interrupt idempotency | Continuity polish |
| Quieter multi-format renderer fallback UX | Deliverable craft |
| Living Product Strategy Brief section structure | 2.4 / deliverable craft |
| “Preserved / full context” truthfulness copy | Honesty copy |
| Soft “Continue in Workspace” with brief + next task | Transfer experience |
| Workspace kickoff “What’s first?” after promised generation | Transfer experience |
| **Same question → three different perspectives** (Designer / Builder / Storyteller) | **Milestone 2.3 (primary)** |

---

## Round 3 — Ask Atlas reasoning (no handoff) (2026-07-23)

**Scenario:** Long founding conversation for a women’s financial-decision community → Product Strategy Brief. Entirely on Ask Atlas.

### Verdict

| Layer | Result |
|-------|--------|
| **Reasoning / intelligence** | **STRONG PASS** — sustained challenge, framework development, moat analysis, coherent brief synthesis |
| **Execution layer** | **FAIL / MIXED** — false artifact-ready claim, renderer failure, export mojibake, duplicate stream tail, resume UX, persistence overclaim |

**Governing split:** Atlas’s *thinking* succeeded; its *execution* (artifact verification, export, persistence truthfulness, refresh recovery, handoff action) did not fully succeed. Do not commission another long reasoning test to close 2.2 — concentrate on execution defects below.

### Improvements to record

| # | Issue | Severity | Disposition |
|---|-------|----------|-------------|
| 1 | Duplicate closing question streamed twice | Bug | Fix: `collapseRepeatedTail` on finishStream |
| 2 | Resume-after-refresh as inline “Welcome back…” message | UX | Recorded — Conversation Resume UX (toast/card, not transcript); not blocking intelligence close |
| 3 | Export mojibake (`Iâ€™m`, `â€”`) | Bug | Fix: UTF-8 BOM on Ask Atlas thread download |
| 4 | Duplicate user message after server interrupt / resend | Bug | Recorded — submission idempotency / continue pending run (continuityV2 key exists; resent mints new id) |
| 5 | False “strategy brief is ready — download from the card” before artifact | **Critical** | Fix: deliverable guard strips readiness claims even when tool not attempted; prompt hard rule |
| 6 | Visible multi-format renderer struggle | UX | Recorded — internal format fallbacks; one concise recovery message |
| 7 | Inline brief fallback after renderer fail | **Keep** | Protect — never lose work when file export fails |
| 8 | Brief strong but essay-like | Product | Recorded — living Product Strategy Brief sections (decisions / assumptions / risks / next decision) |
| 9 | “Preserved / full context next time” overclaim | Truthfulness | Recorded — distinguish thread retention vs artifact vs Workspace memory |
| 10 | Workspace offered but not a verified handoff action | UX | Recorded — contextual “Continue in Workspace” with brief + next task |

### Closeout implication

Reasoning bar for this conversation is met. Remaining 2.2 concentration: **output verification, artifact rendering, persistence truthfulness, refresh recovery, seamless handoff** — not more philosophy tests.

---

## Regression note — “Generating the brief” → empty Outputs (2026-07-23)

**User finding (post-redeploy handoff):** Intelligence transfer largely worked (DNA, Objects, Decisions, Builder, Story, Map populated). UX of transfer felt abrupt. Functional gap: Atlas said “Generating the brief now” but Workspace Outputs was empty.

**Root cause (code):** Choosing “build the full product brief” matched `EXPLICIT_CREATE_SIGNALS` (`"build the "`) but **not** `isDeliverableOnlyRequest` (no brief/document synonym). That forced `create_project` then continued with `tools: false` — so `generate_deliverable` never ran. Progressive prose (“Generating…”) is not honesty-guarded. Secondary: even successful Ask Atlas files land in Atlas Files bucket and are not reparented on Open Workspace.

**Separate UX (not this fix):** Workspace kickoff still asks “What’s first?” after handoff; user expected continuity (“I'm continuing the Product Brief…”). Track as transfer-experience work after 2.2, not as intelligence failure.

**Fix:** Treat product brief / one-pager / executive summary as deliverable-only so forceCreate does not fire.

---

## Regression note — Ask Atlas stream lost on remount (2026-07-23)

**Symptom:** During/after Ask Atlas streaming, soft remount or refresh dropped the assistant turn and injected `Welcome back. Picking up where we left off…`.

**Cause:** Streamed content lived only in React state until `finishStream` persisted; restore always rehydrated from `/api/nexus/thread` (often missing the in-flight assistant) and appended a synthetic greeting.

**Fix (PR on `cursor/ask-atlas-stream-remount-recovery-df4c`):**
- Client `askAtlasThreadMemory` (module + sessionStorage) snapshots the live transcript
- Restore merges memory with `/thread`; skips welcome-back when recovering / awaiting assistant
- Polls `/thread` after remount until the durable assistant lands
- `beforeunload` warning while Ask Atlas is generating
- Server: on client abort after tokens, continue generation for durable persist; `finishStream` idempotent; no throw on closed SSE after DB write

**Retest:** Redeploy, then remount/refresh mid-stream and immediately after stream completes — original assistant text must return, not a welcome-back prompt.

---

## Related docs

| Doc | Role |
|-----|------|
| [`milestone-2-restore-intelligence.md`](./milestone-2-restore-intelligence.md) | Milestone sequence |
| [`milestone-2-1-artifact-generation-delivery-audit.md`](./milestone-2-1-artifact-generation-delivery-audit.md) | Closed deliverable contract |
| `.agents/memory/application-model-2b.md` | AM extraction + projections |
| `.agents/memory/axiom-flow-vision.md` | Flow product intent |
| `.agents/memory/flow-lens-architecture.md` | Map lens jobs |
| `.agents/memory/builder-lens-identity.md` | Builder Map contract |
| `.agents/memory/decision-intelligence-artifacts.md` | Decision artifact types |
| `.agents/memory/global-insights-absorbed.md` | Insights panel ≠ Global Insights |

---

## Phase constraints checklist

| Constraint | Status |
|------------|--------|
| Quality-of-understanding mindset (not infrastructure) | **Honored** |
| Independent surface evaluation + acceptance criteria | **Delivered** |
| Knowledge Classification criteria | **Delivered** |
| Surface Integrity ownership map | **Delivered** |
| Lens differentiation called out | **Delivered** |
| Rich-conversation + five-question protocol | **Delivered** |
| Success metric recorded | **Delivered** |
| No application code changes in this commission | **Honored** |
