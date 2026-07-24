# Requested-Artifact Family — Expansion (not Plan restore gaps)

> Product architecture. Complements `requested-artifacts.md` and the Plan → Plan Card restore.
> Date: 2026-07-24 (revised: Approve ≠ Consume).
>
> **Classification rule:** Anything below that is *not* required for “Tap Plan → Plan Card → Review/Approve/Revise/Skip” is a **new capability**, not unfinished Plan restore.
>
> **Architectural stop line:** Protect the principle below. Do not overload Approve into a destination menu.

---

## Core principle (protect this)

> The composer doesn’t tell Joy how to think.  
> It tells Joy **what kind of artifact** the user wants to leave with.

Orthogonal layers stay separate:

| Layer | Answers |
|-------|---------|
| Posture | How may Joy behave? (Conversation / Build / WhisperGate) |
| Intent | What did the user ask? (natural language) |
| Requested artifact | What should Joy leave them with? |

---

## What Plan restore already closed

```
Tap Plan → requestedArtifact:"plan" → converse → Plan Card → Review / Approve / Revise / Skip
```

That contract is restored. Calling Plan “done” does not depend on Flow, Tasks, or sibling composer buttons.

**Note on today’s Approve:** Plan Card Approve currently kicks a Nexus execute turn. Treat that as a **transitional single consume path**, not the long-term meaning of Approve. Expansion should split **acceptance** from **application** (below)—not grow Approve into a chooser.

---

## What is *not* a Plan gap

| Idea | Class |
|------|--------|
| Flow consumes approved Plan Cards | **Expansion** — consume destination |
| Tasks consume approved Plan Cards | **Expansion** — consume destination |
| Decide / Research / Compare / Timeline buttons | **Expansion** — sibling requested artifacts |

---

## Approve ≠ Consume (locked)

Two user decisions. Keep them separate so the system scales.

| Decision | Meaning | UI moment |
|----------|---------|-----------|
| **Approve** | “This artifact is accepted as truth.” | On the Artifact Card |
| **Consume** | “Apply that accepted artifact here.” | Later — from Artifact Library / available destinations |

### Correct shape

```
Conversation
      ↓
Requested Artifact
      ↓
Artifact Card
      ↓
Approve          ← acceptance only
      ↓
Artifact Library (accepted truth)
      ↓
Available Destinations   ← separate decision
   · Build
   · Flow
   · Tasks
   · Save / share
   · …
```

### Avoid

```
Approve
   ├── Build
   ├── Flow
   ├── Tasks
   ├── Save
   └── …
```

That overloads one button with two decisions. The same approved Plan should later be able to be saved only, sent to Flow, turned into Tasks, used by Build, or shared—**without** re-deciding “is this the plan?”

**Approve** = acceptance of the artifact.  
**Consume** = where that accepted artifact is applied.

---

## Shared contract (family)

```
Composer action
  → requestedArtifact: "<kind>"
  → conversation continues under normal posture + intent
  → culmination: structured Artifact Card
  → Review · Approve · Revise · Skip
  → if Approved: artifact enters accepted library / project history
  → Consume (optional, later): apply to a destination
```

---

## Family map

| Affordance | `requestedArtifact` | Culminating artifact | Mature cousins today | Consume destinations (later) |
|------------|---------------------|----------------------|----------------------|------------------------------|
| **Plan** | `"plan"` | Plan Card | Restored on Nexus | Build · Flow · Tasks · share |
| **Decide** | `"decide"` | Decision Card | CLARIFY / TRADEOFF / `DECISION_ARTIFACT` (inferred today) | Ledger / memory |
| **Compare** | `"compare"` | Comparison Matrix | `tradeoff_matrix` | Ledger / decision record |
| **Research** | `"research"` | Research Brief | `generate_deliverable` files (different shape) | Library / Outputs |
| **Timeline** | `"timeline"` | Timeline Artifact | Partial activity linking | Project Timeline / milestones |

WhisperGate `DECIDE` ≠ composer Decide (intent vs requested artifact).

---

## Expansion — what it would feel like

### 1. Composer as output-type palette

Sibling **request** controls (not personality switches): Plan · Decide · Compare · Research · Timeline.  
Mental model: *Generate X*, never *X Mode*.

### 2. Decide / Compare next (cousins of Plan)

Structured thinking artifacts; reuse decision intelligence; **guarantee** the card when requested instead of hoping WhisperGate emits one.

### 3. Consume adapters (after acceptance exists)

Flow / Tasks / Build / share read from the **accepted** artifact library—not from the Approve click itself.

### 4. Research / Timeline later

New schemas (brief card; milestone artifact)—same bus, new shapes.

### 5. Consume graph (after Approve)

```
         Artifact Card ──Approve──► Accepted in Artifact Library
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                       ▼                       ▼
                 Build                    Flow                    Tasks
              (optional)              (optional)               (optional)
```

Destinations are available **because** the artifact was approved—not chosen *as* approval.

---

## Suggested sequencing

| Order | Capability | Why |
|-------|------------|-----|
| ✅ 0 | Plan → Plan Card | **Done** (restore) |
| 1 | Decide + Compare composer requests | Closest cousins; structured thinking; reuse existing decision cards |
| 2 | Artifact Library + accepted status | Makes Approve = acceptance durable without destination UI |
| 3 | Flow consumes **approved** artifacts | Apply accepted Plans (and later others) |
| 4 | Tasks consume **approved** artifacts | MoSCoW → work items |
| 5 | Research Brief | New shape |
| 6 | Timeline Artifact | New shape |

**Do not** insert “Approve → destination chooser” into this sequence.  
**Do not** ship sibling buttons inside a “finish Plan” PR.

---

## Engineering spine

Reuse from Plan restore:

1. `requestedArtifact` on Nexus submit  
2. Soft side-effect policy per kind  
3. Structuring / emission → SSE → bridge → card  
4. Persist on message metadata + project artifacts  
5. Card actions: Review / Approve / Revise / Skip  
6. **Approve** → mark accepted (library / status)—not invoke destinations  
7. **Consume adapters** (separate) — Flow / Tasks / Build / share subscribe to accepted artifacts  

---

## Related

- Philosophy: `docs/architecture/requested-artifacts.md`  
- Plan restore evidence: `docs/audits/workspace-plan-mode-audit.md`  
- Plan restore gap map: `docs/audits/plan-card-nexus-gap-analysis.md`
