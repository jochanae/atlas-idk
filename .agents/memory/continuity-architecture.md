---
name: Continuity Architecture — Transcript + Resume
description: The two-artifact handoff model for global conversation → workspace transition
---

# Continuity Architecture Decision

## The model (user-confirmed, production target)

Global conversation → project created → TWO things must happen:

1. **Full transcript copied into workspace thread** (for the human)
   - Purpose: trust and continuity. "Atlas came with me."
   - Implementation: re-link ambient nexus_messages rows to new projectId
   - WHERE: `nexusMessagesTable` rows with `projectId IS NULL` → set `projectId = newProjectId`

2. **Resume artifact generated from transcript** (for the system)
   - Purpose: compressed, structured signal for Manifest, builders, future agents
   - Implementation: POST /api/projects/:id/append-thread with conversation snapshot
   - Shape: { threadSummary, suggestedFirstBuild, intent, audience, tone, clarityScore }

## What's built (sandbox Phase 1)
- ✅ Resume artifact generated and stored
- ✅ threadSummary surfaced as workspace opening greeting (commitCarryover.greeting)
- ✅ Manifest reads Resume artifact
- ❌ Full transcript NOT copied into workspace thread (workspace chat still starts blank)

## The gap to close for production
When `performCreateProjectFromConversation` runs:
- After project creation, UPDATE nexusMessagesTable SET projectId = newProjectId
  WHERE projectId IS NULL AND userId = currentUser
- This re-links the ambient conversation to the project
- Workspace loads these as its chat history → user sees full conversation chain

## Why both matter
- Summary-only: feels efficient but emotionally empty, loses nuance
- Transcript-only: too noisy for Manifest/builders, they need compressed artifact
- Both: human gets the chain, system gets the brief

## Rule
**Do not remove the transcript copy step to "simplify."**
Resume is NOT a replacement for the transcript — they serve different consumers.
