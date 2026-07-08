---
name: Single-Surface Workspace Architecture
description: Home has no chat UI; Workspace is the only conversation surface, with a Conversation Mode / Build Mode toggle on the same thread.
---

# Single-Surface Workspace Architecture (post Ask-Atlas removal, 2026-07-08)

> **Governing rule:** Ask Atlas (hero chat, Global Insight takeover, Focused Composer) has been deleted entirely. Home is a pure project dashboard/launcher with no chat UI. All conversation happens in Workspace, on one thread, with a `conversationMode` boolean toggle instead of a separate surface.

## Conversation Mode vs Build Mode

- One state, one thread, one storage key per project (`atlas-conversation-mode-${id}` in sessionStorage) — no handoff, no second chat instance, no separate conversationId.
- `conversationMode: true` threads through `sendOpts` → `useNexusChatStream` request body → `nexus.ts` `/nexus/chat`, which forces `tools:false`, `forceCreate:false`, and injects a "CONVERSATION MODE ACTIVE" system-prompt block for that turn only.
- ChatStream.tsx suppresses run cards / tool activity / terminal blocks while conversationMode is active — same rendering pipeline, just fewer surfaces drawn.
- Toggle UI lives in `ConversationViewSwitcher.tsx` (desktop pill) and the workspace mobile more-sheet (label flips Conversation Mode ↔ Build Mode).

## What NOT to re-introduce

- A second `useNexusChatStream`/`useChatStream` instance for "ambient" or "ask" conversation — there is exactly one chat instance per workspace now.
- Any home-page chat renderer, hero composer, or Global Insight takeover.
- `askAtlasSession`'s old surface-open/closed flags — only `clearConversationId` (legacy-storage cleanup) survives; do not resurrect `isSurfaceOpen`/`setSurfaceOpen`/`isClosed`/`markClosed`/`openAskAtlasFromWorkspace`.

Bringing any of these back re-fragments conversation state across two surfaces, which is the exact problem this migration removed.
