# Axiom Runtime Architecture Map

> **Read this before editing any conversation surface, transport hook, or route.**
> Companion documents: [conversation-ownership.md](conversation-ownership.md) · [attachment-ownership.md](attachment-ownership.md) · [agent-change-rules.md](agent-change-rules.md)

---

## Classification legend

| Tag | Meaning |
|---|---|
| **CANONICAL** | The intended live path. All new work should flow through this. |
| **LIVE TRANSITIONAL** | Still instantiated and reachable at runtime. Not safe to delete. Being migrated toward the canonical path. |
| **LEGACY BUT REACHABLE** | Old code path still exercised by specific surfaces. Must be kept until those surfaces are migrated. |
| **DEAD / SAFE TO DELETE** | No live import, route registration, or runtime reachability found. |

Classification is based on import-chain tracing, grep evidence, and runtime flag inspection. Do **not** promote anything to DEAD without re-running the reachability checks documented at the bottom of this file.

---

## Surface 1 — Ask Atlas

**Classification: CANONICAL**

| Field | Value |
|---|---|
| Rendered component | `artifacts/atlas-frontend/src/components/home/AskAtlasSurface.tsx` |
| Imported by | `artifacts/atlas-frontend/src/pages/home.tsx` (line 34) |
| Visible message owner | Local `messages` state inside `AskAtlasSurface` (not shared with Workspace) |
| Composer / send owner | `useAtlasConversation` (`atlasConv.submit()`) — instantiated inside `AskAtlasSurface` |
| Session / bootstrap owner | None. Ask Atlas has no `sessionId`. Conversation identity lives in the Nexus `conversationId` managed by `useNexusChatStream`. |
| API route | `POST /api/nexus/chat` |
| Payload shape | `{ conversationId?, projectId?, messages: [{role,content}], attachments?: [{base64, mediaType, name?, clientAttachmentId?}], conversationMode?, surface: "ask-atlas" }` |
| Attachment support | **Yes** — full pipeline via `useStagedAttachments` + `useAtlasConversation.submit()` |
| Automated send paths | `triggerNexusHandoff` in `askAtlasHelpers.ts` — programmatic send triggered from `home.tsx` on build-intent detection |
| Persistence | No DB row written by AskAtlasSurface itself. `nexus.ts` persists messages to `conversation_messages` after the stream. |
| Known limitations | No session continuity after page reload; no project scoping until handoff completes; handoff writes to `sessionStorage` and navigates to Workspace |

> ⚠️ **Note:** `replit.md` describes Ask Atlas as "retired." This is **inaccurate** for the current codebase. `AskAtlasSurface` is actively imported and rendered in `home.tsx`. The referenced retirement applies to an older homepage hero chat concept, not this component. Do not delete without an explicit migration task.

---

## Surface 2 — Workspace

**Classification: CANONICAL**

| Field | Value |
|---|---|
| Rendered component | `artifacts/atlas-frontend/src/pages/workspace.tsx` |
| Conversation surface sub-component | `ChatStream.tsx` / `WorkspaceConversationSurface.tsx` (fed from `nexusBridge.messages`) |
| Visible message owner | `nexusBridge.messages` (NexusMessage[] → ChatMessage[] via `useNexusWorkspaceBridge`) — **not** `useChatStream.messages` |
| Composer / send owner | `useAtlasConversation` (`atlasConv.submit()`) for all new sends. `doSend` from `useChatStream` is still wired for legacy automated paths — see Surface 6. |
| Session / bootstrap owner | `nexusBridge` — derives / stores `nexusConversationId` in `localStorage` key `nexus_conv_{projectId}`. URL param `?conversationId=` also accepted. |
| API route | `POST /api/nexus/chat` |
| Payload shape | Same as Ask Atlas plus: `{ conversationId, projectId, surface: "workspace", conversationMode, mode: "workspace" \| "build" }` |
| Attachment support | **Yes** — full pipeline (see [attachment-ownership.md](attachment-ownership.md)) |
| Automated send paths | Opening-message pipeline · import-greeting (`doSend`) · agentic iteration loop (`doSend`) · `axiom:chat-message` event (`doSend`) · project-greeting on Nexus path (`atlasConv.submit`) |
| Persistence | `conversation_messages` table, written by `nexus.ts` backend. `sessions` table still updated by `useChatStream` side effects (LIVE TRANSITIONAL). |
| Known limitations | `useChatStream` is still unconditionally instantiated (see Surface 5) and fires `useListMessages` even though its output is superseded. This is a known migration debt. |

**Runtime flag:** `useNexusWorkspaceChat = true` is **hardcoded** at `workspace.tsx:4715`. This constant gates all `nexusBridge`-vs-`useChatStream` branches. Do not remove without finishing the `useChatStream` migration.

---

## Surface 3 — ActiveRuns / Atlas Composer

**Classification: LEGACY BUT REACHABLE**

| Field | Value |
|---|---|
| Rendered component | `artifacts/atlas-frontend/src/components/home/ActiveRuns.tsx` |
| Imported / rendered by | `artifacts/atlas-frontend/src/components/AtlasComposerSheet.tsx` → `UnifiedShell.tsx` |
| Visible message owner | Local `streamedContent` field on a `ComposerRun` entry — inline stream accumulator |
| Composer / send owner | Direct `fetch("/api/chat", ...)` — **no hook intermediary** |
| Session / bootstrap owner | `POST /api/projects/{projectId}/sessions` fired immediately before the chat call |
| API route | `POST /api/chat` |
| Payload shape | `{ projectId, sessionId, message, history: [], entries: [], attachments?: [{base64, mediaType}], buildMode?, planMode? }` |
| Attachment support | Partial — base64 attachments can be passed but bypass `useStagedAttachments` and `useAtlasConversation` |
| Automated send paths | None; user-triggered only via the Composer sheet |
| Persistence | Session row + messages persisted via `chat.ts` |
| Known limitations | Bypasses WhisperGate; no Nexus features (CLARIFY, DECIDE, plan artifacts, memory chips from nexus.ts). Runs show in ActiveRuns UI but not in Workspace conversation history. |

---

## Surface 4 — FlowPanel

**Classification: LEGACY BUT REACHABLE**

| Field | Value |
|---|---|
| Rendered component | `artifacts/atlas-frontend/src/components/workspace/FlowPanel.tsx` |
| Imported / rendered by | `workspace.tsx` (conditional, inside the Workspace layout) |
| Visible message owner | Local `flowMessages` state — not shared with Workspace `nexusBridge` |
| Composer / send owner | Direct `fetch("/api/chat", ...)` — **no hook intermediary** |
| Session / bootstrap owner | None — no session created or passed |
| API route | `POST /api/chat` |
| Payload shape | `{ projectId, message, flowMode: true, flowNodes: [...], history: [...], projectMap: string, mode: "plan", imageData?: string, imageMimeType?: string }` |
| Attachment support | Image-only via direct `fileToBase64Safe()` call (bypasses `useStagedAttachments`) |
| Automated send paths | None |
| Persistence | None — flow messages are in-memory only; no DB write |
| Known limitations | No session, no persistence, no Nexus features. Image-only attachment support hard-coded inline. |

---

## Surface 5 — useChatStream (legacy workspace mount)

**Classification: LIVE TRANSITIONAL**

`useChatStream` is still instantiated unconditionally inside `workspace.tsx` at line ~4911. When `useNexusWorkspaceChat = true` (always), its `messages` array and `doSend` function are **superseded** by `nexusBridge.messages` and `atlasConv.submit()` for the primary chat display and user-initiated sends.

However `useChatStream` is NOT dead:

- It still manages `sessionId`, `ensureSessionId`, `chatPending`, `liveStep`, `memoryChips`, `handleRegenerate`, `activityStream`, and `abortControllerRef` — all of which are read by `workspace.tsx`.
- `doSend` (from `useChatStream`) is still called by several **automated side-paths** (opening-message fallback, agentic iteration loop, import-greeting, `axiom:chat-message` event).
- It fires `useListMessages(sessionId)` on every session change, writing to `messages` state even though those messages are not rendered.

Migration requirement: Phase 2 of the Nexus Workspace Spine migration (see `memory: nexus-workspace-spine.md`) must migrate these 12+ side-effect callers before `useChatStream` can be removed.

| API route | `POST /api/chat` (default; endpoint param accepted but never overridden in workspace) |
| Payload shape | Same as ActiveRuns but with richer context: `{ projectId, sessionId, message, history, entries, fileContext?, forgeContext?, dbUrl?, model?, buildMode?, planMode?, conversationMode? }` |

---

## Surface 6 — home-to-workspace handoff

**Classification: CANONICAL**

Two helper functions in `artifacts/atlas-frontend/src/lib/askAtlasHelpers.ts`:

### `triggerNexusHandoff(opts)`
- Writes `handoff-*` keys to `sessionStorage`
- Navigates browser to `/workspace/{projectId}`
- Workspace reads the handoff data as its `openingMessage`
- Used by: `home.tsx` (build-intent detection), `AskAtlasSurface.tsx` (PROJECT_READY signal)

### `seedHandoffContinuation(projectId)`
- Writes a continuation flag to `sessionStorage`
- Signals workspace to skip the greeting fetch and proceed directly to the opening-message pipeline
- Used by: `home.tsx`, `AskAtlasSurface.tsx`

Once workspace loads, the opening-message is sent via:
- `atlasConv.submit()` — when `useNexusWorkspaceChat = true` and nexusBridge has messages
- `doSend()` — fallback for the legacy opening-message pipeline path

---

## Surface 7 — V1.2 turn-entry endpoint (atlas-frontend-next)

**Classification: CANONICAL** (for atlas-frontend-next only)

`POST /api/conversations/:conversationId/messages` in `artifacts/api-server/src/routes/runs.ts`

This is the entry point used by `atlas-frontend-next` (the V1.2 frontend). It:
1. Validates conversation ownership
2. Persists the user `ConversationMessage` to DB
3. Creates an `execution_run` row (`received → thinking`)
4. Emits `run_created` + `run_status` events via `RunEventBus`
5. Fires `POST /api/chat` internally (backend-to-backend) in the background at `http://localhost:{apiPort}/api/chat`
6. Returns `202` immediately

The internal `fetch` to `/api/chat` is not a frontend call — it is server-side orchestration. It is **not** a legacy path; it is the canonical submission bridge for V1.2.

---

## Route registrations (verified by grep)

| Route | File | Status |
|---|---|---|
| `POST /api/chat` | `artifacts/api-server/src/routes/chat.ts` | **LIVE** — registered, receives calls from ActiveRuns, FlowPanel, workspace build-handoff, runs.ts internal |
| `POST /api/nexus/chat` | `artifacts/api-server/src/routes/nexus.ts` | **LIVE CANONICAL** — workspace primary, Ask Atlas |
| `POST /api/conversations/:id/messages` | `artifacts/api-server/src/routes/runs.ts` | **LIVE** — V1.2 atlas-frontend-next turn-entry |
| `GET /api/chat/scenario-keep` | `workspace.tsx:10735` (fetch) | **LIVE** — separate scenario-keep sub-path on chat router |

---

## Reachability verification commands

```bash
# Confirm /api/chat has active callers
grep -rn '"/api/chat"' artifacts/atlas-frontend/src/ --include='*.ts' --include='*.tsx'

# Confirm /api/nexus/chat has active callers
grep -rn '"/api/nexus/chat"' artifacts/atlas-frontend/src/ --include='*.ts' --include='*.tsx'

# Confirm useChatStream is imported
grep -rn 'useChatStream(' artifacts/atlas-frontend/src/ --include='*.tsx'

# Confirm AskAtlasSurface import chain
grep -rn 'AskAtlasSurface' artifacts/atlas-frontend/src/ --include='*.tsx'

# Confirm FlowPanel direct fetch
grep -n 'fetch("/api/chat"' artifacts/atlas-frontend/src/components/workspace/FlowPanel.tsx

# Confirm ActiveRuns direct fetch
grep -n 'fetch("/api/chat"' artifacts/atlas-frontend/src/components/home/ActiveRuns.tsx

# Confirm runs.ts internal fetch
grep -n 'api/chat' artifacts/api-server/src/routes/runs.ts

# Run the automated check (report mode, does not fail)
pnpm --filter @workspace/scripts run check-direct-callers
```
