# Handoff — Run Receipts Slice 1 (Backend)
**Date:** 2026-07-16
**Owner:** Cursor / Replit backend
**Depends on:** Lovable commit — `nexus.ts` FILE_EDIT / LINE_PATCH now persist `content` + `before_content`.

---

## Context

The frontend run card, `/runs/:id` detail page, Timeline, and Changes tab all read from `execution_runs` + `execution_run_steps` via `GET /api/projects/:id/runs`. Until this week those step rows were being written with `content: null` / `before_content: null` for every file mutation, so the Changes tab rendered empty even when a run clearly touched files.

Lovable already shipped the writer fix (see `artifacts/api-server/src/routes/nexus.ts`):

- `RunAction` carries `content` / `beforeContent`
- `appendLiveStepAsync` writes both columns
- `FILE_EDIT` auto-apply captures prior file contents (200KB cap) before overwrite
- `LINE_PATCH` writes `content = patch.replace`, `beforeContent = patch.find`
- Live SSE `step` payloads include `content` + `beforeContent`

This handoff covers the parts Lovable did **not** do.

---

## What you're building

### 1. FILE_DELETE step evidence (backend)
File: `artifacts/api-server/src/routes/nexus.ts`

When Atlas deletes a file via the FILE_DELETE action, we currently emit a step with `content: null, beforeContent: null`. Mirror the FILE_EDIT pattern:

- Before `fs.unlink` (or equivalent), read the file (respect the same 200KB cap used by FILE_EDIT).
- Write the step with `beforeContent = priorBody`, `content = null`, `status = "applied"`, and `verb = "FILE_DELETE"`.
- On read failure (missing file, oversize), still emit the step but set `beforeContent = null` and put the reason in `detail`.

Acceptance: after a delete run, the Changes tab shows a red-only diff for the removed file with the prior body visible.

### 2. Atlas-owned GitHub pushes → run receipts (backend)
Today two independent systems record GitHub activity:

- **Run steps** — anything Atlas does inside a run
- **Quiet Updates / GitHub activity feed** — a poll of the repo's commit stream

When Atlas pushes via the Git Tree API as part of a run, the push shows up in Quiet Updates but never as a step on the originating run. Result: the run card says "succeeded, N files" but has no push receipt, and Quiet Updates shows a duplicate-looking entry with no link back to the run.

Do:

1. In the GitHub push helper used by nexus (search for `git/trees` / `createCommit` in `artifacts/api-server/src/services/` and `src/lib/`), after a successful push inside an active run, call `appendLiveStepAsync` with:
   - `verb: "GITHUB_PUSH"`
   - `target: "<owner>/<repo>@<shortSha>"`
   - `status: "applied"`
   - `detail: commit message (first line)`
   - `artifactUrl: html_url of the commit`
   - `content: null`, `beforeContent: null`
2. Stamp the commit with a trailer or metadata we can recognize later — simplest: append `\n\nAtlas-Run: <runId>` to the commit message body.
3. In the Quiet Updates ingester (search `quiet_updates` / GitHub activity poller), skip commits whose message contains an `Atlas-Run:` trailer. Those are already receipts on the run; don't double-report them.

Acceptance:
- Running a BUILD that ends in a push produces a `GITHUB_PUSH` step visible on the run detail page and in Timeline.
- Quiet Updates no longer lists that same commit.
- Human commits (no trailer) still appear in Quiet Updates as before.

### 3. Backfill guardrail (optional, low priority)
Existing rows in `execution_run_steps` where `verb IN ('FILE_EDIT','LINE_PATCH','FILE_DELETE')` and `content IS NULL AND before_content IS NULL` are permanently empty — we don't have the historical file bodies. No migration; just be aware the Changes tab will be blank for pre-fix runs. If you want, mark them in the UI via a `detail = 'legacy-no-diff'` backfill, but not required.

---

## Contracts / schema

No new columns. `execution_run_steps.content`, `before_content`, `artifact_url` already exist. No OpenAPI change — `ApiRunStep` in `lib/api-client-react` already surfaces these fields.

---

## Verification

1. `tsgo` clean in `artifacts/api-server`.
2. Trigger a BUILD run that edits one file, patches another, deletes a third, and pushes to GitHub.
3. Hit `GET /api/projects/:projectId/runs?conversationId=<id>` and confirm each step row carries the expected `content` / `beforeContent` / `artifactUrl`.
4. In the frontend: run card shows step count, `/runs/:id` Changes tab renders three diffs (green, unified, red), Timeline row shows GITHUB_PUSH with commit link, Quiet Updates does not list that commit.

---

## Out of scope (Slice 2+)
- Live SSE for `GITHUB_PUSH` (Slice 2)
- Unifying the run card component between Lovable-style and current Atlas card (frontend, Slice 2)
- Diff rendering upgrades in `ViewChangesPanel` (already works; polish later)
