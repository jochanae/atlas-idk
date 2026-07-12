---
name: CHAT Contract Bridge integration pattern
description: How the live chat.ts pipeline is wired into the V1.2 Run Lifecycle Contract without per-branch surgery
---

## The rule
Use a `res.write` patch (`patchResForContractCompletion`) to intercept the `"done"` SSE event once at the start of the handler, rather than editing each of the ~15 branches that emit a done event in chat.ts.

**Why:** chat.ts has ~15 code paths (standard, dive, agentic, agent-loop, scenario, error) all emitting `data: {"type":"done",...}`. Editing each would create a fragile N-branch coupling. The write-patch strategy wires all branches with a single injection point.

**How to apply:** Whenever adding contract-layer side-effects to chat.ts turns:
1. Declare `let _contractCtx: ContractRunCtx | null = null` BEFORE the outer `try {` so it's accessible in the `catch`.
2. Inject `beginContractRun` + `patchResForContractCompletion` after `userId` resolves inside the try.
3. Call `failContractRun(_contractCtx, ...)` in the outer catch block.
4. The write-patch handles the happy path automatically.

## Conversation ID mapping
`conversationId = "ws-" + sessionId` (integer → string).  
This is consistent with the thinking_receipts lookup already in chat.ts (used independently around line ~3365).

## nexus_conversations upsert
The SSE auth gate reads `nexus_conversations` to verify the userId. The bridge upserts this record (ON CONFLICT DO NOTHING) at the start of every turn, so the first workspace message of a new session still authorizes.

## What endContractRun persists
- One bulk `token` event (full response text, `bulk: true`) — NOT per-token DB writes
- One `conversation_messages` row with `role: "assistant"`
- `contract_runs.status = "succeeded"` + response + elapsed_ms

## Key files
- Bridge: `artifacts/api-server/src/lib/chatContractBridge.ts`
- Injection: `artifacts/api-server/src/routes/chat.ts` (4 edits)
- Tests: `artifacts/api-server/src/__tests__/chatContractIntegration.test.ts`
