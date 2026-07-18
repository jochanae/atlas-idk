---
name: B2 Staged Attachment Lifecycle
description: Correct lifecycle for staged file attachments — callback pattern, SubmissionResult, sent-preview ownership, doSend classification
---

## The invariant
Never call `staged.clearFiles()` before `atlasConv.submit()` (or any transport) confirms success. Files cleared before success are unrecoverable on failure — the user loses their attachments with no retry path.

## The callback pattern
`AtlasConversationSubmission` carries four optional lifecycle callbacks wired from `useStagedAttachments`:

```ts
void atlasConv.submit({
  text,
  stagedAttachments: staged.readyFiles,
  onMarkConverting: staged.markConverting,   // "ready" → "converting"
  onMarkFailed: staged.markFailed,           // → "failed" per file
  onRestoreToReady: staged.restoreToReady,   // "converting" → "ready" on transport failure
  onClearSent: staged.clearSent,             // remove + revoke only confirmed-sent files
});
// Surface code DOES NOT touch staged state after this call.
```

`submit()` drives the full 7-step lifecycle internally:
1. Mark ready IDs as converting
2. Per-file `fileToBase64Safe` with error isolation (Promise.allSettled or individual try/catch)
3. `markFailed(id, { code, message, retryable })` for each conversion failure
4. Bail with ok:false if nothing remains to send
5. `nexusChatStream.send(...)` — the transport
6. On success: `clearSent(sentIds)` — only confirmed-sent IDs
7. On transport failure: `restoreToReady(convertingNotFailed)` — files go back to "ready"

## StagedFileStatus
`"ready" | "converting" | "failed"` — no "error" (superseded), no "validating" (B3).

## StagedFileError structure
```ts
type StagedFileError = { code: string; message: string; retryable: boolean }
```
`code` is machine-readable (e.g. `"CONVERSION_FAILED"`, `"TOO_LARGE"`, `"MAX_COUNT"`).
`code` is NOT a display string — use `error.message` in the UI.

## SubmissionResult
```ts
type SubmissionResult =
  | { ok: true; clientMessageId: string }
  | { ok: false; error: SubmissionError; failedAttachmentIds?: string[] };
```
Surfaces that call `submit()` must await the result if they need to react to failure.
Most surfaces fire-and-forget (`void atlasConv.submit(...)`) and rely on the callbacks.

## Sent-preview ownership (confirmed)
`useNexusChatStream.send()` stores `allFileAttachments` (already-converted `{ base64, mediaType, name }[]`) directly on the optimistic user message (`message.attachments`). `UserBubble` renders from `message.attachments[].base64` — NOT from staged `previewUrl` (object URL). Revoking staged object URLs after send does NOT break the sent message preview.

## home.tsx path map
- **Ask Atlas path**: passes callbacks into `askAtlasConv.submit()`. No surface-level clear.
- **shouldStayOnHome path**: `staged.markConverting(readyIds)` is called before the try block. Per-file `Promise.allSettled` for conversion. `staged.clearSent(sentIds)` on success. `staged.restoreToReady(stillConverting)` on transport failure.
- **Project-creation path (navigate away)**: `staged.markConverting(readyIds)` before the try block. On failure: `staged.restoreToReady(readyIds)` in catch. On success: component unmounts, cleanup revokes URLs.

## workspace.tsx doSend classification
`const useNexusWorkspaceChat = true` is hardcoded at line ~4716. The `if (!useNexusWorkspaceChat)` branch is UNREACHABLE. The legacy `handleSend` inside that branch (which has `setAttachedFiles([])`) is dead code. `doSend` itself is still live for: opening-message auto-continue, `handleRegenerate`, first-run init — all text-only, no staged files. Do NOT apply B2 staged lifecycle to `doSend` — those paths don't use staged attachments.

## Conversion path inventory (2026-07-18)
| Path | Status | Notes |
|------|--------|-------|
| `useAtlasConversation.ts` | Canonical B2 | lifecycle-gated |
| `home.tsx` shouldStayOnHome | B2 lifecycle-gated | allSettled per-file |
| `home.tsx` project-creation sessionStorage | B3 migration | stores for workspace handoff, NOT the nexus send |
| `ActiveRuns.tsx` | Out of scope | Composer sheet, separate surface |
| `WorkspaceConversationSurface.tsx` | Dormant | not mounted from workspace.tsx |
| `FlowPanel.tsx` | Unrelated | Flow canvas image analysis |
| `AccountHubPanel.tsx` | Unrelated | Avatar upload |

**Why:** The invariant exists because object URL revocation is permanent — once revoked, the staged preview and the File reference are both gone from the controller's perspective. If the transport fails after a premature clear, there is no recovery path and the user must reselect files.

**How to apply:** Whenever adding a new send path that handles staged files, always wire the four callbacks from `useStagedAttachments` into the `AtlasConversationSubmission` object. Never call `staged.clearFiles()` as part of a send flow. `clearFiles()` is reserved for explicit cancel actions and component unmount cleanup.
