# Requested Artifacts — Posture · Intent · Output

> Product architecture note. Complements `docs/audits/workspace-plan-mode-audit.md`.
> Captures the locked recommendation after the Plan Mode audit reframing (2026-07-24).

---

## Problem the audit clarified

Composer **Plan** was misread as an AI behavior / posture switch (like Conversation vs Build).

Its original job was narrower and more valuable:

> Request a specific artifact: a **Plan Card**.

The Nexus migration dropped the wire between that request and Plan Card generation. The button still looks like a signal; the runtime no longer honors it.

**Recommendation:** restore the pipeline. Do **not** delete the button.

---

## Three concepts (keep separate)

### 1. Conversation posture — architecture

How Joy is allowed to behave this turn.

- Conversation Mode / Build Mode (`conversationMode`)
- WhisperGate: CHAT / DECIDE / BUILD
- Tool access, build side effects, write gates

Answers: *How should Joy behave?*

### 2. User intent — natural language

What the user is asking right now.

- “Help me think.”
- “Help me decide.”
- “Build this.”

Joy infers this (WhisperGate and related). Planning as *behavior* often happens without any composer toggle — that is expected and fine.

Answers: *What are they asking?*

### 3. Requested artifact — output contract

What Joy should leave the user with when the exchange culminates.

- Plan → **Plan Card**
- Decide → Decision Card
- Research → Research Brief
- Compare → Comparison Matrix
- Timeline → Timeline Artifact
- (existing family) deliverables: PDF, DOCX, PPTX, HTML, images, …

Answers: *What do you want me to leave you with?*

These three stack. Example:

| Layer | Choice |
|-------|--------|
| Posture | Conversation Mode (no tools) |
| Intent | “Help me think through the onboarding funnel” |
| Artifact | Plan Card |

Compatible. Conversation is not the opposite of Plan.

---

## Why Plan is not redundant with “Joy plans anyway”

| Without Plan affordance | With Plan affordance |
|-------------------------|----------------------|
| Joy may plan in prose when useful | Same natural planning |
| May or may not surface a reviewable card | **Guaranteed** Plan Card culmination |
| No stable approve / revise / consume hook | Review · Approve · Revise · Skip → Flow / Build / Tasks / Workspace |

The button is valuable because it requests an **output type**, not because it teaches Joy to plan.

Mental labels: **Generate Plan** / **Create Plan** / **Plan Card** — not “Plan Mode.”

---

## Target contract (Plan)

```
Tap Plan
  ↓
Conversation continues normally
  (posture + intent still govern behavior)
  ↓
Joy plans naturally in the thread
  ↓
Culmination: Plan Card artifact
  ↓
User: Review · Approve · Revise · Skip
  ↓
If approved → consume in Flow / Build / Tasks / Workspace
           → artifact remains part of project history
```

Fits Axiom’s artifact-centric direction: conversations do not only end in text; they can culminate in structured, reviewable artifacts.

---

## Composer affordances as output types

Same philosophy for sibling actions:

| Composer action | Culminating artifact |
|-----------------|----------------------|
| Plan | Plan Card |
| Decide | Decision Card |
| Research | Research Brief |
| Compare | Comparison Matrix |
| Timeline | Timeline Artifact |

The composer is not changing Joy’s personality. It is saying:

> When we’re done, I’d like this kind of deliverable.

---

## Precise fix (engineering)

1. **Preserve** the Plan composer control (copy may evolve toward Create Plan / Plan Card).
2. **Pass** a requested-artifact signal through the Nexus submit path (distinct from `conversationMode` / WhisperGate intent).
3. **Restore** culmination on Nexus: plan extraction or model-emitted plan block → stream/bridge fields → existing `PlanCard` UI.
4. **Wire** Approve into existing consume paths (execute / Flow / Build / Tasks as product defines).
5. **Extend** later with Decide / Research / Compare / Timeline under the same contract.

Do not solve this by folding Plan into Conversation Mode or by relying on intent inference alone.

---

## Related

- Audit (evidence + history): `docs/audits/workspace-plan-mode-audit.md`
- Live posture UI: `ConversationViewSwitcher.tsx`
- Plan Card UI: `components/PlanCard.tsx`
- Legacy Plan Card factory (to re-home on Nexus): `routes/chat.ts` Haiku plan extraction
- Deliverable cousins: `generate_deliverable`, DECIDE CLARIFY/TRADEOFF/DECISION_ARTIFACT
