---
name: Nexus chat write-reliability failure modes
description: Three distinct ways /api/nexus/chat can fail to apply a file edit even though the build/verify pipeline itself is fine — found during the Scheduling benchmark.
---

Observed during a long, multi-turn build conversation against `/api/nexus/chat` (turn ~10+), specifically when asking for one small remaining file late in the thread:

1. **Silent empty-turn failure.** The model can return an empty response after token stripping (`nexus: empty response after token stripping`), surfaced only as a generic "Atlas didn't generate a response" with no diagnosis. Reproduced 5x in a row for the same file request, including after passing an empty `history` array — the server ignores client-supplied `history` and uses its own persisted conversation state, so there is no way for a caller to force a "fresh start" mid-conversation.
2. **Non-standard write marker silently drops the file.** The model can emit a raw `WRITE_FILE:{"path":...}` text token in its prose instead of using the structured `fileEdits` mechanism. Nothing parses this marker — the file never lands on disk — but the response text confidently claims the file was written. This is a false-completion-claim, worse than a visible failure.
3. **Confirmation gate that never applies.** A turn can reply "these changes touch files that require confirmation before applying," and an explicit "Confirmed — go ahead" follow-up can produce the *same* confirmation-required response again, with `fileEdits`/`autoAppliedPaths` staying `undefined` both times — a real user saying "yes" would be stuck.

**Why:** all three are turn-completion/file-application plumbing bugs in `nexus.ts`, independent of code-generation quality — verification tooling (closed-loop verify) only inspects the delivered file tree, so it cannot catch or explain these; they only show up by inspecting raw SSE `runActions`/`fileEdits` per turn.

**How to apply:** if a benchmark or user report says "Atlas said it wrote X but X isn't there" or "it keeps asking to confirm and never does anything," check for these three signatures in server logs before assuming a code-gen defect. Full writeup: `.local/atlas-budgeting-benchmark-audit.md` (Scheduling benchmark section).
