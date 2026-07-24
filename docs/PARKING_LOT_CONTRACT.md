# Parking Lot Product Contract

> This document is the product contract for the Parking Lot.
> It sits beside the Ask Atlas / Workspace surface contract and the Ledger object model.
> When implementation and this document disagree, update the document deliberately — do not silently drift.

**Status:** Proposed (2026-07-24)  
**Audit:** [`docs/audits/parking-lot-product-audit.md`](./audits/parking-lot-product-audit.md)  
**Object model:** Parking Lot items are `entries` with deferred status (`parked`, and `draft` when shown on the lot). Same object as the Ledger — status changes move them; do not duplicate.

---

## One-sentence contract

The Parking Lot holds a project's **unresolved cognitive work** — ideas, decisions, clarifications, risks, and research that still deserve another conversation — and nothing that is already finished, committed, or disposable chatter.

---

## Governing test

> If someone returned to this project six months later, would the Parking Lot contain only the unresolved questions that genuinely deserve another conversation?

If the answer is no, the surface has failed — even if storage and UI "work."

---

## What this surface is

Joy's **working memory with the user's permission**.

Not:

- A second inbox  
- A chat archive  
- A dump for finished outputs  
- A generic notes app  

Framing language should sound like **"things worth thinking about later"** (seeds), never like garbage.

---

## 1. What belongs here

### In

| Category | Meaning | Example |
|---|---|---|
| **Idea** | Speculative direction not yet evaluated | "What if CityHub expanded to multiple cities?" |
| **Decision** | Choice deferred; still open | "Should entrepreneurs be the primary audience?" |
| **Clarification** | Ambiguity blocking progress | "What exactly is the editorial identity?" |
| **Risk** | Threat worth revisiting before commit | "Launching before the identity sentence is locked." |
| **Research** | Investigation owed later | "Investigate sponsorship pricing." |

Optional catch-all for user-parked miscellany that still passes the governing test: **Later** (not Dump).

### Out

- Completed summaries  
- Generated PDFs / finished deliverables  
- Facts and decisions already committed to the Ledger  
- Every random question asked in chat  
- Home handoff residue that was not explicitly parked  
- Raw "brain dump" material whose home is Forge / Intake, not Parking  

### Membership rule

An item may enter the Parking Lot only if it is **unfinished cognitive work** the project may need to resume. Interesting ≠ parked.

---

## 2. How something gets there

Three paths, ordered by trust:

### A. User parks (highest confidence)

Explicit actions only:

- "Park this."  
- ParkSheet / Capture → Park  
- Park control on a message, insight, or CommitCard  

User intent is enough. Persist the category they chose (or a clear default).

### B. Joy recommends parking (high confidence after consent)

Joy may notice unresolved work:

> "We haven't resolved this yet. Park this?"

Creation requires **user confirmation**. Do not silently park recommendations.

### C. Automatic extraction (high bar only)

Allowed only when confidence is high and the signal is deferral or a typed open object, for example:

- "We'll decide later."  
- "We haven't answered…"  
- "Open question…"  
- "Come back to this."  
- Genome / receipt paths that already treat Decisions and Questions as parked until explicit promote  

Auto-created items must mark **Auto** provenance and a confidence score. Prefer over-asking (path B) to silent parking of weak signals.

**Forbidden auto paths:** parking arbitrary recent user messages on handoff; parking finished outputs; parking committed facts.

---

## 3. What happens after it's parked

Every parked card exposes these actions with distinct behavior:

| Action | Contract |
|---|---|
| **Resume** | Return to the source conversation / project thread and continue the discussion. Does not resolve the item by itself. |
| **Clarify** | Open a questioning loop until the item is actionable (enough clarity to Promote, Resume with intent, or Delete). Not a synonym for Resume. |
| **Promote** | Move into the project as a real typed object (Decision, Goal, Feature/Build, Risk, Question, etc.) and leave the Parking Lot (`status → committed` or the appropriate Ledger posture). The chosen type **must** be written. |
| **Delete** | Explicit discard — not worth tracking. Hard remove from the lot. |

Secondary: notes, enrichment detail, open source conversation. These must not replace the four primary verbs.

---

## 4. What removes it

Parking Lot items must not live forever. Exit paths:

| Exit | Trigger |
|---|---|
| **Promote / Commit** | User promotes or commits the item |
| **Delete** | User discards |
| **Resolved (auto or marked)** | The underlying question is answered elsewhere — e.g. editorial identity committed, audience decided, budget locked — matching parked item should leave the lot or become **Resolved ✓** and stop counting as open work |
| **Supersede** | A newer parked or committed entry replaces it |

Resume alone does **not** remove an item.

Stale open items without touch should become visible as stale (last touched) so trust does not erode silently. Exact age policy is an implementation choice; having **no** resolve path is not allowed by this contract.

---

## 5. Metadata on every card

Required, visible or one tap away:

| Field | Values / source |
|---|---|
| **Source conversation** | Session / message / context pointer for Resume |
| **Confidence** | Numeric or band; required for Auto; optional for User |
| **Origin** | `User` \| `Joy` \| `Auto` |
| **Category** | Idea / Decision / Clarification / Risk / Research / Later (product taxonomy) |
| **Date parked** | Created |
| **Last touched** | Updated or last Resume/Clarify/Note |

Enrichment (`whyItMatters`, options, `revisitWhen`, etc.) may deepen the card but does not replace these six fields.

### Category vs capture intents

- **Product categories** (above) are first-class for browse, filter, and Promote.  
- Capture chips on the Park destination must map onto those categories.  
- Do **not** use **Dump** as a Parking Lot category or Park-destination intent. Prefer **Later** / **Inbox** / omit. Raw dumps belong on Forge Intake.

AI `atlasCategory` (`Opportunity`, `Decision`, `Improvement`, `Question`, `Future Build`) may continue as enrichment labels but must not silently diverge from the product taxonomy without a documented mapping.

---

## Relationship to other surfaces

| Surface | Boundary |
|---|---|
| **Ledger** | Committed (and tension/override) record. Parking → Ledger is a status/type promotion, not a copy. |
| **Ask Joy / Workspace chat** | Where Resume and Clarify continue; where Joy may ask to park. Chat history is not the Parking Lot. |
| **Forge / Intake** | Raw brain-dump and structuring. May produce candidates; only high-confidence unresolved work parks, preferably with consent. |
| **Home** | Portfolio awareness may *surface* parked items; handoff must not auto-fill the lot with recent messages. |

---

## Implementation principles (non-negotiable)

1. **One object** — `entries` + status; no parallel parking store.  
2. **Consent over cleverness** — prefer asking to park over silent capture when unsure.  
3. **Exit over endless intake** — every intake path needs a resolve story.  
4. **Honest labels** — if the UI offers Clarify or a Promote type, the behavior must match.  
5. **Seeds, not dumps** — naming and empty states reinforce unfinished thinking worth returning to.

---

## Five-question gate (before changing the feature)

Before adding an intake path, action, or UI chrome to the Parking Lot, answer:

1. Does this item / path pass the **membership** rule?  
2. Which **intake tier** (User / Joy+consent / Auto high-bar) owns it?  
3. Which **action** or **exit** does this change affect?  
4. What **removes** items created or touched by this change?  
5. Which of the **six metadata fields** does the user gain or lose?

If any answer is missing, do not ship the change yet.

---

## Version

| Version | Date | Notes |
|---|---|---|
| 0.1 | 2026-07-24 | Proposed from product audit; not yet implementation-complete |
