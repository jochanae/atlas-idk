# Milestone 2.3 Phase C — Constitution on live chat

**Date:** 2026-07-23  
**Prerequisite:** Phase B CLOSED (Map battery 6/6)  
**Branch:** `cursor/milestone-2-3-phase-b-eval-2010`

## Objective

Apply the **same** Lens Constitution (§3) to live Workspace chat via Nexus — not a revival of Flow/Build/Look.

## What landed

| Piece | Location |
|-------|----------|
| Chat output contracts | `buildChatOutputContract` / `buildLiveChatConstitutionBlock` in `lensConstitution.ts` |
| Nexus injection | `nexus.ts` — when `surfaceContext === "workspace"` |
| Lens-weighted DNA | Focused-project CHAT + BUILD shaping layers |
| Soft lens offer copy | Remapped to Designer / Builder / Storyteller |

## Still open to close Phase C

Re-run **same** T1–T6 battery on **live chat** (≥5/6, T1 mandatory). Prefer a host with `ANTHROPIC_API_KEY` / authenticated Workspace after deploy.
