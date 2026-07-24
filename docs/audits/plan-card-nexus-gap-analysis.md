# Gap Analysis — Workspace Plan → Plan Card (Nexus)

> Read-only Phase 1 before restoring the contract from PR #244 / `docs/architecture/requested-artifacts.md`.
> Date: 2026-07-24.

## Verdict

Not “feature absent.” Not “only a button.”

**Most of the pipeline exists as stranded legacy + a live PlanCard shell.** Live Workspace is missing the **requested-artifact wire** through Nexus submit → Haiku/structure → SSE → bridge → persistence. Approve currently falls back to legacy `/api/chat` via `doSend`.

Likely fix shape: **restore the signal + port the structuring/SSE/persistence slice into Nexus** — do not revive the Workspace `/api/chat` composer path.

---

## Product contract (locked)

Tap Plan → converse normally → culminate in a Plan Card → Review / Approve / Revise / Skip → consume into Flow / Build / Tasks / Workspace.

Plan = **requested artifact**, not posture, not WhisperGate intent.

---

## Hop-by-hop (live Nexus)

| # | Layer | Status |
|---|-------|--------|
| 1 | ChatComposer Plan checklist | **Exists** — local `composerMode`; framed as mode |
| 2 | `handleSend({ mode })` | **Broken** — Nexus early-return drops `opts` |
| 3 | `atlasConv.submit` | **Exists** — no artifact field |
| 4 | `/api/nexus/chat` | **Exists** — no `requestedArtifact` / planMode |
| 5 | Model stream | **Normal** — no plan culmination contract |
| 6 | Haiku structuring | **Missing on Nexus** — alive only in `chat.ts` |
| 7 | SSE `plan_start` / `plan` | **Missing** in `useNexusChatStream` |
| 8 | PlanCard render | **Mounted** — usually empty; prose `detectPlanFromText` only |
| 9 | Review / Approve / Skip | **UI works in-memory**; **no Revise** on PlanCard |
| 10 | Downstream consume | **Broken** — Approve → `executeHomePlan` → `doSend` → `/api/chat` |

---

## Confirmations

| Question | Answer |
|----------|--------|
| PlanCard production-mounted? | **Yes** (`AssistantBubble`) |
| Action handlers work? | Review/Skip = local state. Approve = local + legacy `doSend` or GitHub push if code edits |
| Revise? | **Not on PlanCard** (only agent-loop v2 elsewhere) |
| Haiku pass valid/reachable? | Valid on `/api/chat` + `planMode`; **unreachable from live Workspace** |
| Nexus structured plan events? | **No** (`structuredPlanEnabled: false`; no handlers) |
| Plan survives refresh? | Legacy `chat_messages.run_artifacts` / `project_artifacts` yes; **Nexus thread no** |
| Old cards tied to `/api/chat` shapes? | **Yes** (`planArtifact` via useChatStream) |
| Approval writes meaningful destination? | **No durable plan approval row** for PlanCard; re-prompts chat only |

---

## Legacy classification

| Piece | Class |
|-------|-------|
| Composer Plan toggle | **Adaptable** → `requestedArtifact: "plan"` |
| Haiku extract (`chat.ts`) | **Adaptable** → shared helper + Nexus call |
| `useChatStream` plan SSE handlers | **Adaptable** → port to Nexus stream |
| `PlanCard` UI | **Reuse as-is** |
| Persist `project_artifacts` type plan | **Reuse** |
| Persist `chat_messages.run_artifacts` | **Obsolete for Nexus** → `nexus_messages.metadata` |
| `executeHomePlan` → `doSend` | **Unsafe** on live Workspace → `atlasConv.submit` |
| Agent-loop `plan_artifacts` / PlanArtifactCardV2 | **Defer** (not this PlanCard contract) |
| `detectPlanFromText` | Keep as legacy fallback; **suppress when structured `planArtifact` present** (already) |

---

## Implementation map

| Layer | Already exists | Missing/broken | Reuse or rebuild |
|-------|----------------|----------------|------------------|
| Composer Plan control | Checklist UI | Signals as mode; Nexus ignores | Reuse UI; signal = `requestedArtifact` |
| Submit plumbing | Nexus submit | No field through atlas → nexus | Thin rebuild |
| Nexus route | Chat + tools | No Haiku / plan SSE / soft no-build for artifact turn | Adapt Haiku from chat.ts |
| Stream client | Nexus SSE | No plan handlers | Adapt from useChatStream |
| Bridge | Many artifact maps | No `planArtifact` / awaitingPlan | Add mapping + thread restore |
| PlanCard | Mounted | No structured data on Nexus | Reuse |
| Actions | Review/Skip/Approve UI | No Revise; Approve → legacy doSend; no DB approval | Rebuild Approve onto Nexus; add Revise; report Flow/Tasks gaps |
| Persistence | Legacy tables | Nexus metadata gap | `nexus_messages.metadata.planArtifact` + optional `project_artifacts` |

---

## Phase 2 file plan (smallest correct path)

1. `docs/audits/plan-card-nexus-gap-analysis.md` — this document  
2. Extract Haiku helper from `chat.ts` → shared lib (e.g. `lib/planCardExtract.ts`)  
3. `nexus.ts` — accept `requestedArtifact`; when `"plan"`: soft-block build side effects; prompt culmination; Haiku extract; SSE `plan_start`/`plan`; persist metadata  
4. `useNexusChatStream.ts` — send field; handle SSE; expose on `NexusMessage`  
5. `useAtlasConversation.ts` — pass through submission  
6. `workspace.tsx` — Nexus `handleSend` forwards + resets Plan after submit; `executeHomePlan` → `atlasConv.submit`  
7. `ChatComposer.tsx` — reset after send (parent-driven); keep visual, stop calling it a “mode” in copy where cheap  
8. `useNexusWorkspaceBridge.ts` — map `planArtifact` / `awaitingPlan`; hydrate from thread metadata  
9. `PlanCard.tsx` + `AssistantBubble.tsx` — add **Revise**; wire Approve/Revise to Nexus; suppress duplicate prose card when structured present  
10. Targeted tests + typecheck  

**Out of scope:** Decide/Compare/Research/Timeline composer controls; Conversation/Build redesign; dual Workspace `/api/chat` send path; agent-loop PlanArtifactCardV2.

## Remaining gaps after Phase 2 (do not fake)

| Destination | Status |
|-------------|--------|
| Approve → Nexus execute turn | **Wired** (`atlasConv.submit` execute prompt) |
| Approve → `project_artifacts` type plan | **Wired** on Plan Card emission |
| Flow nodes / Tasks / Parking consume | **Not wired** — report only |
| Dedicated “Build from Plan” surface | **Not wired** — Approve re-submits execute via Nexus |
| Plan approval durable row (committed status) | PlanCard Approve does not write a commit row (v2 `plan_artifacts` deferred) |

## Phase 2 implementation status

Restored on branch `cursor/plan-card-nexus-restore-1294`:

- `requestedArtifact: "plan"` through composer → atlasConv → Nexus
- Soft no-build when plan requested
- Shared Haiku extract (`lib/planCardExtract.ts`)
- SSE `plan_start` / `plan` + done `planArtifact`
- Bridge + thread hydrate `planArtifact`
- PlanCard Review / Skip / Approve / **Revise**
- Approve uses Nexus submit (not legacy doSend)
- Sticky pending until card arrives; UI checklist resets on send

