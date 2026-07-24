# Workspace Plan Mode — End-to-End Audit

> Read-only audit. Repository evidence only; no product/code changes.
> Date: 2026-07-24 (revised same day with corrected product intent).
> Scope: Workspace composer “Plan Mode”, Plan Card artifact pipeline, legacy `/api/chat` `planMode`, Nexus Conversation/Build posture, related remnants.
>
> Spot-checked against: `ChatComposer.tsx`, `workspace.tsx`, `PlanCard.tsx`, `AssistantBubble.tsx`, `lib/plan.ts`, `useChatStream.ts`, `useNexusChatStream.ts`, `ConversationViewSwitcher.tsx`, `nexus.ts`, `chat.ts`, `ActiveRuns.tsx`, `mutationGuard.ts`.

---

## Verdict (corrected framing)

**Composer Plan Mode was never meant as a Conversation/Build posture switch.**

Original product intent: a **signal to Joy that this strategic conversation should culminate in a Plan Card** — a dedicated presentation artifact summarizing the plan (steps, confidence, MoSCoW, approve/skip/review) for the user. Optional related deliverables (ARTIFACT blocks) were allowed; the distinctive output was the **Plan Card**, not a mode change.

| Layer | Status on live Workspace (Nexus) |
|-------|----------------------------------|
| Composer checklist “Plan Mode” | **Cosmetic only** — mode flag never reaches Nexus |
| Signal → PLAN prompt → Haiku extract → SSE Plan Card | **Dead** on Nexus; **alive** only on legacy `/api/chat` |
| Plan Card UI (`PlanCard`, Review/Approve/Skip) | **Still mounted** in Workspace bubbles |
| How a card can still appear without Plan Mode | Prose heuristic `detectPlanFromText`, restored history `runArtifacts`, home handoff seed |
| Real posture switch today | Conversation Mode vs Build Mode (`conversationMode`) — **different product** |

**Locked product recommendation:** keep the Plan affordance; restore the requested-artifact → Plan Card pipeline on Nexus. Do not delete the button. Treat Plan as an **output type** in the same family as Decision Cards and file deliverables — orthogonal to posture and inferred intent. See §Recommendations and `docs/architecture/requested-artifacts.md`.

---

## 0. What “Plan” actually meant

### Artifact signal, not agent mode

```
User toggles Plan (checklist)  →  “this thread should produce a plan presentation”
     ↓
Joy responds strategically (structure, sequence — not FILE_EDIT by default)
     ↓
Server Haiku pass extracts structured plan JSON from the reply
     ↓
SSE plan_start (“Structuring plan…”) → SSE type:"plan"
     ↓
PlanCard: title, confidence, numbered steps, Review / Skip / Approve
```

That is an **output contract**: end the strategic turn with a reviewable plan artifact. It is closer to “generate a Plan Card” than to Conversation Mode (“don’t use tools”).

### Right verbiage

Yes — **artifact** is the right word in this codebase:

- Persisted as `runArtifacts` entry `{ type: "plan", meta: JSON }` and often `project_artifacts` type `"plan"`
- Client field `message.planArtifact` / `StructuredPlanArtifact`
- Rendered as the dedicated `PlanCard` component (not generic chat prose)

Related but **not the same**:

| Thing | What it is |
|-------|------------|
| **Plan Card** | Strategic plan presentation + Approve/Skip/Review |
| **Conversation Mode** | Hard no-tools / no-build posture |
| **DECIDE cards** | CLARIFY / TRADEOFF / DECISION_ARTIFACT — strategic cousins, different UI |
| **`generate_deliverable`** | File deliverables (docx/pptx/xlsx/…) as output cards |
| **Design Plan panel** | Product-design AM brief — name collision only |
| **Billing PlanCard** | Subscription tier UI — unrelated |

---

## 1. Original pipeline (legacy `/api/chat`)

### 1.1 Composer signal

- Local `composerMode: "plan" | "build"` in `ChatComposer`
- Send: `handleSend({ mode: composerMode })` → legacy body `{ planMode: true }`
- Chrome: gold banner “Plan Mode · Strategizing / Active”

### 1.2 Server

```4723:4757:artifacts/api-server/src/routes/chat.ts
  const activeMode = buildMode ? "build" : body.planMode ? "plan" : (body.mode ?? "think").toLowerCase();
  // PLAN: structure/architecture/sequence; no FILE_EDIT unless asked; ARTIFACT still allowed
```

Post-response (the Plan Card factory):

```6257:6295:artifacts/api-server/src/routes/chat.ts
  const isPlanMode = activeMode === "plan" || Boolean(body.planMode);
  if (isPlanMode && displayContent && displayContent.length > 40) {
    res.write(`data: ${JSON.stringify({ type: "plan_start" })}\n\n`);
    // Haiku extracts JSON → emit only if ≥2 steps and (estimatedChanges > 0 OR edit/push steps)
```

### 1.3 Client → Plan Card

- `useChatStream`: `plan_start` → `awaitingPlan` (“Structuring plan…”); `plan` → `message.planArtifact`
- `AssistantBubble`: maps `planArtifact` → `Plan` → `<PlanCard />` with Review / Skip / Approve
- Approve with no FILE_EDITs → `onExecuteHomePlan` (resubmit plan as build instruction)
- Approve with code edits → GitHub push flow

**Env-gated v2:** `USE_STRUCTURED_PLAN` + `propose_plan` → `PlanArtifactCardV2` — still `/api/chat` only; Nexus sets `structuredPlanEnabled: false`.

---

## 2. What happens on live Workspace today

### 2.1 Composer toggle still looks like a signal

Banner, gold checklist, “Strategizing…” — product language still implies “we’re producing a plan.”

### 2.2 Nexus drops the signal

```7708:7767:artifacts/atlas-frontend/src/pages/workspace.tsx
  // useNexusWorkspaceChat === true → atlasConv.submit({ text, stagedAttachments, ... })
  // no mode / planMode — return before legacy planMode/buildMode branch
```

`useNexusChatStream` has **no** `plan` / `plan_start` handlers. Nexus never runs the Haiku Plan Card extraction.

**Net:** the checklist still *looks* like the old artifact signal, but it no longer triggers Plan Card generation.

### 2.3 Residual Plan Card appearances (without Plan Mode)

| Path | How |
|------|-----|
| `detectPlanFromText` | If Joy’s prose looks like a numbered plan, Workspace bubble may still show a Plan Card (heuristic, no SSE) |
| History restore | Old `/api/chat` messages with `runArtifacts` type `plan` hydrate `planArtifact` |
| Home handoff | Can seed a message with a `Plan` via sessionStorage |

None of these are driven by the composer Plan toggle on Nexus.

---

## 3. Prompt / tools / behavior — corrected reading

### What Plan Mode originally changed (when wired)

| Layer | Effect |
|-------|--------|
| Prompt | Bias toward strategic structure; discourage FILE_EDIT |
| Tools | Soft (prompt), not a hard Nexus-style denylist |
| Output | **The distinctive change:** Haiku → structured Plan Card artifact |
| User actions | Review / Approve / Skip on that card |

### What Conversation Mode changes (live, different feature)

Hard `allowToolAccess = false`, `allowBuildSideEffects = false`, “thinking partner only” prompt. **Does not** manufacture a Plan Card.

### What DECIDE / deliverables do on Nexus (live cousins)

- **DECIDE:** CLARIFY / TRADEOFF / DECISION_ARTIFACT cards — strategic conversation artifacts, not Plan Cards
- **`generate_deliverable`:** downloadable file cards (including “project plan” as docx/xlsx) — different shape and UX

---

## 4. Intentional vs leftover (reframed)

| Piece | Assessment |
|-------|------------|
| Composer Plan checklist as **artifact signal** | **Original intent**; **orphaned** from Nexus send path |
| Haiku → Plan Card on `/api/chat` | **Intentional pipeline**; no longer reachable from Workspace composer |
| Plan Card UI still in `AssistantBubble` | **Intentional shell**; fed mainly by prose detect / history / handoff |
| Conversation / Build switcher | **Intentional posture** — not a replacement for Plan Cards |
| Spec→Build modal | Dead leftover (`setShowHandoffModal(true)` never called) |
| `onBuildAnyway` | Dead leftover |
| Treating Plan Mode as “mode switch like Conversation Mode” | **Misread** — product intent was signal → plan presentation artifact |

---

## 5. Dead / unreachable after Nexus migration

| Item | Status |
|------|--------|
| Composer Plan → Plan Card pipeline | **Broken on Workspace** (signal dropped) |
| Legacy `handleSend` `planMode` branch | Unreachable while `useNexusWorkspaceChat === true` |
| Nexus Plan Card SSE | Never implemented (`structuredPlanEnabled: false`) |
| Spec→Build modal / `onBuildAnyway` | Dead |
| ActiveRuns `decide → planMode` | Unused (form hardcoded `intent: "build"`) |

---

## 6. If composer Plan Mode were removed tomorrow

### Lost

1. Misleading “Plan Mode · Strategizing” chrome (already non-functional)
2. Legacy `/api/chat` ability for callers that still set `planMode: true` to force Haiku Plan Cards
3. The **named user affordance** that meant “this conversation should produce a Plan Card”

### Not lost (unless you also delete them)

- Plan Card **component** and Approve/Skip/Review UX
- Prose `detectPlanFromText` Plan Cards
- Home handoff / Review-tab plans
- DECIDE structured cards
- `generate_deliverable`
- Conversation Mode

### What would actually be lost vs original intent

The **user-controllable signal** “make this turn produce a Plan Card.” That capability is already gone on live Workspace; removing the button mainly removes the false promise. Restoring the original value requires **re-wiring** the signal into Nexus (or an equivalent Plan Card emission path), not keeping the dead toggle.

---

## 7. Unique user value — corrected

**Original unique value (when wired):** an explicit user signal that the strategic turn should end in a **reviewable Plan Card artifact** (structured steps + approve path), not merely “talk strategically” or “don’t build yet.”

Joy can often *infer* planning from language (WhisperGate DECIDE), and Conversation Mode can force no-tools talk — but neither is the same as:

> “Summarize this strategy as a Plan Card I can approve.”

**Today on Workspace:** that unique value is **not delivered** by the composer toggle. Closest living substitutes:

1. DECIDE cards (strategic structure, different card types)
2. Occasional prose-detected Plan Cards (unreliable, no forced Haiku pass)
3. `generate_deliverable` for file “plans” (docx/xlsx) — different artifact class

**If Plan Mode remains without re-wiring:** unique *runtime* value is none; unique *perceived* value is a broken promise.

**If Plan Mode remains with re-wiring into Nexus:** unique value returns as the explicit “produce Plan Card” signal — something WhisperGate inference and Conversation Mode do not guarantee.

---

## Recommendations (locked direction)

**Do not remove the Plan button.** Preserve it and restore the Plan Card pipeline.

The precise problem is not “Plan is useless.” It is:

> The runtime lost the connection between an explicit planning request and the Plan Card artifact.

### Three distinct concepts (do not collapse)

| Concept | Answers | Examples |
|---------|---------|----------|
| **1. Conversation posture** | How should Joy behave? | Conversation Mode · Build Mode · WhisperGate CHAT/DECIDE/BUILD |
| **2. User intent** | What is the user asking right now? | “Help me think” · “Help me decide” · “Build this” — inferred from natural language |
| **3. Requested artifact** | What should Joy leave the user with? | **Plan Card** · Decision Card · deliverable file · (future: Research Brief, Comparison Matrix, Timeline) |

Plan belongs in **(3)**. It is compatible with Conversation posture and with inferred intent. “Let’s think” and “leave me with a Plan Card” are not the same question.

### Mental rename

Prefer **Generate Plan / Create Plan / Plan Card** over “Plan Mode.” The composer is not switching Joy’s personality; it is requesting a specific deliverable in the same family as Decision Cards, PDFs, DOCX, PPTX, HTML, images.

Lovable (and Joy) often plan even when Plan is off — that is expected. Planning is AI behavior. The button’s value is the **guarantee**: when this conversation concludes, leave a reviewable planning artifact.

### Target contract

```
Tap Plan
  → conversation continues normally (posture + intent unchanged)
  → Joy plans naturally
  → turn/conversation culminates in a Plan Card
  → user: Review · Approve · Revise · Skip
  → if approved: Flow / Build / Tasks / Workspace can consume it
```

### Composer artifact family (same philosophy)

| Affordance | Culminating artifact |
|------------|----------------------|
| Plan | Plan Card |
| Decide | Decision Card |
| Research | Research Brief |
| Compare | Comparison Matrix |
| Timeline | Timeline Artifact |

Pattern: composer actions request **output types**, not mode switches.

### Implementation fix (precise)

1. Keep the Plan affordance in the composer (rename/copy toward “Plan Card” / “Create Plan” when UX allows).
2. Re-wire the signal through Nexus (`requestedArtifact: "plan"` or equivalent — not a posture flag).
3. Restore culmination: extraction or model-emitted plan block → SSE/bridge → existing `PlanCard` (Review / Approve / Revise / Skip).
4. Do not conflate with Conversation Mode; do not rely on WhisperGate alone to guarantee the card.
5. Optionally extend the same contract to Decide / Research / Compare / Timeline as sibling requested artifacts.

See also: `docs/architecture/requested-artifacts.md`.

---

## Key citations

| Claim | Evidence |
|-------|----------|
| Plan Mode → Haiku Plan Card | `chat.ts` ~6257–6295 |
| PLAN prompt biases strategy, allows ARTIFACT | `chat.ts` ~4750–4757 |
| Client “Structuring plan…” + PlanCard | `useChatStream.ts` ~835–845; `AssistantBubble.tsx` ~2441–2482 |
| PlanCard is approve/review artifact UI | `PlanCard.tsx` |
| Nexus drops composer mode | `workspace.tsx` ~7708–7767 |
| Nexus no plan SSE | `useNexusChatStream` (no handlers); `nexus.ts` `structuredPlanEnabled: false` |
| Prose fallback Plan Card | `lib/plan.ts` `detectPlanFromText`; `AssistantBubble` ~1671–1674 |
| Conversation Mode ≠ Plan Card | `ConversationViewSwitcher.tsx`; `nexus.ts` ~3997–3998 |
