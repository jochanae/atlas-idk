---
name: Global Narrative Memory
description: Cross-thread conversational continuity — living 2-3 sentence narrative synthesized after each Ask Atlas turn, injected into every conversation (both nexus.ts and chat.ts).
---

## Architecture

**Storage:** `users.global_narrative TEXT` + `users.global_narrative_at TIMESTAMPTZ` — added via `ensureColumns()` in `api-server/src/index.ts`.

**Synthesis:** `synthesizeGlobalNarrative(opts)` in `api-server/src/lib/thinkingReceiptExtract.ts`.
- Fire-and-forget Haiku call after every Ask Atlas turn (both projectified and not)
- 4-minute cooldown per user to avoid thrashing on rapid sends
- Reads last 16 nexus_messages for richer context than just the current turn
- Updates `users SET global_narrative = ..., global_narrative_at = now()`

**Trigger:** `nexus.ts` — alongside `maybeExtractThinkingReceipts`, fires `synthesizeGlobalNarrative` unconditionally (no focusProjectId guard — all Ask Atlas turns trigger it)

**Injection:**
- `nexus.ts`: reads `global_narrative` just before thinking receipts block; injects as `--- WHAT WE'VE BEEN WORKING THROUGH ---`
- `chat.ts`: added as 6th element in the `Promise.all` parallel fetch; extracted as `globalNarrative`; injected after `userMemoryText` block; guarded with `!isSelfContainedBuild`

**Instruction to Atlas:** "weave this in naturally when relevant, never recite it"

## Why

Thinking receipts are atomic observations (category/headline/body). The global narrative is a living paragraph — the conversational thread across all sessions. Different tool for a different problem: receipts = crystallized decisions; narrative = ongoing working context.

## How to apply

- Workspace chat (chat.ts) uses `!isSelfContainedBuild` guard — don't inject narrative into build-handoff mode
- The narrative accumulates via Ask Atlas turns only (nexus.ts trigger); workspace turns do NOT trigger synthesis (workspace has project-scoped session summaries for that purpose)
- Cooldown key is per-user (userId), not per-conversation
