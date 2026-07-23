# Milestone 2.3 Phase A — Trace checklist

**Date:** 2026-07-23  
**Branch:** `cursor/milestone-2-3-lens-design-2010`  
**Goal:** Prove one perspective identity travels UI → Nexus meta → Map expand enum.

## Trace 1 — Workspace send

| Step | Expected | Status |
|------|----------|--------|
| 1. Picker shows Designer / Builder / Storyteller (+ Scenario toggle) | No Flow/Build/Look/Scenario-as-lens | ✅ |
| 2. Selection persists `atlas-ws-lens-v2-*` + `atlas-ws-speculate-v1-*` | Canonical ids only | ✅ |
| 3. `useAtlasConversation({ perspective, speculate })` | Wired from `workspace.tsx` | ✅ |
| 4. `POST /api/nexus/chat` body includes `perspective` + `speculate` | `useNexusChatStream` | ✅ |
| 5. Nexus normalizes via `normalizePerspective` | Legacy remapped | ✅ |
| 6. Early `event: meta` echoes `{ perspective, speculate, perspectiveStub }` | Phase A stub only | ✅ |
| 7. No Constitution disposition packs on Nexus yet | Deferred to Phase C | ✅ |

## Trace 2 — Map expand

| Step | Expected | Status |
|------|----------|--------|
| 1. Map tabs use `designer \| builder \| storyteller` | `FlowPanel` | ✅ |
| 2. Tab change writes shared storage + `axiom:perspective-change` | Sync with chat | ✅ |
| 3. `POST /api/forge/expand-node` `lens` enum | Same three ids (`forge.ts`) | ✅ |

## Trace 3 — Naming cleanup

| Step | Expected | Status |
|------|----------|--------|
| 1. Composer placeholders/aura on canonical ids | ✅ |
| 2. History taxonomy = `HistoryIntent` (`build\|decide\|chat`) | Not called “lens” | ✅ |
| 3. Scenario = `speculate` modifier | ✅ |

## Automated coverage

- `artifacts/atlas-frontend/src/lib/__tests__/atlasPerspective.test.ts`
- `artifacts/api-server/src/lib/__tests__/atlasPerspective.test.ts`

## Out of Phase A (do not block)

- Constitution evidence filters / output contracts (Phase B Map, Phase C chat)
- Scenario side-effect port from legacy `/api/chat`
- Eval battery T1–T6 scoring (Phase A′ / B / C)
