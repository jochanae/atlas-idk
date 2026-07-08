---
name: Agent-loop silent file-edit drop
description: Root cause and fix pattern for BUILD responses that complete successfully but write zero files to disk when routed through the agent loop.
---

## The failure mode

A chat response can look completely successful (full text, `run_status=completed`, no error thrown) while writing **zero files to disk**. This happens specifically when a request is routed through the agent loop (`runAgentLoop`) instead of the classic streaming/text-parsing path.

The agent loop extracts file edits exclusively from `sideEffects.fileEdits`, which is only populated by actual tool calls (e.g. `edit_file`). It has no fallback parser for the legacy `FILE_EDIT_START` / `FILE_EDIT_CONTENT` / `FILE_EDIT_END` text block format. If the model emits that legacy text format instead of calling the tool, the edits are silently discarded — the response still reads as a coherent "I built X" message, but nothing lands on disk.

**Why it happens:** the shared base system prompt (`DEV_SYSTEM_PROMPT` in `chat.ts`) still teaches the legacy text format for the classic path, and the agent-loop's tool-usage guidance didn't previously forbid it — so under certain conditions the model reaches for the format it was taught first.

## How to diagnose

Check `agent_runs` for the message in question:
- `tools_called: []` and `step_count: 1` with `stop_reason: "completed"` — the loop ran and finished, but called zero tools.
- Cross-check the message content for literal `FILE_EDIT_START` text — if present alongside an empty tool-call list, this is the mismatch.

**Why:** `agent_runs` is the only place that distinguishes "agent loop ran but did nothing" from "classic path streamed fine." The classic path was confirmed robust (including under simulated client aborts) — it is not the failure surface.

## Fix pattern (defense in depth, not just prevention)

1. **Prevent**: make the agent-loop tool guidance explicitly override the base prompt — state that `FILE_EDIT_START` text does nothing in this mode and the model must call the edit tool.
2. **Detect + self-heal**: after the agent-loop stream completes, if `sideEffects.fileEdits` is empty but the full text contains `FILE_EDIT_START`, parse it with the same extractor the classic path uses, write the files directly, and inject the recovered edits into `sideEffects.fileEdits` so downstream persistence (`fileEditsJson`) is correct.
3. **Surface, never silence**: whether recovery succeeds or fails, append a visible note to the response text (e.g. "_Recovered N file edit(s)..._" or an explicit failure note). A silent recovery is only half a fix — the user/agent must be able to tell a mismatch occurred.

**How to apply:** any time a new "loop" or "agentic" code path is added alongside an existing text-based/legacy path, assume the model can still emit the legacy format (base prompts are shared) and build the same detect+recover+surface pattern rather than assuming prompt changes alone will prevent it.
