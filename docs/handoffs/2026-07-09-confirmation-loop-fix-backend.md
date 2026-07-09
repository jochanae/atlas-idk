# Confirmation loop bug fix (must-fix-before-v1 #1)

## Bug
A turn proposing FILE_EDIT/LINE_PATCH changes to a "critical path" (package.json,
lockfiles, config files, or auth/security/payments/billing/migrations dirs) was gated
by `canProceedWithFileChanges()` in `builderProtocols.ts`. When gated, the assistant
appended an "I need explicit approval" message and **discarded** the proposed edits
entirely (`responseFileEdits = []`) — nothing was persisted as "pending".

`canProceedWithFileChanges()` is purely path-based and has zero concept of user
consent. So when the user replied "yes, apply it", the model had to regenerate the
FILE_EDIT blocks from scratch; if it touched the same critical path again, the gate
blocked again — an infinite loop where "yes" had no effect.

## Fix
Added three new helpers to `artifacts/api-server/src/lib/builderProtocols.ts`
(and mirrored locally in `chat.ts`, which keeps its own duplicate gate logic instead
of importing from builderProtocols):

- `previousTurnRequestedApproval(history)` — true if the most recent assistant message
  in history contains the approval-request phrase.
- `isAffirmativeConfirmationReply(message)` — true only for short, explicit "yes"-style
  replies (yes / go ahead / do it / apply it / proceed / etc.), anchored to the whole
  trimmed message so hedges like "yes but only if..." are rejected.
- `userConfirmedPendingChanges(message, history)` — AND of the above two. This is the
  one-turn bypass: `fileChangesAllowed = !hasProposedFileChanges || canProceedWithFileChanges(...) || userConfirmedPendingChanges(message, history)`.

Wired into both gate call sites:
- `chat.ts` (~line 5660, uses local `message`/`history` vars from the request body).
- `nexus.ts` (~line 3319, uses local `message` var and `conversationHistory`, which is
  nexus's persisted-Living-Thread-backed history array, not the raw request `history`).

## Why this design (not a persisted pending-edit store)
Considered persisting the blocked edits server-side and replaying them verbatim on
confirmation, but that's a bigger change (new DB table or message metadata, cross-cuts
chat.ts/nexus.ts differently) for a fix that needs to ship as #1 of 4. The chosen
approach re-lets the model regenerate the edits on the confirmation turn but disables
the gate for that one turn — simpler, no new state, and directly closes the loop
symptom described in the bug report. If we see cases where the model regenerates
*different* edits on the confirmation turn (drift), a persisted pending-edit store is
the natural follow-up hardening.

## Files changed
- `artifacts/api-server/src/lib/builderProtocols.ts` — new exported helpers.
- `artifacts/api-server/src/routes/chat.ts` — local copies of the same helpers (chat.ts
  doesn't import from builderProtocols for this logic), gate site updated.
- `artifacts/api-server/src/routes/nexus.ts` — imports the new helpers, gate site
  updated.
- `artifacts/api-server/src/__tests__/builderProtocols.test.ts` — 7 new tests covering
  approval-request detection, affirmative-reply detection (including negative/hedge
  cases), and the full bypass behavior.

## Verified
- `pnpm exec vitest run src/__tests__/builderProtocols.test.ts` — 21/21 passing.
- `pnpm --filter @workspace/api-server run typecheck` — no new errors (pre-existing
  unrelated errors in stripeClient.ts, sourceIngest.ts, selfmap.ts, sources.ts, and two
  unrelated `number | undefined` errors in chat.ts/nexus.ts untouched by this change).
- Workflow restarted cleanly.

## Not in scope (separate must-fix items)
- WRITE_FILE marker bug (#2) — the `isWriteClaimWithoutEmission` / `[NO_FILES_WRITTEN]`
  logic is untouched.
- Empty-response turns (#3), long-conversation robustness (#4) — not started.
