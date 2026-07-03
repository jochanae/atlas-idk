---
name: Thinking Receipts Architecture
description: Fire-and-forget insight extraction after Ask Atlas turns; DB table, extraction lib, route, and frontend strip component.
---

## What it is
A silent Haiku pass that runs after every unprojectified (Ask Atlas) nexus turn and extracts structured "thinking receipts" — named tensions, surfaced assumptions, forming commitments, open questions, insights, etc.

## Backend

**Table**: `thinking_receipts`
- Columns: `id, user_id, conversation_id, turn_index, headline, body, category, confidence, dismissed, created_at`
- Created via `ensureColumns` in `artifacts/api-server/src/index.ts`
- Indexes on `(user_id, conversation_id, created_at DESC)` and `(user_id, dismissed, created_at DESC)`

**Extraction**: `artifacts/api-server/src/lib/thinkingReceiptExtract.ts`
- `maybeExtractThinkingReceipts(opts)` — fire-and-forget, in-flight guard per `${conversationId}:${turnIndex}`
- Haiku prompt extracts 0–3 receipts, omits confidence < 60
- Valid categories: Tension / Assumption / Desire / Commitment / Question / Insight / Blocker / Decision

**Hook in nexus.ts** (around line 2502):
```ts
if (!focusProjectId && effectiveConversationId) {
  void maybeExtractThinkingReceipts({ userId, conversationId: effectiveConversationId,
    turnIndex: Math.floor(dbMessages.length / 2), userMessage: body.message ?? "", atlasResponse: visibleContent });
}
```
Only fires for Ask Atlas turns (no project focus).

**Routes**: `artifacts/api-server/src/routes/thinkingReceipts.ts`
- `GET /thinking-receipts?conversationId=&limit=` — active receipts for user
- `PATCH /thinking-receipts/:id/dismiss` — soft dismiss
- `DELETE /thinking-receipts/:id` — hard delete
- Registered in `routes/index.ts` under `requireAuth`

## Frontend

**Component**: `artifacts/atlas-frontend/src/components/home/ThinkingReceiptsStrip.tsx`
- Self-contained: `useThinkingReceipts` hook + `ThinkingReceiptsStrip` + `ReceiptCard`
- Polls `4000ms` after `isStreaming` transitions `true → false`
- Deduplicates by ID via `seenIds` ref; resets on conversationId change
- Dismissal: optimistic (local set) + fire PATCH to server

**Integration**: `AskAtlasSurface.tsx` — strip inserted after `messages.map()` loop, inside the scroll container.
```tsx
<ThinkingReceiptsStrip
  conversationId={conversationId}
  isStreaming={isStreaming}
  turnCount={messages.filter(m => m.role === "assistant" && !m.streaming).length}
/>
```

## Why
**Why:** Ask Atlas is ephemeral — no project, no ledger, no memory. Receipts give the conversation a lightweight persistence layer without requiring the user to manually save anything.

## How to apply
- Phases 4–6 build on this: Phase 4 = `THINKING_STABLE` token from Atlas signals a crystallization moment; Phase 5 = workspace mode awareness; Phase 6 = decision artifact from a receipt.
- If extending categories, update both the Haiku prompt AND the `CATEGORY_COLORS` map in `ThinkingReceiptsStrip.tsx`.
- The 4s poll delay is intentional — Haiku extraction takes 2–4s. Do not reduce below 3s.
