# Conversation Ownership

> **Read this before modifying any hook in the conversation or transport layer.**
> Companion documents: [runtime-map.md](runtime-map.md) · [attachment-ownership.md](attachment-ownership.md) · [agent-change-rules.md](agent-change-rules.md)

This document defines the exact division of responsibility between the six systems that form the conversation stack. Every system has a single owner. Do not let responsibilities leak across boundaries.

---

## System hierarchy

```
workspace.tsx / home.tsx / AskAtlasSurface.tsx
  └─ useAtlasConversation          (CANONICAL controller — owns send + file conversion)
       └─ useNexusChatStream        (CANONICAL transport — owns SSE stream to /api/nexus/chat)
  └─ useNexusWorkspaceBridge        (CANONICAL adapter — owns NexusMessage→ChatMessage + side effects)
  └─ useChatStream                  (LIVE TRANSITIONAL — owns sessionId, doSend, and legacy state)
       └─ fetch /api/chat           (LEGACY — called by useChatStream, FlowPanel, ActiveRuns, runs.ts)
```

---

## `useAtlasConversation`

**File:** `artifacts/atlas-frontend/src/hooks/useAtlasConversation.ts`
**Classification: CANONICAL**

**Owns:**
- The single canonical `submit(AtlasConversationSubmission)` entry point for all user-initiated sends
- `fileToBase64Safe` conversion loop — the **only** place `StagedFile → base64` conversion may happen for a Nexus send
- Partial-success semantics (some files convert, others fail)
- Lifecycle callbacks: `onMarkConverting`, `onMarkFailed`, `onMarkSending`, `onClearSent`, `onRestoreToReady`
- Direct ownership of `useNexusChatStream`

**Does NOT own:**
- Message state (owned by `useNexusChatStream`)
- Side effects in the Workspace (owned by `useNexusWorkspaceBridge`)
- Session IDs (owned by `useChatStream` for legacy paths, derived from `nexusConversationId` for Nexus paths)
- The legacy `doSend` path (still in `useChatStream`)

**Instantiated by:** `workspace.tsx` (as `atlasConv`), `home.tsx` (Ask Atlas surface), `AskAtlasSurface.tsx`

**Rule:** Any new user-facing send must go through `atlasConv.submit()`. Do not add a new `fetch("/api/nexus/chat")` call anywhere.

---

## `useNexusWorkspaceBridge`

**File:** `artifacts/atlas-frontend/src/hooks/useNexusWorkspaceBridge.ts`
**Classification: CANONICAL**

**Owns:**
- Conversion of `NexusMessage[]` → `ChatMessage[]` for Workspace rendering (`toChatMessage`)
- WRITE_FILE disk-write effects (triggered by signal tokens in message content)
- Workspace conversation history load and recovery
- `conversationId` derivation and storage (`localStorage` key `nexus_conv_{projectId}`)
- Run-completed events fired on `workspaceEventBus`

**Does NOT own:**
- Send logic (intentionally removed in the B1 refactor — see file header)
- Stream state (injected from `useAtlasConversation`)
- Session IDs (those remain in `useChatStream`)

**Instantiated by:** `workspace.tsx` only (as `nexusBridge`)

**Rule:** The bridge is a pure side-effect and adapter layer. It must never directly call `fetch` or trigger a new turn submission.

---

## `useNexusChatStream`

**File:** `artifacts/atlas-frontend/src/hooks/useNexusChatStream.ts`
**Classification: CANONICAL**

**Owns:**
- The SSE transport to `POST /api/nexus/chat`
- Optimistic message insertion (synchronous, before the HTTP request fires)
- SSE event parsing: `token`, `intent`, `capture`, `step`, `done`, `attachment_ack`, `build_progress`
- `NexusMessage` type (the canonical in-flight message shape)
- Signal stripping from streamed text: `CONV_STATE`, `MEMORY_T{n}`, `NAVIGATE_TO`, `PROJECT_READY`, `VISUALIZE`, `READY_TO_SHAPE`, `MEMORY_CHIPS`
- Stream timeout (90 s)

**Does NOT own:**
- File conversion (owned by `useAtlasConversation`)
- Side effects on message receipt (owned by `useNexusWorkspaceBridge`)
- Session IDs (no concept of `sessionId` — uses `conversationId`)

**Instantiated by:** `useAtlasConversation` only. Never instantiate directly in a surface component.

**Payload sent to `/api/nexus/chat`:**
```json
{
  "conversationId": "uuid-or-null",
  "projectId": 123,
  "messages": [{ "role": "user", "content": "..." }],
  "attachments": [{ "base64": "...", "mediaType": "image/png", "name": "...", "clientAttachmentId": "..." }],
  "conversationMode": false,
  "surface": "workspace",
  "mode": "workspace"
}
```

---

## `useChatStream`

**File:** `artifacts/atlas-frontend/src/hooks/useChatStream.ts`
**Classification: LIVE TRANSITIONAL**

**Owns (still live):**
- `sessionId` and `ensureSessionId()` — integer session ID for the legacy DB-backed session model
- `doSend(text, sid, currentMessages, ctx?, attachments?, options?)` — the legacy send function, still called by automated side-paths in `workspace.tsx`
- `handleRegenerate` — regenerates the last assistant message
- `chatPending` — pending state for the legacy chat
- `liveStep` — live step state for the builder run card
- `memoryChips` — memory chip state
- `activityStream` — activity stream state
- `abortControllerRef` / `handleStop`
- Per-session summarize effect

**No longer owns (superseded by Nexus path):**
- Primary chat display (superseded by `nexusBridge.messages`)
- Primary user send (superseded by `atlasConv.submit()`)

**Default endpoint:** `POST /api/chat` (hardcoded; the `endpoint` param exists but is never overridden in `workspace.tsx`)

**Instantiated by:** `workspace.tsx` (line ~4911). Also has a unit test in `hooks/__tests__/useChatStream.visibility.test.tsx`.

**Why it still exists:** Phase 2 of the Nexus Workspace Spine migration has not landed. `workspace.tsx` relies on at least 12 side-effects from `useChatStream` that have not been migrated. See memory entry `nexus-workspace-spine.md`.

**Rule:** Do not add new sends through `doSend` for user-initiated sends. Automated/programmatic sends that already use `doSend` may continue until the migration is complete.

---

## `/api/nexus/chat`

**File:** `artifacts/api-server/src/routes/nexus.ts`
**Classification: CANONICAL**

**Owns:**
- WhisperGate intent classification (CHAT / BUILD / DECIDE / CLARIFY / IMAGE_GEN)
- All conversation-mode gating (suppresses run cards, tool calls, build side-effects)
- CLARIFY, DECIDE, Plan artifact generation
- Decision Intelligence artifacts (Tradeoff Matrix / Decision Tree / Deviation Log)
- Memory chips (`MEMORY_CHIPS` token → `memoryChips` SSE event)
- File editing (`FILE_EDIT`, `LINE_PATCH`, `FILE_DELETE`, `GITHUB_PUSH`)
- `attachment_ack` SSE events for server-side attachment persistence confirmation
- `build_progress` SSE events for deliverable generation lifecycle
- `nextSuggestions` on `done` event
- All new Atlas capabilities

**Receives calls from:** `useNexusChatStream` (via `useAtlasConversation`) — Workspace and Ask Atlas

**Rule:** All new backend capabilities go into `nexus.ts`. Do not add new builder features to `chat.ts`.

---

## `/api/chat`

**File:** `artifacts/api-server/src/routes/chat.ts`
**Classification: LIVE TRANSITIONAL**

**Owns (still live):**
- Legacy session-based builder pipeline (FILE_EDIT, GITHUB_PUSH, linePatches, WRITE_FILE)
- BUILD_HANDOFF processing (home-page build intent → `setOpeningMessage` in workspace)
- `chatContractBridge` integration (wires done-event branches into the run-contract layer)
- Builder protocols shared with nexus.ts (via `builderProtocols.ts`)

**Called by:**
- `useChatStream` (workspace legacy path — automated sends)
- `ActiveRuns.tsx` (direct fetch — Composer surface)
- `FlowPanel.tsx` (direct fetch — flow panel surface)
- `runs.ts` (backend-to-backend — V1.2 turn-entry for atlas-frontend-next)
- `workspace.tsx` build-handoff path (via the `openingMessage` → `doSend` pipeline)

**Rule:** Do not add new features to `chat.ts`. Migrate callers to `nexus.ts` progressively.

---

## Dependency injection summary

```
home.tsx
  ├─ AskAtlasSurface (atlasConv = useAtlasConversation({surface:"ask-atlas"}))
  └─ useAtlasConversation (atlasConv, for home-level programmatic sends)

workspace.tsx
  ├─ atlasConv = useAtlasConversation({surface:"workspace"})   ← CANONICAL send
  ├─ nexusBridge = useNexusWorkspaceBridge(id, atlasConv, ...) ← CANONICAL adapter
  └─ {doSend, sessionId, ...} = useChatStream(effectiveId, {}) ← LIVE TRANSITIONAL

useAtlasConversation
  └─ nexusChatStream = useNexusChatStream(opts)               ← CANONICAL transport

FlowPanel.tsx
  └─ fetch("/api/chat", ...) directly                         ← LEGACY BUT REACHABLE

ActiveRuns.tsx
  └─ fetch("/api/chat", ...) directly                         ← LEGACY BUT REACHABLE

runs.ts (backend)
  └─ fetch(`http://localhost:${port}/api/chat`, ...) internally ← CANONICAL for V1.2
```
