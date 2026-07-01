---
name: Home Chat State Architecture
description: Canonical ownership map for all chat-related state on the homepage (home.tsx) after the Ask Atlas layout fix.
---

# Home Chat State — Canonical Ownership

> **Governing rule:** two independent chat instances live on home.tsx. They must never share a scroll container, never share a messages array, and must never gate each other's visibility.

---

## 1. Ambient / Workspace messages — `nexusChat`

**Owner:** `useNexusChatStream` instance at ~line 1958  
**Config:** `focusProjectId: homeFocus`, `conversationId: activeConversationId`, `onData: handleNexusDataEvent`, `onProjectReady: handleNexusProjectReady`  
**Scroll container:** `chatScrollRef` (ref at ~line 1777)  
**Rendered at:** the "Chat thread" block — always below the hero area  
**Active when:** `sendTo === "workspace"` AND the user submits in normal home mode, OR Global Insight mode is open  
**Cleared by:** `nexusChat.setMessages([])` / `nexusChat.clearMessages()` — called on project handoff, Global Insight toggle, conversation reset, and **when entering ask-atlas mode** (via `useEffect` on `sendTo`)

**What it carries:**
- All workspace-mode home conversations
- Global Insight (portfolio-wide) streaming replies
- Resume thread continuity via `activeConversationId`

---

## 2. Ask Atlas messages — `askAtlasChat`

**Owner:** `useNexusChatStream` instance at ~line 1972  
**Config:** `focusProjectId: null`, `conversationId: null`, `model: "claude"` — intentionally stateless, no project context  
**Scroll container:** `askAtlasScrollRef` (ref at ~line 1978)  
**Rendered at:** standalone block immediately after the greeting block, gated on `askAtlasConversationActive` — **completely independent of `nexusChat.messages.length`** (post-fix)  
**Active when:** `sendTo === "ask-atlas"` AND messages have been sent (`askAtlasConversationActive = askAtlasChat.messages.length > 0`)  
**Cleared by:** `askAtlasChat.clearMessages()` — called on toggle exit, on "Continue in Workspace" handoff

**What it carries:**
- Short exploratory Q&A: no memory, no project, no thread ID
- Transient — intentionally ephemeral, no persistence to backend thread

---

## 3. Composer routing — `sendTo` / `sendToRef`

**Owner:** `useState<SendTarget>("workspace")` at ~line 1909 + `useRef` mirror at line 1910  
**Values:** `"workspace"` (default) | `"ask-atlas"`  
**Why two copies:** `sendTo` drives render; `sendToRef` is read inside `handleSubmit` callbacks and event handlers that close over a stale value.  
**The ref MUST be kept in sync** via `useEffect(() => { sendToRef.current = sendTo; }, [sendTo])`.

**Routing decision in `handleSubmit`:**
```
routeTarget = sendToRef.current
if routeTarget === "ask-atlas" → askAtlasChat.send() → return
// else falls through to workspace gates → nexusChat / project handoff
```

**Toggle button (in composer):** flips `sendTo` between modes. On enter ask-atlas: clears nexusChat. On exit ask-atlas: aborts + clears askAtlasChat.

**`axiom:ask-atlas` custom event:** sets `sendTo = "ask-atlas"` from radial menu; nexusChat is cleared via `useEffect` watching `sendTo`.

---

## 4. Scroll containers

| Container | Ref | Owner | Scroll-to-bottom trigger |
|---|---|---|---|
| `chatScrollRef` | workspace messages | nexusChat | `nexusChat.messages` change |
| `askAtlasScrollRef` | ask-atlas messages | askAtlasChat | `askAtlasConversationActive` + `askAtlasChat.messages` change |

They must never be swapped or merged.

---

## 5. Supporting state

| State | Location | Purpose |
|---|---|---|
| `activeConversationId` | useState ~line 1853 | Thread ID for nexusChat; null in ask-atlas mode |
| `globalInsightOpen` | useState ~line 2061 | Portfolio-wide mode; uses nexusChat, overrides workspace layout |
| `isAtlasStreaming` | useState ~line 2104 | Tracks nexusChat streaming; gates loading spinner |
| `threadLoading` | useState ~line 2110 | Initial thread hydration gate |
| `askAtlasConversationActive` | computed ~line 1979 | `askAtlasChat.messages.length > 0` — drives visibility of ask-atlas block |
| `askAtlasBusy` | computed ~line 1980 | Blocks duplicate send in ask-atlas mode |
| `askAtlasHelperVisible` | useState ~line 1913 | One-time onboarding tip; stored in localStorage |

---

## 6. Legacy Nexus state — candidates for removal

These exist because home.tsx once used a different routing architecture. Safe to remove **only after** the workspace conversation path is fully migrated:

| Item | Why it exists | Remove when |
|---|---|---|
| `activeConversationId` | Tracks Nexus thread ID for resume continuity | Cloud Run / Supabase sessions are fully replaced by local backend |
| `callGlobalInsightMode()` | POSTs to `/api/sessions/:id/reflection-mode` | Global Insight moves off nexus session concept |
| `threadLoading` | Waits for nexus thread hydration on mount | Thread loading moves to local backend or is removed |
| `isAtlasStreaming` | Mirrors nexusChat streaming state for UI gating | Can be replaced by `nexusChat.isStreaming` directly |
| `conversationId: activeConversationId` on nexusChat | Attaches nexus thread context to stream requests | Remove when home conversations are fully local |
| Resume-thread logic (`CONVERSATION_RESTORE` event, `rememberActiveConversationId`) | Restores prior nexus sessions across page loads | Remove when local backend owns home conversation persistence |

---

## Visual layout ownership (post-fix)

```
Hero area (flex column)
  ├── Greeting block          — shows when: nexus empty AND ask-atlas empty
  ├── Ask Atlas messages      — shows when: askAtlasConversationActive (INDEPENDENT)
  └── Chat thread block       — shows when: nexusChat.messages.length > 0 OR globalInsightOpen
```

**Critical invariant:** Ask Atlas messages MUST NOT be nested inside any conditional gated on `nexusChat.messages.length`. That was the bug that caused messages to disappear.
