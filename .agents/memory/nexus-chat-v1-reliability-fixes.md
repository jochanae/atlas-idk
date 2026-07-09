---
name: Nexus/chat v1 reliability fixes
description: The four must-fix-before-v1 backend reliability bugs (confirmation loop, WRITE_FILE marker, empty-response turns, no mid-thread reset) and how each was resolved.
---

All four items from `.local/atlas-v1-readiness-report.md`'s "must-fix-before-v1" list are
fixed. Full technical detail lives in the dated handoffs (`docs/handoffs/2026-07-09-*`);
this is the durable summary of the decisions.

1. **Confirmation loop** — `canProceedWithFileChanges()` is path-based with no concept
   of consent, so replying "yes" to a blocked critical-path edit re-blocked forever.
   Fixed with a one-turn bypass (`userConfirmedPendingChanges`): if the previous
   assistant turn asked for approval and this turn is an explicit short affirmative,
   let the edits through once. Not a persisted pending-edit store — if the model
   regenerates *different* edits on the confirmation turn, that's the next hardening
   step.

2. **WRITE_FILE marker** — `nexus.ts` used to inject a second, competing file-write
   prompt (`WRITE_FILE:{"path":...}`) alongside the real `FILE_EDIT_START/END`
   protocol. Nothing parsed the marker, so the model sometimes used it and the file
   silently never landed while the response claimed success. Fixed by removing the
   competing prompt AND adding a defensive parser (`convertWriteFileMarkersToFileEdits`
   in `builderProtocols.ts`) that converts any stray marker into a real edit — belt and
   suspenders, since prompt removal alone doesn't guard against model drift back to it.

3. **Empty-response turns** — the model occasionally returns a stop with no text and no
   tool use. There's a pre-existing Output Guard that avoids persisting a blank turn,
   but every occurrence required a manual user retry. Fixed with one silent automatic
   retry (same request, immediately) before the Output Guard ever fires — in both
   `nexus.ts`'s `streamClaude` and `chat.ts`'s `callModel` (streaming + non-streaming).

4. **No mid-thread reset** — the server's persisted conversation state
   (`chat_messages`/`nexus_messages`) is authoritative; there was no way to recover a
   stuck/context-polluted thread without abandoning the whole project. The global nexus
   thread already had `DELETE /api/nexus/thread`; added the missing counterpart for the
   in-workspace thread: `POST /session-reset` in `chat.ts` clears one session's
   `chat_messages` (ownership-checked) while leaving the project's files/ledger/AM
   completely untouched. Backend-only — no frontend UI wired yet.

**Why this matters for future work:** `chat.ts` maintains a fully duplicated parsing/gate
pipeline instead of importing from `builderProtocols.ts` (see existing drift note in
that file's history) — any future fix to one of these mechanisms must be mirrored in
both files independently, or it will silently only apply to nexus.ts.
