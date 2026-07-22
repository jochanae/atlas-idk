# Milestone 2.2 — Workspace Intelligence Correctness

**Phase:** Evaluation audit (quality of understanding — **not** infrastructure)  
**Date:** 2026-07-22  
**Repo HEAD at commission:** `d0b923d1` (`main`, post PR #208)  
**Status:** **OPEN** — evaluation board commissioned  
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

**Fail condition:** Panels populate with generic, duplicated, invented, or abandoned content that would not convince a human Atlas tracked the conversation’s commitments and forks.

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

**Question:** Does this represent how the conversation actually unfolded?

### Acceptance criteria

| # | Criterion | Pass if… |
|---|-----------|----------|
| F1 | Major branches | Real forks in the conversation appear as nodes/edges |
| F2 | Topic pivots shown | Direction changes are visible |
| F3 | Parallel work separated | Concurrent threads are not collapsed into one false spine |
| F4 | No invented branches | Nodes are grounded in discussion — not plausible fiction |
| F5 | Timeline feels accurate | Discovery order / status narrative matches the chat well enough to trust |

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

## Recommended sequence

1. Run **one** rich Atlas/Reveal-style conversation end-to-end with the scorecard.  
2. Log failures against criteria (B4 abandoned retention, I1 template Insights, F4 hydrate invention, L2 lens sameness are the highest-likelihood fails from code review).  
3. Only then prioritize **targeted** correctness fixes for failed criteria — not a platform rewrite.  
4. After surfaces pass accuracy/usefulness bars, deepen lens differentiation under **2.3**.

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
