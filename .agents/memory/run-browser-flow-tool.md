---
name: run_browser_flow tool architecture
description: Auth injection pattern, startPath navigation requirement, and the Playwright-in-server-process event-loop deadlock when reaching the SPA at localhost:80
---

## Auth cookie injection

HTTP navigation to `/api/auth/browser-test-session` fails when Playwright is spawned from within the API server process — the request is immediately aborted. The correct approach is direct DB insertion + `context.addCookies()`:

1. `randomBytes(32).toString("hex")` → cookieToken
2. `db.insert(userSessionsTable).values({ userId, token: cookieToken, expiresAt })` — 10 min TTL
3. `context.addCookies([{ name: "atlas-session", value: cookieToken, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax", expires: Math.floor(...) }])`

**Why:** The API server at port 8080 receives the navigation request but then aborts it. The nginx proxy at localhost:80 is involved but the issue is reproducible regardless. Skipping HTTP entirely avoids the problem.

## startPath auto-navigation

`startPath` is NOT automatically navigated — it is only a security guard (origin check). Without an explicit `page.goto(baseUrl + startPath)` before `executeSteps`, the browser starts on `about:blank` and all assertions fail immediately.

Fix is already in browserRunner.ts: navigate with `waitUntil: "load"` + 2500ms React hydration wait before calling `executeSteps`.

## Playwright-in-server-process deadlock (open issue)

Even with startPath navigation added, `page.goto(localhost:80/workspace)` times out from within the server process. Root cause: the Atlas chat handler is a long-running request (~20s). While Node.js is processing it, the Playwright browser tries to load the React SPA via the nginx proxy (localhost:80 → Vite dev server at a separate port). This adds a second concurrent network chain through the same event loop, and the SPA hydration never settles.

**Result:** `finalUrl = "about:blank"` on every browser profile.

**Fix path (not yet implemented):** Either:
- Spawn Playwright in a worker thread (`worker_threads`) so the main event loop stays unblocked during navigation
- Target the Vite dev server port directly (bypassing nginx) — get port from `$PORT` env of the `atlas-frontend` workflow

## SHARED_WORKSPACE_TOOL_NAMES

`run_browser_flow` must be in `SHARED_WORKSPACE_TOOL_NAMES` in `artifacts/api-server/src/lib/agent-tools/anthropic-adapter.ts`. That array is what nexus.ts passes to the Anthropic SDK as the actual tools list. Being registered in `buildAgentTools()` alone is NOT sufficient — the tool is invisible to the model otherwise.

## Capability denial prevention

Strong model priors will make the model say "I can't launch a browser" even when the tool is visible. An unconditional system prompt block (pattern established in nexus.ts around line 2563, same as the generate_deliverable fix) is required:

```
--- BROWSER VERIFICATION CAPABILITY ---
You have run_browser_flow. Use it when asked to verify, validate, or test the running app.
Do NOT say you cannot launch a browser — you can.
```

Also list it in the "WHAT YOU HAVE ACCESS TO" section to distinguish it from unauthenticated `BROWSER_VISIT`.
