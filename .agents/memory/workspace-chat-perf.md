---
name: Workspace chat latency profile
description: Where time goes before first Claude token in workspace chat; what was fixed
---

## The three DB batch problem (fixed)

`artifacts/api-server/src/routes/chat.ts` had three sequential `await Promise.all` batches before calling Claude:

- **Batch 1** (~line 3033): 7 queries — project metadata, user, vercel, session, sessionSummary, narrative, zip
- **Batch 2** (now `_earlyBatch2`): 6 queries — errors, selfMap, portfolio, committed entries, parked, thinking receipts
- **Batch 3** (now `_earlyBatch3`): 4 queries — AM, DNA, committed design plan, latest design plan status

Batch 2+3 fire as early promises immediately after `isFoundationMode`/`projectId`/`userId` are known. Saves 300–500ms per request.

## Tier 2 + Tier 3 memory early-promise (fixed)

`loadTier2Block(projectId)` + `loadTier3Block(userId)` used to be awaited deep in system-prompt construction (after all 3 DB batches). Now fired as `_earlyTierMemory` alongside Batch 2+3, resolved lazily at the prompt-building site. Saves ~100–200 ms per request.

The condition at the fire point is `(!isFoundationMode && !isFlowMode && projectId && userId)`. The result is consumed only when `!isSelfContainedBuild` (which isn't known yet at fire time) — an unused result when isSelfContainedBuild=true costs essentially nothing.

## ON CONFLICT bug fixed (projectArtifacts.ts)

`ON CONFLICT ON CONSTRAINT project_artifacts_version_uniq` was silently broken — PostgreSQL `ON CONFLICT ON CONSTRAINT` only works for named CONSTRAINTs (via `ADD CONSTRAINT`), not for plain `CREATE UNIQUE INDEX`. The index existed but the conflict handler never fired, causing concurrent history_snapshot inserts to hit the unique violation instead of upserting. Fixed to `ON CONFLICT (project_id, type, version)`.

## Remaining sequential bottlenecks (unfixed)

- `resolveGithubTokenForRequest` — sequential after Batch 1 (needs `project.githubToken`)
- Repo tree fetch — sequential after resolveGithubToken (needs `project.linkedRepo`); 3s timeout
- File selector Haiku call — sequential after repo tree; 2s timeout; only fires when BUILD_INTENT_RE matches AND repo is linked
- `bootstrapLocalWorkspace` — conditional, sequential

## Why build requests still feel slow

For a local-workspace project (no GitHub repo linked): ~400ms DB + local tree read + main Claude call.
For a GitHub-linked project with build intent: DB + repo tree fetch (up to 3s) + file selector Haiku (up to 2s) + file fetches + main Claude call = worst case 5–6s before first token.

Guards that already limit this:
- `CODE_CONTEXT_RE` guard prevents repo tree fetch for conversational messages
- `BUILD_INTENT_RE.test(message) && repoData?.fullName` required for file selector call
