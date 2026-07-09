---
name: Nexus single-hop tool continuation bug
description: streamClaude continuation after a tool call used to hardcode tools:false, silently breaking any turn needing 2+ sequential tool calls
---

In `artifacts/api-server/src/routes/nexus.ts`, the recursive `streamClaude` continuation after a tool call hardcoded `tools: false` on the follow-up request. This meant only ONE tool-call hop was ever allowed per turn.

Symptom: user gives a detailed, well-specified request (e.g. "generate this PPTX with X audience/goal, save it, give me a download card"). The model's first hop calls a bookkeeping tool (e.g. `tier1_upsert_field` to log audience/context), then wants a second hop to call the actual action tool (e.g. `generate_deliverable`) — but tools are gone on that hop, so it returns empty text. The existing empty-response retry logic then retries the *same* broken continuation and still gets nothing, surfacing a hard "Atlas didn't generate a response" error to the user.

This looked identical to an earlier, unrelated bug (DECIDE intent fully blocking tool access) but is a different failure: intent classification and initial tool-gating were correct (BUILD, tools allowed); the bug was purely in the recursive continuation losing the tools flag after the first hop.

**Why:** Real user requests often need 2+ tool calls per turn (log a field, then act on it). A single-hop tool loop silently caps functionality with no error until the empty-response path triggers.

**How to apply:** When adding/debugging any agentic tool loop, verify continuation calls propagate `tools` (and any other capability flags) across multiple hops, not just the first one. Cap hops (e.g. 6) to avoid runaway loops instead of disabling tools outright. Reproduce multi-tool-call bugs with the exact two-turn user script (vague ask → detailed follow-up) since the bug only appears when the model's plan naturally requires 2+ tool calls in one turn.
