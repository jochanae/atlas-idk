---
name: Thread Continuity Architecture
description: How Ask Atlas and Workspace share one conversation thread via localStorage key coordination
---

## Rule
When a project is created from Ask Atlas (promote), the Ask Atlas conversationId (`askAtlasConversationId ?? activeConversationId`) is written to `localStorage("nexus_conv_${projectId}")`. Workspace reads that key on mount via `useNexusWorkspaceBridge` — so they share one thread, no fork.

**Why:** The user's model is "Conversation → Project" (thread is primary, project is optional association). Before this, Ask Atlas and Workspace each maintained independent threads that diverged at the promote moment.

**How to apply:**
- Any new project creation path must write the source conversationId to `nexus_conv_${projectId}` in localStorage.
- `openAskAtlasFromWorkspace(navigate, conversationId?)` — pass the workspace's `nexus_conv_${id}` conversationId to carry the thread back to Ask Atlas.
- If Ask Atlas conversationId is set, prefer it over activeConversationId (Ask Atlas thread is more specific).
