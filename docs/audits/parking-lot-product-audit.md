# Parking Lot — Product Feature Audit

**Date:** 2026-07-24  
**Mindset:** Product contract, not bug hunt  
**Status:** OPEN — contract proposed; implementation gaps documented  
**Governing question:**

> If someone returned to this project six months later, would the Parking Lot contain only the unresolved questions that genuinely deserve another conversation?

**Verdict today:** **No.** The Parking Lot is a status-based holding area with enrichment labels, not yet Joy's working memory with the user's permission. It stores unfinished *and* incidental cognitive residue. Category toggles on Capture do not categorize. Auto-resolution is missing. Several actions are labels without distinct behavior.

**Companion contract:** [`docs/PARKING_LOT_CONTRACT.md`](../PARKING_LOT_CONTRACT.md)  
**Related:** Ledger / entries share one object model (`status`); Ask Atlas vs Workspace surface contract; `.agents/memory/parking-lot-enrichment.md`

---

## Why this audit

The Parking Lot is becoming a core Atlas surface — the same class of responsibility as Ask Joy and the Ledger. It deserves an explicit product contract before more intake paths accumulate.

This audit answers five product questions against **current behavior**, then names the gaps that keep the six-month test from passing.

---

## Immediate observation: the toggles

On the Parking Lot capture bar, tapping **Idea / Decision / Build / Dump** does not filter the list and does not categorize parked items.

| What it looks like | What it actually is |
|---|---|
| Category sort / filter for parked items | Capture **intent chips** for the composer |
| Toggling changes which items you see | Toggling only changes local UI state before submit |
| Dump is a parking category | Dump is a capture intent hint (`"raw brain"`) |

**Code path:**

1. `CaptureBar` defines intents `idea | decision | build | dump` and passes `intent` to `onPark(content, intent)`.
2. Parking Lot `handleCapture` accepts **only** `content` and calls `buildParkedEntryPayload(content)`.
3. `buildParkedEntryPayload` never stores intent, type, or category — only `status/severity: "parked"`, `mode: "think"`, title/summary.

So the user's instinct is correct: **these items are not categorized for browsing.** Enrichment later writes an `atlasCategory` into JSON for display and Joy prompts, but the list has **no category filter**.

---

## Q1 — What belongs here?

### Product answer (desired)

Unfinished cognitive work that still deserves another conversation:

| Belongs | Example |
|---|---|
| Idea | "What if CityHub expanded to multiple cities?" |
| Decision | "Should entrepreneurs be the primary audience?" |
| Clarification | "What exactly is the editorial identity?" |
| Risk | "Launching before the identity sentence is locked." |
| Research | "Investigate sponsorship pricing." |

### Must not belong

- Completed summaries  
- Generated PDFs / finished outputs  
- Facts already committed to the Ledger  
- Every random question the user asked  

Otherwise it becomes another inbox.

### Current reality

| Source | What lands | Fit |
|---|---|---|
| Explicit Park / ParkSheet / Capture→Park | Whatever the user typed | High trust, unbounded content |
| CommitCard → Park | Decision-catch deferral | Good |
| Joy `"park that"` tool path | Whatever Joy posts as parked | Depends on Joy discipline |
| Genome extract | Decisions & Questions → parked | Good intent; can over-capture |
| Thinking receipts | Decision receipts ≥ 90 confidence → parked | High bar; still Decision-only |
| Ledger auto-draft (DECIDE) | Draft Decision → parked | Good |
| Home handoff | Last ~4 user messages parked as ideas | **Weak** — conversation residue |
| Forge intake seeds | Intake context parked | Mixed — raw dump energy |

**Architectural lock (correct):** Ledger and Parking Lot are the **same `entries` object**, rendered by **status**. Parking Lot UI ⊆ `status ∈ { parked, draft }`.

**Product gap:** There is no membership rule that says "unresolved cognitive work only." Intake paths can park interesting scraps, handoff leftovers, and forge residue. Help copy says *"ideas and decisions that aren't ready to commit"* — close, but not the sharper standard above.

---

## Q2 — How does something get there?

### Product answer (desired)

Clear confidence tiers:

| Path | Rule | Confidence |
|---|---|---|
| User parks | Explicit "Park this" / Capture→Park / ParkSheet | Highest |
| Joy recommends | "We haven't resolved this yet" → ask "Park this?" | High after consent |
| Automatic extraction | Only high-confidence deferral language / object types | High bar only |

Good auto candidates: *"We'll decide later."* / *"We haven't answered…"* / *"Open question…"* / *"Come back to this."*

### Current reality

| Path | Consent | Confidence gating | Notes |
|---|---|---|---|
| User park | Explicit | N/A | Canonical via ParkSheet + CaptureBar |
| Joy park-on-command | Implicit in chat tool instruction | Soft | `"park that"` → POST parked entry |
| Joy resurfacing | N/A (read path) | N/A | Parked items injected into Nexus/Chat prompts; Joy may suggest revisit — does **not** create |
| Auto Decision draft | Silent create | Surface/turn gated | User confirms later via UI |
| Genome Decision/Question | Silent create | Type-based | Explicit promote still required to commit |
| Thinking receipt Decision | Silent create | Confidence ≥ 90 | Good pattern |
| Home handoff | Silent create | None | Parks recent user messages |

**Gap:** There is no first-class **"Joy asks: Park this?"** consent flow for recommendations. Auto paths exist, but membership quality varies — home handoff is the clearest over-capture risk.

---

## Q3 — What happens after it's parked?

### Product answer (desired)

| Action | Meaning |
|---|---|
| **Resume** | Continue the discussion |
| **Clarify** | Ask questions until it's actionable |
| **Promote** | Move into the project as a real decision / task / goal |
| **Delete** | Not worth tracking |

Those four are the right verbs.

### Current reality

| Action | Behavior today | Contract fit |
|---|---|---|
| **Resume** | Navigate to project; prefill composer from title/`contextWhat`. **Does not change status** — item stays parked | Correct for "continue" |
| **Clarify** | **Same handler as Resume** on `/parking` | Label only — not a distinct mode |
| **Promote…** | Menu shows Decision / Goal / Build / Risk / Question, but **every option commits status only**; selected type is ignored on the parking page | Menu is cosmetic |
| **Promote (workspace drawer)** | Decision uses `POST /entries/:id/promote`; other types mostly status-commit | Partial |
| **Commit (detail panel)** | Status → `committed` | Same as promote-without-type |
| **Delete** | Hard delete | Correct |
| **Note** | Patches `details` | Useful, secondary |
| **Open card** | Detail panel; may upgrade enrichment lite → full | Good |

**Gap:** Resume and Clarify should diverge. Promote must write the chosen type (or stop offering types). Clarify should drive a questioning loop until the item is actionable — not identical navigation.

---

## Q4 — What should remove it?

### Product answer (desired)

Items must not live forever.

When the underlying question is answered in the project — editorial identity locked, audience chosen, budget decided — the parking item should **auto-resolve** (leave the lot or become `Resolved ✓`).

Without exit rules, people stop trusting the lot because it fills with stale items.

### Current reality

| Exit | Exists? |
|---|---|
| Manual Promote / Commit | Yes → leaves parked view as Ledger committed |
| Manual Delete | Yes → gone |
| Resume alone | **No** — still parked |
| Auto-resolve when related fact/decision commits | **No** |
| Stale / age-out policy | **No** |
| Explicit Resolved state | **No** (only parked / draft / committed / reopen→draft) |

**This is the largest product hole.** Intake without exit is how working memory becomes a graveyard.

---

## Q5 — What metadata belongs on every card?

### Product answer (desired)

| Field | Why |
|---|---|
| Source conversation | Provenance / Resume target |
| Confidence | Trust in auto vs user |
| Auto / User | Intake path honesty |
| Category | Browse + mental model |
| Date parked | Freshness |
| Last touched | Staleness |

That is enough.

### Current reality

**Stored on `entries` (relevant subset):**  
`projectId`, `sessionId`, `sourceMessageId`, `status`, `type`, `title`, `summary`, `details`, `mode`, `verb`, `contextWhat`, `contextWhy`, `enrichmentJson`, `createdAt`, `updatedAt`, `lockedAt`, …

**Enrichment JSON (async):**  
Lite: `atlasCategory`, `complexity`, `whyItMatters`  
Full (on open): `options[]`, `revisitWhen`, `whatItMeans`, `whyItComesUp`

**Shown on cards typically:** title, summary, mode badge, "From: …" / "Parked", time ago, optional note. Enrichment badges after open.

| Desired field | Today |
|---|---|
| Source conversation | Partial (`sessionId`, `sourceMessageId`, `contextWhat`) — not always set; not always visible |
| Confidence | Only on some auto paths (e.g. thinking receipts); not a card field |
| Auto / User | Approximated by `mode` / `verb` (`think`, `home`, `auto`, `auto-draft`, `forge_intake`) — not a clear Auto\|User badge |
| Category | `atlasCategory` after enrich **or** Capture intent (not persisted) — **not filterable** |
| Date parked | `createdAt` (shown as relative time) |
| Last touched | `updatedAt` exists; not prominently "last touched" |

---

## About "Dump"

**Dump** is a CaptureBar intent label with hint `"raw brain"`. It is not a Parking Lot category and is not persisted on park.

Product judgment (this audit agrees with the vision note):

> Dump communicates "throw your garbage here." That is not what this feature is.

The Parking Lot is closer to **"things worth thinking about later"** — seeds, not dumps.

**Recommended rename for capture intents** (keep parking metaphor):

| Keep | Replace Dump with |
|---|---|
| Idea | **Later** or **Inbox** (if a catch-all is needed) |
| Decision | — |
| Build | — |
| — | Prefer dropping a fourth "raw" intent on the **Park** destination entirely |

If a raw-capture path must exist, it belongs on **Forge / Intake**, which already uses "brain dump" language — not on Parking Lot.

---

## Where suggestions / items come from

There is no dedicated parking-lot seed fixture. Live provenance is:

| Origin | How you can tell |
|---|---|
| Manual park | `mode: "think"`; often no `verb` |
| Home handoff | `mode: "home"`, `verb: home_handoff` / `idea` |
| Forge intake | `verb: "forge_intake"` |
| Genome extract | `mode: "auto"`; typed Decision/Question |
| Ledger DECIDE draft | `mode: "auto-draft"`; Decision |
| Thinking receipt | Decision; high confidence gate |
| Joy tool park | POST from chat tool path |

UI rarely surfaces this provenance clearly. Cards often read as generic "Parked" notes, which makes the lot feel mysterious — as if items appeared without a story.

---

## Architecture note (keep)

Do **not** invent a second store. Parking Lot = Ledger entries with deferred status is the right model. The contract work is about **membership, lifecycle, actions, and metadata** — not a new table.

Two-tier enrichment (lite on park, full on open) is also the right cost model; keep it.

---

## Gap summary (product, not bugs)

| # | Gap | Severity for the six-month test |
|---|---|---|
| 1 | No membership contract — over-capture (esp. home handoff) | High |
| 2 | Capture intents don't persist; Dump naming wrong for Park | High (trust / mental model) |
| 3 | Categories exist as AI labels but don't drive browse/filter | Medium |
| 4 | Clarify ≡ Resume | Medium |
| 5 | Promote type menu ignores chosen type on `/parking` | Medium |
| 6 | No auto-resolve / Resolved state when work completes | **Critical** |
| 7 | Card metadata incomplete (confidence, Auto/User, source) | Medium |
| 8 | No "Joy asks: Park this?" consent path | Medium |

---

## Recommended sequence (contract → product)

1. **Adopt** [`docs/PARKING_LOT_CONTRACT.md`](../PARKING_LOT_CONTRACT.md) as the product source of truth.  
2. **Rename / narrow** Capture intents on Park destination; retire Dump from Parking.  
3. **Persist category** on park (user intent or enrichment) and add optional category filter.  
4. **Differentiate** Clarify from Resume.  
5. **Make Promote type-real** on the parking page.  
6. **Add resolve rules** — at minimum: when a Decision/identity-style commitment lands that matches a parked item, mark Resolved or remove.  
7. **Tighten auto intake** — remove or gate home-handoff parking; require consent for Joy recommendations.  
8. **Surface provenance** on every card (Auto/User, source, date, category).

None of this requires treating the Parking Lot as a bug list. It requires treating it as **Joy's working memory with the user's permission** — and holding it to the six-month test.
