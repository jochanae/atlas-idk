# Atlas Simplification Plan — One Surface, One Engine

**Locked 2026-07-08.** Order is sacred. Do not skip steps.

## The North

- One surface (workspace), one thread, one conversation engine (Nexus), one renderer, one memory path.
- WhisperGate is the invisible traffic controller. Users never pick a mode.
- Uncertainty → talk, never act. BUILD requires explicit intent.
- "Just Talk" is a safety override, not a mode system.
- Home is a pure launcher. No chat, no takeover, no Ask Atlas.

## Order

### Step 0 — Backend safety inversion (Cursor, in progress)

Handoff: `docs/handoffs/2026-07-08-whispergate-safety-inversion-backend.md`

- WhisperGate fallback: BUILD → DECIDE.
- BUILD requires explicit action verb or affirmation of prior BUILD proposal.
- `justTalk: true` on request → force CHAT, block all side-effects.
- Only BUILD turns persist execution_run, invoke tools, GitHub, Tier1 extraction.
- Emit `meta` SSE event with `{intent, justTalk, fallback}`.

**Blocker for everything below. Do not start frontend until this is deployed.**

### Step 1 — Rip out Ask Atlas (frontend)

Files/state to delete outright (no hiding):

- Home hero chat/takeover ("Portfolio Thinking", ATLAS/YOU render block, focused composer state).
- `Ask Atlas` pill in composer (the globe pill in the screenshots).
- Focused-composer route/state and any `askAtlasSession` remnants.
- Home-side conversation renderer, home-side `useNexusChatStream` or `useChatStream` instance.
- Any handoff bridge that moves a home conversation into the workspace.

Home becomes: greeting + "Continue [last project]" link + Projects tab. Nothing else.

Governing memory: `.agents/memory/home-chat-state.md` already declares this. Enforce it.

### Step 2 — Repurpose the composer mode toggle → "Just Talk"

The current composer already has an `n` / `build` toggle (`ChatComposer.tsx`). It is not a Plan button; there is no Plan button in code today.

- Rename `n` → `justTalk` in state and props.
- Label it "Just Talk" with a lock icon. When on: gold accent + small "Just Talk — tools paused" hint above composer.
- Persist per-project in sessionStorage (`atlas-just-talk-${projectId}`).
- Send `justTalk: true` on every `/api/nexus/chat` request until toggled off.
- When on, hide the send-triggered "Building…" affordance; keep only conversational streaming.
- Keep the `build` label as the default (off) state. No third state.

### Step 3 — Delete workspace lenses (frontend)

Not hide. Delete.

Files to remove or gut:
- `artifacts/atlas-frontend/src/hooks/useChatLens.ts` — delete.
- Lens picker UI in `WorkspacePresetsBar.tsx`, `AtlasActivityBar.tsx`, header — remove.
- Lens references in `useChatStream.ts`, `workspace.tsx`, `ChatStream.tsx`, `WorkspaceRunCard.tsx`, `ChatComposer.tsx`, `FlowPanel.tsx`, `StepProgress.tsx`, `HistoryBookmarksSheet.tsx`, `atlas-history.ts`, `useComposerDraft.ts`, `useWorkspacePresets.ts`, `ViewChangesPanel.tsx`, `AssistantBubble.tsx`, `workspaceEventBus.ts`, `home.tsx`, `AxiomFlow.tsx`, `StrategicManifest.tsx` — remove reads, remove writes, delete dead branches.
- Any `lens` field on requests to `/api/nexus/chat` — remove.

If a call site needs a hint to WhisperGate (e.g. "user just clicked build panel"), pass it as a per-turn `hint` field, not a persistent lens. Preferably don't pass anything — let WhisperGate classify on the message alone.

### Step 4 — Gate operational UI on intent (frontend)

Consume the new SSE `meta.intent` from Step 0. Render rules:

- `intent === "CHAT"` → assistant text only. No run card, no Tier1GapCard, no timeline, no file-write cards, no tool activity.
- `intent === "DECIDE"` → same as CHAT plus DECIDE blocks (structured options if the model returns them).
- `intent === "BUILD"` → full operational UI: run card, timeline, tool activity, file-write cards, Tier1GapCard.
- `justTalk === true` → force CHAT rendering regardless of what the server returns (belt-and-suspenders; server should already have forced CHAT).

Preview/files/changes panels wake up only when a BUILD turn actually produces artifacts.

### Step 5 — Sweep

- Delete `/api/chat` legacy route (backend, small handoff) once frontend grep confirms zero references.
- Delete `useChatStream` (the legacy hook) once workspace uses only `useNexusChatStream`.
- Delete any orphan Ask Atlas types, storage keys, event names.
- Run typecheck. Fix stragglers.

## Non-goals

- No new modes.
- No lens replacement.
- No "Chat Mode" branding — it's "Just Talk", framed as an override.
- No Plan button (there isn't one; the composer toggle is the "Just Talk" affordance).
- No home chat surface, ever.

## Success test

1. Send "hey" from workspace with Just Talk **off** → intent CHAT, no run card, no tool activity, Atlas just replies.
2. Send "maybe we should delete Ask Atlas" → intent DECIDE, no side-effects, Atlas thinks with the user.
3. Send "delete Ask Atlas from the app" → intent BUILD, run card, tools, edits fire.
4. Toggle Just Talk on, send "build me a landing page" → intent forced CHAT, Atlas asks the user to turn Just Talk off first, zero side-effects.
5. Home page shows launcher only. No composer. No chat state. No Ask Atlas.
6. Workspace has no visible lens picker. Codebase grep for `useChatLens` returns zero hits.
