---
name: Atlas Provenance Layer
description: Planned lightweight source attribution for Atlas memory claims — why does Atlas think this?
---

# Atlas Provenance Layer

## The rule
When Atlas references memory, the user should be able to ask "where did that come from?" and get an answer without breaking flow.

## Desired UX
Beside memory-backed claims, show a small `ⓘ` affordance:
> Onboarding friction is undiagnosed.  ⓘ

Tap `ⓘ` opens a small panel:
```
Source
✓ Ledger decision — "Onboarding friction is undiagnosed" (saved 2 days ago)
✓ Project resume — open question: actual drop-off point unknown
Confidence: High
```

## Source types to support
- Ledger
- Resume
- GitHub / Repo scan
- Current conversation
- Previous workspace thread
- Portfolio memory
- Atlas inference (important: Atlas can surface "this is an inference, not a stored fact")

## What NOT to build
- Full citations dashboard
- Timeline explorer
- Version diff system
- Massive source graph

## Why
As Atlas gets smarter, trust and explainability become more important than new features. Users will ask: "Is this something I told you? Is this from the codebase? Is this an assumption?" The provenance layer answers that without breaking flow.

**Why:** Lightweight attribution prevents Atlas from feeling like it's making things up. The "Atlas inference" source type is critical — Atlas should be able to say explicitly when something is inferred vs stored.

**How to apply:** Build after the memory architecture is fully stable (HUD, resume, ledger all working). Start with just the ⓘ affordance in AtlasMemoryHUD's expanded panel. Do not add to every message bubble — only memory-backed claims.
