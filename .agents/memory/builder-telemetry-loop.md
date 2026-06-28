---
name: Builder Telemetry Loop Fix
description: How auto-apply telemetry ([LOCAL_APPLY_SUCCESS]) was causing runaway loops, and the three-part fix applied.
---

## The loop mechanism

1. Atlas emits FILE_EDIT blocks → frontend auto-applies them → `handleThinkingDone` receives `autoApplied: true` → `setPendingAutoApply(paths)`
2. A `useEffect` fires → calls `doSend("[LOCAL_APPLY_SUCCESS]...")` with `{ displayAs: "autoVerify" }`
3. `displayAs` is a frontend-only UI flag — it is NOT included in the POST body to `/api/chat`
4. Backend has no way to distinguish telemetry from human messages → persists as `role: "user"` in DB
5. The same message is also added to `messages` state → included in the `history` array on the next call → model sees it as a user turn → responds with more FILE_EDIT blocks → loop

**Why 8 times**: audit always returns PASSED (files exist), Atlas keeps trying the same config files.

## The three-part fix

### 1. Backend — skip DB insert for telemetry (chat.ts)
```ts
const isTelemetryEvent =
  message.startsWith("[LOCAL_APPLY_SUCCESS]") ||
  message.startsWith("[FILE_COMMITTED]") ||
  message.startsWith("[BUILD_VERIFY]");

if (!isFlowMode && !isScenarioMode && !isTelemetryEvent) {
  await db.insert(chatMessagesTable).values(...);
}
```

### 2. Frontend history filter — strip telemetry from model context (useChatStream.ts, doSend)
```ts
const history = currentMessages
  .filter((m) => m.displayAs !== "autoVerify")
  .map((m) => ({ role: m.role, content: m.content }));
```

### 3. Frontend loop guard — max 4 consecutive auto-applies (workspace.tsx)
- `autoApplyCountRef` (useRef<number>) incremented each time the `pendingAutoApply` effect fires
- If count > 4, `setPendingAutoApply(null)` and return without sending
- Reset to 0 in `handleThinkingDone` when Atlas responds WITHOUT `autoApplied: true` (human conversation restored)

**Why:** `displayAs: "autoVerify"` is purely a frontend UI bubble state — it never reaches the backend. Only the three-layer fix above enforces the "telemetry is one-way" invariant.
