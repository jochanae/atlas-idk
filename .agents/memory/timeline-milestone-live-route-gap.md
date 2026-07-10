---
name: Timeline milestone classification live-route gap
description: maybeEmitMilestones was only wired into dormant nexus.ts, not the live chat.ts route — a whole class of "Timeline entries missing" bugs
---

`maybeEmitMilestones` (the conversational Timeline milestone classifier) was
wired only into `nexus.ts`. Per [Nexus vs Chat routes], the live Workspace
chat UI actually calls `chat.ts`, which never called the classifier at all —
so real Workspace conversations never produced Timeline milestones,
regardless of intent-gate tuning.

**Why this matters generally:** when investigating "X isn't happening" bugs
in Atlas around chat/turn side-effects (memory extraction, classifiers,
receipts), always confirm the wiring lives in `chat.ts`, not just `nexus.ts`.
A feature can be fully implemented and unit-correct yet functionally dead in
production because it's only invoked from the dormant route.

**How to apply:** before debugging classifier logic itself, grep both
`chat.ts` and `nexus.ts` for the call site. If it's only in `nexus.ts`,
that's very likely the root cause, not the classifier's own prompt/logic.

**Fix pattern used:** wired the classifier into chat.ts right after
`persistExecutionRun`, awaited with a bounded timeout (~3.5s) before
`res.end()` so the milestone row exists by the time the frontend's
`run-completed` event fires and re-fetches (mirrors the bounded-await +
background-fallback pattern used for the project-title propagation fix).
Also: pass the turn's actual start time (not classifier-completion time) as
`started_at` on the milestone's `execution_runs` row, or async classification
lag causes cross-turn ordering drift when sorting `ORDER BY started_at DESC`.
