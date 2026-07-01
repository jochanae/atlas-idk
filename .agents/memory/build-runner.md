---
name: Build Runner Architecture
description: Phase 1 build runner — SSE streaming builds, project_builds table, BuildPanel overlay, command palette integration
---

## What exists (Phase 1)

**Backend:** `artifacts/api-server/src/routes/builds.ts`
- `POST /api/builds` — SSE stream; body `{ command: "typecheck"|"build", projectId? }`
- Spawns `pnpm --filter @workspace/atlas-frontend run typecheck|build` from workspace root
- SSE events: `{type:"start"}`, `{type:"line", kind:"out"|"err", text}`, `{type:"done", status, exitCode, duration, errorSummary}`, `{type:"error"}`
- Persists to `project_builds` table on done
- `GET /api/builds/:id` and `GET /api/projects/:projectId/builds`
- Max 120s, FORCE_COLOR=0

**DB table:** `project_builds` — id (text PK), project_id, command, status, output, error_summary, started_at, finished_at
Created via ensureColumns() in api-server/src/index.ts with raw SQL (drizzle-kit can't create tables in non-TTY).

**Frontend:**
- `src/features/builds/types.ts` — BuildCommand, BuildStatus, BuildLine, BuildResult
- `src/features/builds/useBuildStream.ts` — fetch + ReadableStream SSE consumer; returns {status, lines, result, run, cancel, reset}
- `src/features/builds/BuildPanel.tsx` — fixed bottom-right overlay; portal to document.body; streaming terminal; error summary collapsible; two command tabs; "send to atlas →" disabled stub

**Wiring:**
- BuildPanel mounted in `UnifiedShell.tsx` alongside `<CommandPalette />`
- Triggered by `window.dispatchEvent(new CustomEvent("axiom:build-run", { detail: { command, projectId? } }))`
- Command palette "Run Typecheck" / "Run Build" in "Build" section (SECTION_ORDER updated)

## Phase 2 (not yet built)

- `send to atlas →` button in BuildPanel — pipe `errorSummary` into workspace chat as a `BUILD_RUN` message
- `workspace.tsx` BUILD_RUN action handler — detect `{type:"BUILD_RUN"}` in Atlas response stream and fire `axiom:build-run` event
- This avoids touching workspace.tsx (400KB+) until Phase 2 specifically targets it

**Why:** Atlas fires the event; the panel catches it globally. The workspace integration (Atlas detecting errors and proposing fixes) is Phase 2 and requires a careful line-range edit to workspace.tsx.

## Phase 2 (now complete)

**workspace.tsx — BUILD_RUN detection (lines ~7047-7063):**
- Pattern: `/BUILD_RUN\s*:?\s*(typecheck|build)/i` in `activityStream.content`
- Guard: `buildRunFiredRef` (useRef) resets on `activityStream.active === false`
- Fires: `axiom:build-run` CustomEvent with `{ command, projectId: Number(id) }`

**workspace.tsx — send-to-atlas listener (lines ~7065-7074):**
- Listens: `axiom:send-build-errors` event
- Calls: `doSend(detail.message, sessionId, messages)` — same as executeHomePlan
- Guards: sessionId must exist, chatPending must be false

**BuildPanel.tsx — "send to atlas →" button:**
- Active when: `done && result?.errorSummary && status !== "success"`
- Fires: `axiom:send-build-errors` with formatted markdown block
- Format: "I just ran `{command}` and got these errors. Please diagnose and fix them:\n```\n{errorSummary}\n```"
