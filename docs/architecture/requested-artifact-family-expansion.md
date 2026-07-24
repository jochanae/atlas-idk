# Requested-Artifact Family — Expansion (not Plan restore gaps)

> Product architecture. Complements `requested-artifacts.md` and the Plan → Plan Card restore.
> Date: 2026-07-24.
>
> **Classification rule:** Anything below that is *not* required for “Tap Plan → Plan Card → Review/Approve/Revise/Skip” is a **new capability**, not unfinished Plan restore.

---

## What Plan restore already closed

The Plan → Plan Card contract is a **requested-artifact** pipeline:

```
Tap Plan → requestedArtifact:"plan" → converse → Plan Card → Review / Approve / Revise / Skip
```

Approve today has a **real** destination: re-submit an execute turn on Nexus (+ Plan Card persisted on emission). That completes the restore.

---

## What is *not* a Plan gap

These were easy to mislabel as “remaining gaps.” They are **expansion**:

| Idea | Why it’s expansion |
|------|--------------------|
| Flow consumes approved Plan Cards | New consume surface — Flow becomes a Plan Card *destination* |
| Tasks consume approved Plan Cards | New consume surface — Tasks/Parking become a destination |
| Decide composer button | New requested-artifact affordance |
| Research composer button | New requested-artifact affordance |
| Compare composer button | New requested-artifact affordance |
| Timeline composer button | New requested-artifact affordance |

Same family as Plan. Different products. Do not block calling Plan “restored” on their absence.

---

## Shared contract (one philosophy, many instances)

Every composer artifact request answers:

> When we’re done, leave me with **this** reviewable deliverable.

Orthogonal to:

1. **Posture** — Conversation / Build / WhisperGate  
2. **Intent** — what the user asked in natural language  

```
Composer action
  → requestedArtifact: "<kind>"
  → conversation continues under normal posture + intent
  → culmination: structured card / brief
  → Review · Approve · Revise · Skip  (shape per artifact)
  → if approved: one or more *consume destinations*
  → artifact stays in project history
```

Plan is instance zero. The table below is the family.

---

## Family map

| Affordance | `requestedArtifact` | Culminating artifact | Mature cousins today | Primary consume destinations (expansion) |
|------------|---------------------|----------------------|----------------------|------------------------------------------|
| **Plan** | `"plan"` | Plan Card | Restored on Nexus; Haiku extract; PlanCard UI | Build execute (wired) · **Flow** · **Tasks** · Workspace history |
| **Decide** | `"decide"` | Decision Card | CLARIFY / TRADEOFF / `DECISION_ARTIFACT` (tradeoff_matrix, decision_tree, deviation_log) — **inferred**, not composer-requested | Ledger / project memory · override logging |
| **Research** | `"research"` | Research Brief | Closest: `generate_deliverable` docx/pdf — file, not brief card | Library / Outputs · citation trail |
| **Compare** | `"compare"` | Comparison Matrix | Largely overlaps `tradeoff_matrix` | Decision record · Ledger |
| **Timeline** | `"timeline"` | Timeline Artifact | Partial Outputs / activity linking | Project Timeline · milestones |

WhisperGate `DECIDE` ≠ composer Decide. Same word, different layer (intent vs requested artifact).

---

## If we consider expansion now — what it would feel like

### 1. Composer as an output-type palette (not a mode row)

Plan already sits as a checklist. Expansion would add sibling **request** controls (not personality switches):

- Plan · Decide · Research · Compare · Timeline  
- At most one requested artifact per send (or explicit multi-request later)  
- UI resets after submit; sticky pending until that artifact culminates (same pattern as Plan)

Mental model stays: *Generate X*, never *X Mode*.

### 2. Approve becomes a destination picker when destinations exist

For Plan today: Approve → execute on Nexus.

With expansion, Approve on a Plan Card could offer:

| Destination | Meaning |
|-------------|---------|
| **Build** | Execute in Workspace (current) |
| **Flow** | Materialize steps as Flow nodes / sequence |
| **Tasks** | Spawn task / parking items from must/should steps |
| **Save only** | Keep in history / Outputs without acting |

That picker is the product of *consume expansion*, not a missing Plan Card button.

### 3. Decide / Compare lean on existing decision intelligence

Lowest-cost expansion after Plan:

1. Composer Decide → `requestedArtifact: "decide"` → guarantee Decision Card culmination (reuse CLARIFY/TRADEOFF/`DECISION_ARTIFACT` factories, force emission when actionable).  
2. Composer Compare → `requestedArtifact: "compare"` → force `tradeoff_matrix` (or a dedicated Comparison Matrix card).  

Difference from today: **guarantee** the card when the user asked for it, instead of hoping WhisperGate DECIDE emits one.

### 4. Research and Timeline need new shapes

- **Research Brief** — structured card (question, findings, sources, open questions) distinct from a downloadable docx; may *also* offer “Export to Outputs.”  
- **Timeline Artifact** — ordered milestones / dependencies consumable by project Timeline, not only chat prose.

These are greenfield artifact types under the same `requestedArtifact` bus.

### 5. Consume graph (Plan Card as hub)

```
                    ┌─────────────┐
                    │  Plan Card  │
                    │  (approved) │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
        Build           Flow            Tasks
     (execute)     (node graph)    (work items)
           │               │               │
           └───────────────┴───────────────┘
                           ▼
                  Project history / Outputs
```

Decide / Compare cards feed **Ledger / memory**.  
Research feeds **Library / Outputs**.  
Timeline feeds **Timeline / milestones**.

One bus (`requestedArtifact`), many cards, many destinations.

---

## Suggested sequencing (if expanding now)

| Order | Capability | Why this order |
|-------|------------|----------------|
| 0 | Plan → Plan Card | **Done** (restore) |
| 1 | Plan Approve → destination chooser (Build + Save) | Tiny UX; teaches “consume” without Flow/Tasks yet |
| 2 | Decide + Compare composer requests | Reuse decision artifact pipeline; prove family beyond Plan |
| 3 | Flow consumes approved Plan | High product leverage; Plan steps → Flow nodes |
| 4 | Tasks consume approved Plan | MoSCoW → work items |
| 5 | Research Brief + Timeline Artifact | New schemas + UI |

Do not wait on 3–5 to call Plan restored. Do not ship Decide/Research/Compare/Timeline buttons inside a “finish Plan” PR.

---

## Engineering spine (shared, once)

Already established by Plan restore — reuse for the family:

1. `requestedArtifact` on Nexus submit (first-class field)  
2. Soft side-effect policy per kind (Plan: no writes; Research: read-heavy; etc.)  
3. Structuring pass or model-emitted block → SSE → bridge → card  
4. Persist on `nexus_messages.metadata` (+ `project_artifacts` when project-scoped)  
5. Card actions: Review / Approve / Revise / Skip  
6. Approve → pluggable **consume handlers** registered by destination  

Expansion work is mostly: new `kind` handlers + card UIs + consume adapters — not a second architecture.

---

## Related

- Philosophy: `docs/architecture/requested-artifacts.md`  
- Plan restore evidence: `docs/audits/workspace-plan-mode-audit.md`  
- Plan restore gap map: `docs/audits/plan-card-nexus-gap-analysis.md`
