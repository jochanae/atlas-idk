# Handoff: Timeline must capture thinking milestones, not just execution

**Date:** 2026-07-09
**Repo:** `Axiom-Atlas` (Cloud Run backend)
**Lane:** Backend only.
**Extends:** `2026-07-06-timeline-full-activity-backend.md`, `2026-07-08-audit-surface-verbs-backend.md`

---

## The gap

A single Ask Atlas conversation (see user's Adult Child / Aging Parent thread) produced: an architectural question, a product-model decision, a full DB schema, a role permission matrix, five build milestones, and a 442-line initial migration. Timeline for that project is empty.

Reason: current step writers only fire on execution verbs (FILE_EDIT, THOUGHT tied to a run, etc.). Pure conversational reasoning that yields a durable outcome writes nothing. Result: three weeks from now, the user has to re-read the whole chat to reconstruct what was decided.

Timeline must record **conversational milestones** — the moments where Atlas moved the project forward — not just code execution.

---

## New verbs (extend `execution_run_steps.verb`)

Add to the enum / allowed values:

| Verb                    | Fires when                                                                                       | `content`                                 | `detail`                    |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------- | --------------------------- |
| `MILESTONE_REQUIREMENTS`| Atlas confirms a concrete requirement set (primary user, scope, non-goals) inside a chat turn    | 1-line summary + bulleted key facts       | source message id           |
| `MILESTONE_DECISION`    | Atlas commits to an architectural / product choice (ownership model, RLS strategy, stack pick)   | title + 1-line rationale                  | source message id           |
| `MILESTONE_DESIGN`      | Atlas emits a schema, data model, permission matrix, or flow diagram in prose                    | title + entity/section count              | source message id           |
| `MILESTONE_PLAN`        | Atlas emits an ordered plan (milestones, phases, build order)                                    | title + step count                        | source message id           |
| `ARTIFACT_GENERATED`    | Atlas produces a durable artifact inline (migration SQL, spec doc, config) even without codegen  | filename or title, line count             | mime / language             |

These are **conversation-scoped**, not execution-scoped. They must be emitted from Ask Atlas / Nexus / Tier1 chat paths, not only from the codegen runner.

Frontend already has `ARTIFACT_CREATED` wiring from the 2026-07-08 handoff; `ARTIFACT_GENERATED` is the conversation-side sibling (no file was written to disk — Atlas just produced content in the message). Reuse `ARTIFACT_CREATED` if it's cleaner; otherwise emit the new verb.

---

## Detection

Two viable paths — pick one:

1. **Post-turn classifier (preferred).** After each assistant turn completes, run a lightweight LLM pass over the message + prior turn with a fixed schema:
   ```json
   { "milestones": [
     { "verb": "MILESTONE_DECISION", "title": "...", "summary": "..." },
     { "verb": "ARTIFACT_GENERATED", "title": "001_initial_schema.sql", "detail": "sql", "lineCount": 442 }
   ] }
   ```
   Zero milestones is a valid result. Cheap model, structured output, one call per turn.

2. **Inline tool-calls.** Give the assistant an `emit_milestone` tool it can call during the turn. More accurate, more prompt-engineering surface area.

Either way: writes go to `execution_run_steps` on a run tied to the assistant `message_id`. If no run exists for pure-chat turns (per WhisperGate inversion), create a lightweight `execution_runs` row with `intent = 'DECIDE'` or `intent = 'CHAT'` and let it carry the milestone steps.

---

## Terminology

User request: stop calling conversation-side entries "runs" in UI copy. Backend keeps `execution_runs` as the table (fine, internal), but the serializer should expose a `kind` field:

- `kind: "execution"` — has FILE_EDIT / LINE_PATCH / FILE_DELETE steps
- `kind: "milestone"` — only MILESTONE_* / ARTIFACT_GENERATED / THOUGHT / SUMMARY steps

Compute server-side from the step verbs on the run. Frontend will label `execution` as "Run" and `milestone` as "Milestone" (or the specific milestone type).

---

## Acceptance

1. A pure Ask Atlas conversation that decides ownership + designs a schema + emits a migration produces at least: `MILESTONE_REQUIREMENTS`, `MILESTONE_DECISION`, `MILESTONE_DESIGN`, `MILESTONE_PLAN`, `ARTIFACT_GENERATED` steps on one or more runs tied to that project.
2. `GET /api/projects/:id/runs` returns those runs with `kind: "milestone"` and populated step arrays.
3. Existing code-execution runs continue to return `kind: "execution"` unchanged.
4. No milestone is emitted for small talk / clarifying questions — only when the turn advances the project.

---

## Non-goals

- Not deleting or reshaping the existing Changes tab.
- Not backfilling historical conversations.
- Not surfacing milestones outside the project workspace Timeline in this pass.
