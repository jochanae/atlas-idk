---
name: Nexus vs Chat routes
description: chat.ts (/api/chat) is the live Workspace chat path; nexus.ts (/api/nexus/chat) is a parallel/ported implementation only used by an unrendered surface. Verified by tracing imports, not assumed.
---

## Corrected verdict (supersedes earlier "nexus.ts is the active path" note)

Traced end-to-end during a forced-remount investigation by following actual imports, not surface names:

- `pages/workspace.tsx` (the real, rendered Workspace page) imports `useChatStream` from `@/hooks/useChatStream`, NOT `useNexusChatStream`.
- `useChatStream.ts` defaults `endpoint = "/api/chat"`; `workspace.tsx`'s call site does not override it.
- `workspace.tsx` also imports `WorkspaceConversationSurface` (which uses `useNexusChatStream` → `/api/nexus/chat`) but never renders it — dead import, not in the live tree.
- `useNexusChatStream` is only consumed by `home.tsx` and `WorkspaceConversationSurface.tsx`.
- Conclusion: **the actual Workspace chat UI a user interacts with today talks to `/api/chat` → `chat.ts`**, not `/api/nexus/chat` → `nexus.ts`.

## chat.ts vs nexus.ts relationship

Neither file imports the other (`routes/index.ts` mounts both routers independently). `nexus.ts` was built by copying/adapting `chat.ts` logic — its own comments say so explicitly ("Nexus equivalent of ... in chat.ts", "Ported from chat.ts", "match chat.ts ... for frontend parity"). So they are duplicate/parallel implementations, not caller/callee. `nexus.ts` currently powers only the not-yet-wired-in `WorkspaceConversationSurface` migration target.

**Why this matters:** any fix targeting the live Workspace chat (run cards, persistence, streaming, tool execution) must be verified against `chat.ts` + `useChatStream.ts`, and confirmed with logs (`POST /api/chat` vs `POST /api/nexus/chat`) — don't assume nexus.ts is live just because it looks newer or is described elsewhere as the migration target. Re-verify next time the "Nexus Workspace Spine" migration progresses, since this could flip once `WorkspaceConversationSurface` actually gets rendered.

## Side-effect gate (WhisperGate + Just-Talk) — nexus.ts only, not yet live

nexus.ts classifies intent via WhisperGate (or forces CHAT when `justTalk === true`) before the model loop.
`allowBuildSideEffects = intent === "BUILD" && !justTalk && !conversationModeActive` gates:
- `persistNexusExecutionRun`
- GitHub bootstrap
- Tier1 slot extraction
- Tool-loop enablement / forceCreate
- Step/run-card SSE events

CHAT and DECIDE turns never write an execution_run row. Classifier failure falls back to DECIDE (not BUILD).
Every turn emits SSE `event: meta` with `{intent, justTalk, fallback}` before the first text delta.
(This logic exists in nexus.ts today but is dormant until the Nexus surface is actually rendered — see verdict above.)

## Two separate agent tool systems
`chat.ts` (live Workspace) uses the AI SDK `tool()` wrapper from `lib/agent-tools/` (registered via a `buildAgentTools`-style factory). `nexus.ts` uses raw `Anthropic.Tool[]` definitions (`NEXUS_AGENT_TOOLS`/`NEXUS_WORKSPACE_TOOLS`) with manual dispatch — it does NOT call `buildAgentTools`. New workspace-only tools (e.g. `search_all_projects`) don't automatically reach nexus.ts; since Ask Atlas is documented as retired in favor of Workspace, new cross-project tools were scoped to chat.ts only, not backported to nexus.ts.

## Architecture diff reuses the source index, not new tables
Architecture diff (Phase 3A step 2) compares two projects' routes/deps/data-entities/components/auth by re-running the SAME extraction primitives already used for indexing (scanProjectRoutes, package.json parse, AM data.entities, PascalCase export scan) rather than persisting a new "architecture snapshot" table. Category status is plain Jaccard-similarity bucketing (same/similar/different/onlyA/onlyB/empty) — a structural signal, not a semantic diff. Any future diff category should follow this pattern: derive on-demand from project_source_files + application_models, don't add new storage.
