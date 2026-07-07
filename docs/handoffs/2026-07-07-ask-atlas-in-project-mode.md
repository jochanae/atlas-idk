# Handoff — Ask Atlas in-project mode (backend)

**Date:** 2026-07-07
**Scope:** `artifacts/api-server/src/routes/chat.ts` (+ possibly `nexus.ts`)
**Priority:** Small. One-line kind of change. Blocks frontend plan step 4.

## Context

Frontend is landing the "same conversation, two views" seam (see plan). When the user opens Ask Atlas *while inside a workspace*, the frontend will send:

- the workspace's `sessionId` as the **active conversation/session reference**
- the workspace's `projectId`
- a hidden system-role seed built from the project's memory brief + last user goal + recent events + unresolved decisions

Today the Ask Atlas chat path treats its own `conversationId` as canonical and ignores workspace `sessionId`, so Ask Atlas would start a brand new thread with no project memory — the exact "blank global chat" behavior we're trying to kill.

## What to change

In the Ask Atlas chat handler (whichever route the surface posts to — currently `/api/chat` or the nexus ask-atlas variant, confirm from `AskAtlasSurface` payload):

1. **Accept `projectId` + `sessionId` from the request body.** If both are present, treat this call as an **in-project Ask Atlas** turn:
   - Use the project's memory (same source Workspace uses) as system context
   - Persist the turn under the supplied `sessionId` so Ask Atlas and Workspace share one thread of messages
   - Skip creating a new Ask Atlas conversation row

2. **When `projectId` is absent**, behavior is unchanged (true global Ask Atlas from `/home`).

3. **Do not overwrite** the workspace session's own tier1 memory from Ask Atlas turns unless the turn already qualifies under existing rules — Ask Atlas messages should be visible in the workspace transcript but should not silently reshape project memory.

## Frontend contract the backend must honor

Request body (POST `/api/chat` or equivalent) from Ask Atlas when in-project:
```json
{
  "message": "...",
  "projectId": 123,
  "sessionId": 456,
  "askAtlasContextSeed": "Continuing in <project name> workspace.\nBrief: ...\nLast goal: ...\nRecent: ...\nOpen decisions: ..."
}
```

- `askAtlasContextSeed` is prepended as a system-role message on the first turn only (frontend will stop sending it after the first exchange).
- If the backend prefers to build the seed server-side from the project's own memory, ignore `askAtlasContextSeed` — the frontend seed is a fallback, not the source of truth.

## Non-goals

- No schema changes.
- No new endpoint.
- Do not touch DecisionCatch, WhisperGate, or Output Guard logic.
- Do not change global Ask Atlas behavior (no `projectId` → today's behavior).

## Verification

1. Open a workspace. In frontend, tap "Conversation" pill (once step 5 lands).
2. Send a message. Backend logs should show `projectId` + `sessionId` on the request.
3. Reload the workspace. The Ask Atlas turn appears in the workspace transcript under the same session.
4. Open Ask Atlas from `/home` (no project). Behavior identical to today.

## Hand back to Lovable

Reply in this doc with:
- Which route file you touched
- Whether the seed is built server-side from memory (preferred) or the frontend seed is used
- Any field name changes so the frontend payload matches

---

## Backend reply (2026-07-07)

**Route touched:** `artifacts/api-server/src/routes/nexus.ts` — `POST /api/nexus/chat` (Ask Atlas posts here via `useNexusChatStream`, not `/api/chat`).

**Context seed:** Built **server-side** from project memory (`loadTier1ForProject` + project memory store), last user goal (`chat_messages` for the session), genome open questions, and ledger in-tension/parked entries. The frontend `askAtlasContextSeed` is accepted only as a **first-turn signal** (presence triggers injection); its string content is ignored.

**Frontend payload (no field renames):**

```json
{
  "message": "...",
  "projectId": 123,
  "sessionId": 456,
  "askAtlasContextSeed": "..."
}
```

Optional: `focusProjectId` still works; when both `projectId` and `sessionId` are present, in-project mode takes precedence.

**In-project behavior (`projectId` + `sessionId` both set):**
- History loaded from `chat_messages` for the session (shared workspace transcript)
- User + assistant turns persisted to `chat_messages` under `sessionId` (no new `nexus_messages` / conversation row)
- `conversationId` is not auto-generated; `done` event returns `{ sessionId, projectId, inProjectAskAtlas: true }` instead of `conversationId`
- Tier 1 updates follow existing tool confidence rules only (no extra memory writes)
- Global Ask Atlas unchanged when `projectId` is absent

**Log line for verification:** `nexus: in-project Ask Atlas turn` with `{ projectId, sessionId }`.
