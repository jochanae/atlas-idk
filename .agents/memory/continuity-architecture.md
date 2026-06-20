---
name: Continuity Architecture — Transcript + Resume
description: The two-artifact handoff model for global conversation → workspace transition
---

# Continuity Architecture Decision

## The model (user-confirmed, production target)

Global conversation → project created → TWO things must happen:

1. **Full transcript copied into workspace thread** (for the human)
   - Purpose: trust and continuity. "Atlas came with me."
   - Implementation (two-layer):
     a. **Visual layer**: sessionStorage `atlas-opening-conversation` → `normalizeThinkFreelyThread` → `setMessages` in workspace.tsx (already wired, survives nav)
     b. **Persistence layer**: `POST /api/projects/:id/append-thread` writes conversation snapshot to `nexusMessagesTable` with `projectId = newProjectId` (added; survives refresh; AI context)

2. **Resume artifact generated from transcript** (for the system)
   - Purpose: compressed, structured signal for Manifest, builders, future agents
   - Implementation: same `POST /api/projects/:id/append-thread` call — generates Resume artifact
   - Shape: { threadSummary, suggestedFirstBuild, intent, audience, tone, clarityScore }

## What's built (Phase 2 complete)

- ✅ Resume artifact generated and stored (`artifactsTable` type="resume")
- ✅ threadSummary surfaced as workspace opening greeting (commitCarryover.greeting)
- ✅ ManifestMode reads Resume artifact via GET /api/projects/:id/resume
- ✅ Visual transcript transfer: sessionStorage → workspace chat UI (OPENING_CONVERSATION_STORAGE_KEY)
- ✅ Persistent transcript: nexusMessagesTable write on append-thread (idempotent, filters empty/genesis msgs)

## Idempotency guard
`append-thread` checks if any nexus messages with `projectId = id AND userId = userId` already exist before inserting. Safe to call multiple times.

## Why both matter
- Summary-only: feels efficient but emotionally empty, loses nuance
- Transcript-only: too noisy for Manifest/builders, they need compressed artifact
- Both: human gets the chain, system gets the brief

## Rule
**Do not remove the transcript copy step to "simplify."**
Resume is NOT a replacement for the transcript — they serve different consumers.

---

## Two-Surface Architecture (MUST NOT merge)

- **Home Nexus**: `useNexusChatStream` → `/api/nexus/chat` — global, exploratory, multi-project
- **Workspace Chat**: `useChatStream` → `/api/chat` — project-scoped, execution-focused
- Both use `useAtlasStream` as transport. Same identity, different jobs. Never unify the hooks or endpoints.

## Handoff Paths

Two paths both now do the same thing:
1. **Manual** (CommitPill "+" tap): `performCreateProjectFromConversation`
2. **Auto** (`PROJECT_READY` signal): `handleHandoff`

Both paths must:
- Set `OPENING_CONVERSATION_STORAGE_KEY` (conversation snapshot for workspace visual layer)
- Set `OPENING_MESSAGE_PROJECT_ID_STORAGE_KEY` (guards against wrong-project replay)
- Fire `POST /api/projects/:id/append-thread` (persistence layer + Resume brief)

## Cinema Overlay (HandoffCinemaOverlay)

Triggered by `shapingStatus === "transitioning"` from `shellStore`.

Flow inside `handleHandoff`:
1. Name determined → `setPendingWorkspace(null, name)` + `setShapingStatus("transitioning")` + `setShellHandoffStage("Creating workspace…")`
2. Each network call → update `setShellHandoffStage(...)` (visible in overlay subtitle)
3. After all work → `setShellHandoffStage("Ready.")` + 900ms pause → `setLocation(...)`
4. On error → `setShapingStatus("idle")` + `setShellHandoffStage("")`

Stage labels shown in overlay (real, not decorative):
- "Creating workspace…"
- "Loading your conversation…"
- "Mapping your ideas…"
- "Packaging your resume…"
- "Ready."

`shellStore` now has `handoffStage: string` + `setHandoffStage(stage)`. `resetHandoff()` also clears it.

## Workspace Session Seeding

On workspace mount with `source=home-handoff`:
1. `OPENING_CONVERSATION_STORAGE_KEY` → `normalizeThinkFreelyThread` → `setMessages` (visual layer)
2. User sends first message → `history = currentMessages.map(...)` → sent to `/api/chat` (AI context)
3. `/api/chat` includes history in AI messages array — Atlas has full context on first workspace turn

## Clock Button (Conversation History)

- Lives in `GlobalInsightSurface` at ~line 914 (clock SVG, calls `onOpenHistory`)
- `handleOpenHistory` in home.tsx loads `/api/nexus/conversations` → opens `SessionHistorySheet`
- Only visible when `globalInsightOpen === true` (Global Insight mode must be open)
- Title: "GLOBAL INSIGHT · HISTORY"

## AtlasActivityBar Real States

- Currently shows cycling ambient phrases (6 phrases, 2.6s rotation) — cosmetic only
- Handoff stages now use `shellStore.handoffStage` → displayed in `HandoffCinemaOverlay` subtitle
- ActivityBar real states require backend emitting `NARRATION:` prefix OR a shared event bus — not yet built
