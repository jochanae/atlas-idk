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

---

## Workspace Legacy `doSend` Inventory

> **Maintenance rule:** this table must be updated whenever a `doSend` call is added, removed, or migrated in `workspace.tsx`. See [agent-change-rules.md](agent-change-rules.md) § doSend inventory rule.

**Reachability note:** 5 of the 16 call sites are provably unreachable while `useNexusWorkspaceChat = true` (hardcoded). They are retained as the legacy fallback in case the flag is ever toggled and to avoid accidental divergence during a future rollback. The 11 reachable calls are the active migration surface.

**Total call sites found:** 16 (verified by `grep -n 'doSend(' workspace.tsx` filtered for actual invocations, excluding type references, prop definitions, and comments).

**Test coverage:** `hooks/__tests__/useChatStream.visibility.test.tsx` and `hooks/__tests__/useChatStream.attachments.test.ts` cover the hook's internal state machine, not the individual `doSend` invocation sites in `workspace.tsx`. None of the 16 call sites below have dedicated test coverage.

### Classification key

| Class | Meaning |
|---|---|
| **READY FOR NEXUS MIGRATION** | `atlasConv.submit({ text })` can replace `doSend(text, sid, msgs)` today without behavior loss. May require replacing the `!sessionId` guard with an equivalent `atlasConv.canSend` check. |
| **NEEDS SMALL CONTRACT EXTENSION** | Migration requires adding a new field to `AtlasConversationSubmission` / `NexusMessage`, or ensuring `nexus.ts` handles a builder protocol signal the call site emits. |
| **BLOCKED BY SESSION OWNERSHIP** | The call site's trigger condition gates on `sessionId` or `priorLoadedState` from `useChatStream`; migration requires first migrating those readiness signals to the Nexus conversation model. |
| **BLOCKED BY MESSAGE-STORE BEHAVIOR** | The call site derives content or firing conditions from `messages` (the `useChatStream` array); migration requires re-expressing those conditions against `nexusBridge.messages`. |
| **LEGACY-ONLY AND INTENTIONALLY RETAINED** | Unreachable while `useNexusWorkspaceChat = true`. Kept as a no-regression safety net for the legacy path. Do not remove until the Nexus migration is declared complete and the flag removed. |

---

### Call site table

| # | Line | Containing function / handler | Trigger source | Category | Message content / category | Session / conv identity | `displayAs` / extra options | Changes visible chat? | Legacy state deps | `atlasConv.submit` feasible today? | Migration risk | Classification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 5068 | `sendAuditMessage()` inside `useEffect([pendingAutoApply])` | `pendingAutoApply` effect fires after file audit fetch resolves | Build-driven (agentic loop continuation) | `[LOCAL_APPLY_SUCCESS] N file(s) written…` + AUDIT PASSED / INTEGRITY FAILURE / AUDIT REQUIRED body | `sessionId`, `messagesRef.current` | `displayAs: "autoVerify"` | Yes — autoVerify bubble rendered in chat | `sessionId`, `messagesRef` | No — `displayAs: "autoVerify"` is not in `AtlasConversationSubmission`; `nexus.ts` must also handle the `[LOCAL_APPLY_SUCCESS]` + audit signal cycle | Medium — `displayAs` field + nexus.ts signal handling | **NEEDS SMALL CONTRACT EXTENSION** |
| 2 | 6745 | `executeHomePlan()` `useCallback` | `onExecuteHomePlan` prop → user clicks "Execute" on a plan card in `ChatStream` | User-initiated (indirect) | Plan step text + "Execute this plan in this workspace…" instruction | `sessionId`, `messages` (snapshot for history) | none | Yes | `sessionId`, `messages` snapshot (history only; nexus.ts has server-side history) | Yes — plain text, no special options; nexus history covers the history dependency | Low | **READY FOR NEXUS MIGRATION** |
| 3 | 6878 | Opening message `useEffect` (else-branch) | `openingMessage` set from sessionStorage handoff — **`!useNexusWorkspaceChat` branch only** | Lifecycle (dead branch) | Handoff message text + optional attachments | `sessionId`, `messagesRef.current` | none | Yes | `sessionId`, `messagesRef`, `priorLoadedState`, `sessionsLoading` | N/A — unreachable: Nexus branch at line 6876 fires `atlasConv.submit()` and the `else` is never reached | None | **LEGACY-ONLY AND INTENTIONALLY RETAINED** |
| 4 | 6897 | `atlas-initial-{id}` sessionStorage `useEffect` | sessionStorage key `atlas-initial-{id}` present on first load | Lifecycle | Arbitrary string read from sessionStorage | `sessionId`, `messagesRef.current` | none | Yes | `sessionId`, `priorLoadedState` (useChatStream), `sessionsLoading` | No — effect guards on `priorLoadedState` which is owned by `useChatStream`; migration requires substituting an equivalent Nexus history-loaded gate | Medium — gating signal migration | **BLOCKED BY SESSION OWNERSHIP** |
| 5 | 6927 | Import greeting `useEffect` | `?source=` URL param present + `messages.length === 0` + `project.memory` set | Lifecycle (one-shot) | Fixed import greeting: `"I just imported this project from {source}…"` | `sessionId` | none | Yes | `sessionId`, `messages.length` (useChatStream message count used as "no history" gate) | No — `messages.length` gate must be re-expressed as `nexusBridge.messages.length` first | Low code change, but requires re-expressing the gate | **BLOCKED BY MESSAGE-STORE BEHAVIOR** |
| 6 | 6977 | `primeHomeHandoff()` inner function inside home-handoff `useEffect` (else-branch) | `?source=home-handoff` URL param detected — **`!useNexusWorkspaceChat` branch only** | Lifecycle (dead branch) | Home-handoff continuation prompt (varies by `project.memory` state) | `sessionId`, `messagesRef.current` | none | Yes | `sessionId`, `messagesRef`, `messages.length`, `nexusBridge.messages.length` | N/A — unreachable: line 6974 `if (useNexusWorkspaceChat)` fires `atlasConv.submit()` and returns | None | **LEGACY-ONLY AND INTENTIONALLY RETAINED** |
| 7 | 7041 | `sendFromIntentCapture()` `useCallback` | `onSend` prop on `ChatStream` — **overridden by Nexus spread at line ~9304** | User-initiated (dead via prop override) | Arbitrary text passed through `onSend` | `sessionId`, `messages` snapshot | none | Yes | `sessionId`, `messages`, `chatPending` | N/A — unreachable: ChatStream `onSend` is overridden to `void atlasConv.submit({ text: msg })` by the Nexus prop spread applied last in JSX | None | **LEGACY-ONLY AND INTENTIONALLY RETAINED** |
| 8 | 7051 | `atlas:workspace-send` DOM event handler | `window.dispatchEvent(new CustomEvent("atlas:workspace-send", { detail: { text } }))` from any component | Event-driven (programmatic) | Event `detail.text` — arbitrary | `sessionId`, `messagesRef.current` | none | Yes | `sessionId`, `messagesRef` | Yes — replace with `if (atlasConv.canSend) void atlasConv.submit({ text })` | Low | **READY FOR NEXUS MIGRATION** |
| 9 | 7483 | `handleSend()` (legacy branch after early return) | User submits composer — **`!useNexusWorkspaceChat` branch only** | User-initiated (dead branch) | Composer text + file suffix + URL context; `sendOpts` with mode flags | `sessionId`, `ensureSessionId()`, `messages`, `attachedFiles` | `planMode`, `buildMode`, `conversationMode` | Yes | `sessionId`, `ensureSessionId`, `messages`, `attachedFiles`, `zipContext` | N/A — unreachable: `handleSend()` returns at line 7417 after `atlasConv.submit()` | None | **LEGACY-ONLY AND INTENTIONALLY RETAINED** |
| 10 | 7498 | `doSendFromComposer()` `useCallback` (legacy fallback) | All composer sends forwarded through `doSendFromComposer` — **`!useNexusWorkspaceChat` branch only** | User-initiated (dead branch) | Forwarded args from composer | `sessionId` | forwarded `sendOpts` | Yes | `sessionId` | N/A — unreachable: line 7494 returns after `atlasConv.submit()` | None | **LEGACY-ONLY AND INTENTIONALLY RETAINED** |
| 11 | 8015 | `handleReviewPushSuccess` callback — local-workspace branch | File edits applied to local workspace (no linked GitHub repo) | Build-driven (agentic loop continuation) | `[LOCAL_APPLY_SUCCESS] N file(s) written to local workspace…` | `sessionId`, `messagesRef.current` | `displayAs: "autoVerify"` | Yes — autoVerify bubble | `sessionId`, `messagesRef`, `agenticMode`, `agenticIterCount` | No — same `displayAs` gap as #1; nexus.ts signal handling also required | Medium | **NEEDS SMALL CONTRACT EXTENSION** |
| 12 | 8081 | `handleReviewPushSuccess` callback — GitHub branch | Files committed to GitHub repo via push | Build-driven (agentic loop continuation) | `[FILE_COMMITTED] N file(s) committed to {repo}: {paths}. Verify the build.` | `sessionId`, `messagesRef.current` | `displayAs: "autoVerify"` | Yes — autoVerify bubble | `sessionId`, `messagesRef`, `linkedRepo`, `agenticMode` | No — `displayAs` gap + nexus.ts must handle `[FILE_COMMITTED]` signal | Medium | **NEEDS SMALL CONTRACT EXTENSION** |
| 13 | 8364 | `axiom:send-build-errors` DOM event handler | User clicks "Send to Atlas" in `BuildPanel` component | User-initiated (indirect) | Build error message text from `BuildPanel` | `sessionId`, `messages` snapshot | none | Yes | `sessionId`, `messages`, `chatPending` | Yes — replace with `if (atlasConv.canSend) void atlasConv.submit({ text: detail.message })` | Low | **READY FOR NEXUS MIGRATION** |
| 14 | 9239 | `onEditDeclined` prop handler in `ChatStream` JSX | User dismisses / declines proposed file edits in chat | User-initiated (indirect) | `FILE_EDIT_DECLINED: User reviewed but did not push {edits}. Awaiting further instruction.` | `sessionId`, `messages`, `messagesRef.current` | none | Yes | `sessionId`, `messagesRef`, `messages` (to derive edit paths) | Yes — message content can be assembled and passed to `atlasConv.submit({ text })`; `messages` used only to build the text, not as history | Low | **READY FOR NEXUS MIGRATION** |
| 15 | 9280 | `onBuildAnyway` prop handler in `ChatStream` JSX | User clicks "Build Anyway" to bypass the readiness gate | User-initiated | Arbitrary text supplied by caller | `sessionId`, `messagesRef.current` | `buildMode: true`, `skipReadiness: true`, `conversationMode` | Yes | `sessionId`, `messagesRef` | No — `buildMode` and `skipReadiness` are `/api/chat`-specific flags; nexus.ts has no `skipReadiness` concept | Medium — requires nexus.ts flag support or equivalent override | **NEEDS SMALL CONTRACT EXTENSION** |
| 16 | 9288 | `onSuggestionTap` handler (docked-composer branch) | User taps a suggestion chip while the composer is in "docked" (floating) mode | User-initiated | Suggestion chip text (verbatim) | `sessionId`, `messagesRef.current` | none | Yes | `sessionId`, `messagesRef` | Yes — replace with `void atlasConv.submit({ text })` | Low | **READY FOR NEXUS MIGRATION** |

---

### Migration summary

| Classification | Count | Lines |
|---|---|---|
| READY FOR NEXUS MIGRATION | 5 | 6745, 7051, 8364, 9239, 9288 |
| NEEDS SMALL CONTRACT EXTENSION | 4 | 5068, 8015, 8081, 9280 |
| BLOCKED BY SESSION OWNERSHIP | 1 | 6897 |
| BLOCKED BY MESSAGE-STORE BEHAVIOR | 1 | 6927 |
| LEGACY-ONLY AND INTENTIONALLY RETAINED | 5 | 6878, 6977, 7041, 7483, 7498 |
| **Total** | **16** | |

**Reachable calls requiring active migration work:** 11 (all except the 5 LEGACY-ONLY retained calls).

**Prerequisite for full migration:**
1. Add `displayAs` (or equivalent message-classification field) to `AtlasConversationSubmission` and `NexusMessage` — unblocks calls 5068, 8015, 8081.
2. Add `nexus.ts` handling for `[LOCAL_APPLY_SUCCESS]`, `[FILE_COMMITTED]`, and `FILE_EDIT_DECLINED` builder protocol signals — unblocks calls 5068, 8015, 8081, 9239.
3. Add `skipReadiness` / `buildMode` override to nexus route or `useAtlasConversation.submit()` options — unblocks call 9280.
4. Replace `priorLoadedState` gate with a Nexus-equivalent history-loaded signal — unblocks call 6897.
5. Replace `messages.length` import-greeting gate with `nexusBridge.messages.length` — unblocks call 6927.

After prerequisites 1–5 are done, the 5 LEGACY-ONLY calls can be removed and `useChatStream` can be retired from `workspace.tsx`.
