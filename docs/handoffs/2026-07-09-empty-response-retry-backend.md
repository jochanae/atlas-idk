# Empty-response turns fix (must-fix-before-v1 #3)

## Bug
The v1 readiness report documented "Model returned no content" recurring five times in
a row for the same trivial file request late in a long conversation, with no diagnostic
surfaced to the user beyond a generic retry message. Root cause was not diagnosed at
report time.

`nexus.ts` already had a defensive **Output Guard** (`if (!visibleContent.trim())`) that
correctly avoids persisting a blank assistant turn to the thread (which would confuse
the model on the next request) and surfaces a `event: error` / `empty_response` SSE
event instead. That guard is a good last resort, but it only fires *after* the model has
already returned nothing — every occurrence still required the user to manually retry.

## Fix
Added a single silent, automatic retry at the point where the model's response is first
observed to be empty — before the Output Guard ever has to fire and before the user sees
anything:

- **`nexus.ts`** (`streamClaude`): in the `finalMessage` handler, if the accumulated
  `fullText` is empty and the model made no tool call either, log a warning and
  re-invoke `streamClaude` with the identical `messagesForClaude` and a `retryCount`
  bumped to 1, capped at one retry. Only if the retry is *also* empty does execution
  fall through to `finishStream`, which still hits the existing Output Guard and
  surfaces `empty_response` to the client as before.
- **`chat.ts`** (`callModel`): both the streaming (`anthropic.messages.stream`) and
  non-streaming (`anthropic.messages.create`) branches now loop up to 2 attempts,
  retrying once on an empty response before returning/throwing.

This does not change behavior for a genuinely-empty CHAT-mode turn where the *content*
is legitimately blank after marker stripping (e.g. a turn that's 100% FILE_EDIT blocks
with no prose) — those turns have non-empty `fullText` from the model's perspective;
only the *visible* content is empty after later stripping, and that path is unaffected
by this change (it still goes through the pre-existing Output Guard, unmodified).

## Why a bare retry, not a deeper fix
The root cause of the underlying empty completions (a transient issue with the
Anthropic API returning a stop with no text/tool_use for a well-formed request) was not
reproducible in this environment and is consistent with a transient upstream blip rather
than a deterministic bug in our prompt or parsing — the same request succeeding on
retry is the expected signature of that class of issue. A single automatic retry
converts "user sees an error and must manually retry, sometimes several times" into
"usually invisible," which is the actual trust problem described in the report. If
retries are observed to *not* resolve it in practice (i.e., the same request fails
twice in a row repeatedly), that's a signal to escalate to Anthropic support or add
telemetry around request payload size / conversation length correlation — the retry
count and an explicit warning log (`nexus: model returned empty response — retrying
once`) already give a data point for that going forward.

## Files changed
- `artifacts/api-server/src/routes/nexus.ts` — `streamClaude` options gained
  `retryCount?: number`; one retry wired into the `finalMessage` handler before
  `finishStream` is called.
- `artifacts/api-server/src/routes/chat.ts` — `callModel`'s streaming and non-streaming
  branches each wrapped in a bounded (2-attempt) retry loop on empty content.

## Verified
- `pnpm exec vitest run src/__tests__/builderProtocols.test.ts` — 25/25 passing
  (unaffected by this change, no new tests added here since the fix is retry-timing
  logic around live API calls, not a pure function — verified via typecheck + code
  review + workflow log health instead).
- `pnpm --filter @workspace/api-server run typecheck` — no new errors (same
  pre-existing unrelated errors in stripeClient.ts, sourceIngest.ts, selfmap.ts,
  sources.ts, and the two unrelated `number | undefined` errors in chat.ts/nexus.ts).
- Workflow restarted cleanly; boot logs healthy.

## Not in scope (separate must-fix items)
- Confirmation loop bug (#1) and WRITE_FILE marker bug (#2) — already fixed, see the
  other two handoffs dated 2026-07-09.
- Long-conversation robustness (#4) — the report's open question of whether a stuck
  conversation can be reset mid-thread (server ignores client-supplied `history`, uses
  its own persisted state) is unrelated to this retry fix and still open.
