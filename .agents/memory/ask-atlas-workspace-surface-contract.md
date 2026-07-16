---
name: Ask Atlas vs Workspace Surface Contract
description: Hard boundary between Ask Atlas (conversation/handoff) and Workspace (execution). Any change touching nexus.ts or useNexusChatStream must respect this boundary.
---

# Ask Atlas vs Workspace Surface Contract

## The Rule
Ask Atlas and Workspace share the same backend route (`nexus.ts`) and the same hook (`useNexusChatStream`). They are NOT interchangeable. Any shared logic that does not explicitly check `surfaceContext` will leak execution behavior into Ask Atlas.

## What Each Surface Owns

**Ask Atlas (surfaceContext: "ask-atlas" | "home")**
- Conversation, exploration, planning
- Project focus and creation
- Handoff: summarize plan → NAVIGATE_TO (existing project) or PROJECT_READY (new)
- Lightweight deliverables explicitly allowed there
- NEVER: FILE_EDIT, LINE_PATCH, BUILD_CONTRACT, GITHUB_PUSH, run lifecycle

**Workspace (surfaceContext: "workspace")**
- Plan → Authorize → Build execution
- Run cards, stop/cancel controls
- Timeline, Changes, Preview, Draft, Local Dev, Code
- All agent mutations
- Stop button must always be present during an active run

## How surface context is enforced (as of this fix)

**Frontend:** `surfaceContext` option added to `UseNexusChatStreamOptions`.
- `useNexusWorkspaceBridge` passes `surfaceContext: "workspace"`
- `home.tsx` nexusChat passes `surfaceContext: "home"`
- `home.tsx` askAtlasChat passes `surfaceContext: "ask-atlas"`

**Backend (nexus.ts):**
- Body field: `surfaceContext?: "workspace" | "ask-atlas" | "home"`
- `allowBuildSideEffects` is now gated: `surfaceContext === "workspace" && (intent === "BUILD" || isResuming) && ...`
- When surface is non-workspace and intent is BUILD: "SURFACE CONTRACT: ASK ATLAS — HANDOFF REQUIRED" system prompt fires instead of BUILD protocols
- BUILD_CONTRACT, NEXUS_BUILD_PROTOCOLS, ATLAS_DESIGN_INTELLIGENCE, VERIFICATION_ENFORCEMENT are all inside the `allowBuildSideEffects` block → they only fire for workspace

## What caused the regression
The BUILD_CONTRACT system prompt injection was added inside `else if (allowBuildSideEffects)` — but at the time, `allowBuildSideEffects` had NO surface check. It fired for any BUILD-intent turn, including Ask Atlas. This gave Ask Atlas explicit instructions to emit BUILD_CONTRACT blocks and write files, overriding its handoff behavior.

**Why:** `allowBuildSideEffects = (intent === "BUILD" || isResuming) && !justTalk && !conversationModeActive` — no surface check existed before this fix.

## Rule for any future agent touching nexus.ts or useNexusChatStream
Before adding ANY new behavior to the shared nexus path, ask:
1. Does this apply to Ask Atlas? If no, gate it on `allowBuildSideEffects` (which is now workspace-only) or add an explicit `surfaceContext === "workspace"` check.
2. Does this add a new system prompt injection to the BUILD branch? If yes, it now only fires for workspace — confirm that is correct.
3. Does this add a new `return` field to `UseNexusChatStreamReturn`? Verify home.tsx's `nexusChat` and `askAtlasChat` instances won't accidentally consume it.

## Ask Atlas still exists in the codebase
As of July 2026, Ask Atlas is NOT retired. It exists in:
- `artifacts/atlas-frontend/src/components/home/AskAtlasSurface.tsx`
- `artifacts/atlas-frontend/src/components/AskAtlasFocusSheet.tsx`
- `artifacts/atlas-frontend/src/pages/home.tsx` (two `useNexusChatStream` instances: `nexusChat` and `askAtlasChat`)

The `replit.md` note saying "Ask Atlas retired" refers to the old hompage hero chat being deleted — the in-project Ask Atlas surface remains live.
