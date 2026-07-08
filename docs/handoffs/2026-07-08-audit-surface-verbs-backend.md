# Handoff: Audit-Surface Verb Coverage (ARTIFACT_CREATED, ERROR, QUESTION_ASKED, run.intent)

**Repo:** `Axiom-Atlas` (backend, Cloud Run)
**Owner:** Cursor
**Priority:** P1 — unblocks the run audit surface. Frontend already renders these; today the DB never emits them, so they're invisible.

---

## Context

Frontend refactored the workspace audit surface (`ViewChangesPanel.tsx`) to a two-tab model — **Timeline** (narrative) and **Changes** (diffs). The Timeline now has a run-level header (prompt · status · timestamps · duration · summary) and a receipt-styled SUMMARY/ERROR block. Frontend can render four additional verb types the moment the backend starts emitting them:

- `ARTIFACT_CREATED`
- `ERROR`
- `QUESTION_ASKED`
- `run.intent` (WhisperGate classification stored on the run row)

No frontend work is needed once these are emitted — the render paths are already wired (see `TIMELINE_VERBS`, `EXPANDABLE_VERBS`, `ALWAYS_OPEN_VERBS`, `stepColor`, `stepLabel`, `StepIcon`, `RunHeader` in `artifacts/atlas-frontend/src/components/workspace/ViewChangesPanel.tsx`).

---

## Scope

1. `lib/db/src/schema/agent_runs.ts` — add nullable columns.
2. New migration under `lib/db/drizzle/`.
3. `artifacts/api-server/src/routes/generation.ts` (and any other run/step writers — check `nexus.ts`, `agent-loop.*`, and the Tier1 side of `services/tier1.ts`) — emit the new verbs and populate `run.intent`.
4. `artifacts/api-server/src/routes/generation.ts` GET runs endpoint — include `intent` and `prompt` in the serialized run.

No new endpoints. No breaking changes.

---

## Changes

### 1. Schema — `execution_runs`

Add columns (all nullable, backward-compatible):

```ts
// lib/db/src/schema/agent_runs.ts
intent: text("intent"),   // "CHAT" | "DECIDE" | "BUILD" | null
// prompt already exists as `prompt: text("prompt")` — confirm it's returned by /runs
```

Migration:

```sql
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS intent text;
```

No GRANT changes needed (existing table).

### 2. `execution_run_steps` — new verbs

No schema change; `verb` is already `text`. Just start writing these values:

**`ARTIFACT_CREATED`**
- `target`: file path or artifact filename (e.g. `handoffs/backend-spec.md`)
- `detail`: MIME type or short label (`markdown`, `pdf`, `pptx`, `docx`)
- `content`: optional short receipt (e.g. `"3 pages"`), NOT the full document body
- Add `artifact_url` — new nullable column on `execution_run_steps`:
  ```sql
  ALTER TABLE execution_run_steps ADD COLUMN IF NOT EXISTS artifact_url text;
  ```
  Frontend will render this as an "Open Output →" link. If Outputs are addressable via `/outputs/:id`, that's fine too — just put the URL in `artifact_url`.

**`ERROR`**
- `target`: optional — subsystem or file that failed
- `detail`: short error type (`timeout`, `rate_limit`, `provider_error`, `validation`)
- `content`: human-readable error message + relevant stack line(s). Keep under ~2 KB.
- Emitted whenever a run fails or a step throws recoverably. Multiple ERROR steps per run are allowed.

**`QUESTION_ASKED`**
- `target`: null
- `detail`: null
- `content`: the exact question Atlas asked the user (from DECIDE-mode responses or clarifying-question turns)
- Emitted once per question surfaced to the user. Distinguishes user-facing questions from internal `THOUGHT` steps.

### 3. `run.intent` population

Set on run creation in whichever route persists the `execution_run` row (Nexus BUILD path, generation route, agent loop). The value should mirror the WhisperGate classification for that turn:

```ts
const intent = whisperGateResult.intent; // "CHAT" | "DECIDE" | "BUILD"
await db.insert(executionRuns).values({ ..., intent });
```

Per the sibling `whispergate-safety-inversion` handoff, `CHAT` turns should NOT persist an `execution_run` row at all — so in practice `intent` will be `"DECIDE"` or `"BUILD"` when present.

### 4. Serializer — include new fields

In `artifacts/api-server/src/routes/generation.ts` `serializeGenerationRun` (and the parallel `/api/projects/:id/runs` serializer in whatever route feeds `useProjectRuns`), add:

```ts
{
  ...existing,
  prompt: run.prompt,      // if not already exposed
  intent: run.intent,      // new
}
```

And in the step serializer:

```ts
{
  ...existing,
  artifactUrl: step.artifactUrl, // new — matches frontend camelCase convention
}
```

---

## Acceptance

1. New `execution_runs.intent` column exists and is populated for every persisted run (DECIDE + BUILD only).
2. `GET /api/projects/:id/runs` returns `intent` and `prompt` on each run in the JSON payload.
3. A generation run that produces a Markdown handoff writes an `ARTIFACT_CREATED` step with `artifact_url` set. Frontend Timeline shows "Output · handoffs/backend-spec.md" with an openable link.
4. A run that fails writes at least one `ERROR` step; frontend renders it as the red receipt card.
5. A DECIDE turn that asks the user a clarifying question writes a `QUESTION_ASKED` step; frontend renders it in Timeline with the `HelpCircle` icon.
6. Existing runs without these columns/verbs continue to render normally (all fields are nullable / optional).

---

## Non-goals

- No changes to Changes-tab semantics — `FILE_EDIT` / `LINE_PATCH` / `FILE_DELETE` remain the only verbs Changes reads.
- Do NOT overload `FILE_EDIT` for generated docs (PDF/PPTX/handoffs). Those must emit `ARTIFACT_CREATED`, not `FILE_EDIT`. Changes must stay a code-diff surface.
- No new tables. No new endpoints. No auth changes.
- Do not backfill `intent` on historical runs.
