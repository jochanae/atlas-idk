# Handoff: Timeline must reflect ALL run activity, not just file edits

**Date:** 2026-07-06
**Repo:** `Axiom-Atlas` (Cloud Run backend)
**Lane:** Backend only. Frontend renderer is already correct — do NOT touch `artifacts/atlas-frontend/`.
**Supersedes / extends:** `docs/handoffs/2026-07-05-timeline-steps-regression-backend.md`

---

## The core principle (read this first)

A "run" is not just a code edit. A run is **any bounded unit of Atlas activity tied to a message**: a conversation turn, a thinking pass, a file read, a search, an inspection, a decision catch, a commit, a build, a push. **Every one of those must write rows into `execution_run_steps` scoped to that run's `run_id` and the originating `message_id`.**

If Atlas did something — thought, read, searched, decided, edited, summarized — the Timeline must show it. If the Timeline is empty, the backend didn't log it. There is no valid state where "Atlas worked but the Timeline is blank."

This is not just about BUILD runs. It applies to THINK, DECIDE, and BUILD equally.

---

## Symptom

- Conversations produce no Timeline entries at all (no run row, or run row with zero steps).
- BUILD runs show only a bare `EDITED <path>` with no THOUGHT / PROMPT / FILE_READ context.
- Users can't tell what Atlas actually did during a turn — reads, searches, and reasoning are invisible.

---

## Required verbs (extend enum if missing)

Every one of these must be a valid `execution_run_steps.verb` and must be written whenever the corresponding activity happens:

| Verb          | When to write                                                                 | `content` / `target`                          |
| ------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| `PROMPT`      | Run start — snapshot of the user instruction                                  | `content` = user prompt text                  |
| `THOUGHT`     | Model reasoning phase completes                                               | `content` = reasoning text, `detail` = `<s>s` |
| `FILE_READ`   | Every file the agent opens/reads during the run                               | `target` = path                               |
| `SEARCH`      | Every codebase/web search issued                                              | `content` = query, `detail` = source          |
| `INSPECT`     | Structured lookups (schema, symbol, API surface)                              | `target` = what was inspected                 |
| `FILE_EDIT`   | Every file written                                                            | `target` = path, `content` = new body/diff    |
| `LINE_PATCH`  | Line-range edits                                                              | `target` = path, `content` = patch            |
| `FILE_DELETE` | Every file removed                                                            | `target` = path                               |
| `DECISION`    | Decision Catch fires OR Commit lands OR Proceed Anyway                        | `content` = entry id + verdict                |
| `SUMMARY`     | Run end — one-line recap                                                      | `content` = recap                             |

Frontend `TIMELINE_VERBS` already includes THOUGHT, FILE_READ, SEARCH, INSPECT, FILE_EDIT, LINE_PATCH, FILE_DELETE, SUMMARY. Add `PROMPT` and `DECISION` to the frontend list once the backend emits them (I'll handle that when you confirm the verbs are live).

---

## Applies to every run type

- **THINK / conversation turn** — must still create an `execution_runs` row with `PROMPT`, `THOUGHT`, any `FILE_READ`/`SEARCH` the agent used to answer, and `SUMMARY`. A pure conversation is a valid run with zero FILE_EDIT rows — that is fine, but it must not be zero rows total.
- **DECIDE / Decision Catch** — must write `DECISION` rows referencing the ledger entry id.
- **BUILD / codegen** — must write PROMPT + THOUGHT + FILE_READ (for context files) + FILE_EDIT per file + SUMMARY.

The `execution_runs` row itself must be created at turn start, not only when a file gets written. Otherwise conversation-only turns leave no trace.

---

## Verification query

```sql
select r.id, r.created_at, r.project_id,
       array_agg(s.verb order by s.created_at) as verbs
from execution_runs r
left join execution_run_steps s on s.run_id = r.id
where r.project_id = <PROJECT_ID>
order by r.created_at desc
limit 10;
```

Expected: every recent run has a non-empty `verbs` array. A pure chat turn should show at least `{PROMPT, THOUGHT, SUMMARY}`. A build turn should also include `FILE_READ` and `FILE_EDIT`.

---

## Definition of done

1. Every user turn creates an `execution_runs` row tied to the assistant `message_id`, regardless of mode.
2. Every meaningful agent activity (think, read, search, inspect, edit, decide, summarize) writes a `run_step` row on that run.
3. Verb enum contains all verbs in the table above; enum-error inserts do not silently drop.
4. Verification query above returns non-empty `verbs` for every recent run.
5. In the workspace UI, opening any run — conversation-only or build — shows a populated Timeline with the actual activity, without any frontend change.
