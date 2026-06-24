---
name: Surface Manifest
description: Atlas product bible — four-question contract per surface; what each screen promises, what it must never do; built through live audit June 24 2026
---

# Surface Manifest

Full document lives at `.local/surface-manifest.md`. Read that file before touching any surface.

## Why this exists
Atlas had a surface contract problem, not a capability problem. Each screen was accumulating features without a clear promise to the user. This audit defines what every surface IS and IS NOT.

## Four questions per surface
1. What is this surface?
2. What should the user feel?
3. What should Atlas do here?
4. What should never happen here?

## Dead Card Standard (global rule)
Three valid states for every widget: Alive (real data) | Unavailable (explain why) | Empty (what to do next).
Never: 0, blank, "Could not load", silent nothing.

## Homepage — Audit complete
- State name: Ambient State (NOT "Idle" — Atlas is never idle)
- Three layers: Ambient Atlas (passive) · Atlas Thinking (proactive) · Atlas Acting (composer)
- Atlas Composer (rename from "Active Runs") stays on homepage — it's a cross-ecosystem command center, not a build monitor
- NEXT MOVE stays — it's Atlas's most differentiated feature
- Known fixes: rename Active Runs, fix Portfolio Health dead state, fix Cognitive Momentum zero state, fix Focus selector mobile cramping

## Global Insights, Workspace, Portfolio
Audit in progress — see `.local/surface-manifest.md` for current state.

**Why:** Without this document, every agent switch risks adding features that break the surface contract. Read this before building anything on any surface.
**How to apply:** Before any UI change, check: does this fit the surface's promise? Does it violate the "never" list?
