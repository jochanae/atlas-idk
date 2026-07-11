---
name: Workspace blank-after-every-turn bug
description: onConversationId callback in URL-routed workspace triggers a history reload cascade that blanks the screen after each completed stream turn.
---

## The rule

In `useNexusWorkspaceBridge`, the `onConversationId` callback must NOT call `setConversationId` when `opts.initialConversationId` is set. The URL param is the authority. Calling it triggers a full cascade.

**Why:** Every stream `done` event fires `onConversationId(serverReturnedCid)`. If `setConversationId(serverCid)` is called unconditionally:

1. State changes → effect at line ~154 fires
2. Effect sees `conversationId (serverCid) !== opts.initialConversationId (URL param)`
3. `setConversationId(URL param)` + `historyLoadedRef.current = false`
4. History load effect re-fires (dep: conversationId changed back)
5. Fetches DB history → `setMessages(nexusMsgs)` during fetch window
6. **Blank screen** until fetch resolves — happens after EVERY turn

**How to apply:** In `onConversationId` callback:
```typescript
if (!opts?.initialConversationId) {
  setConversationId(cid);
}
// Always persist to localStorage:
if (pid) storeConversationId(pid, cid);
```

Non-URL-routed workspaces (no initialConversationId) still update state as before — server-assigned IDs are how they get their first conversation.
