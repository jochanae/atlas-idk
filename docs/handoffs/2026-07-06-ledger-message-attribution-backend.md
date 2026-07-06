# Handoff: Ledger → Message Attribution Fix

**Date:** 2026-07-06
**Repo:** atlas-idk
**Scope:** Backend only. No frontend changes. No migrations. No new tables.
**Prerequisite for:** Run Details → Decisions tab (deferred until this lands)

---

## Why

Audit (Cursor, 2026-07-06) confirmed: automated ledger entries created during an agent/build run do **not** carry `entries.source_message_id`. Empirical: project 74, entries 559–560 (auto) had `source_message_id = null`; entry 561 (manual park) had `source_message_id = 330`.

Root cause: `write_ledger_entry` and siblings do not pass `sourceMessageId`, and `ctx.messageId` is only assigned **after** the assistant message row is inserted at the end of the tool loop — so it is unavailable while tools run.

Result: no run today can reconstruct which ledger entries it produced. Blocks the Decisions tab and degrades cross-surface provenance in general.

---

## Goal

Every automated ledger entry created during an agent or build run must have `entries.source_message_id` populated with the id of the assistant `chat_messages` row that caused it.

Explicitly out of scope:

- Building any Run Details UI
- Creating `agent_run_steps` or any new table
- Deciding Timeline storage (`sessions.run_actions` vs. new sink)
- Adding a dedicated `run_id` FK to `entries`
- Any schema migration

---

## Phase 0 — Safety audit (do this before writing code)

Answer one question: **is it safe to insert the assistant `chat_messages` row at loop start (empty/placeholder content, filled at loop end) with the current streaming and rendering stack?**

Check:

1. Does the SSE stream reference `messageId` before end-of-loop? If yes, early insert is fine and actually simplifies things.
2. Does the frontend render assistant messages by id or by streamed content buffer? If id-based, early insert is safe; if buffer-based with reconciliation at the end, verify the reconciliation still works when a row already exists.
3. Any triggers, listeners, or realtime subscriptions on `chat_messages` insert that would fire prematurely (notifications, analytics, capacity metering, etc.)?
4. Does `runMetadataInsertValues()` in `chat.ts` currently `INSERT` or `UPDATE`? If insert-only, it becomes an update against the pre-created row.

**Deliverable of Phase 0:** short note in the PR description — "early insert is safe" OR "early insert is unsafe because X". If unsafe, stop and propose a shadow correlation key (uuid generated at loop start, reconciled to `message.id` at end); do **not** implement or migrate — bring it back for review.

### Phase 0 result (implemented branch)

**Early insert is safe.**

1. Agent-loop SSE only emits `messageId` in the final `done` event; streaming uses a negative placeholder id until then.
2. `useChatStream` is buffer-based during stream and reconciles to `res.messageId` at `done` — pre-existing DB row is invisible to the client until done.
3. No `chat_messages` insert listeners, realtime subscriptions, or embedding hooks in this codebase.
4. Legacy build path (`runMetadataInsertValues`) remains insert-only; agent loop is the only path changed to insert-then-update.

---

## Phase 1 — Implementation (only if Phase 0 says safe)

### 1. Insert assistant `chat_messages` row at loop start

In the agent-loop entrypoint (`runner.ts`):

- Insert the assistant row **before** invoking the tool loop, with `role: "assistant"`, `content: ""`.
- Capture the returned `id` and assign it to `ctx.messageId` before the first tool call.
- At loop end, `UPDATE` that row with final `content`, `run_status`, `run_summary`, token counts, and `*Json` file edit fields. Do not insert a second row.

### 2. Thread `sourceMessageId` through every automated write path

- `write_ledger_entry` — `sourceMessageId: ctx.messageId` when set.
- `writePlanCommittedLedgerEntry` — optional `sourceMessageId` param; passed from `commit_plan` (`ctx.messageId`) and `agentApprovals` (`plan.messageId`).
- `autoCaptureLedgerDecision` (nexus) — when `sessionId` is set, mirror assistant turn into `chat_messages` and pass that id; otherwise null (Ask Atlas without workspace session).
- Resolved-node inserts in `chat.ts` — `sourceMessageId: intentMsgId ?? savedMsgId`.

Leave user/API park paths alone.

Do **not** touch: genome/thinking-receipt auto-promote, capacity ledger entries.

### 3. No schema change

`entries.source_message_id` already exists as `integer`. Just populate the column.

---

## Verification

Before merging:

1. Run a real agent turn that triggers `write_ledger_entry`. Confirm `source_message_id` = assistant message id.
2. Run a build turn that emits a resolved-node insert. Same check.
3. Run a nexus turn (with `sessionId`) that fires `autoCaptureLedgerDecision`. Same check.
4. SQL spot-check on post-fix rows with `mode IN ('auto', 'decide', 'plan_committed')`.
5. Regression: manual park (`POST /projects/:id/entries` with `sourceMessageId`) still works.

---

## Consuming frontend files

None in this pass.

---

## Out of scope / follow-ups

- `agent_run_steps` table for narrated Timeline
- Timeline unification (`sessions.run_actions` vs. new sink)
- FK promotion on `entries.source_message_id`
- Backfilling historical null `source_message_id`
- Capacity/genome ledger write paths
- Run Details UI
