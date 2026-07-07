---
name: Nexus vs Chat routes
description: The workspace chat goes to /api/nexus/chat, not /api/chat. Fixes to run cards, whisperGate, or execution_run persistence must target nexus.ts.
---

## Rule
When fixing workspace chat behavior (run cards, step events, execution_run inserts), check BOTH routes:
- `artifacts/api-server/src/routes/chat.ts` → handles `/api/chat`
- `artifacts/api-server/src/routes/nexus.ts` → handles `/api/nexus/chat` — this is the ACTIVE workspace path

## Why
The workspace frontend uses `useNexusChatStream` → `/api/nexus/chat`. The `useChatStream` → `/api/chat` path exists but is not the active workspace path. Confirmed in logs: POST to `/api/nexus/chat` produces `nexus: persisted execution_run for workspace turn`.

## How to apply
Any time a fix is needed for workspace chat behavior:
1. Fix it in nexus.ts first (active path)
2. Mirror in chat.ts for consistency (inactive but preserved)
3. Confirm with logs: look for `POST /api/nexus/chat` vs `POST /api/chat`

## persistNexusExecutionRun guard
nexus.ts computes `mode = fileReadActions.length > 0 ? "operational" : "conversation"`.
Conversational turns (mode === "conversation") skip the DB insert entirely — no run card rendered.
