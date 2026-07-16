---
name: Nexus Run Lifecycle Restoration
description: Phase 1 data-path fixes for the regressed Nexus build lifecycle; which breaks were found and what was changed.
---

## Root Cause
The Nexus path (useNexusWorkspaceChat=true) had several data-flow breaks that caused the build lifecycle surfaces to appear empty:

## Break 1 — runId never reached ChatMessage (FIXED)
- `toChatMessage()` in `useNexusWorkspaceBridge.ts` never mapped `nm.runId → msg.runId`
- `NexusMessage.runId` WAS set correctly from the done event (`runId: activeRunId`)
- Fix: added `...(nm.runId ? { runId: nm.runId } : {})` to toChatMessage output

## Break 2 — runCardAfterIdx always returned -1 (FIXED)
- Used `m.id === execLatestRun.messageId` to anchor the receipt card
- But `m.id` on the Nexus path is positional (`idx + 1`), NOT the DB row ID
- `execLatestRun.messageId` is a nexus_messages DB integer — never matched
- Fix: changed to `m.runId === execLatestRun.id` (both are the execution_runs UUID)
- Also updated both `suppressDeliverableReceipt` checks (inline + trailing) in ChatStream.tsx

## Break 3 — generatedArtifacts lost on reload (FIXED)
- nexus.ts never persisted `generatedArtifacts` to `nexus_messages.metadata`
- Thread endpoint never returned it either
- Fix: added fire-and-forget metadata UPDATE in nexus.ts (same pattern as imageGen/decisionArtifacts)
- Fix: thread endpoint now returns `generatedArtifacts: (m.metadata as any)?.generatedArtifacts ?? null`

## Break 4 — html-app never triggered Preview panel (FIXED)
- useNexusChatStream done handler had no dispatch of axiom:open-preview for html-app artifacts
- Fix: after setMessages, fetches HTML from downloadUrl and dispatches axiom:open-preview { source:"sandbox", content: html }

## Break 5 — ArtifactCreatedCard had no iframe for html-app (FIXED)
- ArtifactCreatedCard was a generic download card for all types
- Fix: added HtmlAppCard variant with sandboxed iframe (srcdoc from fetch), expand/collapse, copy, safety gate
- Added `preview?: { safe?, reasons?, html? }` field to GeneratedArtifactMeta, ChatMessage.generatedArtifacts, NexusMessage.generatedArtifacts

## What was confirmed working (pre-existing)
- nexus.ts creates execution_runs at start of turn, persists steps incrementally via appendLiveStepAsync
- WorkspaceRunCard "Details" → dispatches axiom:open-changes { runId: run.id } (UUID)
- axiom:open-changes handler → sets leftTab="diff" + ?runId=UUID in URL → ViewChangesPanel reads focusedRunId
- ViewChangesPanel queries execution_run_steps by runId → Timeline/Changes surfaces

**Why:** These were regressions caused by incomplete Nexus path wiring, not new feature gaps.
**How to apply:** Verify after any future toChatMessage changes that runId is still mapped.
