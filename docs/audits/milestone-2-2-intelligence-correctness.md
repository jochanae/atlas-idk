# Milestone 2.2 — Workspace Intelligence Correctness

**Phase:** Evaluation audit (quality of understanding — **not** infrastructure)  
**Date:** 2026-07-22  
**Repo HEAD at commission:** `d0b923d1` (`main`, post PR #208)  
**Status:** **OPEN** — Round 1 closed out; next = **P1 Verify Flow → P2 Knowledge Classification → P3 Surface Integrity → Round 2**  
**Board:** [`milestone-2-restore-intelligence.md`](./milestone-2-restore-intelligence.md)  
**Prerequisite:** Milestone 2.1 deliverable contract landed (PR #208)

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
| **Flow** | `projects.nodeState` (strategic); `project_flow_canvas` (AM projection) | FLOW_NODE, hydrate, Forge, AM sync | Map → Designer / Builder / Storyteller |
| **Objects** | Same `entries` table, typed | Genome `objects[]` → often auto-committed | Blueprints → Objects |
| **Satellite** | Portfolio Master Map / Flow goal satellites | Portfolio orbit — weak turn-level understanding signal | `/map` or Flow satellites |
| **Ledger** | Full `entries` UI | Broader than Decisions (blockers, parked, etc.) | Ledger tab |

**Naming traps for evaluators:**

1. “Blueprint” may mean the **live Application Model panel** (2.2 target) or a **one-shot JSON snapshot** (`POST /blueprint`). Prefer the AM panel.  
2. **Insights panel** ≠ genome `Insight` objects on ObjectBoard.  
3. **Two Flow stores** — strategic `nodeState` vs AM `project_flow_canvas`.  
4. **Two lens systems** — workspace chat lenses (Flow/Build/Look/Scenario) vs Map UI lenses (Designer/Builder/Storyteller).

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
4. Flow (Designer, then Builder + Storyteller)  
5. Every relevant lens (chat lenses if used; Map lenses always)

### Five questions (always)

1. What did Atlas understand **correctly**?  
2. What did it **miss**?  
3. What did it **invent**?  
4. What was genuinely **helpful**?  
5. What would I **actually use**?

### Pass / fail shorthand

- **Pass:** Contents would convince a human Atlas tracked commitments and forks.  
- **Fail:** Populated but generic, duplicated, inventing, retaining abandoned ideas, or treating brainstorming as decision.

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

### Inspection path

Map → Designer (ground truth graph) → Generate/Hydrate only if empty → compare nodes to transcript pivots → Builder + Storyteller for same graph, different jobs.

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
| **Flow** | **NOT VERIFIED** |
| **Root issue** | **Classification**, not a crash — Ideas / Decisions / Insights / Questions / Engineering Events must be separated automatically |

**Next:** Follow **Round 1 Closeout** below — observation → correction → validation. Do **not** start Round 2 until P1–P3 complete.

---

## Round 1 Closeout — observation → correction → validation

Progress the board in this order only.

### P1. Verify Flow

| | |
|--|--|
| **Status** | **NOT VERIFIED** |
| **Mode** | Observation |
| **Goal** | Confirm Atlas is building a **reasoning graph**, not a conversation graph |

**Pass criteria:**

- Founding promise appears as a **root** concept  
- Principles **branch from** the promise  
- Questions **branch from** principles  
- No fabricated nodes  
- No duplicate concepts  

**Inspect:** Map → Designer on the Round 1 project. Score F1–F5 + S4.

---

### P2. Knowledge Classification

| | |
|--|--|
| **Status** | **FAIL — highest-priority correction** |
| **Mode** | Correction |
| **Goal** | First-class types + explicit promotion (see §0) |

**Implement / enforce:**

- Idea · Decision · Insight · Question · Engineering Event  
- Rule: no silent category drift — only **explicit promotion** (e.g. Idea → Decision)  

**Pass:** K1–K6 green on a re-inspect of the Round 1 project (and a short new turn that produces each type).

---

### P3. Surface Integrity

| | |
|--|--|
| **Status** | Blocked on P2 |
| **Mode** | Correction (wiring after types exist) |
| **Goal** | One responsibility per surface (see §0b) |

| Surface | Owns |
|---------|------|
| Blueprint | Stable project identity |
| Ledger | Decisions only |
| Insights | Synthesized observations |
| Flow | Relationships between concepts |
| Activity | Engineering events, syncs, builds, commits |

**Pass:** S1–S5 — no engineering leakage into Ledger; Insights not procedural state; Flow not a linear chat dump.

---

### Then — Round 2 (validation)

Only after P1–P3 are complete:

1. **Lock** the three architectural principles  
2. Test **abandonment** and recovery  
3. Test **reversal** (“we changed our mind”)  
4. Verify Atlas can **evolve** knowledge without corrupting prior commitments  

Re-score B4, D2–D3, K*, S* on that thread.

---

### Why this closeout matters

Earlier work made Atlas **talk**. Round 1 on PR #209 is the first time the product is judged on whether Atlas **knows what kind of knowledge it has learned** — the foundation for growing intelligently over months instead of accumulating an undifferentiated pile of notes.

---

## Recommended sequence

1. ~~Round 1 conversation + scorecard~~ — **closed out** (scores above).  
2. **P1** — Verify Flow / Designer (pass criteria in Closeout).  
3. **P2** — Knowledge Classification (K1–K6) — highest-priority fix.  
4. **P3** — Surface Integrity (S1–S5) once types exist.  
5. **Round 2** — lock principles → abandon → reversal → evolve without corruption.  
6. After 2.2 accuracy + classification bars, deepen lens differentiation under **2.3**.

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
| Lens differentiation called out | **Delivered** |
| Rich-conversation + five-question protocol | **Delivered** |
| Success metric recorded | **Delivered** |
| No application code changes in this commission | **Honored** |
