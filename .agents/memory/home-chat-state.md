---
name: Home Chat State Architecture
description: Canonical ownership map for chat state on home.tsx after the Ask Atlas single-surface consolidation (2026-07-02).
---

# Home Chat State — Canonical Ownership

> **Governing rule:** two chat instances live on home.tsx (`nexusChat` for workspace/global-insight, `askAtlasChat` for Ask Atlas). Each has exactly ONE renderer. Ask Atlas is rendered only by `AskAtlasSurface`. There is no inline Ask Atlas path on the home shell.

---

## 1. Ambient / Workspace messages — `nexusChat`

**Owner:** `useNexusChatStream` instance (~line 1950)
**Config:** `focusProjectId: homeFocus`, `conversationId: activeConversationId`, `onData`, `onProjectReady`
**Scroll container:** `chatScrollRef`
**Rendered at:** the "Chat thread" block on the home hero
**Active when:** normal home mode / Global Insight mode
**Cleared when Ask Atlas opens:** via `useEffect` on `askAtlasSurfaceOpen`

## 2. Ask Atlas messages — `askAtlasChat`

**Owner:** `useNexusChatStream` (~line 1963), `focusProjectId: null`, `conversationId: null`, `model: "claude"` — stateless.
**Sole renderer:** `AskAtlasSurface` (`@/components/home/AskAtlasSurface`). No inline block on the home shell.
**Visibility gate:** `askAtlasSurfaceOpen` (single boolean). Do NOT re-add `askAtlasConversationActive` to the surface's `open` prop or as an alternate render path.
**Entry points (all funnel through `setAskAtlasSurfaceOpen(true)`):**
- Home composer "Ask Atlas" pill
- `axiom:ask-atlas` custom event (radial menu)
- Resume conversation / sessions history / projects drawer (resume path also calls `askAtlasChat.setMessages(...)`)
**Exit:** the surface's exit chip calls `setAskAtlasSurfaceOpen(false)` + `askAtlasChat.abort()` + `askAtlasChat.clearMessages()`.

## 3. Send routing in `handleSubmit`

- If `askAtlasSurfaceOpen` → send via `askAtlasChat.send(...)`. Always. Regardless of how the surface was opened.
- Otherwise → the normal workspace/nexus create-or-inline path.

This eliminates the pre-2026-07-02 split where entry point silently determined which chat stream received the message.

## 4. Removed (do NOT re-introduce)

- `sendTo` state + `sendToRef` + `SendTarget` type (composer had a workspace ↔ ask-atlas toggle)
- Inline Ask Atlas mode banner ("Portfolio Thinking · Not Building" banner on home composer)
- `askAtlasHelperVisible` one-time helper tip
- `askAtlasScrollRef` (was never attached to the DOM; dead code)
- `askAtlasHandoffSeed` / `buildAskAtlasHandoffSeed` usage in home.tsx (helper file still exists but is no longer imported)
- `open={askAtlasSurfaceOpen || askAtlasConversationActive}` fallback on `AskAtlasSurface`

Bringing any of these back reopens the split-personality bug where two Ask Atlas conversations could overlap on the same screen.
