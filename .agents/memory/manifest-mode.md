---
name: ManifestMode Architecture
description: How ManifestMode V1 is built — overlay pattern, data sources, lock logic, and what's still pending
---

## Architecture

ManifestMode is a workspace **state**, not a tab or navigation destination.

- `manifestModeOpen: boolean` in workspace.tsx controls it
- Renders as `position: absolute; inset: 0; z-index: 40` inside the workspace canvas container
- Manifest pill (UnifiedSubheader) sets `manifestModeOpen = true` — does NOT call handleManifest()
- Generation (handleManifest) only fires when user picks a target and clicks Materialize

## Component: ManifestMode.tsx

Sub-sections:
1. **DnaSnapshot** — fetches `/api/projects/:id/genome`, derives 4 anchors client-side
2. **BuildTargets** — static V1 list: Landing Page, Database Schema, Web App, Beta Program, Investor Deck, Mobile App
3. **MaterializeAction** — fires `handleManifest(selectedTarget)` on click
4. **ExecutionFeed** — V1: label only, points to Changes tab

## DNA Anchor derivation (client-side)
- Core Intent → `genome.purpose`
- Core Audience → `genome.audience`
- Brand Posture → `genome.coreEmotion`
- Surface Strategy → derived: present if purpose + audience + clarity ≥ 50

Completeness states: `absent` (field missing), `thin` (field present but clarity below threshold), `sufficient`

## Target lock logic (client-side, V1)
| Target | Unlock condition |
|--------|-----------------|
| Landing Page | purpose + clarity ≥ 30 |
| Database Schema | purpose + clarity ≥ 25 |
| Web App | purpose + audience + clarity ≥ 50 |
| Beta Program | purpose + audience + clarity ≥ 55 |
| Investor Deck | purpose + audience + coreEmotion + clarity ≥ 65 |
| Mobile App | purpose + audience + coreEmotion + clarity ≥ 75 |

Warning state: partially met conditions.

## handleManifest() changes
- Now accepts `selectedTarget?: string`
- Passes `target` in POST body to `/api/manifest/decide`
- Backend doesn't need to change for V1

## Still pending
- ManifestPanel.tsx (420 lines) — still orphaned, still imports missing hooks from api-client-local
- Tab visual demotion (Changes/Blueprints/Artifacts/Console as "outputs" not primary nav) — not yet done
- ExecutionFeed as a real component wrapping SessionTimeline — V2
- AI-generated target list (vs static) — V2

**Why:** The three-fragment manifest problem (BlueprintsTab card + broken ManifestPanel + manual pill) collapsed into one overlay state. Mental model: Atlas understands enough → these realities are possible → choose one → materialize.
