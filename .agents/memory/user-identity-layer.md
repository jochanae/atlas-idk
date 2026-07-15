---
name: User Identity Layer
description: Architecture for durable per-user identity (name, work style, tone) injected at the top of every Atlas system prompt — separate from the working-context global_narrative.
---

## Architecture

**Storage:** `users.user_identity TEXT` — added via `db.execute(ALTER TABLE ... ADD COLUMN IF NOT EXISTS)` in `backgroundInit()` in `api-server/src/index.ts`.

**Synthesis:** `synthesizeUserIdentity(opts)` in `api-server/src/lib/thinkingReceiptExtract.ts`.
- Fire-and-forget Haiku call after every Ask Atlas turn (alongside `synthesizeGlobalNarrative`)
- Currently skips if `user_identity` is already non-null (one-shot for now; add `user_identity_at` column for periodic refresh if needed)
- Reads last 30 nexus_messages; outputs 3–5 sentence profile
- Name hint from `users.name` is passed in so the model doesn't have to infer it

**Injection:** `nexus.ts` — at the END of the system-prompt-building block (lines ~2694–2716).
- Fetches `global_narrative`, `name`, AND `user_identity` in ONE SQL query
- Builds `identityLines[]` from name + identity profile + tone mirroring instruction
- **PREPENDS** the identity block to `systemPrompt` so it ranks above ALL project context:
  ```
  --- WHO YOU'RE TALKING WITH ---
  Name: Jochanae. Use this name naturally...
  [user_identity profile]
  Communication style: mirror the user's register...
  --- END IDENTITY ---
  ```

**Tone instruction (always injected, even without profile):**
"Mirror the user's register. If they're casual, be casual. If they use colorful or direct language, don't sanitize your tone. If memory is missing something, say that plainly instead of inventing a plausible-sounding profile."

## Why

`global_narrative` captures what the user has been working on (project context, open questions). `user_identity` captures WHO they are — name, work style, communication patterns. These are different concerns and must not be conflated. The narrative instruction previously said "never recite it" which trained Atlas to be vague about everything it knew, including the user's name.

## Pre-seeded profile for user id=1 (Jochanae Yawn / Jo)

Written directly into `users.user_identity` for user 1 based on Jo's own words in conversation. The profile covers: name + nickname (Jo), work style (vision-led + practical, persistent, fragmentation-sensitive, "do it right"), communication style (direct, thinks aloud, colorful language is expected and should be mirrored), project breadth, continuity needs, and product philosophy (real experiences, not impressive architecture).

## How to apply

- If `users.name` is set, it is ALWAYS injected — even before the identity profile is synthesized
- The identity profile synthesizes on first non-CHAT Atlas turn and then stays (one-shot)
- To force a re-synthesis, set `user_identity = NULL` for the user in the DB
- The `global_narrative` injection instruction was also cleaned up — removed "never recite it"
