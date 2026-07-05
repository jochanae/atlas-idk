# Handoff: Atlas Agent Loop Refactor (Backend)

**Date:** 2026-07-05
**Repo:** `Axiom-Atlas` (Cloud Run)
**DB:** Supabase `osuasytymbzurjvklhde`
**Scope:** Backend only. Frontend continues consuming the existing SSE contract; any new event types are additive.

---

## Why

Atlas today runs a shallow completion → one FILE_EDIT/LINE_PATCH batch → stops. This is why:
- edits feel one-shot; Atlas doesn't react to its own typecheck output
- `builder-telemetry-loop` failures keep resurfacing (claimed "done" without verification)
- users have to re-prompt after every small failure

Fix: replace the current single-pass model call in `atlas-chat` with a real AI SDK agent loop that keeps calling tools until a stop condition is met.

---

## Non-negotiables

1. **No new SSE contract for chat text.** Existing `data:` token stream stays byte-compatible with the frontend.
2. **New event types are additive.** `event: tool_call`, `event: tool_result`, `event: step_end` may be emitted; frontend ignores unknown events safely today.
3. **All existing action emissions (FILE_EDIT, LINE_PATCH, NAVIGATE_TO, BUILD_RUN, plan artifact, surfacedMemories) still fire in the same shape.** They are now emitted from tool results, not from prose parsing.
4. **`composeAtlasPrompt` remains the only prompt composer.** Add tool guidance inside it; do not fork.
5. **`stepCountIs(50)` minimum.** Not lower. Structured-output steps count.

---

## Data Model

New table `agent_runs` (observability, not required for correctness):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `message_id` | uuid FK → chat_messages | the assistant message this run produced |
| `project_id` | int FK → projects | |
| `user_id` | uuid FK → auth.users | |
| `step_count` | int | how many loop iterations ran |
| `stop_reason` | text | `completed` \| `step_limit` \| `error` \| `aborted` |
| `tools_called` | jsonb | array of `{ name, ok, ms }` |
| `total_tokens_in` | int | |
| `total_tokens_out` | int | |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz | |

Standard RLS: user reads own rows via `auth.uid()`. Service role full access for writes from the runner.

GRANTs:
```sql
GRANT SELECT ON public.agent_runs TO authenticated;
GRANT ALL ON public.agent_runs TO service_role;
```

---

## Tool Catalog (Phase 1)

Every tool is defined with AI SDK `tool()` + Zod `inputSchema`. Descriptions must be one sentence — the model picks by description.

**Read tools (always safe, no approval):**
- `read_file({ path })` → file contents (capped 8k lines; return `truncated: true` past that)
- `search_codebase({ query, glob?, maxResults? })` → ripgrep, capped 100 hits
- `list_dir({ path })` → children with type
- `git_diff({ ref? })` → current working diff or diff vs ref
- `read_ledger({ projectId, filter? })` → entries slice
- `read_dna({ projectId, fields? })` → DNA subset
- `search_memory({ projectId, query, k=8 })` → RAG stub for now, returns text search; swap to vectors in Phase 3

**Write tools (needsApproval only for destructive):**
- `edit_file({ path, oldContent, newContent, reason })` — emits FILE_EDIT SSE event as side effect
- `line_patch({ path, startLine, endLine, newContent, reason })` — emits LINE_PATCH
- `write_ledger_entry({ projectId, verb, title, summary, amField? })`
- `patch_dna({ projectId, field, value, status })`

**Verification tools (the whole point of the loop):**
- `run_typecheck({ scope?: "frontend"|"backend"|"both" })` → `{ ok, errors: [{ file, line, message }] }`
- `run_tests({ pattern? })` → pass/fail summary
- `screenshot_preview({ path?, viewport? })` → returns storage URL (project-assets bucket, reuse existing)

**Control:**
- `finish({ summary })` — model calls when task is complete. Loop terminates on this OR `stepCountIs(50)`.

---

## Loop Implementation

Replace the current `streamText` call in `atlas-chat` (server/routes/chat.ts or wherever nexus/ask-atlas resolves) with:

```ts
import { streamText, stepCountIs, tool } from "ai";

const result = streamText({
  model: gateway("google/gemini-3-flash-preview"),
  system: composeAtlasPrompt(roleSpecific),
  messages: convertToModelMessages(history),
  tools: agentTools,               // catalog above
  stopWhen: stepCountIs(50),
  experimental_telemetry: { isEnabled: true },
  onStepFinish: async ({ toolCalls, toolResults, usage }) => {
    // append to agent_runs.tools_called, increment step_count
  },
  onFinish: async ({ finishReason, usage, steps }) => {
    // write agent_runs row, update chat_messages with final assistant text
  },
});

return result.toUIMessageStreamResponse({ headers: corsHeaders });
```

**Critical loop rules:**
- Every write tool auto-invokes the relevant verify tool on the *next* step by including its result in the tool response payload (`{ ok: true, hint: "run_typecheck recommended" }`). Do not hard-force; the model decides.
- If `run_typecheck` returns errors, the model MUST attempt a fix before calling `finish`. Enforce in the system prompt, not code.
- Abort signal from client (existing SSE cancel path) must propagate into `streamText`'s `abortSignal`. Currently it doesn't — verify.

---

## Prompt Additions (composeAtlasPrompt)

Add a new section `roleSpecific.tools`:

```
You have tools. Use them instead of guessing.

- To change a file: read_file → edit_file → run_typecheck. If typecheck fails, fix before calling finish.
- To answer a factual question about the project: search_codebase or read_ledger BEFORE responding.
- To claim a task is done: call finish({ summary }). Do NOT say "done" in prose without calling finish.
- Never fabricate file contents. Always read_file first.
- Verification is not optional after any write tool.
```

Voice rules #7 (never deny capabilities) and #8 (order is the discipline) already in atlas-core stay unchanged.

---

## SSE Additions (backward compatible)

Emit in addition to existing events:

```
event: tool_call
data: {"name":"read_file","args":{"path":"..."},"stepId":"..."}

event: tool_result
data: {"name":"read_file","ok":true,"ms":42,"stepId":"..."}

event: step_end
data: {"step":3,"tokensIn":1204,"tokensOut":89}
```

Frontend will get a "thinking receipts"–style live view for free later. Not required to render now.

---

## Rollout

1. **Feature flag `USE_AGENT_LOOP`** (env var, default off). When off, existing code path runs unchanged.
2. Deploy behind flag. Turn on for your user only (`user_id` allowlist).
3. Test 5 real tasks: edit + typecheck fix, codebase question, ledger lookup, plan artifact, GitHub push.
4. Watch `agent_runs.stop_reason` distribution. If `step_limit` > 10% of runs, raise cap or tighten prompt.
5. Turn on globally.

---

## Explicit Non-Goals (Phase 1)

- No sub-agents (Phase 4).
- No embeddings/vectors (Phase 3 — `search_memory` returns text search for now).
- No structured plan output refactor (separate handoff).
- No frontend changes required beyond ignoring new SSE events.

---

## Files Touched (expected)

- `server/routes/chat.ts` (or `atlas-chat.ts`) — the loop
- `server/lib/agent-tools/*.ts` — new tool definitions, one file per tool
- `server/lib/agent-tools/index.ts` — barrel export
- `server/lib/atlas-core.ts` — prompt additions
- `lib/db/src/schema/agent_runs.ts` — new table
- `lib/db/drizzle/000X_agent_runs.sql` — migration (raw SQL, per `drizzle-kit-tty` memory)

---

## Definition of Done

- [ ] `USE_AGENT_LOOP=true` for allowlisted user
- [ ] 5 test scenarios pass end-to-end
- [ ] `agent_runs` populates on every assistant message
- [ ] Existing SSE contract unchanged (frontend has no regression)
- [ ] Typecheck-fix loop verified: intentionally break a file, ask Atlas to fix, confirm it reads → edits → typechecks → re-edits → finishes
