# Handoff: WhisperGate Safety Inversion + Just-Talk Server Enforcement

**Repo:** `Axiom-Atlas` (backend, Cloud Run)
**Owner:** Cursor
**Priority:** P0 — blocks frontend cleanup pass (Ask Atlas removal, lens deletion, Just-Talk button)

---

## Why

Today WhisperGate falls back to `BUILD` when the classifier fails or is uncertain. That is the root cause of "hello triggers a run card / GitHub write / file edit." The product is a decision-led thinking partner — uncertainty should never cause the system to act. It should cause it to talk.

Also: even when the classifier returns `CHAT` or `DECIDE`, `nexus.ts` still allows some side-effects through. Only BUILD should trigger persistence of an execution_run, tool calls, GitHub bootstrap, or Tier1 write side-effects.

Frontend is about to ship a "Just Talk" override toggle. That override must be enforced **server-side** — the frontend cannot be the safety layer.

---

## Scope

Two files:

1. `artifacts/api-server/src/lib/whisperGate.ts`
2. `artifacts/api-server/src/routes/nexus.ts`

No schema changes. No new endpoints.

---

## Changes

### 1. `whisperGate.ts` — invert fallback + tighten BUILD

**A. Fallback: BUILD → DECIDE**

Change the catch block at the bottom of `classifyIntent`:

```ts
// OLD
return { intent: "BUILD", confidence: 0, reason: "classifier_failed", fallback: true, elapsedMs };

// NEW
return { intent: "DECIDE", confidence: 0, reason: "classifier_failed", fallback: true, elapsedMs };
```

Update the comment block above it. The old "never lose a build request" rationale is wrong for this product. Uncertainty → think, don't act.

**B. Tighten BUILD in the SYSTEM prompt**

Add these explicit rules to the SYSTEM string:

```
BUILD requires an explicit action verb from the user in THIS turn, OR an unambiguous affirmation of a prior BUILD proposal from the assistant. Action verbs: build, create, make, fix, wire, implement, deploy, edit, generate, apply, run, add, remove, delete, push, ship, refactor, rename, install.

If the user is describing a problem, expressing a preference, wondering, considering, or asking "should we / could we / maybe we", that is DECIDE — not BUILD, even if it names a concrete change.

Examples:
- "Maybe we should delete Ask Atlas." → DECIDE
- "Delete Ask Atlas." → BUILD
- "Can you help me think through deleting Ask Atlas?" → DECIDE
- "I'm frustrated with this." → CHAT
- "What do you think about X?" → CHAT or DECIDE (never BUILD)

When ambiguous between DECIDE and BUILD, choose DECIDE.
When ambiguous between CHAT and DECIDE, choose CHAT.
```

**C. Structured logging**

Replace the existing `logger.info` line with a structured event:

```ts
logger.info({
  event: "whisperGate.turn",
  intent,
  confidence: parsed.confidence,
  reason: parsed.reason,
  fallback: false,
  elapsedMs,
  model: "claude-haiku-4-5",
}, "whisperGate: classified");
```

Same shape in the fallback path (`fallback: true`).

---

### 2. `nexus.ts` — enforce Just-Talk + gate side-effects on BUILD only

**A. Accept `justTalk` from request body**

```ts
const { messages, conversationMode, justTalk } = req.body;
```

**B. When `justTalk === true`:**

- Skip `classifyIntent` entirely.
- Force `intent = "CHAT"`.
- Force `tools: false`, `forceCreate: false`.
- Inject a system block: `"JUST TALK MODE ACTIVE — the user has explicitly disabled build actions. Do not build, edit, run, create, deploy, or modify anything. Do not call tools. Do not propose file writes. Respond conversationally only. If the user asks for a build action, acknowledge and ask them to turn Just Talk off first."`
- Log: `logger.info({ event: "nexus.justTalk", projectId, userId }, "just-talk override active")`.

**C. Gate side-effects on BUILD only**

Currently `persistNexusExecutionRun` is gated by `mode === "operational"` (derived from file-read actions). Replace with an intent check:

```ts
const shouldPersistRun = intent === "BUILD" && !justTalk && !conversationMode;
if (shouldPersistRun) {
  await persistNexusExecutionRun(/* ... */);
}
```

Apply the same gate to:
- GitHub bootstrap
- Tier1 extraction side-effects (the auto-fill pass)
- Tool-loop enablement (tools should be `false` for CHAT and DECIDE)

CHAT and DECIDE turns should never write an execution_run row, never invoke GitHub, never trigger Tier1 field extraction. They can still surface memory (read-only) and produce DECIDE-block responses.

**D. Return intent + justTalk in SSE metadata**

Emit a `meta` event early in the stream so the frontend can render the right surfaces:

```ts
res.write(`event: meta\ndata: ${JSON.stringify({ intent, justTalk: !!justTalk, fallback })}\n\n`);
```

Frontend will use this to suppress run cards, Tier1GapCard, timeline, and file-write cards on non-BUILD turns.

---

## Acceptance

1. `curl` `/api/nexus/chat` with `{"messages":[{"role":"user","content":"hey"}]}` → intent CHAT, no execution_run row inserted, no tool calls, no GitHub writes.
2. Same with `"Maybe we should delete Ask Atlas."` → intent DECIDE, no execution_run row, no side-effects, structured DECIDE response allowed.
3. Same with `"Delete Ask Atlas from the app."` → intent BUILD, execution_run row inserted, tools enabled.
4. Same with `justTalk: true` and `"Build me a landing page"` → intent forced CHAT, no side-effects, Atlas replies "turn Just Talk off first".
5. Classifier timeout → intent DECIDE (not BUILD), no side-effects.
6. Every turn emits a `whisperGate.turn` structured log line with `{intent, confidence, reason, fallback, elapsedMs, model}`.
7. Every turn emits an SSE `meta` event with `{intent, justTalk, fallback}` before the first text delta.

---

## Non-goals

- No new endpoint.
- No schema change.
- No frontend edits (separate pass).
- Do not touch the `/api/chat` legacy route — it will be deleted after frontend confirms nothing hits it.
