---
name: Conversation-first routing
description: How the homepage composer Send creates a conversation record and navigates to workspace; streaming fix for chat.ts
---

## Rules

### Entry point flow
- Homepage composer Send → `POST /api/conversations` with `{ initialMessage }` → gets `{ id, conversationId }` → stores message in `OPENING_MESSAGE_STORAGE_KEY` + `OPENING_MESSAGE_PROJECT_ID_STORAGE_KEY` → navigates to `/project/:id`
- `handleNewProject` (drawer New, homepage New button) → `POST /api/conversations` with empty body → navigates to `/project/:id`
- `handleSubmit` in home.tsx: `shouldStayOnHome` defaults to `options?.forceStayOnHome ?? false` (was hardcoded true)

### /api/conversations route
- `POST /conversations` — creates project record + UUID conversationId, fires async Haiku title generation from `initialMessage`, returns `{ id, conversationId }`
- `GET /conversations/:conversationId` — resolves UUID to full project row
- Both behind `requireAuth` in routes/index.ts

### DB
- `projects.conversation_id` text column, nullable, unique index (WHERE NOT NULL)
- Added to schema at `lib/db/src/schema/projects.ts`
- Migration via `ensureColumns()` in `api-server/src/index.ts` — runs on boot, idempotent

### Frontend routing
- `/workspace/:conversationId` route renders `WorkspaceByConversationId` in `App.tsx`
- `WorkspaceByConversationId` fetches `/api/conversations/:cid`, then `replace`-navigates to `/project/:id`
- `isUnifiedShellPath` extended to include `pathname.startsWith("/workspace/")`

### Streaming fix
- Removed `writeStep(res, { verb: "Reviewing", target: "workspace context", phase: "scan" })` from chat.ts (line was ~2184 before edit)
- This fired immediately after SSE flush but before all DB pre-fetch, creating a "Reviewing…" loading indicator that disappeared when first token arrived — exactly the "pop" vs nexus smoothness gap
- Nexus never had this writeStep; removing it brings workspace first-token feel to parity

**Why:** The `writeStep` events set `liveStep` state in `useChatStream`, which renders a loading indicator in the assistant bubble. Any step fired before the model starts is dead time that makes streaming feel slower.

**How to apply:** If adding new pre-model writeStep calls in chat.ts, wrap them only around slow operations (GitHub tree fetch, repo clone) not around the general "loading context" phase.
