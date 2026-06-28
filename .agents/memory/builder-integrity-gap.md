---
name: Builder file integrity gap
description: Atlas Builder can claim completion while omitting files it imported — export must be blocked until all imports resolve.
---

# Builder File Integrity Gap

## The failure (observed 2026-06-28, SmartGarden test)

Atlas said: "building all three pages, nav, and the Plant/WateringSchedule data model now."
Generated zip contained: Dashboard.jsx, Plants.jsx — **Settings.jsx missing**.
App.jsx had `import Settings from './pages/Settings'` and a `<Route path="/settings">` — app crashes on load.

## Root cause

The LOCAL_APPLY_SUCCESS audit is LLM-based and unreliable. The model confirmed
completion without verifying that every import target it wired into App.jsx or
route config actually existed as a file in the workspace.

## The governing rule

"If Atlas wired the import, it must have written the file. If it didn't write the
file, it must say so explicitly."

Export must be **blocked** (HTTP 422) if any relative import in a JS/JSX/TS/TSX
file cannot be resolved to an existing file in the workspace.

**Why:** An LLM audit prompt ("are all files present?") is probabilistic.
A filesystem import-trace is deterministic and cannot lie.

**How to apply:**
- `auditWorkspaceIntegrity(workspaceDir)` in fs.ts — walks all scannable files,
  extracts relative imports via regex, tries common extensions (.jsx/.tsx/.js/.ts
  + /index variants), returns list of unresolved paths.
- `GET /api/fs/:projectId/zip` blocks with 422 + `missing[]` payload if audit fails.
- `GET /api/fs/:projectId/audit` exposes the audit result standalone so Builder
  can surface it to Atlas after LOCAL_APPLY_SUCCESS.
- LOCAL_APPLY_SUCCESS message includes the actual unresolved imports from the
  audit endpoint, giving Atlas specific filenames to write rather than a generic
  "check for missing files" prompt.

## What was shipped

- `auditWorkspaceIntegrity()` added to fs.ts
- `/audit` endpoint added alongside `/zip`
- Zip export blocked on integrity failure with descriptive 422
- LOCAL_APPLY_SUCCESS in workspace.tsx calls `/audit` and embeds specific
  missing paths in the follow-up message to Atlas
