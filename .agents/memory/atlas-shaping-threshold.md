---
name: Atlas Shaping Framework and Threshold Architecture
description: The 5-dimension internal shaping model and Global→Workspace transition design
---

## The 5-Dimension Shaping Framework
Atlas internally tracks: PROBLEM / AUDIENCE / GAP / VISION / HARD PART.
These are never shown to the user as a checklist — internal scaffolding only.
Hard ceiling: 5 questions. Stop early if dimensions are inferable.

**Why:** Max-5 rule prevents Atlas from overstaying its welcome in Global. Stop-early rule prevents mechanical checkbox questioning.

**How to apply:** In CONVERSATIONAL_EXPANSION_PROTOCOL and IDEA_MODE_POSTURE. Both use same dimensions, different energy (Idea Mode is more expansive in phases 1-2).

## The Threshold — Global→Workspace Transition Signal
At threshold, Atlas emits `PROJECT_READY:{"projectName":"...","reason":"..."}` (NOT `NAVIGATE_TO`, NOT `create_project` tool call).

**Why:** `NAVIGATE_TO` auto-navigates, bypassing the CommitPill UI. `create_project` tool creates server-side but `handleHandoff()` in home.tsx creates client-side — they were duplicates. CommitPill is the correct UX pattern.

**How to apply:** CommitPill in home.tsx watches shellStore shapingStatus. PROJECT_READY → handoffSignal → shapingStatus="ready" → CommitPill shows "Open Workspace". User taps → handleHandoff() creates project → navigate.

## Global Boundaries (never ask in Global)
Project naming, pricing, architecture, tech stack, features, milestones, timelines.
If user volunteers any of these → treat as signal, transition immediately.

## CommitPill States
- "shaping" state: hidden (return null) — button only appears at threshold
- "ready" state: "Open Workspace" (was "Enter Workspace →")
- "transitioning" state: "Opening workspace…"

## Workspace Arrival (Threshold Moment)
When fresh workspace has memories from Global shaping, first message should surface what was brought over (✓ Problem, ✓ Audience, ✓ Constraints) then ask for name only if generic.
Rule: never ask user to re-explain what was already shaped in Global.

## Focused-Project Response Structure
When Atlas gives an overview/status of a focused project, it uses this structure:
**Identity** → **Technical State** → **Recent Momentum** → **Unresolved Tensions** → **Portfolio Pattern** (optional)

Identity leads with wedge/differentiator from the shaping layer — NOT file counts.
Portfolio Pattern only appears when a real cross-project pattern exists (e.g. "shares ecosystem-before-wedge tendency with PresentQ").

**Why:** Previous structure (What it is / Where it stands / Recent work / Thing I'd name) was too technical-metadata-heavy and guessed at positioning instead of reading from the shaping layer.

## Focused-Project Closing Question Rule
Never end a focused-project overview with "What are you trying to figure out or build right now?" — too broad for a workspace context.
Instead: offer a lens picker ("Which lens? Positioning / Market readiness / UX / Infrastructure / Prioritization / Portfolio patterns") or ask ONE narrow question that pushes one level deeper.

## Shaping Layer Injection (focused project)
`focusGenomeRow` is fetched in nexus.ts for Atlas State label. The shaping fields (purpose, audience, wedge, differentiator, openQuestions) are now also built into a `shapingBlock` and injected into the system prompt so Atlas can read and lead with them — not just use them for posture detection.
