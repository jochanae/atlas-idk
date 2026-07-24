# Workspace Plan Mode — End-to-End Audit

> Read-only audit. Repository evidence only; no product/code changes.
> Date: 2026-07-24. Scope: Workspace composer “Plan Mode”, legacy `/api/chat` `planMode`, Nexus Conversation/Build posture, related dead Plan/Build remnants.
>
> Spot-checked against: `ChatComposer.tsx`, `workspace.tsx`, `useAtlasConversation.ts`, `useNexusChatStream.ts`, `ConversationViewSwitcher.tsx`, `nexus.ts`, `chat.ts`, `ActiveRuns.tsx`, `mutationGuard.ts`, prior audits in `docs/audits/` and `docs/architecture/`.

---

## Verdict

**On live Workspace, composer Plan Mode is UI-only.** Sends go through Nexus (`useNexusWorkspaceChat = true` → `atlasConv.submit()` → `/api/nexus/chat`) and **drop** `plan`/`build` mode. Prompt, tools, and side effects are unchanged by the checklist toggle.

The real Workspace posture control is **Conversation Mode vs Build Mode** (`conversationMode`), plus WhisperGate intent (CHAT / DECIDE / BUILD). Legacy `planMode` still exists on `/api/chat` (prompt + Haiku plan extraction) but is **not** driven by the Workspace composer anymore.

---

## 1. What happens internally when Plan Mode is enabled?

### 1.1 Composer toggle (what the user sees)

| Step | Behavior |
|------|----------|
| Default | `composerMode = "build"` (`defaultComposerMode: "build"` in `workspace.tsx`) |
| Toggle | Local React state only (`ChatComposer.togglePlanMode`) |
| Chrome | Gold accent, “Plan Mode · Active/Strategizing” banner (~1.5s), checklist button pressed state |
| Send click | `handleSend({ mode: composerMode })` |

### 1.2 Live send path (Nexus) — mode is discarded

```7708:7767:artifacts/atlas-frontend/src/pages/workspace.tsx
  const handleSend = async (opts?: { mode: "plan" | "build" }) => {
    if (useNexusWorkspaceChat) {
      // ...
      atlasConv.submit({
        text,
        stagedAttachments: staged.readyFiles,
        // lifecycle callbacks only — no mode / planMode
      })
      // ...
      return;
    }
    // legacy branch below sets planMode/buildMode — unreachable while flag is true
```

`useNexusWorkspaceChat` is hardcoded `true` (~4872). `AtlasConversationSubmission` has no plan/build fields. Nexus body accepts `conversationMode`, not `planMode`.

**Net effect of enabling Plan Mode on current Workspace:** cosmetic only.

### 1.3 Legacy path (`POST /api/chat`) — if `planMode: true` ever arrives

Still implemented in `chat.ts`:

1. **Prompt:** appends `--- ACTIVE MODE: PLAN ---` — structure/architecture/sequence; no `FILE_EDIT` unless user asks; ARTIFACT still allowed.
2. **Mode resolution:** `activeMode = buildMode ? "build" : planMode ? "plan" : (mode ?? "think")`.
3. **No hard tool denylist** on classic chat for plan — gating is prompt-level + confidence/confirmation for writes.
4. **Post-response:** if plan mode and reply length > 40 → SSE `plan_start` → Haiku extracts structured plan JSON → SSE `{ type: "plan", ... }` when estimatedChanges/edit steps qualify → persisted in `runArtifacts` → client `PlanCard`.

Agent-loop structured tools (`propose_plan` / `revise_plan` / `commit_plan`) are env-gated (`USE_STRUCTURED_PLAN`) on `/api/chat` only; Nexus sets `structuredPlanEnabled: false`.

---

## 2. How does it change the prompt, tools, agent behavior, or output?

### Composer Plan Mode on live Workspace

| Layer | Change when Plan Mode ON |
|-------|--------------------------|
| Prompt | None |
| Tools | None |
| Agent loop / WhisperGate | None |
| Output / PlanCard extraction | None (`useNexusChatStream` has no `plan` / `plan_start` handlers) |
| UI chrome | Banner, gold styling, placeholder copy |

### What actually changes posture on Workspace

**Conversation Mode** (`conversationMode: true` via `ConversationViewSwitcher`):

```3997:3998:artifacts/api-server/src/routes/nexus.ts
  } else if (conversationModeActive) {
    systemPrompt += `\n\n--- CONVERSATION MODE ACTIVE ---
... Do not call any tools, propose file edits, or take build actions...`;
```

- `allowBuildSideEffects = false`
- `allowToolAccess = false`
- Chat stream suppresses run cards / write proposals / terminal-style build UI

**Build Mode** in the switcher = `conversationMode === false` (normal Nexus + WhisperGate).

**WhisperGate** still classifies CHAT / DECIDE / BUILD from the message when not forced into Conversation Mode. DECIDE is the semantic cousin of “plan/decide with me” (options, tradeoffs, read tools allowed, no writes).

### Legacy `/api/chat` `planMode` (not Workspace composer)

| Layer | Change |
|-------|--------|
| Prompt | PLAN instructions (structure, no FILE_EDIT by default) |
| Tools | Soft (prompt); not a Nexus-style hard gate |
| Output | Haiku → structured PlanCard SSE |
| vs `buildMode` | Build forces FILE_EDIT expectation, readiness preflight, lens often forced to build |

---

## 3. Is there any runtime behavior that differs from normal chat?

### Live Workspace

**No.** Same `atlasConv.submit` payload whether the checklist is on or off. Conversation Mode is the only explicit user posture switch that changes runtime.

Enter key calls `handleSend()` without `{ mode }` even on the legacy branch; only the send-button path passed `composerMode` — another sign the mode wiring is half-migrated.

### Legacy `/api/chat` with `planMode: true`

Yes: PLAN prompt + optional PlanCard extraction. Callers today:

- Dead Workspace `handleSend` legacy branch (unreachable while Nexus flag is true)
- `ActiveRuns.intentToModeFlags("decide") → { planMode: true }` — but ActiveRuns form hardcodes `intent: "build"`, so decide→planMode is unused by the current UI
- Any direct API callers still posting `planMode`

---

## 4. Intentional or leftover from previous Plan/Build?

| Piece | Assessment |
|-------|------------|
| Composer Plan Mode button + banner | **Leftover UI.** Wired for `/api/chat`; Nexus never receives mode. Misleading chrome. |
| `defaultComposerMode: "build"` | **Remnant.** “Build” here no longer means `buildMode` on Nexus. |
| Conversation / Build switcher | **Intentional successor.** File comment: Ask Joy removed; this owns Conversation vs Build in-place. |
| `/api/chat` `ACTIVE MODE: PLAN` + Haiku extraction | **Intentional on legacy path**; orphaned from Workspace composer. |
| Spec→Build handoff modal (`showHandoffModal`) | **Dead leftover.** `setShowHandoffModal(true)` never called; milestone 2.4 still lists “Plan→Build modal”. |
| `onBuildAnyway` | **Dead leftover.** Prop threaded workspace → ChatStream → AssistantBubble; never invoked in bubble body. |
| ActiveRuns `decide → planMode` | **Unused remnant** (form is BUILD-only). |
| `mutationGuard` code `PLAN_MODE_BLOCKED` | **Intentional, different meaning** — blocks writes while run status is `planning` / `awaiting_confirmation`, unrelated to composer Plan Mode. |
| Structured `propose_plan` tools | **Intentional** behind flags; not driven by composer Plan Mode; not on Nexus. |

### Architecture (current)

```
[Composer Plan Mode toggle] ──opts.mode──► handleSend
                                              │
                    useNexusWorkspaceChat=true │
                                              ▼
                                    atlasConv.submit()  ──► /api/nexus/chat
                                    (mode DROPPED)         WhisperGate + conversationMode

[Conversation | Build switcher] ──conversationMode──► Nexus (LIVE posture)

[Legacy /api/chat] ◄── planMode/buildMode ◄── ActiveRuns (build only) / dead handleSend branch
                       PLAN prompt + Haiku PlanCard
```

---

## 5. Dead or unreachable after Build Mode redesign?

| Item | Status |
|------|--------|
| Composer `mode` → Nexus submit | Dropped; no server effect |
| `handleSend` legacy `planMode`/`buildMode` branch | Unreachable while `useNexusWorkspaceChat === true` |
| Spec→Build modal | Never opened |
| `onBuildAnyway` | Never called from bubble |
| ActiveRuns `decide` → `planMode` | Intent fixed to `"build"` |
| Enter-key without mode on legacy path | Would have ignored composer mode even if Nexus were off |
| Milestone doc “Plan→Build modal” ceremony | Matches dead modal; Conversation/Build is the quiet replacement |

**Not dead (live, separate concepts):**

- Conversation/Build switcher + Nexus `conversationMode`
- WhisperGate DECIDE / BUILD / CHAT
- Plan artifact UI (`PlanCard`, prose detect, home→workspace plan handoff, Review tab)
- Design Plan panel (product design AM — name collision only)
- `PLAN_MODE_BLOCKED` mutation guard (run lifecycle)

---

## 6. If Plan Mode were removed tomorrow, what would actually be lost?

### A. Remove only composer Plan Mode toggle / `planMode` flag plumbing

**On live Workspace: almost nothing functional.** Users lose:

1. Visual Plan Mode chrome (banner, gold checklist, “Strategizing…”)
2. Legacy `/api/chat` `planMode` prompt + Haiku PlanCards for remaining `/api/chat` callers
3. Unused ActiveRuns `decide → planMode` mapping
4. Docs/comments that describe Plan Mode as a send-time Workspace mode

**Kept:** Conversation/Build switcher, WhisperGate, PlanCard from other sources, Design Plan, mutationGuard.

### B. Also remove Conversation Mode / Build Mode

Large regression: no explicit no-tools talk posture; tools/build side effects always available when WhisperGate allows BUILD.

### C. Also remove all plan-artifact machinery

Independent of the toggle: PlanCard review/approve, home handoff plans, structured plan DB/tools, Review-tab plans.

---

## 7. If Plan Mode remains, what unique user value cannot Joy infer naturally?

**Composer Plan Mode today has no unique runtime value.** Joy already:

- Infers CHAT vs DECIDE vs BUILD via WhisperGate from the user’s words
- Can be forced into pure talk via Conversation Mode (harder guarantee than “please just plan”)
- Surfaces clarifications / tradeoffs on DECIDE without a Plan Mode flag
- Can produce plan-like prose and (on legacy path) PlanCards without the composer toggle affecting Nexus

| Capability | Needs composer Plan Mode? | Provided by |
|------------|---------------------------|-------------|
| “Don’t write code yet — think with me” | No | Conversation Mode (hard) or WhisperGate CHAT/DECIDE (soft) |
| Structured options / tradeoffs | No | DECIDE |
| Explicit no-tools guarantee | No | Conversation Mode / Just Talk |
| PlanCard approve/execute UX | No | Legacy extraction / prose detect / agent-loop / home handoff |
| Gold “I’m planning” affordance | Yes — but cosmetic only | Composer toggle |

**Conclusion:** The only thing the Plan Mode button uniquely provides on Workspace is **a visible planning affordance that does not change behavior**. That is leftover from dual Plan/Build composer design, superseded by Conversation/Build + WhisperGate. Keeping it as-is risks teaching users that toggling Plan Mode changes Joy when it does not.

---

## Recommendations (audit only — not implemented)

1. **Treat composer Plan Mode as deletion-candidate** (or re-wire into Nexus as an explicit posture if product still wants a planning-only mode distinct from Conversation Mode).
2. **Do not conflate** composer Plan Mode with Conversation Mode, Design Plan, or `PLAN_MODE_BLOCKED`.
3. **Clean up dead companions** in the same pass if removing the toggle: Spec→Build modal, unused `onBuildAnyway` wiring, ActiveRuns decide→planMode if decide UI stays gone.
4. **Preserve** Conversation/Build + WhisperGate as the real posture system; preserve plan *artifacts* independently of the mode flag.

---

## Key citations

| Claim | Evidence |
|-------|----------|
| Nexus always on | `workspace.tsx` ~4872 `const useNexusWorkspaceChat = true` |
| Mode dropped on send | `workspace.tsx` 7708–7767 |
| PLAN prompt + Haiku | `chat.ts` 4723–4757, 6257–6295 |
| Conversation Mode gates tools | `nexus.ts` 2971–2983, 3997–3998 |
| Conversation/Build is successor | `ConversationViewSwitcher.tsx` header comment |
| Handoff modal never opens | `rg setShowHandoffModal\(true\)` → zero matches |
| ActiveRuns build-only | `ActiveRuns.tsx` ~556 `const intent: Intent = "build"` |
| Nexus no structured plan | `nexus.ts` `structuredPlanEnabled: false` |
| planMode is `/api/chat`-only | `docs/audits/atlas-runtime-dead-code-inventory.md` §3 / handler notes |
