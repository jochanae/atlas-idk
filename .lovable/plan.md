# Pass B — Workspace Changes, Run-Aware

Frontend-only. Reuses the existing Changes surface (`leftTab === "diff"`). No new page, no new tab key, no backend.

## Surface

```text
Workspace top nav:  CHANGES · BLUEPRINTS · OUTPUTS · CONSOLE
                     │
                     ▼
ViewChangesPanel  (leftTab === "diff")
├── [run pill]  "Viewing run: <title>   ✕ clear"     ← only when ?runId= present
├── Toggle:    ( Timeline | Changes )                 ← new
├── Timeline lens  → SessionTimeline (filtered when runId tags match)
├── Changes lens   → per-file rows: path · summary · [View diff] [Open file]
└── GitHub block   → Workspace-updated / Pushed-to-main (unchanged)
```

## Deep-link contract

- URL: `/project/:projectId?leftTab=diff&runId=<id>`
- `leftTab=diff` reuses the existing internal key — no `tab=changes` alias.
- On mount, if `leftTab=diff` is present in `location.search`, set `leftTab` to `"diff"` (piggyback on the existing `sessionStorage` restore path or read `URLSearchParams` alongside it).
- If `runId` is present but no `TimelineMessage.runId` matches: show the run pill AND a hint above the unfiltered list: **"No entries tagged for this run yet."** Do not pretend the view is filtered.

## Files

1. **`artifacts/atlas-frontend/src/components/workspace/ViewChangesPanel.tsx`**
   - Add prop `runId?: string | null`.
   - Add local `lens: "timeline" | "changes"` (default `"timeline"`).
   - Replace the two collapsible sections with: run pill (if `runId`), segmented `Timeline | Changes` toggle, body per lens, then existing GitHub block.
   - Timeline lens = existing `SessionTimeline`, `messages` filtered when at least one carries the runId; otherwise unfiltered + hint.
   - Changes lens = minimal per-file list built from `messages.fileEdits` / `linePatches`, same filter rule. Reuse the diff/open handlers already used inside `SessionTimeline`; extract or inline a small row renderer.

2. **`artifacts/atlas-frontend/src/pages/workspace.tsx`**
   - Read `runId` and `leftTab` from `URLSearchParams` near the existing `leftTab` initializer (line ~4127).
   - If `leftTab=diff` in URL, initialize `leftTab` to `"diff"`.
   - Pass `runId={runId}` into `<ViewChangesPanel />` (line ~7810).

3. **`artifacts/atlas-frontend/src/components/home/ActiveRuns.tsx`**
   - Change Details link (line ~1341) from `/runs/${run.id}` to `/project/${run.projectId}?leftTab=diff&runId=${run.id}`.
   - No other Run Card changes; Pass A stays intact.

## Out of scope

- Blueprints, Outputs, Console tabs.
- Chat rendering, RunCard header/receipt.
- Backend message schema (no runId tagging pass).
- Saved Runs / bookmark behavior.

## Validation

- Build passes.
- From a Run Card → tap **Details** → lands on workspace Changes surface, run pill shown, Timeline lens by default, toggle switches to Changes lens.
- Tap ✕ clear → same panel, unfiltered, no pill.
- Open CHANGES from top nav directly (no `runId`) → same panel, no pill, toggle works.
- Push/rollback flow still renders and functions.

## Risk

Low. One new prop, one local state, one URL param read, one href change. Streaming/retry/apply/PR paths untouched.
