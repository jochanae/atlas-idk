---
name: Repository Runtime Phase 2
description: Runtime verification architecture — POST /run route, install dir fix, Vite detection, WsDevState extension
---

## Route

`POST /api/devserver/workspace/:projectId/run`
- Auth via `requireAuth` (already applied to all devserver routes)
- Ownership check via `assertProjectOwner`
- Body: `{ targetId?: string; env?: Record<string, string> }`
- Accepts immediately with `{ status: "installing", targetId }`, runs async

## Key architecture decisions

**Classify-on-run**: the route re-classifies the repo on every `/run` call (no cached report). This is fast (local-complete ~36ms) and ensures stale reports don't drive incorrect starts.

**Install directory for monorepos**: for sub-directory targets (workDir ≠ workspaceDir), install must run at the workspace root (`installDir = workspaceDir`), not in the target's subdirectory. The target's subdirectory won't have a lockfile, so `detectPackageManager` would fall back to npm and fail with catalog syntax errors.

**Use `target.installCommand` directly**: the classifier already encodes the right package manager ("pnpm install", "npm install"). Don't re-detect — use it as a shell string with `shell: true`.

**Vite detection**: `target.framework` is a human-readable string like "Vite + React", not the raw string "vite". Use `/vite/i.test(target.framework)` for case-insensitive match. When Vite is detected, append `-- --host 0.0.0.0 --port <allocated>` to the startCommand.

**`WsDevState` extension**: `verifiedTargetId: string | null` and `verifiedAt: Date | null` added. These are set in `markVerified()` and persisted to the tmp JSON alongside port+pid.

**Status endpoint**: exposes `verifiedTargetId` and `verifiedAt` in the GET response. Re-adoption on server restart restores `verifiedTargetId` from the persist file.

**`markVerified()` helper**: inner function in the async IIFE, called from both the stdout data handler and the port-fallback probe. Clears the fallback timer, sets port/status/startedAt/verifiedTargetId/verifiedAt, saves to persist file, logs.

## Error case behavior

If the process exits non-zero (e.g. missing env vars), `status = "error"` and `errorMsg` contains the reason. The user must pass `{ env: { "VAR": "value" } }` in the body and relaunch.

## Acceptance evidence

Project 19 (atlas-idk monorepo), target `atlas-frontend`:
- Without `BASE_PATH`: `status=error`, correctly surfaces "Dev server exited (code 1)"
- With `{ env: { BASE_PATH: "/" } }`: `status=running, port=5200, verifiedTargetId=atlas-frontend, verifiedAt=2026-07-20T16:53:35.749Z`

Acceptance artifact: `.local/acceptance-artifacts/run-verified-19.json`

## Phase 3 scope (not yet built)

Phase 3 = UX layer:
- Plain-language summary in chat (showing what can run, what's missing)
- Env var collection UI (secure input, never echoed)
- "Configure and run" flow in RuntimePanel or chat
- Preview pane auto-opens on `verified-runnable`
- URL reference path (use existing deployed URL instead of running locally)
