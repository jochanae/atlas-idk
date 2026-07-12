---
name: V1.2 turn-entry endpoint
description: POST /api/conversations/:conversationId/messages — canonical composer send; architecture, routing, idempotency, and runId bridging details
---

# V1.2 Turn-Entry Endpoint

**Route:** `POST /api/conversations/:conversationId/messages`  
**File:** `artifacts/api-server/src/routes/runs.ts`

## Architecture
1. Validate auth + conversation ownership (nexus_conversations)
2. Idempotency check — `idempotency_key` column on `contract_runs` (unique index per user_id)
3. Create canonical Run via `createRun()` → emits `run_created` to RunEventBus
4. Persist user `conversation_messages` row
5. Transition received → thinking via `updateRunStatus()` → emits `run_status`
6. Fire-and-forget internal fetch to `/api/chat` with `_contractRunId` in body
7. Return 202 `{runId, userMessageId, intent: null}` immediately

## Pipeline bridge (chat.ts lines 3174–3190)
`_contractRunId` in the body body bypasses `beginContractRun()` entirely and builds a `ContractRunCtx` directly. The existing `patchResForContractCompletion` still fires on the "done" SSE event → writes assistant message + transitions to succeeded.

## Routing constraint (V1.2)
Only `ws-{n}` conversationIds are supported. The production pipeline (chat.ts) is keyed on integer sessionId; reverse-mapping is `sessionId = parseInt(conversationId.slice(3))`. Non-ws IDs return 400 UNSUPPORTED_CONVERSATION_ID.

## Idempotency key
Column: `contract_runs.idempotency_key text`  
Index: `UNIQUE (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`  
Duplicate submit: returns existing `{runId, userMessageId, ..., duplicate: true}` without re-running pipeline.

**Why:** Lovable's composer uses client-generated UUIDs as idempotency keys. Without this, network retries would create duplicate runs and double-fire the pipeline.
