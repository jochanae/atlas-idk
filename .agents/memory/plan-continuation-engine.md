---
name: Plan Continuation Engine
description: Orchestration rule that auto-executes the first safe read-only step after Atlas produces a roadmap in a DECIDE turn
---

## The pattern
After a DECIDE turn that produces a roadmap, the model may emit a `PLAN_CONTINUATION_START...PLAN_CONTINUATION_END` block containing a `ContinuationEnvelope`. The orchestrator validates it against `CONTINUATION_ALLOWLIST` and, if approved, recursively calls `streamClaude` with the continuation before `finishStream` runs.

## Envelope shape
```typescript
{ gate: "execution", action: string, risk: "read_only", tools_required: string[], reason: string, requires_user_input: false }
```

## Allowlist rules (server-side — not model judgment)
- `risk` must be `"read_only"`
- `requires_user_input` must be `false`
- `action` must not match: `edit|write|create|delete|remove|modify|update|change|install|deploy|push|build|migrate|alter|drop|truncate|patch|overwrite|rename|move`
- `tools_required` must not include: file_edit, line_patch, github_push, build_project, deploy, install_package, update_dna, delete_file, write_file, create_file, run_sql, exec

## Recursive pattern (same as tool hops)
First pass: parses envelope, validates, strips block from fullText, emits event:continuation + writeStep, builds continuation messages, calls `streamClaude(continuationMessages, { ...options, continuationHopCount: 1, continuationPrefix: cleanedFirstPass })`, returns WITHOUT calling finishStream.
Second pass: `finishStream` called with `continuationPrefix + "\n\n---\n\n" + fullText` — one combined persisted message.

## Hard constraints
- MAX_CONTINUATION_HOPS = 1 — only one auto-continuation per user turn
- Only fires when `continuationHopCount ?? 0 < 1` AND `!options.continuationPrefix`
- Safety strip in finishStream removes unconsumed blocks
- Second-pass findings contract: inspected files, evidence, classification (production-ready | extendable | prototype | stub | dead-code), unresolved questions, next gate

**Why:** The user explicitly rejected prompt-only continuations as probabilistic. The orchestration rule makes continuation deterministic after the signal appears. The allowlist ensures model misjudgment of gate type cannot execute state-modifying actions.

## Regex fix — snake_case action blocking
The `blocked_action_re` must NOT use a trailing `\b`. Snake_case action
names like `edit_analytics_component` have no word boundary between the
verb and `_analytics` (both are `\w`). Leading `\b` only is sufficient.

Wrong:  `/\b(edit|write|...)\b/i`  — misses `edit_analytics_component`
Correct: `/\b(edit|write|...)/i`   — correctly blocks it

## Live verification evidence (2026-07-11)
Acceptance test 5/5 passed. T4 live SSE: done.content showed
`"intoiq — here's the roadmap, followed by the investigation findings.\n\n---\n\n## NOW / NEXT / LATER:"`.
The `---` separator is the two-pass combiner signal. Combined message
was 4367 chars with specific file references. DB row: `assistant|4367|f`.

## Model behavior note
The continuation only fires when the model defers investigation to a
second pass rather than answering from injected DNA/Ledger context.
When the project DNA is rich enough to answer inline, the model does so
without emitting PLAN_CONTINUATION (single-pass, also valid). The engine
is an optimization for investigation-heavy DECIDE turns, not a universal
wrapper around all tool calls.
