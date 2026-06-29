---
name: Conversation-first routing
description: How the homepage composer Send creates a conversation record and navigates to workspace; streaming fix for chat.ts
---

## Rules

### Entry point flow
- Homepage composer Send → `POST /api/conversations` with `{ initialMessage }` → gets `{ id, conversationId }` → stores message in `OPENING_MESSAGE_STORAGE_KEY` + `OPENING_MESSAGE_PROJECT_ID_STORAGE_KEY` + pre-caches `atlas-cid-${conversationId}` → navigates to `/workspace/${conversationId}`
- `handleNewProject` (drawer New, homepage New button) → `POST /api/conversations` with empty body → pre-caches `atlas-cid-${conversationId}` → navigates to `/workspace/${conversationId}`
- `handleSubmit` in home.tsx: `shouldStayOnHome` defaults to `options?.forceStayOnHome ?? false` (was hardcoded true)
- Existing project list navigations still go to `/project/:id` (backward compat — old projects may not have a conversationId)

### /api/conversations route
- `POST /conversations` — creates project record + UUID conversationId, fires async Haiku title generation from `initialMessage`, returns `{ id, conversationId }`
- `GET /conversations/:conversationId` — resolves UUID to full project row
- Both behind `requireAuth` in routes/index.ts

### DB
- `projects.conversation_id` text column, nullable, unique index (WHERE NOT NULL)
- Added to schema at `lib/db/src/schema/projects.ts`
- Migration via `ensureColumns()` in `api-server/src/index.ts` — runs on boot, idempotent

### Frontend routing
- `/workspace/:conversationId` route renders `Workspace` directly in `App.tsx` (no redirect component)
- `Workspace` reads `conversationId` param via `useParams<{projectId?:string; conversationId?:string}>()`
- Resolution: `useState` lazy-initializer reads `sessionStorage.getItem('atlas-cid-${conversationId}')` (instant for fresh navigations from home.tsx). Deep links fall back to `GET /api/conversations/:cid` and cache the result.
- Rules of Hooks: all three new hooks declared before any conditional branching
- `isUnifiedShellPath` extended to include `pathname.startsWith("/workspace/")`
- `/project/:projectId` route still works — backward compat for existing projects and project list links

### Streaming fix
- Removed `writeStep(res, { verb: "Reviewing", target: "workspace context", phase: "scan" })` from chat.ts (line was ~2184 before edit)
- This fired immediately after SSE flush but before all DB pre-fetch, creating a "Reviewing…" loading indicator that disappeared when first token arrived — exactly the "pop" vs nexus smoothness gap
- Nexus never had this writeStep; removing it brings workspace first-token feel to parity

**Why:** The `writeStep` events set `liveStep` state in `useChatStream`, which renders a loading indicator in the assistant bubble. Any step fired before the model starts is dead time that makes streaming feel slower.

**How to apply:** If adding new pre-model writeStep calls in chat.ts, wrap them only around slow operations (GitHub tree fetch, repo clone) not around the general "loading context" phase.
