# Long-conversation robustness — session reset (must-fix-before-v1 #4)

## Gap
The v1 readiness report flagged that the server maintains its own persisted
conversation state (`chat_messages`, keyed by `sessionId`, for the in-workspace thread;
`nexus_messages`, keyed by `conversationId`, for the global thread) independent of
client-supplied history, and asked whether it's an intended gap or a real problem that
there was no way to reset a stuck conversation mid-thread short of starting an entirely
new project.

Related but separate from #3 (empty-response turns): #3 makes individual turns more
reliable; #4 is about recovery once a thread is already in a bad state (e.g. repeating
the same failure, or just too long/context-polluted to continue productively) and the
only escape hatch was abandoning the project.

## Decision
This is a real gap, not an intended contract — losing all project state (files, ledger,
Application Model) just to get a clean conversation is a disproportionate cost for what
is fundamentally a chat-thread problem. The global nexus thread already had this
(`DELETE /api/nexus/thread`, scoped by `conversationId`); the in-workspace thread
(`chat.ts`, `chat_messages` keyed by `sessionId`) did not.

## Fix
Added `POST /session-reset` to `chat.ts`:
- Verifies the session belongs to a project owned by the authenticated user (session →
  project → user ownership chain, same pattern as the existing `/scenario-keep` route).
- Deletes all `chat_messages` rows for that `sessionId` and resets the session's
  `messageCount` to 0.
- Leaves the project, its workspace files, ledger, Application Model, and DNA
  completely untouched — this resets *only* the conversational thread, not the
  project's accumulated state.
- Logs the reset (`sessionId`, `projectId`, count cleared) for observability.

Intentionally minimal: no new table, no soft-delete/undo, no partial/selective
truncation. A full clear of one session's messages is the simplest reset that actually
unblocks a stuck thread, and matches the existing `DELETE /api/nexus/thread` pattern
already shipped for the global thread. Frontend wiring (a "reset conversation" action in
the workspace UI) is a separate, follow-up piece of work — this handoff is backend-only,
consistent with the other three fixes in this session.

## Files changed
- `artifacts/api-server/src/routes/chat.ts` — new `POST /session-reset` route.

## Verified
- `pnpm --filter @workspace/api-server run typecheck` — no new errors (same
  pre-existing unrelated errors as the other three fixes in this session).
- Workflow restarted cleanly; boot logs healthy.
- `curl -X POST localhost:80/api/session-reset` (no auth) → `401 Authentication
  required`, confirming the route is registered and gated correctly.

## Not in scope
- Confirmation loop (#1), WRITE_FILE marker (#2), empty-response retry (#3) — already
  fixed, see the other three handoffs dated 2026-07-09.
- Frontend UI to surface a "reset conversation" action — backend capability only.
- The 40-message history cap and other context-length limiting already in place in
  `nexus.ts` were reviewed and left unchanged; they were not implicated in the reported
  gap (the gap was "no reset," not "context too small/large").
