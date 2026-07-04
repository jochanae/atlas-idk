---
name: Workspace chat latency profile
description: Where time goes before first Claude token in workspace chat; what was fixed
---

## The three DB batch problem (fixed)

`artifacts/api-server/src/routes/chat.ts` had three sequential `await Promise.all` batches before calling Claude:

- **Batch 1** (~line 2870): 7 queries — project metadata, user, vercel, session, sessionSummary, narrative, zip
- **Batch 2** (~line 3150): 6 queries — errors, selfMap, portfolio, committed entries, parked, thinking receipts  
- **Batch 3** (~line 3195): 4 queries — AM, DNA, committed design plan, latest design plan status

Batch 2+3 only need `projectId`/`userId` (from request parse), NOT Batch 1 results. Fix: fire as early promises (`_earlyBatch2`, `_earlyBatch3`) immediately after `isFoundationMode`/`projectId`/`userId` are known (before any `await`), then `await` them later. Saves 300-500ms per request.

## Remaining sequential bottlenecks (not yet fixed)

- `resolveGithubTokenForRequest` — always sequential after Batch 1 (needs `project.githubToken`)
- Repo tree fetch — sequential after resolveGithubToken (needs `project.linkedRepo`)
- File selector Claude call — sequential after repo tree (Haiku, 2s timeout); only fires when BUILD_INTENT_RE matches AND repo is linked
- `bootstrapLocalWorkspace` — conditional, sequential

## Why build requests feel slow

For a local-workspace project (no GitHub repo linked): ~600ms DB + local tree read + main Claude call.
For a GitHub-linked project with build intent: ~600ms DB + repo tree fetch (up to 3s timeout) + file selector Haiku call (up to 2s) + file fetches + main Claude call = worst case 6-7s before first token.

**Why:** `CODE_CONTEXT_RE` guard (line 2966) already prevents repo tree fetch for conversational messages. The file selector call guard (line 3038) also requires `BUILD_INTENT_RE.test(message)` AND `repoData?.fullName` — so it only fires for code-intent messages with a linked repo.
