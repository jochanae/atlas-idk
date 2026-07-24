# Axiom Surface Responsibility Map

> This document is the current contract between systems.
> Before introducing any new UI component, it must pass the five-question test at the bottom.

---

## 🏠 Home — Global Insight

**Purpose:** Discover and shape ideas without operational overhead.

| Component | Responsibility | User question answered |
|---|---|---|
| **FOCUS chip** | "Atlas is currently thinking inside IntoIQ." | Where is Atlas focused? |
| **Atlas · Activity** | "Atlas just remembered or connected something important." | What did Atlas just notice? |
| **Commit Pill** | "This conversation is mature enough to persist into a project." | Is this ready to become a project? |

**Rules:**
- FOCUS is **state** — persists until changed
- Activity is **event** — appears on signal, fades after 8 s idle
- Commit is **consent** — requires explicit user action

**Home answers three questions:**
1. What am I exploring?
2. What does Atlas remember?
3. Is this ready to become a project?

---

## 🏗️ Workspace — Build and Operationalize

**Purpose:** Build and operationalize decisions.

| Component | Responsibility | User question answered |
|---|---|---|
| **Atlas · Memory** | Living memory — what Atlas currently knows | What do we already know? |
| **Resume card** | Project snapshot — audience, goals, open questions, next steps | Where does this project currently stand? |
| **Chat** | Active shaping and building engine | What are we building / what still needs to be decided? |

**Rules:**
- Memory = **living** (updates as Atlas learns)
- Resume = **snapshot** (reflects committed understanding)
- Chat = **engine** (where things actually happen)

**Workspace answers three questions:**
1. What are we building?
2. What do we already know?
3. What still needs to be decided?

---

## Naming Convention

Do not call both surfaces "HUD." They are different things.

| Surface | Name | Location |
|---|---|---|
| Home event panel | **Atlas · Activity** | Home only, ephemeral |
| Workspace memory panel | **Atlas · Memory** | Workspace only, persistent |

---

## Five-Question Test for New Features

Before building any new UI component or surface, answer all five:

| Question | Example |
|---|---|
| What surface owns this? | Home or Workspace |
| Is this state or an event? | FOCUS = state · Activity = event |
| Is this persistent or ephemeral? | Resume = persistent · Activity = ephemeral |
| What is its source of truth? | Resume artifact · Ledger · Conversation |
| What user question does it answer? | "What do we know?" |

**If you cannot answer all five, do not build it yet.**

---

## 🅿️ Parking Lot — Unresolved Cognitive Work

**Purpose:** Hold unfinished thinking that still deserves another conversation — Joy's working memory with the user's permission.

**One-sentence contract:** Only unresolved ideas, decisions, clarifications, risks, and research — not finished outputs, committed facts, or chat residue.

**Six-month rule:** If the user returns in six months, the lot should contain only unresolved cognitive work that still deserves attention.

**Philosophy:** Decision queue — every item ends Resolved, Promoted, Deleted, or consciously Kept.

**Canonical product contract:** [`docs/PARKING_LOT_CONTRACT.md`](./PARKING_LOT_CONTRACT.md)  
**Audit:** [`docs/audits/parking-lot-product-audit.md`](./audits/parking-lot-product-audit.md)

**Object model:** Same `entries` as the Ledger; deferred via `status` (`parked` / `draft`). Status change moves items — do not duplicate.

**Parking Lot answers three questions:**
1. What unfinished thinking still deserves another conversation?
2. How did this get set aside (User / Joy / Auto)?
3. Resume, Clarify, Promote, or Delete — what next?

---

## Provenance Layer (planned — not yet built)

When memory architecture is fully stable, add a lightweight `ⓘ` affordance beside memory-backed claims.

Tap opens a source panel showing: Ledger · Resume · Repo scan · Conversation · Portfolio memory · **Atlas inference**

The "Atlas inference" source type is critical — Atlas must be able to say explicitly when something is inferred vs stored.

See `.agents/memory/provenance-layer.md` for full spec.
