---
name: Phantom-work pattern root cause
description: Why Atlas says "let me look" then returns nothing — WhisperGate CHAT + no context + no tools
---

## The pattern
Inside a focused project, user asks a project-knowledge question. Atlas responds with "Give me a second" or "Let me pull that up" and then the response ends with no result. Zero tool calls recorded in execution_runs.

## Root cause — three cooperating failures

1. **WhisperGate misclassification**: Questions like "what does this project do?", "is our description stale?", "what are we missing?" were classified as CHAT (pure conversation), not DECIDE. The classifier treated them as thinking-aloud.

2. **CHAT context starvation**: CHAT + focused project injected only the project name. No DNA (purpose/audience/wedge), no Ledger decisions, no description. The model knew it was inside a project but had no information about it.

3. **CHAT tool prohibition**: CHAT system prompt says "Do NOT call tools" and streamClaude receives `tools: false`. Model cannot retrieve anything even if it wants to.

Result: model knows it's in a project, knows Atlas has project data, but can't access any of it. Produces future-action language ("let me look") because it's trained to be helpful — but it literally cannot complete the promised action.

## Fix applied (nexus.ts + whisperGate.ts)

- **WhisperGate**: DECIDE definition expanded to include any question requiring project data. Seven concrete examples added (project description, capabilities, Ledger, history comparisons). CHAT definition now explicitly excludes project-state questions.

- **CHAT + focused project context**: Now async-loads DNA (purpose/audience/wedge/differentiator/stage/open questions) + filters `committedEntries` for the focused project. Injected into system prompt. Model can answer without tools.

- **Hard output rule in CHAT prompt**: Forbidden-phrase list added. "Give me a second", "let me look", "I'll pull that up" etc. are banned as terminal statements. Model must either answer from context or say exactly what it doesn't have.

## How to apply
Any time a model says "let me look" in a project workspace and no `execution_run` is created — check WhisperGate classification first (it's logged). If CHAT, the context injection and hard rule should prevent the phantom response. If DECIDE with no tool call, check `allowToolAccess` flag and whether `streamClaude` received `tools: true`.

**Why:** The phantom-work pattern is disqualifying for trust. Users notice immediately when Atlas announces an action and then produces nothing — it erodes confidence faster than a blank screen.
