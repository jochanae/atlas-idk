---
name: Truth-Layer Wiring v0.1.1
description: Fixes and architectural decisions from the live browser-path acceptance test for the execution state machine.
---

## Root cause that broke ALL state machine transitions

`execution_runs` has no `user_id` column. `advanceRunExecutionState` tried to SELECT it directly, throwing a PostgreSQL error on every call — model-driven AND server-driven. Fixed by JOINing on `projects.user_id`:

```sql
SELECT p.user_id, er.run_mode, er.execution_state, ...
FROM execution_runs er
JOIN projects p ON p.id = er.project_id
WHERE er.id = ${runId}
```

**Why:** The column was assumed during schema design but never added. ensureColumns verified the other v1.4 columns but not user_id (which was derived implicitly from the pre-insert flow).

## LINE_PATCH text protocol and tool calls are mutually exclusive

Anthropic streaming turns are TEXT-OR-TOOLS. When the model emits LINE_PATCH via the text-stream protocol (LINE_PATCH_START…END), it CANNOT also call `advance_execution_state` as a tool call in the same turn. The model reliably produces LINE_PATCH text output, so model-driven state advancement via `advance_execution_state` is structurally impossible when the model uses the text-stream patch protocol.

**Fix:** Server-driven auto-advance block runs in nexus.ts BEFORE the `done` SSE event. It inspects `runActions` (in-memory) for FILE_READ + PATCH verbs and advances the state machine with `isServerDriven: true` (bypasses evidence-ref DB validation — server observed the evidence directly).

**Why `isServerDriven` bypasses validation:** Evidence ref validation was designed to prevent the model from asserting states without proof. For server-driven advances, the server is the trusted authority — validation is redundant.

## State machine topology: CAUSE_CONFIRMED → CHANGE_PROPOSED → CHANGE_APPLIED

The valid transition chain is:
```
UNINVESTIGATED → INVESTIGATING → CAUSE_CONFIRMED → CHANGE_PROPOSED → CHANGE_APPLIED → BUILD_VERIFIED → RUNTIME_VERIFIED
```

Cannot skip CHANGE_PROPOSED. The auto-advance chain must include all intermediate states.

## Fix 2: PATCH steps not persisted in canonical rewrite

`persistNexusExecutionRun` deletes all live steps and re-inserts only PROMPT/THOUGHT/FILE_READ/SUMMARY. "Patching"/"Writing"/"Typechecking" steps were silently lost. Fixed by adding a BUILD_EVIDENCE_VERBS loop that re-inserts these verbs from `runActions`.

## Fix 3: derivePurposeFromVerb missing verbs

"Patching"/"Writing"/"Written" → PATCH and "Typechecking"/"Typecheck" → TYPECHECK were not in the switch. Both added.

## Proven acceptance criteria (live browser path)

1. WhisperGate intent captured as BUILD ✓
2. execution_run_steps with step_purpose=FILE_INSPECTION + PATCH ✓
3. State machine advances through 4 transitions (UNINVESTIGATED→INVESTIGATING→CAUSE_CONFIRMED→CHANGE_PROPOSED→CHANGE_APPLIED) ✓
4. RunOutcome in done SSE event (executionState + executionOutcome fields) ✓
5. Outcome persists after simulated page-refresh (re-query DB) ✓
6. AssistantBubble outcome footer renders in real browser — Playwright confirmed "Patch applied — build verification pending" with amber styling ✓
