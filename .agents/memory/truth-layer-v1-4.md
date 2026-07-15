---
name: Truth-Layer v1.4 consolidation
description: v0.1.1 wiring repairs — execution_runs is the single truth table; contract_runs deprecated; evidence validation and mode routing rules
---

## The rule
`execution_runs` owns all truth-layer state. `contract_runs` is deprecated — no new writes.

**Why:** The v0.1 audit found a parallel truth system: contract_runs held state separate from execution_runs, with an unsafe lateral join that returned the wrong contract when a conversation had multiple runs. The badge never rendered because the join produced NULL for most rows.

## New columns on execution_runs (added via ensureColumns)
- `run_mode` text DEFAULT 'EXPLORE' — epistemic posture (EXPLORE | INVESTIGATE | EXECUTE)
- `execution_state` text — current ExecutionState
- `verification_contract` jsonb — VerificationContract with completedSteps[] and outcome: RunOutcome
- `state_history` jsonb DEFAULT '[]' — array of StateTransitionEvidence records
- `open_questions` jsonb DEFAULT '[]' — array of OpenQuestion records
- `mode_history` jsonb DEFAULT '[]' — array of ModeHistoryEntry records

## New column on execution_run_steps
- `step_purpose` text — derived server-side by derivePurposeFromVerb(); NULL for legacy rows

## Mode routing (EXPLORE | INVESTIGATE | EXECUTE)
- BUILD intent → EXECUTE; all other intents → EXPLORE initially
- DECIDE turns may lazily escalate to INVESTIGATE via recordModeEscalation() when investigation tools fire
- INVESTIGATE mode cap: state machine stops at CAUSE_CONFIRMED (no mutations)
- runMode is set on AgentToolContext; SCHEMA_CTX satisfies it with null/EXPLORE

## Evidence validation (in advanceRunExecutionState)
Purpose-based, not verb-regex. State-specific rules:
- CAUSE_CONFIRMED: at least one CODE_SEARCH or FILE_INSPECTION step
- CHANGE_APPLIED: PATCH step with status='ok'
- BUILD_VERIFIED: BUILD/TYPECHECK step with status='ok', created_at > latest PATCH step
- RUNTIME_VERIFIED: STARTUP/HEALTH_CHECK/DEPLOY step with status='ok', created_at > latest BUILD step
- USER_FLOW_VERIFIED: BROWSER_FLOW step with status='ok'
- INVESTIGATING, CHANGE_PROPOSED: no evidence required
- BLOCKED, FAILED: no evidence required

execution_run_steps status values are 'ok' / 'fail' / 'warn' — NOT 'succeeded'.

## Outcome model
RunOutcome replaces allowedOutcome: string.
- code: NOT_STARTED | INVESTIGATING | CAUSE_CONFIRMED | CHANGE_APPLIED | BUILD_VERIFIED | RUNTIME_VERIFIED | USER_FLOW_VERIFIED | BLOCKED | FAILED
- outcome.complete = true only when all requiredSteps are in completedSteps
- Frontend OutcomeBadge reads outcome.code from verificationContract.outcome
- ExecutionStateUpdatePayload carries outcome: RunOutcome (no longer allowedOutcome)

## runId ownership
advance_execution_state tool schema has NO runId field. The tool reads ctx.activeExecutionRunId (server-provided from AgentToolContext). The model cannot impersonate a run.

## How to apply
Any new feature touching the state machine or evidence trail must:
1. Use execution_runs columns, not contract_runs
2. Validate evidenceRefs via execution_run_steps (ownership + purpose + ordering)
3. Derive RunOutcome via deriveRunOutcome() — never accept outcome from model prose
4. Set activeExecutionRunId + runMode on any AgentToolContext construction
