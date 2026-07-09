---
name: Nexus route uses shared agent-tools registry via adapter
description: How /api/nexus/chat gets new capabilities without duplicating tool definitions
---

`routes/nexus.ts` uses the raw `@anthropic-ai/sdk` streaming API (not the Vercel `ai` SDK agent loop used by `routes/chat.ts`), so it can't call `buildAgentTools()` directly — that returns `ai`-SDK `tool()` objects, not `Anthropic.Tool` schemas.

Bridge: `lib/agent-tools/anthropic-adapter.ts` exposes `toAnthropicTools(ctx, names)` (schema conversion via `asSchema(t.inputSchema).jsonSchema`) and `executeSharedAgentTool(ctx, name, input)` (generic executor). nexus.ts derives its Anthropic tool lists and dispatches unknown tool names through this adapter instead of hand-rolling new `Anthropic.Tool` consts.

**Why:** Phase 3A/3B tools (generate_deliverable, search_all_projects, etc.) were built into the shared registry but never reached the real chat surface because nexus.ts had a second, disconnected set of hardcoded tool arrays (`NEXUS_AGENT_TOOLS`/`NEXUS_WORKSPACE_TOOLS`). Any capability added only to `buildAgentTools()` without also being added to nexus.ts's local arrays would silently never be invokable by Atlas.

**How to apply:** When adding a new capability, add it once to `lib/agent-tools/index.ts` (`buildAgentTools`), then add its name to `SHARED_HOME_TOOL_NAMES` or `SHARED_WORKSPACE_TOOL_NAMES` in `anthropic-adapter.ts`. Never write a new hardcoded `Anthropic.Tool` const in nexus.ts for a capability that could live in the shared registry. Exception: `create_project` and the pre-project "buffer" branches of `tier1_upsert_field`/`tier1_mark_skipped` stay nexus-specific — they encode home-vs-project dual-mode routing that doesn't exist elsewhere; only their *schema* (not execution) is sourced from the shared registry.
