---
name: Timeline milestone classification live-route gap
description: a classifier can be fully implemented yet functionally dead if it's only wired into a dormant route, not the live one
---

`maybeEmitMilestones` (the conversational Timeline milestone classifier) was
wired only into `nexus.ts`. Per [Nexus vs Chat routes], the live Workspace
chat UI actually calls `chat.ts`, which never called the classifier at all —
so real Workspace conversations never produced Timeline milestones,
regardless of how the classifier's own intent gate was tuned.

**Why this matters generally:** when investigating "X isn't happening" bugs
around chat/turn side-effects (memory extraction, classifiers, receipts),
confirm the wiring lives in the route actually serving traffic before
debugging the feature's internal logic. A feature can be unit-correct and
still be a no-op in production if it's only invoked from a dormant route.

**Related durable lessons from the same fix:**
- Background/fire-and-forget work whose completion the UI depends on needs a
  bounded-await-then-detach pattern, not pure fire-and-forget — otherwise the
  UI's "did it finish" check can race ahead of the write.
- If two related DB rows are deliberately given the same logical timestamp
  (e.g. both stamped with a turn's start time for cross-turn ordering),
  timestamp-only sort ordering is not deterministic for that pair — add an
  explicit monotonic tie-breaker (DB-assigned sequence/insertion order).
