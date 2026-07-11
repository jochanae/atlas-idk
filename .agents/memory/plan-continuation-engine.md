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
