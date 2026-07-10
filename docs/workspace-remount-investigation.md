# Task 161 — Forced Remount Investigation & Runtime Path Trace

## 1. Remount/reload investigation — findings

**No code path was found that forces a full app reload or component remount when the Workspace browser tab loses/regains focus.** Every `visibilitychange`/`blur`/`focus` handler in the live code was traced to its full effect body; none of them call `location.reload()`, `setLocation()`/navigate, or clear top-level component state.

Audited and ruled out:
- `App.tsx:76` — `window.location.reload()` exists only inside the ErrorBoundary's "Reload" button `onClick`. User-click only, never auto-invoked.
- `workspace.tsx:765` — a `reload()` call exists only inside the explicit "Disconnect GitHub" confirmation flow. User-click only.
- `useChatStream.ts:1264-1280` (the "B2c summarize effect") — the only `visibilitychange` listener in the active chat hook. On hide, it fires one `POST /api/sessions/:id/summarize` and returns; it never touches `messages`, `sessionId`, or triggers any fetch of history. Confirmed via `git` history/comments and now covered by a regression test (see §3).
- `useProjectState.ts` — polls every 30s and clears the active project only on a `404`; not tied to visibility.
- `useAuth.ts` — `staleTime: 5min`, no `refetchOnWindowFocus`.
- `master-map.tsx:388` — visibility listener only updates a ref, no state/reload.
- `sw-guard.ts` — unregisters the service worker once at boot (including inside Replit's iframe preview where `window.self !== window.top`); does not re-run on visibility change.
- `router.tsx` / `routes/__root.tsx` / `routeTree.gen.ts` (TanStack Router scaffold, including any chunk-reload logic in its generated code) — **confirmed dead code**. `main.tsx` only mounts `App.tsx`, which uses `wouter`. The TanStack Router tree is never imported by `main.tsx` and its route modules never execute. It should be deleted in a follow-up cleanup task, but it cannot be the cause of a live remount since it never runs.
- `components/workspace/WorkspaceConversationSurface.tsx` + `useNexusChatStream.ts` — imported in `workspace.tsx` (line 116) but **never rendered** — dead import. Not in the live tree, so also ruled out. (This also corrects a stale memory note — see §2.)

**One real, provable, but lower-severity issue found and fixed:** `home.tsx` and `projects.tsx` both set `refetchOnWindowFocus: true` on their `useListProjects` query, while the app-wide `QueryClient` default (`App.tsx:44`) is `false`. On `/projects`, `isLoading` from that query directly gates a full-page loading skeleton (`projects.tsx:510`), so every tab refocus re-triggered `isLoading` and visibly flashed the whole page back to a loading state — this is the most likely source of the "feels like a reload" reports, at least for the `/projects` surface. `home.tsx`'s copy of the same override doesn't gate any UI, but was still firing an unnecessary refetch/re-render on every refocus and was harmonized for consistency.

**Fix applied:** both queries now use `refetchOnWindowFocus: false`, matching the global default (see diffs in `artifacts/atlas-frontend/src/pages/home.tsx` and `.../projects.tsx`).

**What was not, and could not, be conclusively ruled in or out via static code review:** Vite dev-server HMR websocket reconnect behavior when a tab is backgrounded for an extended period, inside Replit's iframe-proxied preview. This is a client injected by Vite itself (not application code) and its reconnect/reload behavior under Replit's proxy could not be verified without a live, extended-duration tab-backgrounding reproduction, which the available tooling in this session could not perform (no live browser-automation tool was available this session). If the remount is still reproducible after this fix, the next step should be a live reproduction with the Network/Console panes open specifically watching for a Vite HMR `full-reload` message.

## 2. `chat.ts` vs `nexus.ts` — verified relationship

**Verdict: `chat.ts` is the live backend for the actual rendered Workspace surface today. `nexus.ts` is an independently-maintained parallel implementation that `chat.ts` does not call, and that does not call `chat.ts`. `nexus.ts` currently only powers a component that is imported but never rendered.**

Evidence:
- `routes/index.ts:7,101` — `import chatRouter from "./chat"; router.use(requireAuth, chatRouter);`
- `routes/index.ts:24,139` — `import nexusRouter from "./nexus"; router.use(requireAuth, nexusRouter);`
  Both routers are mounted independently in the same file; neither imports the other. `grep` for `from "./chat"` inside `nexus.ts` returns no import — confirmed no call relationship.
- `nexus.ts` contains multiple comments describing itself as a **port**, not a caller, of `chat.ts` logic, e.g.:
  - `nexus.ts:1429` — "Nexus equivalent of `persistExecutionRun()` in chat.ts"
  - `nexus.ts:3022` — "Ported from chat.ts. Must run BEFORE any FILE_EDIT / GITHUB_PUSH parsing"
  - `nexus.ts:3287` — "Ported from chat.ts for workspace BUILD parity"
  - `nexus.ts:4110` — "match chat.ts done-event field names exactly for frontend parity"
  This confirms `nexus.ts` was built by copying and adapting `chat.ts`'s logic, not by delegating to it — the two files are duplicate/parallel implementations of overlapping functionality, not caller/callee.
- **Frontend wiring (this is the decisive evidence for "which one is actually live"):**
  - `pages/workspace.tsx:12` imports `useChatStream` from `@/hooks/useChatStream` (not `useNexusChatStream`).
  - `hooks/useChatStream.ts:184` defaults `endpoint = "/api/chat"`. `workspace.tsx`'s call to `useChatStream(...)` (line 4784) does not override `endpoint`, so the real, rendered Workspace chat UI POSTs to `/api/chat` → `chat.ts`.
  - `hooks/useNexusChatStream.ts` (the file that would call `/api/nexus/chat`) is only imported by `home.tsx` and `components/workspace/WorkspaceConversationSurface.tsx`.
  - `workspace.tsx:116` imports `WorkspaceConversationSurface` but **never renders it** (`grep` for `<WorkspaceConversationSurface` in `workspace.tsx` returns no matches) — it is dead code in the current tree.
  - `components/home/ActiveRuns.tsx:314` (the Composer, a different surface) also calls `/api/chat` directly.
  - `workspace.tsx:5544` — an explicit comment: "Build-handoff path: auto-send through /api/chat so BUILD_HANDOFF fires" — i.e. engineers are aware `chat.ts` has functionality `nexus.ts` doesn't, and intentionally keep this path on `chat.ts`.

**Correction to prior memory:** an earlier memory entry ("Nexus vs Chat routes") stated "workspace uses `/api/nexus/chat` (not `/api/chat`)". That is **stale/incorrect** for the current codebase — it likely described the intended end-state of the "Nexus Workspace Spine" migration (flag `USE_NEXUS_WORKSPACE_CHAT`, mentioned in memory but not found anywhere in the current frontend source — also stale/removed) rather than what `workspace.tsx` actually renders today. Memory has been corrected (see commit).

## 3. Runtime path trace — `/api/nexus/chat`... corrected to the actual live path, `/api/chat`

Because §2 established that the rendered Workspace surface talks to `/api/chat`, not `/api/nexus/chat`, this trace follows the path that is actually live. (If/when the Nexus migration is finished and `WorkspaceConversationSurface` is wired in, the `nexus.ts` file mirrors nearly all of the same steps below — see the "ported from chat.ts" comments cited in §2 — but that is not what a user exercises today.)

1. **UI** — `artifacts/atlas-frontend/src/pages/workspace.tsx`, component `Workspace()`. User submits the composer; the submit handler calls into the chat hook's `send`/`doSend`.
2. **Hook** — `artifacts/atlas-frontend/src/hooks/useChatStream.ts`, `useChatStream()`. Manages `messages`, `sessionId`, `chatPending`, and posts the request via `doSend()` (internal), which does `fetch(endpoint, ...)` at line 435, where `endpoint` defaults to `"/api/chat"` (line 184).
3. **HTTP endpoint** — `POST /api/chat`, registered in `artifacts/api-server/src/routes/index.ts:101` (`router.use(requireAuth, chatRouter)`), handled in `artifacts/api-server/src/routes/chat.ts:3077` (`router.post("/chat", ...)`).
4. **Route handler / model+tool execution** — inside that same handler in `chat.ts`: builds context (project, entries, file/forge context), calls the model, streams tokens back over the response, and parses any tool/action markers (`FILE_EDIT`, `GITHUB_PUSH`, `BUILD_HANDOFF`, `IMAGE_GEN`, etc.) emitted by the model, dispatching each to its executor.
5. **Persistence** — `chat.ts`'s `persistExecutionRun()` (referenced by name from `nexus.ts:1429`'s "equivalent of" comment) writes the run/message to the sessions/messages tables once the stream completes.
6. **Timeline** — completed runs and any generated artifacts are surfaced through the ledger/timeline read paths that `ViewChangesPanel.tsx` and `TimelineRail.tsx` query (via `project_builds`/`run_artifacts`-style tables per existing memory on Build Runner / Plan Artifact SSE architecture).
7. **History hydration** — on (re)mount, `useChatStream.ts` loads prior messages via the generated `useListMessages` hook (`_workspace/api-client-react`), keyed by `sessionId`, and merges them through `mapPriorMessage` before rendering in `components/workspace/ChatStream.tsx`.

## 4. Symptoms re-verified post-fix (title-update delay, Timeline gaps, "No messages loaded")

Since no forced-remount code path was found or removed (only the `refetchOnWindowFocus` flicker was fixed, and that was scoped to `/projects`+`/home` project-list queries, not the Workspace chat/session state), **these three symptoms were not side effects of a Workspace remount** — there was no remount to be a side effect of. They should be treated as separate, independent issues if they are still reproducible, and investigated on their own (title-update delay → likely a debounce/auto-name timing issue in `chat.ts`'s `setAutoNameKey` flow; Timeline gaps for image/sketch generation → likely an artifact-type not yet wired into the timeline read path; "No messages loaded" menu bug → likely a `sessionId`/query-key mismatch in the history hydration step above). None of these were in scope to fix under this task once the remount hypothesis didn't pan out as their common cause.

## 5. Changes made in this task

- `artifacts/atlas-frontend/src/pages/home.tsx` — `refetchOnWindowFocus: true` → `false` on the projects list query (harmonize with global default).
- `artifacts/atlas-frontend/src/pages/projects.tsx` — same fix; this one directly stops a full-page skeleton flash on tab refocus.
- Added Vitest + Testing Library to `artifacts/atlas-frontend` (previously referenced by test files but not actually installed/runnable) and a `vitest.config.ts` + `test` script.
- Added `artifacts/atlas-frontend/src/hooks/__tests__/useChatStream.visibility.test.tsx` — regression test asserting the tab-hide/show cycle never clears `messages`/`sessionId`/`chatPending`, and that the summarize-on-hide network call fires at most once per session.
- Note: enabling `pnpm --filter @workspace/atlas-frontend run test` surfaced 7 pre-existing failing tests in `useChatStream.attachments.test.ts` and `useNexusChatStream.attachments.test.ts` that predate this investigation (they were never executable before, since Vitest wasn't installed for this package). Left unfixed — out of scope here; flagged for a follow-up task.
