---
name: Closed-Loop Verification (Phase 3)
description: How Atlas verifies generated project workspaces (manifest/build/truncation/env/seed) before calling a build "done"
---

`artifacts/api-server/src/lib/closedLoopVerification.ts` runs 6 checks against a project workspace: manifest (do package.json script refs and relative imports resolve to real files), install+build/typecheck, truncation (unbalanced brackets / abrupt EOF), env var checklist (`process.env.X` scan), seed-data presence, and an overall pass/fail gate.

Exposed via `POST /api/fs/:projectId/verify`, and auto-invoked inside the agent loop's `finish` tool (`agent-tools/finish.ts`) whenever files were written that turn — `finish` returns `blocked: true` instead of ending the loop if verification fails.

**Why:** a real benchmark (generating a full app via Atlas's own chat pipeline) found Atlas would confidently say "done" on projects that couldn't actually build — a config file referenced but never generated, then (after that fix) a second unrelated bug where root/client package.json were split without npm workspaces so `react` was never installed. Manifest checking alone did not catch the second bug — only an actual install+build did.

**How to apply:** any future "does the generated app actually work" question should go through this verify endpoint/gate rather than manual file inspection. If extending generated-app scaffolding patterns, prefer npm workspaces over split/disconnected package.json files for client+server splits — it's what Atlas itself converged on when given a concrete failure report.
