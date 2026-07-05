# Handoff: Restore BUILD run timeline steps (THOUGHT / PROMPT / FILE_EDIT)

**Date:** 2026-07-05
**Repo:** `Axiom-Atlas` (Cloud Run backend)
**Lane:** Backend only. Frontend renderer is already correct — do NOT touch `artifacts/atlas-frontend/`.

---

## Symptom (user-visible)

Workspace → Changes tab shows BUILD run cards but:
- **Timeline** sub-tab is empty ("Workspace is clean — no local changes.").
- **Changes** sub-tab shows at most one bare `EDITED src/App.jsx` line, no diff, no counts.

Previously (see screenshots in chat 2026-07-05) the same panel showed:
- `THOUGHT · 52s` (expandable reasoning card)
- `PROMPT` card with the user's build instruction
- `MODIFIED index.css  +310`
- `MODIFIED App.tsx  +222`

That behavior has regressed. The frontend still reads and renders those rows — they simply aren't being written anymore.

---

## Where the frontend reads

`artifacts/atlas-frontend/src/components/workspace/ViewChangesPanel.tsx`
- `useProjectRuns(projectId)` → each run has `steps: ApiRunStep[]`
- Timeline lens filters on `TIMELINE_VERBS = ["THOUGHT", "FILE_READ", "SEARCH", "INSPECT", "FILE_EDIT", "LINE_PATCH", "FILE_DELETE", "SUMMARY"]` (see `ViewChangesPanel.tsx:351`).
- Changes lens filters on `verb in ("FILE_EDIT", "LINE_PATCH", "FILE_DELETE")` and derives the file path from `step.target` (line 606).
- Expandable diff needs `step.content` populated (line 617).

If `execution_run_steps` has no rows of these verbs for a run, both lenses render empty. That is exactly what the user is seeing.

---

## What to check in the backend

1. In the BUILD/codegen pipeline (whatever route the "Build" button hits — likely `POST /api/projects/:id/build` or the atlas-codegen entrypoint), locate the code that creates the `execution_runs` row and any `execution_run_steps` inserts.

2. Verify these inserts still happen per run, in order:
   - `verb='THOUGHT'`, `detail='<seconds>s'`, `content=<reasoning text>` — one row, written when the model finishes its reasoning phase.
   - `verb='PROMPT'`, `content=<user prompt snapshot>` — one row at run start. *(If `PROMPT` isn't a supported verb, add it to the enum — the frontend already renders it via the generic timeline item.)*
   - `verb='FILE_EDIT'`, `target=<relative path>`, `content=<full new file body or diff>` — one row **per file written**.
   - Optional: `verb='SUMMARY'`, `content=<one-line recap>` at run end.

3. Confirm they are being committed (not rolled back on a downstream error) and that `run_id` on each step matches the `execution_runs.id` the frontend is fetching.

---

## Verification query

Against the backend Postgres (Supabase project `osuasytymbzurjvklhde`):

```sql
select verb, count(*)
from execution_run_steps
where run_id in (
  select id from execution_runs
  where project_id = <PROJECT_ID>
  order by created_at desc
  limit 5
)
group by verb
order by verb;
```

Expected: rows for `THOUGHT`, `PROMPT`, `FILE_EDIT`. Currently: only `BUILD`-level summary rows (or nothing).

---

## Likely root cause candidates

- A refactor of the codegen pipeline replaced granular `run_step` inserts with a single aggregate write.
- Step inserts were moved behind a feature flag that is currently off in prod.
- The verb enum lost `THOUGHT` / `PROMPT` and inserts are silently failing (check server logs for `invalid input value for enum`).
- Steps are being written to the wrong `run_id` (e.g., a nested sub-run) so the parent run the frontend queries appears empty.

---

## Definition of done

After the backend fix, hitting Build in the workspace and opening the run in Changes must show, without any frontend change:
- Timeline lens: at least one `Thought` card + one `Read`/`Edit` step per file touched.
- Changes lens: one `MODIFIED <path>  +N` row per file, expandable to reveal diff content.

No schema migration should be needed if the verbs already exist. If `PROMPT` isn't in the enum, add it in the same migration that restores the inserts.
