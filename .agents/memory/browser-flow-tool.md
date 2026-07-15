---
name: Browser Flow Tool Architecture
description: run_browser_flow agent tool — Playwright engine design, auth, scope, evidence persistence
---

## Rule
`run_browser_flow` is the ONLY valid path to USER_FLOW_VERIFIED. Atlas cannot self-assert this state. The execution_run_step with step_purpose=BROWSER_FLOW and status='ok' is the sole evidence token.

**Why:** Prevents model hallucination of browser verification ("I navigated to the page and confirmed...").

**How to apply:** The advance_execution_state tool's USER_FLOW_VERIFIED case enforces this — it rejects if no BROWSER_FLOW step exists, if status≠'ok', if failedProfiles in metadata is non-empty, or if the browser step predates the latest PATCH/BUILD/RUNTIME step.

## Chromium path resolution
`findChromiumPath()` in browserRunner.ts: env PLAYWRIGHT_CHROMIUM_PATH → `which chromium` → hardcoded Nix store path `/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium`. Smoke tested — returns 625KB screenshot in ~4.5s.

## Session auth design
- `browser_test_sessions` table: token UUID, userId, projectId, executionRunId, scope, allowedMutations JSONB, expiresAt (5 min)
- `/api/auth/browser-test-session?token=<uuid>` creates a `user_sessions` entry with 10-min TTL and sets `atlas-session` cookie with `secure: false, sameSite: lax` (HTTP localhost compatible)
- Regular `createSessionCookie` uses `secure: true, sameSite: none` — intentionally different; browser tests run over HTTP at localhost:80

## READ_ONLY enforcement
Enforced at Playwright `page.route()` layer: cross-origin requests aborted, POST/PUT/PATCH/DELETE blocked unless in `allowedMutations`. Additionally `x-browser-test-token` header injected on every request for server-side audit.

## Destructive target guard
`isDestructiveTarget()` checks click targets for destructive labels (delete, remove account, deploy now, billing) and blocks them in READ_ONLY scope.

## Evidence storage
GCS under `browser-runs/{userId}/{projectId}/{runId}/{stepId}/`. BUCKET from `DEFAULT_OBJECT_STORAGE_BUCKET_ID` env. Failure to upload is non-fatal — metadata (sha256, key) is preserved regardless.

## Multi-viewport gate
All viewports in the `viewports` array must pass. `allProfilesPassed = failed profiles === 0`. `metadata.failedProfiles[]` written to execution_run_step. The USER_FLOW_VERIFIED evidence validator checks this field.

## Ordering invariant (v1.5)
The BROWSER_FLOW step's `created_at` must be newer than the latest PATCH/BUILD/RUNTIME step. Enforced in executionStateMachine.ts USER_FLOW_VERIFIED case via `latestStepWithPurpose()`.
