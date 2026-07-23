# Milestone 2.3 — Lens Differentiation Design

**Phase:** Phase C (Constitution on live chat) in progress  
**Date:** 2026-07-23  
**Status:** **PHASE 0 CLOSED** · **Phase A PASS** · **Phase B CLOSED** · **Phase C landing**  
**Prerequisite:** Milestone 2.2 CLOSED (intelligence correctness)  
**Parent board:** [`milestone-2-restore-intelligence.md`](./milestone-2-restore-intelligence.md)  
**Repo HEAD at commission:** `51acaf50` (`main`, post #217)

### Approvals (2026-07-23)

| Item | Decision |
|------|----------|
| §3 Lens Constitution | **Approved** (incl. one-sentence contracts below) |
| §4 Evaluation battery (T1–T6 + L1–L5) | **Approved** |
| Phase 0 scope | **Map + live chat plumbing first** → Constitution on Map → live chat → same battery on both |
| §9 Naming | **Signed off** — see checklist; Flow → Storyteller confirmed |

### One-sentence contracts (canonical — Constitution, eval, UI tooltips)

| Lens | Primary question | Contract |
|------|------------------|----------|
| **Designer** | How should this be experienced? | Optimizes for the user's experience, clarity, usability, and emotional impact. |
| **Builder** | How should this be constructed? | Optimizes for feasibility, implementation, systems, and execution. |
| **Storyteller** | What is the meaning, narrative, and human journey? | Optimizes for meaning, communication, narrative, motivation, and long-term identity. |

These three sentences are the shared mental model for users and developers. Implementation must surface them in UI tooltips and keep eval/docs in sync.

---

## Governing question

> Does the same project question receive three genuinely different professional perspectives — or three skins on one answer?

**Not personality. Not tone. Perspective and job.**

Example question: *“Build a community page for Reveal.”*

| Lens | Must naturally own |
|------|--------------------|
| **Designer** | Experience, interaction, visual hierarchy, emotion, usability |
| **Builder** | Architecture, implementation, APIs, data, execution sequence |
| **Storyteller** | Meaning, narrative, user journey, engagement, communication |

If the three outputs are rewriteable into each other by swapping headings, differentiation has failed.

---

## 0. Scope clarification — unify to one lens architecture

Axiom **today** has two parallel systems (inventory in §1). **2.3 approved scope** collapses that into **one architecture**:

> The active lens is a first-class signal carried through the **entire** reasoning pipeline (UI → client transport → Nexus/live server → expand-node / chat assembly → SSE/UI). Map and chat are **surfaces** that consume the same lens identity — not two competing taxonomies.

| Concern | Approved direction |
|---------|-------------------|
| Canonical lens identities | **Designer · Builder · Storyteller** (Constitution §3) |
| Map surface | Implements Constitution first (presentation + generative) |
| Chat surface | **Plumbing first** (carry active lens end-to-end); **full chat differentiation second** |
| Legacy chat modes (Flow / Build / Look / Scenario) | Retire or remap under naming plan §9 — must not remain a second ontology |
| Evaluation | Same T1–T6 battery on Map **and** live chat once each surface claims differentiation |

**Naming traps (current code — resolve via §9 before impl):**

- Chat **Build** ≠ Map **Builder**
- Chat **Flow** ≠ Flow Map surface
- History `AtlasLens` (`builder` / `strategic` / `minimal`) ≠ either system
- Soft Nexus copy (“Which lens? Positioning / UX…”) is not selectable state

---

## 1. Current State

### 1.1 Map / Flow UI lenses (Designer · Builder · Storyteller)

**Shared data:** in-memory Flow `nodes` drawn from `projects.nodeState` (strategic graph). Dual store also exists (`project_flow_canvas` AM projection) — Map lenses read the strategic node array in `FlowPanel`, not a per-lens knowledge store.

**Selection:** tab switcher inside `FlowPanel` (`lensView` local React state — **not persisted**). Labels: Designer / experience · Builder / execution · Storyteller / story.

**Display:** same panel; body swaps by `lensView`.

**AI touchpoint:** `POST /api/expand-node` (`forge.ts`) — same transcript grounding (last ~30 Nexus messages); only a short `lensInstructions` string differs. Cache key includes lens (`nodeId:lens`).

#### Designer

| Dimension | Current state |
|-----------|---------------|
| **Purpose** | Spatial “what experience are we creating?” — AxiomFlow canvas **is** the design perspective |
| **Prompt** | Expand-node only: *“Focus on user experience, journeys, personas, pain points…”* (`forge.ts`) |
| **Routing** | Client `lensView === "designer"` → render `<AxiomFlow lens="designer" />`; expand passes `lens: "designer"` |
| **Selected** | FlowPanel tab “Designer” |
| **Displayed** | Visual node graph (constellations, blocker glow, MoSCoW, resolved ✓) with designer-specific style hooks |
| **Shared code** | Same `nodes` array, same expand-node route, shared `AxiomFlow` |
| **Duplicated code** | Lens instruction string parallel to Builder/Storyteller (three one-liners) |
| **Limitations** | Differentiation is mostly **layout/visual**, not a distinct reasoning pipeline. Expand-node AI is prompt-variation only. No constitution-driven refusal when asked for pure API design. |

#### Builder (Map)

| Dimension | Current state |
|-----------|---------------|
| **Purpose** | Execution schema — “what needs to be built / what next?” |
| **Prompt** | Expand-node: *“Focus on technical components, APIs, data models…”* |
| **Routing** | `lensView === "builder"` → monospace type-grouped list UI (not canvas) |
| **Selected** | FlowPanel tab “Builder” |
| **Displayed** | Schema-style sections: requirements / decisions / sprints / priorities / blockers / out_of_scope (contract: `.agents/memory/builder-lens-identity.md`) |
| **Shared code** | Same `nodes`; client-side regrouping only |
| **Duplicated code** | Prior status-grouped layout still documented in older `flow-lens-architecture.md` — **drift risk** vs identity doc |
| **Limitations** | Strong **presentation** differentiation; weak **generative** differentiation. Asking Builder a product-feel question still hits the same expand model with a one-line bias. No enforcement that answers refuse UX-only framing. |

#### Storyteller

| Dimension | Current state |
|-----------|---------------|
| **Purpose** | Narrative chapters — “why does this project exist?” |
| **Prompt** | Expand-node: *“Focus on origin story, vision, the why…”* |
| **Routing** | `lensView === "storyteller"` → five fixed chapters |
| **Selected** | FlowPanel tab “Storyteller” |
| **Displayed** | Chapters: The Origin · What Was Decided · Still Being Shaped · Active Risks · Tradeoffs Made |
| **Shared code** | Same `nodes`; chapter assignment is client heuristics on type/status |
| **Duplicated code** | Chapter copy structure unique; expand-node instruction still parallel one-liner |
| **Limitations** | Round 2 noted chapters are **status narrative**, not true chronology. Risk of restating Builder lists in prose. Expand-node same as siblings. |

**Existing identity notes (not a full constitution):**

- `.agents/memory/flow-lens-architecture.md` — three questions on one graph  
- `.agents/memory/builder-lens-identity.md` — Builder must stay schema/monospace  
- `.agents/memory/axiom-flow-vision.md` — perspectives, not datasets  
- M2.2 L1–L3 criteria (distinct job / distinct output / useful alone)

---

### 1.2 Workspace chat lenses (Flow · Build · Look · Scenario)

**Type:** `WorkspaceLens = "flow" | "build" | "look" | "scenario"` (`useChatLens.ts`).

**Selection:** Workspace composer lens picker; persisted `localStorage atlas-ws-lens-v2-${projectId}`.

**UI config** (`workspace.tsx` `LENS_CONFIG`):

| Lens | Sublabel | Default model |
|------|----------|---------------|
| Flow | Think it through | Claude |
| Build | Write code · push to GitHub | Claude |
| Look | CSS · animation · visual | Gemini |
| Scenario | What if — no commitment | (keep current) |

**Canonical prompts** live in `artifacts/api-server/src/routes/chat.ts` (`workspaceLensInstructions`) — disposition blocks + `LENS_DRIFT` hints + optional `previousLens` transition carry-forward.

| Lens | Purpose (as coded on `/api/chat`) | Side effects / extras |
|------|-----------------------------------|------------------------|
| **Flow** | Strategic exploration, clarifying questions | Soft drift → Build if code-heavy |
| **Build** | Code-first, FILE_EDIT, GitHub push | Design Plan injection; integrity if long prose without edits; model forced Claude when buildMode |
| **Look** | Visual/UI-first, design tokens, a11y | UI switches model to Gemini; FilesPanel visual grid bias |
| **Scenario** | Speculative; no commitments | `scenarioMode` suppresses decision-catch / some persist / auto-name on **chat** path; client buffer + Keep/Discard |

**Critical live-path finding:**

> Workspace send uses `useNexusWorkspaceChat = true` → `POST /api/nexus/chat` (`nexus.ts`).  
> **`nexus.ts` has no `workspaceLens` handling** (confirmed by search).  
> Chat-lens **prompt blocks in `chat.ts` do not reach the live Workspace composer.**

What still works on Nexus for chat lenses today:

- **UI chrome** (picker, placeholders, aura colors)
- **Model wire** (Look → Gemini via `wsModel`)
- **Some panel chrome** (Terminal availability for Build/Scenario; FilesPanel view biases)
- Scenario exit UX on client

What does **not** work as designed:

- Lens instruction injection into the live model turn
- Lens transition carry-forward from `chat.ts`
- Scenario side-effect gating that only exists on `/api/chat`

**Shared vs duplicated (chat):**

| Concern | Reality |
|---------|---------|
| Prompt assembly | Duplicated: `chat.ts` vs `nexus.ts` (hand-ported cousins) |
| Tool registry | Partially shared (`SHARED_WORKSPACE_TOOL_NAMES`) |
| Lens type defs | Duplicated across `useChatLens.ts`, `workspace.tsx`, presets |
| Map chat inside FlowPanel | Third flavor: `flowMode: true` on `/api/chat` (FLOW ARCHITECT / `FLOW_NODE`) — not `workspaceLens` |

---

### 1.3 Current-state verdict

| System | Differentiation mechanism today | Supports genuine reasoning split? |
|--------|----------------------------------|-----------------------------------|
| Map lenses | **Presentation** (canvas / schema / chapters) + **one-line expand prompt** | **Partial** — good structural UI split; generative path is prompt variation on shared context |
| Chat lenses (designed) | Disposition prompts + model + side-effect gates | **Designed yes / live no** — prompts stranded on non-live `/api/chat` |
| Expand-node AI | Shared transcript + shared model + shared schema | **Prompt variation only** |

**2.3 does not start from “no lenses.”** It starts from **presentation-first Map lenses** and **broken/incomplete chat-lens wiring**, without a governing constitution that forces disagreement and different evidence.

---

## 2. Definition of Lens Differentiation

### 2.1 What counts as differentiated

A lens is differentiated when, for the **same project**, the **same user question**, and the **same underlying knowledge**:

1. **Different primary question** is answered (not a synonym).
2. **Different evidence** is privileged (UX signals vs systems vs story/meaning).
3. **Different structure** of output (journey/wireframe thinking vs execution plan vs narrative arc).
4. **Different blind spots** are admitted (what this lens refuses to pretend it owns).
5. **Useful disagreement** is possible (“Builder rejects Designer’s approach as unimplementable”; “Storyteller rejects Builder’s plan as meaningless to the user”).

### 2.2 What does *not* count

- Rewriting the same bullet list with warmer/cooler tone  
- Changing only headings (“Experience” vs “Implementation” vs “Story”)  
- Personality / voice tricks without different content  
- Three skins over one shared outline produced once and restyled  

### 2.3 Worked example (acceptance sketch)

**Question:** Build a community page for Reveal.

| Lens | Pass-shaped answer includes… | Fail-shaped answer… |
|------|------------------------------|----------------------|
| Designer | Entry states, hierarchy of posts/members, empty states, trust/safety UX, mobile thumb zones | Lists API routes and DB tables as the main content |
| Builder | Route/component boundaries, data model for posts/membership, authz, pagination, ship sequence | Speaks only in “feel / delight / brand story” |
| Storyteller | Why community exists for Reveal’s users, the journey from lurker→contributor, what success *means* | Restates Builder’s schema in paragraph form |

---

## 3. Lens Constitution

> Governing specification — **not prompt text**. Prompts (later) must obey this; this document does not rewrite prompts.

Applies to the **one vocabulary**: Designer · Builder · Storyteller (Map and live chat surfaces).

### 3.0 Canonical contracts (must stay identical everywhere)

| Lens | Primary question | One-sentence contract |
|------|------------------|----------------------|
| **Designer** | How should this be experienced? | Optimizes for the user's experience, clarity, usability, and emotional impact. |
| **Builder** | How should this be constructed? | Optimizes for feasibility, implementation, systems, and execution. |
| **Storyteller** | What is the meaning, narrative, and human journey? | Optimizes for meaning, communication, narrative, motivation, and long-term identity. |

### 3.1 Designer

| Field | Specification |
|-------|----------------|
| **Contract** | Optimizes for the user's experience, clarity, usability, and emotional impact. |
| **Primary question** | How should this be experienced? |
| **Mission** | Make the product *experienceable* — what a human encounters, feels, and can do. |
| **Primary objective** | Define interaction, hierarchy, emotion, and usability of the proposed change. |
| **Primary questions** | What does the user see first? Where do they get stuck? What emotion should this surface hold? What is the interaction model? What fails accessibility or trust? |
| **Preferred evidence** | User journeys, UI states (empty/loading/error/success), visual hierarchy, copy as UI, affordances, existing design tokens / Look-adjacent patterns, Flow nodes typed as experience/requirements. |
| **Blind spots** | Does not own production architecture, schema design, or infra sequencing. May sketch constraints (“needs auth”) without specifying tables. |
| **Success criteria** | A designer or PM could start wireframes / UX writing from the answer alone. Mentions states and interaction, not only features. |
| **Failure modes** | Speaks as a backend plan; generic “make it beautiful”; duplicates Storyteller’s meaning essay without interaction specifics. |
| **When to disagree** | With **Builder** when the implementation plan would harm clarity, trust, or usability. With **Storyteller** when the narrative promise cannot be expressed in the actual UI path. |

### 3.2 Builder

| Field | Specification |
|-------|----------------|
| **Contract** | Optimizes for feasibility, implementation, systems, and execution. |
| **Primary question** | How should this be constructed? |
| **Mission** | Make the product *buildable* — architecture, interfaces, data, and execution order. |
| **Primary objective** | Specify what to implement, in what order, against what system boundaries. |
| **Primary questions** | What components/APIs/data change? What are dependencies and risks? What is the smallest shippable slice? What is explicitly out of scope? |
| **Preferred evidence** | Stack/DNA, Application Model entities, existing routes/files, Flow requirements/decisions/blockers/sprints, repo reality when available. |
| **Blind spots** | Does not own brand narrative or emotional tone. Mentions UX only as acceptance constraints (“must support empty state”), not as the deliverable. |
| **Success criteria** | An engineer could open an implementation checklist / PR plan from the answer alone. Type-grouped, sequence-aware, constraint-honest. |
| **Failure modes** | Motivational prose; restyling Designer’s journey as “steps”; inventing stack that contradicts project DNA; schema aesthetic without substance. |
| **When to disagree** | With **Designer** when the experience implies unbounded scope or impossible latency/authz. With **Storyteller** when the story implies features that have no execution path this milestone. |

### 3.3 Storyteller

| Field | Specification |
|-------|----------------|
| **Contract** | Optimizes for meaning, communication, narrative, motivation, and long-term identity. |
| **Primary question** | What is the meaning, narrative, and human journey? |
| **Mission** | Make the product *meaningful* — why it exists, who it is for, and how the journey earns trust. |
| **Primary questions** | Why does this matter now? What story does the user enter? What commitment are we making? What would make this hollow? |
| **Preferred evidence** | Purpose/wedge/audience (DNA/Blueprint), resolved decisions, risks/tradeoffs, human problem statements, Flow goal + strategic answers. |
| **Blind spots** | Does not own API shapes or CSS systems. Mentions “page” as a narrative beat, not a component tree. |
| **Success criteria** | A founder or marketer could explain the change’s meaning and user journey without reading code. Distinct chapters or arc — not a bullet dump of requirements. |
| **Failure modes** | Chat summary; Builder list in paragraphs; Designer UI checklist without meaning; inventing lore not grounded in project knowledge. |
| **When to disagree** | With **Builder** when the plan ships capability that does not advance the founding promise. With **Designer** when the UI optimizes convenience against the story’s required friction (e.g. trust, ritual, commitment). |

### 3.4 Cross-cutting constitutional rules

1. **One graph, three jobs** — shared knowledge is required; shared *outline* is forbidden.  
2. **No silent restyle** — if two lenses produce isomorphic content, at least one has failed.  
3. **Disagreement is a feature** — lenses may conflict; the user (or a later synthesis mode) resolves. 2.3 does not require automatic merge.  
4. **Grounding beats invention** — prefer Blueprint/DNA/Flow/AM evidence; inventing stack or lore is a fail.  
5. **Constitution > prompt** — future prompt edits are invalid if they violate §3.

---

## 4. Evaluation Framework

### 4.1 Protocol

For each test case:

1. Fix project context (same Workspace / same Flow graph / same DNA).  
2. Ask the **identical** user prompt under each of Designer, Builder, Storyteller.  
3. Capture three responses (Map expand and/or future chat-bound lens answers — specify which surface under test).  
4. Score with the rubric below.  
5. **Pass the case** only if L1–L3 all Pass for that case.

### 4.2 Rubric (per case)

| ID | Criterion | Pass if… |
|----|-----------|----------|
| **L1** Distinct job | Each answer clearly serves its §3.0 one-sentence contract and primary question |
| **L2** Distinct content | ≥2 substantive claims unique to each lens; not a heading swap |
| **L3** Useful alone | A practitioner of that craft could act without reading the other two |
| **L4** Grounded | No invented stack/lore that contradicts project knowledge |
| **L5** Productive disagreement | At least one tension or explicit non-overlap across the trio (optional for soft cases; required for adversarial cases) |

**Fail fast:** If any two answers are paraphrases, mark L2 Fail regardless of tone.

### 4.3 Test battery

#### T1 — Product design

**Prompt:** *Build a community page for Reveal.*

| Lens | Must include | Must not dominate |
|------|--------------|-------------------|
| Designer | States, hierarchy, interaction, trust/safety UX | API/DB design |
| Builder | Components/routes/data/authz/ship slice | Brand essay |
| Storyteller | Why community; lurker→member arc; meaning | Schema dump |

**Eval notes:** Primary acceptance example for 2.3.

---

#### T2 — Business strategy

**Prompt:** *Should Reveal charge for community access in v1?*

| Lens | Expected center of gravity |
|------|----------------------------|
| Designer | Pricing UX, permissioning, perceived fairness, upgrade moments |
| Builder | Entitlements model, paywall enforcement, migration, analytics hooks |
| Storyteller | What paid vs free *means* for the founding promise and trust |

**Eval:** Disagreement expected (Storyteller may resist paywall that Builder finds trivial).

---

#### T3 — Technical planning

**Prompt:** *Add real-time notifications when someone replies in the community.*

| Lens | Expected center of gravity |
|------|----------------------------|
| Designer | Notification UX, noise control, mute, inbox vs toast |
| Builder | Transport (SSE/WS), fan-out, persistence, idempotency, failure modes |
| Storyteller | What “being answered” means for belonging; when silence is sacred |

**Eval:** Builder must be specific; Designer must own interrupt ethics; Storyteller must not become an architecture doc.

---

#### T4 — Bible study

**Prompt:** *Design a weekly group Bible study rhythm inside Reveal’s community.*

| Lens | Expected center of gravity |
|------|----------------------------|
| Designer | Session structure UI, reading plan affordances, accessibility, quiet mode |
| Builder | Content model (passages, notes, schedules), roles, reminders jobs |
| Storyteller | Spiritual posture, communal formation, tone of invitation vs content dump |

**Eval:** Tests non-SaaS domain; Storyteller should not collapse into “engagement metrics.”

---

#### T5 — Personal planning

**Prompt:** *Help me plan my next four weeks as founder of Reveal.*

| Lens | Expected center of gravity |
|------|----------------------------|
| Designer | Personal operating cadence as *experienced* (energy, focus surfaces) |
| Builder | Concrete backlog, dependencies, ship criteria, calendarizable tasks |
| Storyteller | Narrative of the season — what this month means relative to the mission |

**Eval:** Personal context; still must not produce three identical “week 1–4” lists.

---

#### T6 — Creative writing

**Prompt:** *Write the opening of the community page — the first thing a new member reads.*

| Lens | Expected center of gravity |
|------|----------------------------|
| Designer | Placement, hierarchy, CTA, scanning pattern, alternate states |
| Builder | Where copy lives (CMS/i18n/component), constraints, variants |
| Storyteller | The actual voice and story of the opening (this is Storyteller’s home turf) |

**Eval:** Only Storyteller should produce the primary prose artifact; others frame constraints.

---

### 4.4 Scoring sheet (copy per run)

```
Case: T_
Surface under test: Map expand / Map view-only / Chat (specify)
Designer: L1_ L2_ L3_ L4_ L5_   Notes:
Builder:  L1_ L2_ L3_ L4_ L5_   Notes:
Storyteller: L1_ L2_ L3_ L4_ L5_ Notes:
Case result: Pass / Fail
Overall 2.3 battery: _ / 6 cases Pass
```

**Milestone pass suggestion:** ≥5/6 cases Pass, including **T1 mandatory Pass**, and L5 Pass on ≥2 adversarial cases (T2 or T3 recommended).

---

## 5. Architecture Review

### 5.1 Does current implementation support differentiated reasoning?

| Layer | Assessment |
|-------|------------|
| Map **presentation** | **Yes, partially** — canvas vs schema vs chapters is a real structural split (L1 for *views*). |
| Map **generative** expand-node | **No — prompt variation only** — shared model, shared transcript, shared JSON schema, three instruction sentences. |
| Chat lens **design** (`chat.ts`) | Disposition prompts + Scenario gates = stronger differentiation *if live*. |
| Chat lens **live** (`nexus.ts`) | **Does not implement `workspaceLens`** — differentiation collapses to model/UI chrome. |
| Shared knowledge | Correct and desired (one project truth). |
| Shared outline risk | High — one expand call shape + one transcript → isomorphic sub-nodes with different adjectives. |

**Conclusion (superseded by approval):** Today’s Map lenses are presentation-first; chat lens prompts are stranded on `/api/chat`. **Approved plan:** (1) one pipeline carrying active lens on Map + live Nexus, (2) Constitution on Map generative path, (3) full live-chat differentiation, (4) same battery on both.

### 5.2 Shared prompts / context / routing

| Asset | Shared? | Implication |
|-------|---------|-------------|
| Flow `nodeState` | Shared across Map lenses | Good for truth; bad if only restyled |
| Expand-node system prompt shell | Shared | Forces same output schema for all lenses |
| Expand-node lens instructions | Tiny per-lens delta | Insufficient for constitutional jobs |
| Nexus transcript grounding | Shared | Good; needs per-lens *evidence filters*, not only adjectives |
| Chat system prompt (Nexus) | Shared; **no lens block** | Live chat ignores lens |
| Chat system prompt (chat.ts) | Has lens blocks | Dead for Workspace composer |
| Dual stores (`nodeState` vs `project_flow_canvas`) | Parallel | Confusion risk; not per-lens |

### 5.3 Opportunities for separation (design only — no implementation)

Ordered by leverage for true differentiation:

1. **Constitution-bound lens packs** — separate mission/questions/evidence/blind-spots injected as structured policy (not tone adjectives).  
2. **Evidence filters** — Designer privileges journey/UI nodes + DNA audience; Builder privileges AM/entities/stack/blockers; Storyteller privileges purpose/decisions/risks. Same store, different retrieval weighting.  
3. **Output contracts** — different response schemas (journey states vs execution checklist vs narrative chapters) instead of one JSON sub-node array for all.  
4. **Disagreement pass** — optional second step: “state what you reject from the other lenses’ default instincts” (eval L5).  
5. **Live-path unification** — either port lens policy into `nexus.ts` or stop exposing chat lenses that do not affect reasoning.  
6. **Persist Map `lensView`** — minor UX; not differentiation.  
7. **Resolve doc drift** — `flow-lens-architecture.md` (status-grouped Builder) vs `builder-lens-identity.md` (type-grouped) — pick one constitutionally.

### 5.4 Explicit non-goals for early 2.3

- Personality / witty voice packs  
- Three separate knowledge graphs  
- Automatic merge of the three answers  
- Rewriting prompts before Constitution + eval harness exist  

---

## 6. Roadmap (implementation phases) — **approved order**

> Complexity is technical (surface area / risk), not calendar time.  
> **Do not skip plumbing (Phase A) before Constitution work (Phase B).**

### Phase 0 — Design freeze ✅ **CLOSED**  
**Objective:** Approve Constitution, eval battery, scope, naming.  
**Acceptance:** §3 + §4 approved; §0 scope recorded; §9 naming signed off.  
**Complexity:** Low.  
**Dependencies:** 2.2 closed ✅.  
**Status:** **Complete** — Flow → Storyteller signed off; Scenario = modifier; Flow reserved for Map; AtlasLens rename required; one-sentence contracts locked.

### Phase A — One lens pipeline (plumbing only) ← **PASS**  
**Objective:** Carry **active lens** end-to-end on Map **and** live Workspace chat so there is one architecture, not two. **No full chat differentiation yet** — signal must be present, typed, logged, and consumed as a stub/policy hook on Nexus (may be no-op or identity-only beyond “lens=X is active”).  
**In scope:**
- Canonical lens type shared by Map tabs + composer (post-naming: Designer | Builder | Storyteller)
- Client → `POST /api/nexus/chat` includes active lens
- Nexus accepts/persists/forwards lens on the turn (meta SSE / tracing)
- Expand-node already has `lens`; align enum + shared module with Nexus
- Map `lensView` and chat active lens stay in sync (or explicitly document single source of truth)
- Remove or stop implying legacy Flow/Build/Look/Scenario as a second ontology (per §9)
**Out of scope:** Constitution-grade evidence filters, output contracts, chat disposition packs, Scenario side-effect port  
**Acceptance:**
- Trace one Workspace send: UI selection → request body → Nexus log/meta → (optional) prompt stub acknowledges lens id
- Trace one Map expand: same lens id enum as chat
- No second parallel `workspaceLens` string space left live in composer
- Automated or manual trace checklist checked in  
**Complexity:** Medium (Nexus + client wiring; naming migration).  
**Dependencies:** Phase 0 naming sign-off.  
**Status:** **PASS** (2026-07-23) — plumbing complete; no behavioral differentiation introduced. Checklist: [`milestone-2-3-phase-a-trace-checklist.md`](./milestone-2-3-phase-a-trace-checklist.md).

### Phase A′ — Baseline measurement (may parallelize after A starts)  
**Objective:** Run T1–T6 against **current** Map behavior (pre-Constitution) for a before/after delta.  
**Acceptance:** Baseline score sheet published.  
**Complexity:** Low–medium.  
**Dependencies:** Phase 0.

### Phase B — Constitution on Map path ← **CLOSED**  
**Objective:** Implement §3 on Map generative + presentation path (expand-node / Map-bound reasoning): policy, evidence weighting, output contracts — not adjective swaps.  
**Acceptance:** Re-run battery on **Map**; T1 Pass mandatory; ≥5/6 Pass; L2 improves vs baseline; Builder remains schema-true.  
**Complexity:** Medium–high.  
**Dependencies:** Phase A (shared lens identity); Phase A′ baseline preferred.  
**Status:** **CLOSED** (2026-07-23) — battery **6/6 Pass**, T1 Pass. Score sheet: [`milestone-2-3-phase-b-battery/score-sheet.md`](./milestone-2-3-phase-b-battery/score-sheet.md).

### Phase C — Constitution on live chat ← **IN PROGRESS**  
**Objective:** Full live-chat differentiation using the **same** Constitution and lens ids (now that plumbing exists). Port/replace stranded `chat.ts` disposition logic onto Nexus under Designer/Builder/Storyteller — not a revival of Flow/Build/Look/Scenario as a second set.  
**Acceptance:** Re-run **same** T1–T6 battery on **live chat**; Pass bar matches Map (≥5/6, T1 mandatory); selecting a lens changes reasoning content (L2), not only model chrome.  
**Complexity:** High.  
**Dependencies:** Phase A + Phase B quality bar (Map proves Constitution works before chat absorbs it).  
**Status (landing):**
- ✅ Nexus Workspace injects `buildLiveChatConstitutionBlock(perspective, speculate)`
- ✅ Lens-weighted DNA emphasis on focused-project context
- ✅ Soft “which lens?” copy remapped to Designer / Builder / Storyteller
- ⏳ Live-chat battery T1–T6 (same bar as Map)

### Phase D — Disagreement & compare (thin)  
**Objective:** Productive conflict (L5) without auto-merge — side-by-side or dissent affordance.  
**Acceptance:** T2/T3 show documented tension across lenses.  
**Complexity:** Medium.  
**Dependencies:** Phase B; Phase C for chat compare.

### Phase E — Close 2.3  
**Objective:** Milestone closed; deferred UX → 2.4.  
**Acceptance:** Map + chat both pass battery; parent board → 2.3 CLOSED; 2.4 unblocked.  
**Complexity:** Low.  
**Dependencies:** Phase B + Phase C.

---

## 7. Deferred items carried from 2.2 (not 2.3 core)

These remain **out of the lens constitution** unless a phase explicitly absorbs them:

- Resume-after-refresh as toast/card  
- Resend / interrupt idempotency  
- Quieter multi-format renderer fallback  
- Living Product Strategy Brief structure  
- “Preserved / full context” copy honesty  
- Soft Continue-in-Workspace / “What’s first?” transfer UX  

**In 2.3 core:** same question → three different perspectives (Designer / Builder / Storyteller).

---

## 8. Acceptance of *this* deliverable

| Requirement | Status |
|-------------|--------|
| Design document only | ✅ This file |
| No implementation (yet) | ✅ |
| No prompt rewriting | ✅ |
| Current state inventory | ✅ §1 |
| Definition of differentiation | ✅ §2 |
| Lens constitution | ✅ §3 **Approved** |
| Evaluation framework | ✅ §4 **Approved** |
| Architecture review | ✅ §5 |
| Phased roadmap | ✅ §6 **Approved order** |
| Naming recommendation | ✅ §9 — **Signed off** (Flow → Storyteller) |

**Next:** Finish Phase C live-chat battery (same T1–T6 bar), then Phase D/E closeout.

---

## 9. Naming collisions — recommendation (sign off before implementation)

### 9.1 Problem

| Collision | Why it hurts |
|-----------|--------------|
| Chat **Build** vs Map **Builder** | Same English root; different jobs (code-write mode vs execution schema perspective) |
| Chat **Flow** vs **Flow Map** surface | “Flow” means think-through chat *and* the graph product |
| Chat **Look** vs Designer | Overlapping “visual/UX” ownership without shared id |
| Chat **Scenario** | Side-effect mode (no commit), not a professional perspective |
| History `AtlasLens`: `builder` / `strategic` / `minimal` | Third taxonomy from Whisper intent |
| Soft Nexus “Which lens? Positioning / UX…” | Copy-only; not state |

Two taxonomies guarantee two architectures. 2.3 requires **one**.

### 9.2 Recommended model: one vocabulary, two *modifiers*

**Canonical perspectives (Constitution — user-visible lens names):**

| Id | Label | Job |
|----|-------|-----|
| `designer` | Designer | Experience / interaction / usability |
| `builder` | Builder | Architecture / implementation / execution |
| `storyteller` | Storyteller | Meaning / narrative / engagement |

**Session modifiers (not lenses — orthogonal flags):**

| Flag | Replaces | Meaning |
|------|----------|---------|
| `speculate` (or keep UI label **Scenario**) | Chat lens `scenario` | No-commitment exploration; can combine with any perspective |
| *(optional later)* `code_write` | Aspects of chat `build` FILE_EDIT pressure | Tooling bias, not a fourth perspective |

**Chat modes → remap (do not keep as parallel ontology):**

| Legacy chat mode | Remap to |
|------------------|----------|
| **Look** | **Designer** (+ model default Gemini may remain a Designer preference) |
| **Build** | **Builder** (+ optional `code_write` intensity later — Phase C) |
| **Flow** | **Storyteller** *or* default **Designer** — see choice below |
| **Scenario** | Modifier `speculate=true` on whichever perspective is active |

**Legacy Flow → Storyteller:** **SIGNED OFF.** Product rationale: keeps three non-overlapping primary questions (experience / construction / meaning). Mapping Flow → Designer would create two design-oriented concepts that overlap in users’ minds. “Think it through” lands on narrative, implications, and human journey — Storyteller’s job.

**History `AtlasLens`:** rename internally to `historyIntent` (`build` / `decide` / `chat`) — **never** call it a lens in UI or types. **SIGNED OFF.**

**Flow Map surface:** product name **Flow** / **Axiom Flow** means the visual conversation/project map only (“Open the Flow”). Lens tabs = Designer / Builder / Storyteller. Never a chat thinking mode named Flow. **SIGNED OFF.**

**Scenario:** toggle/modifier (`speculate`) on the active perspective — e.g. Builder + Scenario = “assume funding is cut in half” while still thinking as Builder. Changes assumptions, not identity. **SIGNED OFF.**

### 9.3 Migration rules (Phase A)

1. Single shared TypeScript union: `type AtlasPerspective = "designer" | "builder" | "storyteller"`.  
2. Composer picker shows only those three (+ Scenario as toggle/modifier).  
3. Persist `atlas-ws-lens-v2-*` values migrated: `look→designer`, `build→builder`, `flow→storyteller`, `scenario→` keep perspective + set speculate flag.  
4. Map `lensView` uses the same union (already close).  
5. Nexus + expand-node accept only the canonical union.  
6. UI tooltips use the §3.0 one-sentence contracts verbatim.  
7. Docs: deprecate dual wording in `flow-lens-architecture.md`; Builder presentation rules stay in `builder-lens-identity.md` under id `builder`.  
8. Rename `AtlasLens` → `historyIntent` (or equivalent) in types/UI copy.

### 9.4 Sign-off checklist — **COMPLETE**

- [x] Canonical ids = `designer` | `builder` | `storyteller`  
- [x] Scenario = modifier (`speculate`), not a fourth lens  
- [x] Legacy Flow maps to **Storyteller**  
- [x] History taxonomy renamed away from “lens”  
- [x] “Flow” reserved for Map surface name only  
- [x] One-sentence contracts locked for Constitution / eval / UI tooltips  

**Phase 0 closed. Phase A (plumbing) may begin.**

---

## Related docs

| Doc | Role |
|-----|------|
| [`milestone-2-restore-intelligence.md`](./milestone-2-restore-intelligence.md) | M2 sequence |
| [`milestone-2-2-intelligence-correctness.md`](./milestone-2-2-intelligence-correctness.md) | Closed; L1–L3 seed criteria |
| `.agents/memory/flow-lens-architecture.md` | Early Map lens jobs |
| `.agents/memory/builder-lens-identity.md` | Builder presentation contract |
| `.agents/memory/axiom-flow-vision.md` | Perspectives ≠ datasets |
| `.agents/memory/nexus-vs-chat-routes.md` | Live Workspace transport |
| `.agents/memory/agent-loop-lens-gating.md` | Chat Flow/Scenario gating history |
