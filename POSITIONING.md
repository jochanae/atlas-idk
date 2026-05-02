# Atlas — Positioning & Build Spec

> Companion to `ATLAS_CONSTITUTION.md`. The Constitution is the philosophical
> foundation. This document is the practical spec layered on top — what Atlas
> is for, what it is NOT, the engine that proves it, and the UI moments that
> expose the engine. Every product decision must answer to this document.
>
> **Last locked:** 2026-05-02
> **Status:** Active — supersedes prior "Sovereign IDE" framing on conflicts
> of product surface (the philosophy/discipline rules in the Constitution
> remain absolute).

---

## 0. The One-Sentence Truth

Atlas is **a system that helps people clarify, test, and commit decisions
before they become expensive.**

Not a strategist. Not a builder. Not a tool. A **decision partner.**

Internally, the brain that does this is called the **Decision Catch Engine.**
Externally, we lead with softer language: *"Decision Partner"* /
*"Sovereign Strategic Partner."* Never market the engine name to users.

---

## 1. The Test Every Feature Must Pass

Before adding ANYTHING — feature, component, edge function, copy change —
it must answer **yes** to one question:

> **Does this help the user make a better decision before commitment?**

Equivalent phrasing:
> **Does this reduce decision regret?**

If the answer is no, it doesn't belong at the core. It's noise — even if it's
impressive.

This test overrides backlog priority, demos, and "wouldn't it be cool if."

---

## 2. Three Non-Negotiables (Identity Rules)

If any of these break, Atlas is no longer Atlas:

1. **Atlas never leads with output.** It leads with *tension*, *misalignment*,
   or *clarity*. Spontaneously generating components, sketches, or files when
   the user is exploring is a violation.

2. **Every feature feeds the Ledger.** Conversations, sketches, file ingestion,
   code generation — all of them must end in a question the user can answer:
   *"What are we committing to?"* If a flow doesn't terminate at the Ledger,
   the flow is incomplete.

3. **Atlas must challenge the user.** Helpers assist. Partners challenge.
   Not aggressively — clearly. If Atlas only ever agrees, it's a helper, and
   we've lost.

---

## 3. The Decision Catch Engine (The Brain)

This is the moment Atlas proves its value. If this feels fake → Atlas fails.
If this feels precise → Atlas becomes addictive.

### 3.1 Trigger

The engine activates when it detects **intent + confidence + action** — not
brainstorming, not venting, not exploring.

Linguistic signals (non-exhaustive):
- "I'm going to…"
- "I think I'll…"
- "I'm about to…"
- "Let's just…"
- "I'll probably…"
- Direct future-tense commitments paired with a noun ("I'll add a social feed")

Detection happens server-side (extension of `whisper-gate.ts`). False
positives are worse than false negatives — when in doubt, **don't fire.** A
catch that doesn't land is forgivable. A catch that fires on a venting user
is identity damage.

### 3.2 The Three Checks

When the trigger fires, the engine runs three checks against the Ledger and
session memory:

| Check | Question | Source of truth |
|---|---|---|
| **Alignment** | Does this match what they said matters? | Project Compass + recent stated priorities |
| **Conflict**  | Does this contradict a past decision?     | Committed Ledger entries |
| **Pattern**   | Is this part of a behavior loop?          | Historical deviations + supersedes chain |

If none of the three return a hit, the engine stays silent. **No catch unless
there's something real to catch.**

### 3.3 The Response

What Atlas does NOT say:
- "Are you sure?"
- "That might not be ideal"
- "Consider this…"

What Atlas says (short, specific, grounded):

> *"Before you do — this breaks your earlier decision to prioritize
> simplicity. Proceed anyway?"*

Two buttons. Always two. **Proceed anyway** / **Adjust.** No third option,
no clutter, no "maybe later."

### 3.4 What Happens After

- **Proceed anyway** → Ledger logs a *deviation* entry: "Decision made against
  prior alignment — intentional tradeoff." Atlas understands this wasn't a
  mistake; it was a conscious tradeoff. The deviation is now itself a
  committed decision that future catches can reference.
- **Adjust** → Atlas reframes ("Then we're optimizing for X over Y, confirm?")
  and a `CommitPrompt` may follow.

Over time, deviations + adjustments build a model of the user's decision
style, weak points, and tradeoff patterns. **This is how Atlas becomes
personally intelligent — not just generally smart.**

---

## 4. The Universal Lifecycle Vocabulary

Every artifact in Atlas — decisions, sketches, files, drafts, generated code
— exists in exactly one of three states:

| State | Meaning |
|---|---|
| **In Motion** | Being explored, drafted, or actively shaped. |
| **Under Consideration** | Stable enough to evaluate, not yet committed. Includes "In Tension" — when two things conflict. |
| **Committed** | Locked in the Ledger. Future Decision Catches will defend it. |

A fourth implicit state — **Overridden** — exists only as a relationship
between two committed entries (supersedes chain). It's not a state an item
sits in; it's history.

This vocabulary replaces the `think/plan/build/explore/decide/audit` mode
labels in user-facing copy.

---

## 5. The Critical Interaction Loop

Every session, regardless of domain, follows this rhythm:

```
1. Anchor          ← "Where were we." (ThreadAnchor)
2. Exploration     ← User talks
3. Structuring     ← Atlas clarifies, narrows
4. Decision Intent ← Engine detects trigger
5. ⚠ Decision Catch ← Three checks, response if hit
6. User chooses    ← Proceed / Adjust
7. CommitPrompt    ← Lock it in?
8. Ledger updates  ← Memory with consequence
9. Context updates ← Patterns, tension, open loops refresh
↓
Repeat
```

The product IS this loop. Everything else is scaffolding for it.

---

## 6. UI Moments (Components Worth Building)

Each component must answer: **What moment is this? Why does it exist right
now?**

### MVP Four (build these first — Phase A)

| Component | Moment it exposes |
|---|---|
| **ThreadAnchor** | "Where were we." Persistent at top of conversation. Updates only on real shifts, not every message. |
| **DecisionCatchCard** | Inline slide-in. Two buttons: Proceed anyway / Adjust. Pauses flow visually but doesn't block typing. **The most important component in the product.** |
| **CommitPrompt** | Appears after clarity is reached (post-Adjust or post-resolution). Two buttons: Commit Decision / Keep Exploring. |
| **DecisionLedger** (grouped view) | The Ledger column. Three groups: **Committed**, **In Tension**, **Overridden**. Updates ONLY on Commit or Proceed Anyway — never from casual chat. |

### Phase B (after MVP proves)

- **DecisionDetailDrawer** — opens from a Ledger entry; shows original
  context, why it was made, what it affects, where it's been violated.
- **ActiveTensionCard** — right column. "You are balancing: Speed ↔ Trust.
  Current tilt: Speed."
- **AtlasNoticedCard** — pattern detection. "You tend to expand scope after
  initial clarity."
- **OpenLoops** — unresolved thinking threads (NOT tasks).
- **ContextIngestionCard** — replaces "here's what's in your file" with
  "this build is drifting from what you originally intended."
- **ConceptSketchCard** — inline thinking artifact. Refine / Accept Direction.

### Phase C (Workshop tools — descend intentionally)

- FileTreePanel, CodeEditor, LivePreview, DiffViewer
- Codegen pipeline
- Export drawer

These already exist. They move behind the **Workshop tab** and stop
presenting themselves as the main event.

---

## 7. Demotions & Reframings (Locked)

These were "core" under the prior framing. Under this spec they are
demoted or reframed. **Do not re-promote them without revisiting this doc.**

### 7.1 The visible mode bar — DEMOTED

`think / plan / build / explore / decide / audit` no longer appears as a
user-facing toggle. Mode detection stays internal (WhisperGate continues to
classify). Detection shifts the UI subtly:

- Auditing → more ContextCards visible
- Deciding → bias toward Decision Catch firing
- Building → Workshop becomes prominent

The user **never switches modes manually.** If they want to descend into
building, they enter the Workshop tab.

### 7.2 Codegen / LivePreview — DEMOTED to Workshop

These are real and supported, but they are **engine room**, not cockpit. The
War Room (default surface) is the cockpit. Entering the Workshop is an
intentional descent. Atlas remains available as a side panel inside Workshop.

`/build` slash command continues to work. Auto-codegen on detected BUILD
intent stays gated (already shipped). Atlas does NOT spontaneously generate
components when the user is exploring or asking about capabilities.

### 7.3 Image generation — REFRAMED as "Sketch"

The capability is real. The framing is fixed:

- **Wrong:** "Generate images." (commodity, loses)
- **Right:** "Clarify what you mean visually before committing to it."

The component is `ConceptSketchCard`. Output is a thinking artifact, not a
final asset. Two buttons: Refine / Accept Direction. Sketches that lead to
"Accept Direction" feed the Ledger as design-direction commitments.

Never marketing imagery. Never a hero image generator. Never standalone.

### 7.4 File attachments — REFRAMED as Context Ingestion

- **Wrong:** "Atlas can read your stuff" → file analyzer (commodity, loses)
- **Right:** Atlas ingests context to detect drift from stated intent.

Atlas does NOT respond with "here's what's in your file." Atlas responds
with: *"This build is drifting from what you originally intended."* or
*"This contradicts the constraint you set in the Compass."*

The output of ingestion is the same as any other input — it can fire a
Decision Catch, surface a tension, or feed the Ledger. Never a standalone
"file insight" that doesn't terminate at a decision.

---

## 8. Layout — The War Room (default surface)

Three-column on desktop, single-column with surface-bar on mobile:

```
┌──────────────┬──────────────────────────┬──────────────┐
│ Ledger (L)   │ Conversation (C)         │ Context (R)  │
│ Memory       │ Thinking / Live thread   │ Awareness    │
│              │   • ThreadAnchor (top)   │ • Tension    │
│ • Committed  │   • Messages             │ • Patterns   │
│ • In Tension │   • DecisionCatchCard    │ • Open loops │
│ • Overridden │   • CommitPrompt         │              │
└──────────────┴──────────────────────────┴──────────────┘
```

Workshop is a separate tab — `WorkspaceTabs: [War Room (default), Workshop]`.

---

## 9. What "Done" Looks Like for the MVP

The MVP four components ship as a unit. We know they're working when:

- **Users see DecisionCatch fire on real intent.** If it never fires, the
  trigger logic is broken. If it fires on venting, the trigger is too loose.
- **Users engage with the two buttons.** If they ignore them, the tone is
  wrong. If they rely on them, we've built the right thing.
- **The Ledger groups (Committed / In Tension / Overridden) reflect reality.**
  If everything piles into Committed, the lifecycle isn't being respected.
- **ThreadAnchor only updates on real shifts.** If it updates on every message,
  it's noise. If it never updates, the shift detector is broken.

---

## 10. What Does NOT Belong (Hard Stops)

The repositioning means actively saying no. The following are explicitly out
of scope unless they pass §1:

- General-purpose chat (without Decision Catch wired in)
- Image generation as a standalone feature
- File analysis as a standalone feature
- Multi-agent orchestration UI (the four-AI-roles vision in Constitution
  Section IX remains a LATER milestone, not MVP)
- Any feature whose primary value prop is "faster output"
- Any feature that produces output without offering a commit moment

---

## 11. Taglines & Voice Anchors

For copy, marketing, onboarding — pick from these. Never stray:

- *"A decision partner, not an assistant."*
- *"Move correctly, not just faster."*
- *"Thinking made visible."* (only for Sketch flow)
- *"Where were we."* (anchor moment — keep this exact phrasing)
- *"Before you do — …"* (Decision Catch lead-in — never deviate)

---

## 12. Build Order (Locked)

Phase A (now): MVP four components + engine trigger detection + deviation
logging in the Ledger. **Nothing else until this proves out.**

Phase B (after MVP proves): DecisionDetailDrawer, ActiveTensionCard,
AtlasNoticedCard, OpenLoops, Sketch flow (image generation as
ConceptSketchCard), ContextIngestionCard.

Phase C (later): Workshop polish, Constitution Section IX (multi-AI
orchestration), advanced pattern detection, cross-project memory.

---

*If a future decision conflicts with this document, this document wins
until it is explicitly updated. Update the date at the top when you do.*
