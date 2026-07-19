# Agent Change Rules

> **Read this before writing any code that touches conversation surfaces, transport hooks, routes, or attachments.**
> Companion documents: [runtime-map.md](runtime-map.md) · [conversation-ownership.md](conversation-ownership.md) · [attachment-ownership.md](attachment-ownership.md)

These rules exist because the conversation stack has multiple live layers in simultaneous use. Violating them causes silent divergence, duplicate sends, broken attachment pipelines, or lost messages.

---

## The three-question test

Before any change to the conversation stack, answer these three questions:

1. **Which surface does this change affect?** (Ask Atlas, Workspace, ActiveRuns, FlowPanel, handoff, programmatic)
2. **Which layer owns the behavior I'm changing?** (use [conversation-ownership.md](conversation-ownership.md) to find the owner)
3. **Does this change cross a layer boundary?** (if yes, re-read the ownership rules before proceeding)

---

## Rules: sending a message

| Rule | Rationale |
|---|---|
| New user-facing sends go through `atlasConv.submit()` only | `submit()` is the single canonical send path; adding a second breaks attachment lifecycle callbacks |
| Never call `fetch("/api/nexus/chat")` directly from a component | Transport must go through `useNexusChatStream` (owned by `useAtlasConversation`) |
| Never call `fetch("/api/chat")` directly from a new component | `/api/chat` is a legacy route; new surfaces use the Nexus route |
| Programmatic / automated sends may continue using `doSend()` until Phase 2 migration lands | `doSend` is still wired to session-ID-keyed infrastructure that Nexus path does not yet replicate |
| Do not add a new `useChatStream` instantiation | There must be exactly one `useChatStream` in the tree (currently in `workspace.tsx`) |
| **When adding, removing, or migrating a `doSend` call in `workspace.tsx`, update the inventory table in [conversation-ownership.md § Workspace Legacy doSend Inventory](conversation-ownership.md#workspace-legacy-dosend-inventory)** | The inventory is the authoritative migration tracker; stale entries mislead future agents about reachability and readiness |

---

## Rules: attachments

| Rule | Rationale |
|---|---|
| All attachment state goes through `useStagedAttachments` | Any other state holder creates a second source of truth |
| `fileToBase64Safe` must only be called inside `useAtlasConversation.submit()` for conversational sends | Duplicate conversion loops diverge on resize thresholds and error semantics |
| `clearFiles()` must not be called before `submit()` resolves | Clearing before confirmation drops files the user expects to send |
| `previewUrl` is a local Blob URL — never send to server or store in DB | The server has no access to the client's Blob store |
| `clientAttachmentId` must be passed through from `StagedFile.id` | This is the only correlation key for `attachment_ack` events |

---

## Rules: modifying `workspace.tsx`

`workspace.tsx` is 400 KB+. Handle with extreme care:

- **Never read the full file into an agent context.** Use `cp`, `bash head -n`, or line-range reads only.
- The `useNexusWorkspaceChat = true` constant at line 4715 gates all Nexus-vs-legacy branches. Do not remove it without completing the Phase 2 migration.
- `atlasConv` (line 4744) and `nexusBridge` (line 4753) are the CANONICAL hooks. Prop-spread them last in `ChatStream` / composer so they win over legacy props.
- `useChatStream` (line ~4911) still provides `sessionId`, `ensureSessionId`, `doSend`, `chatPending`, `liveStep`, `memoryChips`, `handleRegenerate`, `activityStream`, and `abortControllerRef`. Do not remove any of these until the Phase 2 migration moves them to the Nexus path.

---

## Rules: adding a new backend capability

| Rule | Rationale |
|---|---|
| New capabilities go into `nexus.ts` only | `chat.ts` is LIVE TRANSITIONAL; new features added there won't be reachable from the canonical Workspace path |
| If a capability exists in `chat.ts`, replicate it in `nexus.ts` before relying on it | `nexus.ts` does not inherit `chat.ts` features automatically |
| Use `builderProtocols.ts` for shared token/emitter logic | Prevents protocol drift between the two routes |
| New SSE event types must be handled in `useNexusChatStream` | The hook owns all SSE parsing for the Nexus stream |

---

## Rules: classifying old code

Do not label any path **DEAD / SAFE TO DELETE** without evidence from all three of:

1. **Import chain:** No file imports or re-exports the symbol.
2. **Route registration:** No `router.get/post/use` registers the path.
3. **Runtime reachability:** No runtime `fetch(...)`, `EventSource(...)`, or `XMLHttpRequest` call contains the path as a string literal or template fragment.

Run `pnpm --filter @workspace/scripts run check-direct-callers` to get a current snapshot of callers.

---

## High-risk boundaries (comment anchors)

These locations are the most dangerous to modify incorrectly. Architecture comments have been placed at each one pointing back to this document.

| Location | File | Risk |
|---|---|---|
| Top of `workspace.tsx` | `artifacts/atlas-frontend/src/pages/workspace.tsx` | Dual-hook instantiation; `useNexusWorkspaceChat` flag |
| `useChatStream` mount | `workspace.tsx` line ~4911 | Still provides live state even though display is superseded |
| Nexus bridge mount | `workspace.tsx` line ~4753 | CANONICAL adapter; removing breaks message display |
| `atlasConv` mount | `workspace.tsx` line ~4744 | CANONICAL send path; removing breaks all user-initiated sends |
| `doSend` in FlowPanel | `FlowPanel.tsx` line ~376 | Direct `/api/chat` call — bypasses WhisperGate and attachment pipeline |
| `fetch("/api/chat")` in ActiveRuns | `ActiveRuns.tsx` line ~317 | Direct `/api/chat` call — bypasses Nexus and attachment pipeline |
| `fileToBase64Safe` in FlowPanel | `FlowPanel.tsx` line ~389 | Non-canonical conversion — bypasses `useStagedAttachments` |
| `fileToBase64Safe` in home.tsx | `home.tsx` line ~148 | Pre-B2 direct conversion — verify reachability vs AskAtlasSurface path |

---

## Migration roadmap (do not skip phases)

Phase 2 of the Nexus Workspace Spine migration must complete before `useChatStream` can be removed. The migration involves:

1. Moving `sessionId` / `ensureSessionId` to the Nexus conversation model
2. Migrating all `doSend` automated side-paths in `workspace.tsx` to `atlasConv.submit()`
3. Migrating FlowPanel to use `atlasConv.submit()`
4. Migrating ActiveRuns to use `atlasConv.submit()`
5. Removing the `useChatStream` instantiation from `workspace.tsx`

Until then, both hooks coexist. Do not attempt a partial migration.

---

## Check script

A reporting script checks for newly introduced direct callers of protected entry points:

```bash
pnpm --filter @workspace/scripts run check-direct-callers
```

This script reports (but does not fail) when it finds:
- Direct `fetch("/api/chat")` calls outside the known set of files
- Direct `fetch("/api/nexus/chat")` calls outside `useNexusChatStream.ts`
- `useChatStream(` instantiations outside `workspace.tsx`
- `fileToBase64Safe` calls outside the known set

Run it after any PR that touches conversation surfaces. If it reports a new caller, assess whether it is intentional and update the known-callers list in `scripts/src/check-direct-callers.ts`.
