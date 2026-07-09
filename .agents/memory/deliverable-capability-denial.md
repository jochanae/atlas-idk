---
name: LLM capability denial despite available tool
description: Atlas denied it could generate .pptx even after generate_deliverable was correctly wired into the tool registry — the model has no way to know a tool exists/works just because it's schema-available; it needs explicit prompt-level capability assertion.
---

Wiring a tool into the registry/schema list is not sufficient to stop the model from denying the capability in prose. Anthropic models have strong priors that they "can't produce binary files" and will assert that limitation confidently even when a working tool for exactly that purpose is present in their tool list for the turn.

**Why:** The model doesn't reason from "this tool is in my tools array" to "therefore I have this capability" — especially under intent-gated tool availability (WhisperGate CHAT/DECIDE turns strip tools entirely), where the model has learned tool absence is normal and defaults to its trained-in capability disclaimer instead of saying "not available this turn."

**How to apply:** For any capability that fights a strong model prior (native file generation, binary output, "I can't browse/execute/etc"), add an explicit, unconditional system-prompt block asserting the true capability and forbidding the specific denial phrasing — independent of per-turn tool availability gating. Also instruct: if the tool call fails, report the real error, never reinterpret failure as "I don't have this at all." Verify with a live SSE trace (tool call step + artifact_created event + actual binary download), not just a typecheck or a chat reply that "sounds right."
