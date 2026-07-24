# Parking Lot Product Contract

> This document is the product contract for the Parking Lot.
> It sits beside the Ask Atlas / Workspace surface contract and the Ledger object model.
> When implementation and this document disagree, update the document deliberately — do not silently drift.

**Status:** Architecture settled (2026-07-24) — remaining work is implementation  
**Audit:** [`docs/audits/parking-lot-product-audit.md`](./audits/parking-lot-product-audit.md)  
**Object model:** Parking Lot items are `entries` with deferred status (`parked`, and `draft` when shown on the lot). Same object as the Ledger — status changes move them; do not duplicate.

---

## One-sentence contract

The Parking Lot holds a project's **unresolved cognitive work** — ideas, decisions, clarifications, risks, and research that still deserve another conversation — and nothing that is already finished, committed, or disposable chatter.

---

## Six-month rule (north star)

> If the user returns to this project in six months, the Parking Lot should contain only unresolved cognitive work that still deserves attention.

This is not a soft aspiration. It is the pass/fail test for the surface. If the answer is no, the Parking Lot has failed — even if storage and UI "work."

Every intake path, action, and exit rule exists to make the six-month rule true.

---

## Philosophy: decision queue, not storage

Do not think of the Parking Lot as storage. Think of it as a **decision queue**.

Everything inside it should eventually have one of four outcomes:

| Outcome | Meaning |
|---|---|
| **Resolved** | Answered elsewhere (auto or marked) — leaves open work |
| **Promoted** | Graduated into the project as a typed commitment / object |
| **Deleted** | No longer matters |
| **Kept** | Genuinely still unresolved and worth another conversation |

Nothing should simply sit forever. The lot is an active workspace for unresolved thinking — conversations → structured knowledge → decisions.

### Membership litmus

Every item must answer:

> Was this intentionally deferred?

If no, it probably should not be parked.

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

### Product categories (settled — five + Later)

| Category | Meaning | Example |
|---|---|---|
| **Idea** | Speculative direction not yet evaluated | "What if CityHub expanded to multiple cities?" |
| **Decision** | Choice deferred; still open | "Should entrepreneurs be the primary audience?" |
| **Clarification** | Ambiguity blocking progress | "What exactly is the editorial identity?" |
| **Risk** | Threat worth revisiting before commit | "Launching before the identity sentence is locked." |
| **Research** | Investigation owed later | "Investigate sponsorship pricing." |
| **Later** | User-parked catch-all that still passes the governing test | Something worth another conversation, not yet typed |

**Do not add Assumption as a parking category.** Assumptions are metadata on a Decision, Risk, or Research item until validated — not a separate parking type.

### Out

- Completed summaries  
- Generated PDFs / finished deliverables  
- Facts and decisions already committed to the Ledger  
- Every random question asked in chat  
- Home handoff residue that was not intentionally deferred  
- Raw "brain dump" material whose home is Forge / Intake, not Parking  

### Membership rule

An item may enter the Parking Lot only if it is **unfinished cognitive work** the project may need to resume. Interesting ≠ parked. Intentionally deferred = parked.

---

## 2. How something gets there

Three paths, ordered by trust:

### A. User parks (highest confidence)

Explicit actions only:

- "Park this."  
- ParkSheet / Capture → Park  
- Park control on a message, insight, or CommitCard  

User intent is enough. Persist the category they chose (or a clear default).

### B. Joy recommends parking (consent)

Joy may notice unresolved work:

> "We haven't resolved this yet. Park this?"

Creation requires **user confirmation**. Do not silently park recommendations.

### C. Automatic extraction (confidence-gated)

Auto-park behavior is gated by confidence:

| Confidence | Behavior |
|---|---|
| **95–100** | Auto-park without asking (rare) |
| **80–94** | Joy asks: "This seems unresolved. Park it?" — do **not** silent-park |
| **Below 80** | Do not park automatically |

Good auto *candidates* (still subject to the table above): *"We'll decide later."* / *"We haven't answered…"* / *"Open question…"* / *"Come back to this."* / high-confidence Decision receipts / typed open Questions.

Auto-created items must mark **Auto** provenance and a confidence score.

### Forbidden auto paths

- **Home handoff must not auto-park** recent user messages (or any content) unless unresolved-work confidence passes the auto-park threshold (≥95) **and** the membership litmus ("intentionally deferred?") is true. Default: handoff does not park.
- Parking finished outputs  
- Parking committed facts  

---

## 3. What happens after it's parked

Every parked card exposes these actions with distinct behavior:

| Action | Contract |
|---|---|
| **Resume** | Return to the source conversation / project thread and continue the discussion. Does not resolve the item by itself. |
| **Clarify** | Open a questioning loop until the item is actionable (enough clarity to Promote, Resume with intent, or Delete). Not a synonym for Resume. |
| **Promote** | Graduate into the project. Always ask **Promote to what?** when there is ambiguity. Write the chosen destination type and leave the Parking Lot. |
| **Delete** | Explicit discard — not worth tracking. |

### Promote destinations (graduation)

Promote is graduation from a staging area, not card removal alone. Destinations:

| Destination | Meaning |
|---|---|
| **Decision** | Lock as a project Decision (Ledger) |
| **Goal** | Project goal |
| **Build** | Feature / build work |
| **Risk** | Tracked risk |
| **Question** | First-class open question (if still open but elevated) |

"Ledger" is the committed posture of promoted Decisions (and related committed types) — not a separate duplicate store. Flow-node graduation may be added later; do not fake it.

The chosen type **must** be persisted. Cosmetic menus that ignore the selection violate this contract.

Secondary: notes, enrichment detail, open source conversation. These must not replace the four primary verbs.

---

## 4. What removes it (exit rules)

Parking Lot items must not live forever.

| Exit | What counts as answered / done |
|---|---|
| **Promoted** | User promotes to a destination above |
| **Deleted** | User discards |
| **Resolved automatically** | Underlying question answered elsewhere — e.g. user (or Joy) commits a matching Decision; related commitment lands; item superseded |
| **Kept** | Still genuinely unresolved — remains open with honest last-touched |

Resume alone does **not** remove an item.

### Auto-resolution triggers (implementation)

Treat as resolved when any of:

1. User explicitly commits a matching Decision / related commitment  
2. The parked item itself is Promoted  
3. User Deletes it  
4. A newer entry supersedes it (`supersedesId` / equivalent)  

Project-milestone close may resolve linked parked work once linkage exists; until then, prefer explicit commit/promote/delete/supersede.

Stale open items without touch should show last-touched so trust does not erode silently.

---

## 5. Metadata on every card

Required, visible or one tap away:

| Field | Values / source |
|---|---|
| **Source conversation** | Session / message / context pointer for Resume |
| **Confidence** | Numeric; required for Auto; drives intake behavior |
| **Origin** | `User` \| `Joy` \| `Auto` |
| **Category** | Idea / Decision / Clarification / Risk / Research / Later |
| **Date parked** | Created |
| **Last touched** | Updated or last Resume/Clarify/Note |

### Capture intents vs categories

- Park destination chips: **Idea · Decision · Build · Later** (map Build → build work; Later = catch-all).  
- **Dump is not a Parking Lot intent.** Dump / raw brain belongs on **Forge Intake** only.  
- Once something reaches the Parking Lot, it has survived one level of processing — it deserves another conversation, not a dump label.

Category chips on the lot must **filter** real persisted categories.

AI `atlasCategory` may continue as enrichment but must map deliberately to the product taxonomy when used for browse.

---

## Relationship to other surfaces

| Surface | Boundary |
|---|---|
| **Ledger** | Committed record. Parking → Ledger is promotion/status, not a copy. |
| **Ask Joy / Workspace chat** | Where Resume and Clarify continue; where Joy asks to park. |
| **Forge / Intake** | Raw brain-dump. Dump language lives here. |
| **Home** | May surface parked items; **must not** auto-fill the lot on handoff. |

---

## Settled architectural decisions

These are closed unless implementation reveals a bug:

1. Dump → Later on Park; Dump stays on Forge Intake  
2. Membership = unfinished / intentionally deferred cognitive work  
3. Intake sources are known and tiered (User / Joy+consent / Auto)  
4. Resume / Clarify / Promote / Delete are the four verbs  
5. Card metadata set above is enough  
6. One `entries` object + status; two-tier enrichment stays  

---

## Implementation backlog (build, not redesign)

1. **Home handoff** — stop unconditional auto-park; only park if intentionally deferred and confidence ≥ auto threshold (default: park nothing on handoff)  
2. **Confidence behavior** — enforce 95 / 80 thresholds on auto paths; ask path for mid band  
3. **Auto-resolution** — resolve matching parked items when answered elsewhere  
4. **Promote destinations** — always ask where; persist chosen type  
5. **Filter chips** — persist category on park; chips filter the list  
6. **Clarify ≠ Resume** — distinct questioning prefill / loop  
7. Usability pass after end-to-end behavior works  

---

## Implementation principles (non-negotiable)

1. **One object** — `entries` + status; no parallel parking store.  
2. **Consent over cleverness** — prefer asking to park over silent capture when unsure.  
3. **Exit over endless intake** — every intake path needs a resolve story.  
4. **Honest labels** — if the UI offers Clarify or a Promote type, the behavior must match.  
5. **Seeds, not dumps** — naming and empty states reinforce unfinished thinking worth returning to.  
6. **Decision queue** — every item is headed toward Resolved, Promoted, Deleted, or consciously Kept.

---

## Five-question gate (before changing the feature)

Before adding an intake path, action, or UI chrome to the Parking Lot, answer:

1. Does this item / path pass the **membership** rule and litmus ("intentionally deferred?")?  
2. Which **intake tier** (User / Joy+consent / Auto) owns it, and does confidence behavior apply?  
3. Which **action** or **exit** does this change affect?  
4. What **removes** items created or touched by this change?  
5. Which of the **six metadata fields** does the user gain or lose?  
6. Does this still pass the **six-month rule**?

If any answer is missing, do not ship the change yet.

---

## Version

| Version | Date | Notes |
|---|---|---|
| 0.1 | 2026-07-24 | Proposed from product audit |
| 0.2 | 2026-07-24 | Architecture settled: six-month rule, decision-queue philosophy, confidence thresholds, promote graduation, resolve triggers, home-handoff forbid, no Assumption category, implementation backlog |
