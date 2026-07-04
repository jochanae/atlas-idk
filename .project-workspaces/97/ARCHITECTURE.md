# Conviction Engine — Architectural Specification

> **Status:** Draft v1.0  
> **Last updated:** 2026-07-04  
> **Purpose:** Define the structural and behavioral architecture of a long-term AI partner environment built around continuity of belief, principled reasoning, and executable decisions.

---

## Overview

Conviction Engine is an architectural framework for AI partner environments that maintain coherent, human-owned belief systems over time. The core problem it solves: AI systems that treat every session as stateless produce drift — they give advice that contradicts prior commitments, adopt the user's framing uncritically, and never accumulate genuine understanding of who the person is and what they stand for.

Conviction Engine provides three interlocking mechanisms to prevent this:

1. A **Three-Layer Memory Model** that distinguishes what a person believes from how they reason from what they've decided.
2. A **Temporal Decision Graph** that tracks how beliefs and decisions relate to and affect each other over time.
3. A **Conviction Conflict Surface** that surfaces real contradictions — between new inputs and prior commitments — instead of silently absorbing them.

---

## Part 1 — The Three-Layer Continuity Model

### Layer Architecture

The model separates persistent state into three semantically distinct layers. The distinction matters: collapsing them produces a flat memory that can't reason about its own contents.

```
┌─────────────────────────────────────────────────────────┐
│  CONVICTION LAYER                                       │
│  What the person fundamentally believes                 │
│  → Slow to change. High evidence threshold required.    │
├─────────────────────────────────────────────────────────┤
│  PRINCIPLE LAYER                                        │
│  How the person reasons and makes tradeoffs             │
│  → Moderately stable. Updated by pattern, not impulse.  │
├─────────────────────────────────────────────────────────┤
│  EXECUTION LAYER                                        │
│  What the person has decided and acted on               │
│  → Volatile. Updated frequently. Time-indexed.          │
└─────────────────────────────────────────────────────────┘
```

---

### Layer 1: Conviction

**Definition:** A Conviction is a stable, deeply-held belief that functions as a first-order constraint on all decisions and advice. It is not a preference. It is not a goal. It is a settled answer to the question "what is true, or what matters, in this domain."

**Characteristics:**
- Formed slowly, from repeated evidence across many contexts
- Not easily overridden by a single argument or emotional state
- Violation of a Conviction is always flagged — never silently accommodated
- Examples: "I will not build a product that manipulates users," "Quality always beats speed when the stakes are high," "I am a founder, not an operator"

**Schema:**
```json
{
  "id": "conv_uuid",
  "statement": "string — one clear declarative sentence",
  "domain": "string — the life or work domain this governs",
  "formed_at": "ISO timestamp",
  "last_reinforced_at": "ISO timestamp",
  "evidence_count": "integer — number of sessions/events that reinforced this",
  "confidence": "float 0.0–1.0",
  "status": "active | suspended | deprecated"
}
```

**Rules:**
- A Conviction is never created from a single session. Minimum evidence threshold: 3 independent reinforcing signals.
- A Conviction can only be deprecated through explicit human acknowledgment — not silently overwritten by new behavior.
- When a user action conflicts with an active Conviction, the Conflict Surface activates (see Part 3).

---

### Layer 2: Principle

**Definition:** A Principle is a reasoning heuristic — a rule the person applies when making tradeoffs. Principles are derived from observed decision patterns, not from explicit statements. They represent *how* the person thinks, not *what* they believe at the deepest level.

**Characteristics:**
- More numerous and more flexible than Convictions
- Updated when a person consistently makes a certain type of tradeoff
- Not violations — conflicts with Principles trigger a softer signal ("this seems inconsistent with how you usually approach X")
- Examples: "Prefer simplicity over feature richness in v1," "Don't add dependencies without a clear forcing function," "Design for mobile-first across all surfaces"

**Schema:**
```json
{
  "id": "prin_uuid",
  "statement": "string — a short heuristic",
  "domain": "string",
  "derived_from": ["decision_id", "decision_id"],
  "formed_at": "ISO timestamp",
  "last_applied_at": "ISO timestamp",
  "application_count": "integer",
  "confidence": "float 0.0–1.0",
  "status": "active | suspended | deprecated"
}
```

**Rules:**
- Principles are inferred, not declared. The system observes decision patterns and proposes a Principle for human confirmation after 3+ consistent applications.
- A Principle can be overridden without ceremony — but the override is logged and may eventually generate a new Principle.
- Principles are domain-scoped. A principle about product decisions does not apply to personal planning decisions.

---

### Layer 3: Execution

**Definition:** An Execution record captures a specific decision, action, or commitment — what the person decided, when, in what context, and with what stated rationale.

**Characteristics:**
- Created frequently (potentially every session)
- Always time-indexed
- Connected to the Conviction and Principle layer via typed graph edges
- The primary input to graph traversal and conflict detection

**Schema:**
```json
{
  "id": "exec_uuid",
  "description": "string — what was decided or done",
  "context": "string — the situation or problem being addressed",
  "rationale": "string — stated or inferred reasoning",
  "decided_at": "ISO timestamp",
  "project_id": "string — optional",
  "session_id": "string",
  "status": "active | superseded | reversed | archived",
  "linked_convictions": ["conv_uuid"],
  "linked_principles": ["prin_uuid"]
}
```

---

### Layer Interaction Summary

| Layer | Created by | Updated by | Conflict response |
|---|---|---|---|
| Conviction | Repeated evidence + human confirmation | Long-term behavior change + human acknowledgment | Hard surface — blocks or flags clearly |
| Principle | Observed pattern + human confirmation | Consistent override behavior | Soft surface — noted, not blocked |
| Execution | Every decision session | Each new decision in same domain | Supersession chain — old record linked |

---

## Part 2 — Temporal Decision Graph

### Purpose

The Temporal Decision Graph (TDG) is the structural spine of Conviction Engine. It answers the question: *how does what was decided before constrain, inform, or invalidate what is being decided now?*

Without the graph, memory is a flat log — each entry isolated from every other. The TDG makes relationships explicit and traversable.

---

### Node Types

```
ConvictionNode    — represents a Conviction record
PrincipleNode     — represents a Principle record
ExecutionNode     — represents an Execution record
SessionNode       — represents a conversation session (lightweight, for time anchoring)
```

---

### Typed Edge Catalogue

Each edge has a direction (source → target) and a semantic meaning. The type is not decorative — it changes how the graph is traversed and how conflicts are surfaced.

| Edge Type | Direction | Meaning |
|---|---|---|
| `supersedes` | newer_exec → older_exec | This decision replaces the prior one. The older execution is still valid history but no longer active. |
| `invalidates` | exec → conviction OR exec → principle | This decision, if accepted, would contradict a Conviction or Principle. Triggers Conflict Surface. |
| `reinforces` | exec → conviction OR exec → principle | This decision is consistent with and strengthens a Conviction or Principle. Evidence count increments. |
| `derives_from` | principle → exec | This Principle was inferred from this (set of) Execution records. |
| `constrained_by` | exec → conviction | This decision was made within the boundaries set by this Conviction. Explicit traceability. |
| `follows` | session → session | Temporal chaining between sessions. Enables "what changed between these two sessions?" queries. |
| `revises` | conviction_v2 → conviction_v1 | A Conviction was updated. Both versions are preserved; the newer version supersedes but the older remains queryable. |

---

### Graph Schema

```json
{
  "nodes": [
    {
      "id": "string",
      "type": "ConvictionNode | PrincipleNode | ExecutionNode | SessionNode",
      "payload": "{ ...layer-specific fields }",
      "created_at": "ISO timestamp",
      "version": "integer — increments on update"
    }
  ],
  "edges": [
    {
      "id": "edge_uuid",
      "type": "supersedes | invalidates | reinforces | derives_from | constrained_by | follows | revises",
      "source": "node_id",
      "target": "node_id",
      "created_at": "ISO timestamp",
      "session_id": "string — which session created this edge",
      "confidence": "float 0.0–1.0",
      "annotation": "string — optional human note"
    }
  ]
}
```

---

### Traversal Patterns

**Pattern 1: Ancestry Query**
> "What led to this decision?"

Traverse `constrained_by` and `derives_from` edges backward from an ExecutionNode to surface the Convictions and Principles that shaped it.

**Pattern 2: Impact Query**
> "If I change this Conviction, what decisions does it affect?"

Traverse `constrained_by` edges forward from a ConvictionNode to find all ExecutionNodes that cited it as a constraint.

**Pattern 3: Conflict Detection**
> "Does this new decision contradict anything?"

For an incoming ExecutionNode, traverse all active ConvictionNodes and PrincipleNodes. Score semantic similarity. If similarity exceeds threshold and the decision appears to oppose (not align with) the target node, generate an `invalidates` edge candidate and surface it.

**Pattern 4: Supersession Chain**
> "What is the current active decision in this domain?"

Follow `supersedes` edges forward from the oldest ExecutionNode in a domain until you reach a node with no outgoing `supersedes` edge. That is the current active decision.

---

### Temporal Integrity Rules

1. **No silent overwrites.** When a node is updated, a new version is created and a `revises` edge connects the old to the new. The old version is never deleted.
2. **All edges are timestamped.** Every relationship carries the session in which it was created.
3. **Invalidation is a proposal, not an action.** Creating an `invalidates` edge does not automatically deprecate the target — it surfaces the conflict for human resolution.
4. **Confidence decay.** Execution nodes not reinforced within a configurable window have their confidence score reduced. This prevents stale decisions from being treated as current with full weight.

---

## Part 3 — Conviction Conflict Surface

### Purpose

The Conflict Surface is the user-facing mechanism that prevents silent belief drift. It activates when the system detects a potential `invalidates` relationship between an incoming input (new decision, new statement, new request) and an existing Conviction or high-confidence Principle.

The design goal: make the conflict visible, give the human the full picture, and require an explicit human choice. Never resolve the conflict automatically.

---

### Activation Conditions

The Conflict Surface activates when **any** of the following is true:

1. A new Execution record would create an `invalidates` edge to a Conviction with `confidence >= 0.7`
2. A new Execution record would create an `invalidates` edge to a Principle with `confidence >= 0.85` and `application_count >= 5`
3. A user statement directly contradicts a Conviction statement at high semantic similarity (threshold: configurable, default 0.80)
4. A pattern of recent Execution records (3+ in a rolling 7-session window) collectively moves in a direction that opposes an active Conviction

---

### Conflict Surface — Functional Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: DETECTION                                              │
│  Incoming input is scored against active Convictions and        │
│  high-confidence Principles. Candidate conflicts are ranked     │
│  by severity (invalidation type × confidence × recency).       │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: FRAMING                                                │
│  The highest-severity conflict is surfaced to the human.        │
│  Framing includes:                                              │
│  • The existing Conviction/Principle (verbatim)                 │
│  • The incoming decision/statement                              │
│  • Why the system believes they conflict                        │
│  • How many prior decisions were constrained by the Conviction  │
│  Multiple conflicts are queued — one surfaces at a time.        │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: HUMAN RESOLUTION — 4 OPTIONS                          │
│                                                                 │
│  A. HOLD THE CONVICTION                                         │
│     The incoming decision is blocked or modified to comply.     │
│     An `invalidates` edge is created but marked "rejected."     │
│     The Conviction is reinforced (evidence count +1).           │
│                                                                 │
│  B. REVISE THE CONVICTION                                       │
│     The human updates the Conviction statement.                 │
│     A `revises` edge is created. Old version preserved.         │
│     Downstream decisions that cited the old Conviction are      │
│     flagged for review (not auto-changed).                      │
│                                                                 │
│  C. SUSPEND THE CONVICTION                                      │
│     The Conviction is marked `suspended` for a defined period   │
│     or until a specified condition is met.                      │
│     Suspension is logged — it is not a silent park.             │
│                                                                 │
│  D. PROCEED AS EXCEPTION                                        │
│     The incoming decision is accepted as a one-time exception.  │
│     An `invalidates` edge is created but marked "excepted."     │
│     The Conviction remains active. Exception count is tracked.  │
│     If exception count exceeds threshold, the system proposes   │
│     a Conviction revision.                                      │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: GRAPH UPDATE                                           │
│  Resolution is written to the graph:                           │
│  • Appropriate edge type created (with resolution annotation)   │
│  • Confidence scores updated across affected nodes              │
│  • Downstream nodes flagged if Conviction was revised           │
│  • Session record updated with conflict resolution event        │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: CONTINUATION                                           │
│  Normal session flow resumes.                                   │
│  If additional conflicts were queued (Step 2), the next one     │
│  surfaces before the original request is processed.            │
│  The system never processes a conflicting request without       │
│  a resolution.                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Conflict Surface — Design Constraints

**What the Conflict Surface must never do:**
- Silently absorb a contradiction and proceed as if nothing happened
- Surface conflicts so frequently that the user habituates and dismisses them (wolf-crying failure mode)
- Auto-resolve in favor of either the Conviction or the new input without human input
- Block the user from proceeding — it is a gate, not a wall

**Calibration principles:**
- Surface rate target: no more than 1 conflict per 5 sessions on average during steady-state usage
- High-frequency surfacing is a signal that Convictions need refinement, not that the user is acting incorrectly
- The framing of the conflict must be neutral — it presents both sides without advocating for either
- The system's prior behavior is part of the conflict context — if the AI previously advised something that led to the new decision, that is surfaced

---

### Conflict Surface — Example Interaction

**Existing Conviction:**
> "I will not ship features that compromise user data privacy for conversion optimization."
> confidence: 0.92 | evidence: 7 sessions | domain: product

**Incoming request:**
> "Add a behavioral tracking pixel to the onboarding flow so we can see where users drop off."

**Surface output:**
```
⚖️ Conviction conflict detected

Your conviction: "I will not ship features that compromise user data privacy for conversion optimization."

This request introduces behavioral tracking on the onboarding flow, which may fall within the scope of conversion optimization — the exact use case your conviction addresses.

4 prior decisions cited this conviction as a constraint, including the decision to exclude analytics from the free tier (6 sessions ago).

How do you want to resolve this?

  A — Hold the conviction (find a privacy-safe alternative)
  B — Revise the conviction (update its scope or definition)
  C — Suspend the conviction (temporarily, with a defined condition)
  D — Proceed as exception (one-time, tracked)
```

---

## Implementation Notes

### Storage Recommendations

- **Conviction and Principle nodes:** Persistent store (PostgreSQL / Supabase). These are durable and must survive session resets.
- **Execution nodes:** Append-only log with foreign keys to Conviction/Principle. Never update in place — always supersede.
- **Graph edges:** Relational join table with typed `edge_type` column and full timestamp + session provenance.
- **Conflict Surface queue:** In-session state, cleared on resolution. Unresolved conflicts are persisted and re-surfaced at next session open.

### Query Performance

Graph traversal at depth 2-3 (ancestry and impact queries) is sufficient for all described use cases. Full graph traversal is not required. Index on: `node_type`, `status`, `domain`, `confidence`, `created_at`.

### Human-in-the-Loop Invariant

Every change to the Conviction layer requires an explicit human action. No automated process may create, deprecate, or revise a Conviction without surfacing a confirmation request. This is the non-negotiable architectural invariant of the entire system.

---

## Open Questions

1. **Cross-domain conflict:** Can a Conviction in one domain (e.g., personal ethics) constrain decisions in another (e.g., product)? Current assumption: yes, with explicit cross-domain linkage required.
2. **Collaborative conviction:** In a team context, who owns a Conviction? Does the system support shared vs. individual Conviction layers?
3. **Conviction formation UX:** What is the interface for a human to explicitly seed a Conviction vs. waiting for the system to infer one from pattern?
4. **AI-held convictions:** Should the AI partner itself have a Conviction layer that constrains its own behavior? (Current architecture applies only to the human's belief state.)
5. **Decay rate calibration:** What is the right confidence decay curve for Execution nodes? Linear? Exponential? Domain-dependent?

---

*End of architectural specification. This document is a living artifact — update it when foundational decisions change, and use the Conviction Engine's own graph to track those changes.*