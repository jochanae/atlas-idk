---
name: Nexus vs Chat routes
description: The workspace chat goes to /api/nexus/chat, not /api/chat. Fixes to run cards, whisperGate, or execution_run persistence must target nexus.ts.
---

## Rule
When fixing workspace chat behavior (run cards, step events, execution_run inserts), check BOTH routes:
- `artifacts/api-server/src/routes/chat.ts` → handles `/api/chat` (legacy; scheduled for deletion)
- `artifacts/api-server/src/routes/nexus.ts` → handles `/api/nexus/chat` — this is the ACTIVE workspace path

## Why
The workspace frontend uses `useNexusChatStream` → `/api/nexus/chat`. The `useChatStream` → `/api/chat` path exists but is not the active workspace path.

## How to apply
Any time a fix is needed for workspace chat behavior:
1. Fix it in nexus.ts first (active path)
2. Do not touch `/api/chat` unless explicitly asked (legacy)
3. Confirm with logs: look for `POST /api/nexus/chat` vs `POST /api/chat`

## Side-effect gate (WhisperGate + Just-Talk)
nexus.ts classifies intent via WhisperGate (or forces CHAT when `justTalk === true`) before the model loop.
`allowBuildSideEffects = intent === "BUILD" && !justTalk && !conversationModeActive` gates:
- `persistNexusExecutionRun`
- GitHub bootstrap
- Tier1 slot extraction
- Tool-loop enablement / forceCreate
- Step/run-card SSE events

CHAT and DECIDE turns never write an execution_run row. Classifier failure falls back to DECIDE (not BUILD).
Every turn emits SSE `event: meta` with `{intent, justTalk, fallback}` before the first text delta.
