---
name: atlasIdentity.ts is a template literal
description: Gotcha when editing the Atlas system prompt file — backticks in inserted text break the string.
---

`artifacts/api-server/src/lib/atlasIdentity.ts` exports its prompt content as one large backtick-delimited template literal string. Inserting new prompt text that itself contains backticks (e.g. to mark up tool/function names like `` `read_file` ``) breaks the enclosing string and produces confusing TS1005/TS1443 parse errors pointing at unrelated lines.

**Why:** the parser doesn't error at the inserted backtick — it errors wherever the now-prematurely-closed template literal next hits invalid syntax, which can be far from the actual mistake.

**How to apply:** when adding text to this file (or any other prompt-as-template-literal file), use plain text or single/double quotes for emphasis instead of backticks. If a typecheck error in this file looks nonsensical, check for a stray backtick first.
