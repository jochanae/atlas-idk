---
name: Agent-loop lens gating and chat route error handling
description: Why Flow/Scenario lens turns used to stall silently, and the fix pattern used
---

The `/api/chat` route handler ran the entire multi-thousand-line turn after SSE headers were already flushed, with no top-level try/catch. Any uncaught error deep in the turn (e.g. a tool failure) left the client's connection open forever — no reply, no saved history, no visible error.

**Why:** SSE responses can't fall back to a normal HTTP error response once headers are sent, so an unguarded async route handler turns exceptions into indefinite hangs instead of visible failures.

**How to apply:** Any SSE/streaming route handler should wrap its full body in try/catch, and the catch must (a) persist a recoverable-error message to history if a session exists, and (b) write a terminal SSE event and end the response — never leave the connection open with nothing sent.

Separately: Flow and Scenario lenses used to skip both user-message persistence AND the agent loop (which is the only place cross-project reference tools are wired in) unconditionally. Fixed by keying persistence on `sessionId` presence (Scenario always has one; Flow may not) rather than on lens flags, and by allowing the agent loop to run whenever `sessionId > 0`, not just outside Flow/Scenario.
