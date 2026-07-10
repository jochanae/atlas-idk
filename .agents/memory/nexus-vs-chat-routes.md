---
name: Nexus vs Chat routes — verify live path each time, it has flipped before
description: Which chat endpoint (/api/chat vs /api/nexus/chat) the rendered Workspace UI actually uses; this has changed across sessions and must be re-traced, not assumed from memory.
---

## Current verdict (2026-07-10, task #172) — supersedes prior "chat.ts is live" note

As of `workspace.tsx` in the current codebase: `useNexusWorkspaceChat = true` (hardcoded), and the `ChatStream`/composer prop-spreads (`...(useNexusWorkspaceChat ? { messages: nexusBridge.messages, onSend: nexusBridge.send, ... } : {})`) are applied **last** in the prop object, so `nexusBridge` (backed by `useNexusChatStream` → `POST /api/nexus/chat`) wins over `useChatStream`'s (`POST /api/chat`) return value in what actually renders and sends. **The live transport today is `/api/nexus/chat` → `nexus.ts`.**

`useChatStream` is still unconditionally instantiated in the same render and independently fires its own `useListMessages(sessionId)` fetch and other side effects — none of it is gated behind `useNexusWorkspaceChat`, so it runs live but its output is discarded. This is a confirmed wasted-duplicate-work / drift risk, not yet fixed (see `docs/workspace-remount-investigation.md` §6).

**Why this matters:** this flag/wiring has flipped at least twice across sessions (chat.ts live → nexus.ts dormant, now the reverse). Do not trust a prior memory or doc's claim about which is "live" — re-derive it by reading the current value of `useNexusWorkspaceChat` and the prop-spread order in `workspace.tsx` every time it matters (e.g. before wiring a new SSE field through, or debugging why a feature "isn't showing up").

**Concrete failure mode this caused:** task #171 added a `generatedArtifacts` field to `ChatMessage`/`chat.ts`'s SSE `done` event and rendered it in `ChatStream.tsx`. It worked against `useChatStream`, but `useNexusChatStream`'s `NexusMessage` type/done-handler never captured `generatedArtifacts` from `nexus.ts`'s `done` event, and `useNexusWorkspaceBridge.ts`'s `toChatMessage()` mapper never passed it through either — so the feature was silently invisible on the actually-live path until task #172 fixed both. **Lesson: a chat feature must be traced through BOTH transports' full chain (backend SSE payload → hook's message type → hook's done-handler → any bridge/mapper → the component) before it's considered "done," not just the one you tested against.**

## chat.ts vs nexus.ts relationship (structural, unaffected by which is currently live)

Neither file imports the other (`routes/index.ts` mounts both routers independently). `nexus.ts` was built by copying/adapting `chat.ts` logic — its own comments say so explicitly ("Nexus equivalent of ... in chat.ts", "Ported from chat.ts"). They are duplicate/parallel implementations kept loosely in sync by hand, not caller/callee — new features added to one do not automatically reach the other.

## Two separate agent tool systems, but partially unified

`chat.ts` uses the AI SDK `tool()` wrapper from `lib/agent-tools/`. `nexus.ts` uses raw `Anthropic.Tool[]` built via `toAnthropicTools()` in `lib/agent-tools/anthropic-adapter.ts`, which derives schemas from the SAME shared tool registry (`SHARED_HOME_TOOL_NAMES` / `SHARED_WORKSPACE_TOOL_NAMES`, e.g. `generate_deliverable`, `search_all_projects`) — so tool *availability* is shared for tools listed there, but each route still hand-writes its own dispatch/result-mapping code, which is where fields can silently diverge (see `generatedArtifacts` example above).

## Side-effect gate (WhisperGate + Just-Talk) — nexus.ts

nexus.ts classifies intent via WhisperGate (or forces CHAT when `justTalk === true`) before the model loop.
`allowBuildSideEffects = intent === "BUILD" && !justTalk && !conversationModeActive` gates:
- `persistNexusExecutionRun`
- GitHub bootstrap
- Tier1 slot extraction
- Tool-loop enablement / forceCreate
- Step/run-card SSE events

CHAT and DECIDE turns never write an execution_run row. Classifier failure falls back to DECIDE (not BUILD).
Every turn emits SSE `event: meta` with `{intent, justTalk, fallback}` before the first text delta.

## Architecture diff reuses the source index, not new tables
Architecture diff (Phase 3A step 2) compares two projects' routes/deps/data-entities/components/auth by re-running the SAME extraction primitives already used for indexing (scanProjectRoutes, package.json parse, AM data.entities, PascalCase export scan) rather than persisting a new "architecture snapshot" table. Category status is plain Jaccard-similarity bucketing (same/similar/different/onlyA/onlyB/empty) — a structural signal, not a semantic diff. Any future diff category should follow this pattern: derive on-demand from project_source_files + application_models, don't add new storage.
