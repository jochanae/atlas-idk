# Execution Narrative Flow — Backend Handoff

**Repo:** `Axiom-Atlas` (Cloud Run)
**Owner:** Cursor
**Frontend status:** Anchor plumbing shipped. Frontend renders `WorkspaceRunCard` inline BEFORE the assistant message whose `id === executionRun.messageId`. Once backend splits the turn into intent + summary as described below, the same code path yields: `user → intent → CARD → summary` with no further frontend work.

---

## Problem

Today one BUILD-mode user turn produces one assistant message and one run. The message settles AFTER the run finishes, so the user sees:

```
user
assistant "Done. Here's what changed."
[run card receipt]     ← trailing, feels detached
```

Industry pattern (Cursor / Replit Agent / Lovable) is:

```
user
assistant "I'm updating X…"      ← intent
[run card, live → receipt]
assistant "Done. Here's what changed. Next: …"   ← summary
```

## Change (3 things)

### 1. Split the assistant turn into intent + summary

For any BUILD-mode turn, emit **two** assistant messages instead of one:

- **Intent message** — emitted BEFORE the execution run is created. Short (1–2 sentences), states what Atlas is about to do. Stream normally so the user sees typing immediately.
- **Summary message** — emitted AFTER the execution run completes. Contains the "here's what changed / next step" prose that today comes out as the single post-run message.

Do not merge intent + summary into one message with a mid-stream pause. They are separate `chat_messages` rows.

### 2. Anchor the execution run to the intent message

When creating the `execution_run` row, set:

```
execution_run.message_id = <intent_message.id>
```

Not the summary message. The frontend uses `execution_run.message_id` to place the card inline; anchoring to the intent message yields `intent → CARD → summary` order automatically.

`GET /api/projects/:id/runs` already returns `messageId` (see `useProjectRuns.ts:17`). No API shape change required — just make sure the value points at the intent message.

### 3. Don't finalize the turn until the run finishes

Lifecycle owned by the backend for a BUILD turn:

```
1. Receive user message.
2. Emit + persist intent assistant message.  ← chat_messages insert #1
3. Create execution_run (message_id = intent.id).
4. Stream run steps (existing SSE / step events).
5. On run completion, emit + persist summary assistant message.  ← chat_messages insert #2
6. Close the turn.
```

The user should never see "Done." before the run card resolves.

---

## API / Data Contract

No new endpoints. Only behavior changes:

| Field | Before | After |
| --- | --- | --- |
| `chat_messages` per BUILD turn | 1 assistant row | 2 assistant rows (intent, summary) |
| `execution_run.message_id` | Points at the single (post-run) assistant message | Points at the **intent** message |
| SSE stream order | intent tokens + summary tokens interleaved | intent stream completes → run events → summary stream |

Non-BUILD turns (pure chat, no execution run) stay as one assistant message. No change.

---

## Frontend guarantees (already shipped)

- `ChatStream.tsx` computes `runAnchorIdx` from `execLatestRun.messageId` and renders `WorkspaceRunCard` inline immediately before that message.
- Trailing `WorkspaceRunCard` is suppressed when the inline anchor fires (no double-render).
- During active streams (`chatPending`), the trailing card owns the live surface — this covers the window between the intent message being persisted and the summary message arriving.
- `WorkspaceRunCard.adaptExecutionRun` already suppresses orphaned receipts when a newer user message has arrived after the anchor.

Once (1) + (2) + (3) land, the render order becomes:

```
[user bubble]
[intent assistant bubble]
[WorkspaceRunCard — live during run, settled receipt after]
[summary assistant bubble]
[suggestion chips]
```

No further frontend PR needed.

---

## Out of scope for this ticket

- Multiple concurrent runs per turn (single run per turn stays the contract).
- Thinking receipts, decision cards, Direct Launch, workspace layout changes.
- Changing the run card visual (already has active/receipt phases with header animation + spinner).

---

## Verification

After deploy, in workspace chat:

1. Send a BUILD prompt ("update X to do Y").
2. Confirm two `chat_messages` rows are written for that turn (role=assistant, distinct ids).
3. Confirm `execution_runs.message_id` matches the **first** assistant row's id.
4. In the UI, confirm order is: user → intent → run card (live → receipt) → summary.
5. Reload the thread — same order should render from history alone.
