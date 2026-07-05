---
name: Nexus Workspace Spine
description: WorkspaceConversationSurface is now the live workspace chat engine; key gotchas for project switching and mobile layout.
---

## Status: SHIPPED

`useNexusWorkspaceChat = true` in `workspace.tsx:4463`. The Nexus engine (`/api/nexus/chat`) is the workspace chat engine.

## What's live

- `WorkspaceConversationSurface` renders via `hostShell` → `streamSlot` path in `UnifiedConversationSurface`
- Per-project UUID `conversationId` derived from `localStorage` keyed `nexus_conv_${projectId}`
- `WRITE_FILE:{...}` token parsed after stream closes → POST `/api/nexus/write-file`
- `Tier1ProgressCard` suppressed when `useNexusWorkspaceChat = true` (see below)

## Critical gotchas

**Project switching — must use `key={id}`**
`WorkspaceConversationSurface` must have `key={id}` (projectId) on the JSX in `workspace.tsx:8413`.
Without it, React keeps the component alive when the project changes, `useState` doesn't re-run, and the old project's `conversationId` bleeds into the new project's conversation. Atlas replies with context from the wrong project.

**Tier1ProgressCard overlap on mobile**
`Tier1ProgressCard` is `position: fixed, bottom: 96px, zIndex: 40`. It floats directly over the `WorkspaceConversationSurface` input on mobile. It's now gated with `!useNexusWorkspaceChat` at `workspace.tsx:9215`. Do not remove this gate.

**hostShell render path**
workspace.tsx passes `hostShell` + `streamSlot` to `UnifiedConversationSurface`. The component hits line 109 (`if (hostShell && streamSlot !== undefined)`), sets `stream = streamSlot`, and calls `hostShell({ stream })`. The children (old chat layout) are dropped when streamSlot is defined.

## What still needs to be built (Phase 2)

- Richer message UI: file write cards, thinking block, scroll-to-bottom button
- Better mobile font sizing (currently 13.5px)
- WRITE_FILE requires a project workspace directory to actually land on disk
- Tier1 capture in conversation (Nexus doesn't use the old chip-strip flow)

**Why:** The old `useChatStream` + `ChatStream` was months of incremental UI work on top of a broken engine. The Nexus engine is now correct; the shell needs to catch up.
