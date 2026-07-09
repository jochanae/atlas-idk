# WRITE_FILE marker bug fix (must-fix-before-v1 #2)

## Bug
`nexus.ts` unconditionally injected a "WORKSPACE FILE WRITING" prompt block instructing
the model to write the complete file in a fenced code block followed by a
`WRITE_FILE:{"path":"..."}` marker on the next line. This is a **second, competing**
file-write protocol alongside the real one (`FILE_EDIT_START` / `FILE_EDIT_CONTENT` /
`FILE_EDIT_END`, defined in `NEXUS_BUILD_PROTOCOLS` and parsed by `extractAllFileEdits`).

Nothing on the backend ever parsed `WRITE_FILE:{...}`. When the model used it instead of
FILE_EDIT (which it sometimes did, since both were present in its instructions), the file
silently never landed on disk while the response text confidently claimed it had been
written — a false-completion-claim bug, worse than a visible failure.

`chat.ts` never had this prompt block, so this was nexus-only.

## Fix
Two parts:

1. **Removed the competing prompt.** Deleted the "--- WORKSPACE FILE WRITING ---" block
   and the two other WRITE_FILE mentions in `nexus.ts`'s system prompt, replacing them
   with pointers to the FILE_EDIT protocol (already injected via `NEXUS_BUILD_PROTOCOLS`
   on BUILD-classified turns). One documented mechanism instead of two.
2. **Defensive fallback, not just prompt surgery.** Added
   `convertWriteFileMarkersToFileEdits(content)` to `builderProtocols.ts`: matches a
   fenced code block immediately followed by `WRITE_FILE:{"path":...}`, converts it into
   a real `FileEdit` (respecting the same `BLOCKED_PATH_RE`/`BLOCKED_DIR_RE` guardrails as
   `extractAllFileEdits`), and strips the marker from visible content. Wired into both
   `nexus.ts`'s and `chat.ts`'s parsing pipelines *before* `extractAllFileEdits` runs, so
   any stray marker the model emits — from cached/old prompt behavior, model drift, or a
   future regression — still gets applied as a real file instead of silently dropped.
   `chat.ts` gets a local copy of the same function since it already maintains its own
   duplicated parsing pipeline rather than importing from `builderProtocols.ts`.

## Why both parts
Removing the prompt is the root-cause fix. The defensive parser is cheap insurance: if
the model ever emits the marker anyway (memory of the old instruction, a different
system-prompt path, or human-authored content that resembles it), the current behavior
would still be "confidently claims success, does nothing." Converting it to a real edit
converts a silent failure into a working file, and the existing gates
(`isCriticalPath`/`canProceedWithFileChanges`, `isWriteClaimWithoutEmission`) still apply
to the resulting FileEdit array normally since it's merged in before the critical-path
check point on the FILE_EDIT/LINE_PATCH read.

## Files changed
- `artifacts/api-server/src/lib/builderProtocols.ts` — new exported
  `convertWriteFileMarkersToFileEdits`.
- `artifacts/api-server/src/routes/nexus.ts` — removed the WRITE_FILE prompt block and
  both inline mentions; imported and wired `convertWriteFileMarkersToFileEdits` into the
  parsing pipeline ahead of `extractAllLinePatches`/`extractAllFileEdits`.
- `artifacts/api-server/src/routes/chat.ts` — local copy of the same converter (no
  prompt change needed here, chat.ts never had the WRITE_FILE prompt); wired into its
  local parsing pipeline for defense-in-depth/consistency.
- `artifacts/api-server/src/__tests__/builderProtocols.test.ts` — 4 new tests: golden
  conversion, blocked-path rejection, no-marker no-op, malformed-JSON doesn't throw.

## Verified
- `pnpm exec vitest run src/__tests__/builderProtocols.test.ts` — 25/25 passing.
- `pnpm --filter @workspace/api-server run typecheck` — no new errors (same pre-existing
  unrelated errors in stripeClient.ts, sourceIngest.ts, selfmap.ts, sources.ts, and the
  two unrelated `number | undefined` errors in chat.ts/nexus.ts).
- Workflow restarted cleanly; boot logs healthy (Stripe init failure and drizzle schema
  push warning are pre-existing/unrelated to this change).

## Not in scope (separate must-fix items)
- Confirmation loop bug (#1) — already fixed, see
  `docs/handoffs/2026-07-09-confirmation-loop-fix-backend.md`.
- Empty-response turns (#3), long-conversation robustness (#4) — not started.
