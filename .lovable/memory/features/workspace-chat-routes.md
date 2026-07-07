---
name: Workspace chat routes (nexus is the live one)
description: /api/nexus/chat is the actual workspace chat path, NOT /api/chat. Run-card noise fixes belong in nexus.ts, not chat.ts.
type: feature
---

**Locked 2026-07-07** after wasted round-trip fixing the wrong route.

## Two chat routes exist
- `artifacts/api-server/src/routes/chat.ts` → `/api/chat` — classic path, legacy.
- `artifacts/api-server/src/routes/nexus.ts` → `/api/nexus/chat` — **the workspace path currently in use**.

## How to tell which is live
Log line `nexus: persisted execution_run for workspace turn` = nexus path. If a fix targets run-card / step-chip / operational-side-effect behavior in the workspace, it MUST land in `nexus.ts`, not `chat.ts`.

## Run-card guard pattern (already in nexus.ts as of 2026-07-07)
`nexus.ts` already computes `mode: "conversation"` when there are no file reads. The fix was an early-return skipping `persistExecutionRun` when `mode === "conversation"`. Any future noise-fix work should extend that guard, not duplicate it in chat.ts.

## WhisperGate status
- `chat.ts` has WhisperGate wired (Lovable's earlier work).
- `nexus.ts` uses its own `mode` computation and does NOT currently call `classifyIntent`. If we want unified intent routing, port WhisperGate into nexus.ts — but the conversation-mode early-return already solves the run-card symptom.

## Do not
- Do not write another Cursor handoff for this — backend lives in this repo, edit directly.
- Do not "fix" `chat.ts` for workspace symptoms without confirming logs show `/api/chat` traffic.
