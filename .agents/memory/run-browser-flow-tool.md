---
name: run_browser_flow tool architecture
description: Auth injection pattern, startPath navigation requirement, and the popup-handler ordering bug that caused about:blank on every Atlas-invoked run
---

## Auth cookie injection

HTTP navigation to `/api/auth/browser-test-session` fails when Playwright is spawned from within the API server process — the request is immediately aborted. The correct approach is direct DB insertion + `context.addCookies()`:

1. `randomBytes(32).toString("hex")` → cookieToken
2. `db.insert(userSessionsTable).values({ userId, token: cookieToken, expiresAt })` — 10 min TTL
3. `context.addCookies([{ name: "atlas-session", value: cookieToken, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax", expires: Math.floor(...) }])`

**Why:** The HTTP endpoint at port 8080 receives the navigation request but aborts it immediately from within the same process. Direct DB insert + addCookies() bypasses the network entirely.

## startPath auto-navigation

`startPath` is NOT automatically navigated — it was only a security guard (origin check). Without an explicit `page.goto(baseUrl + startPath)` before `executeSteps`, the browser starts on `about:blank` and all assertions fail immediately. Fix: navigate with `waitUntil: "load"` + 2500ms React hydration wait before calling `executeSteps`.

## Popup handler must be registered AFTER context.newPage()

**This was the root cause of `about:blank` on every Atlas-invoked run.**

`context.on("page", p => { void p.close(); })` fires for ALL new pages in the context — including the one created by `context.newPage()` itself. If the handler is registered before `newPage()`, the newly created main page is immediately closed. Every subsequent `page.goto` throws `"Target page, context or browser has been closed"`, which is caught silently, leaving `page.url()` as `about:blank`.

**Fix:** Register the popup handler AFTER `context.newPage()`:
```js
const page = await context.newPage();
context.on("page", p => { void p.close(); }); // AFTER — only catches popups opened BY the page
```

**Why the event-loop deadlock theory was wrong:** `localhost:80` and `localhost:22883` are both reachable from within the server process at any time. Playwright navigation works identically inside and outside the server process. The about:blank was entirely caused by the page being closed before goto was called.

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

## Confirmed working result

Atlas-invoked run_browser_flow with DESKTOP profile on `/workspace`:
- `finalUrl: http://localhost/workspace` ✅ (not about:blank)
- Duration: ~5,600ms
- Console errors: 0, Network errors: 0
- All assertions cleared
