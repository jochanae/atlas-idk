# Handoff: Completion popover — remaining backend gaps

**Repo:** `Axiom-Atlas` (Cloud Run) · **Date:** 2026-07-02
**Frontend counterpart:** `artifacts/atlas-frontend/src/components/UnifiedShell.tsx` — `ShellCompletionChip` popover (header readiness ring).

## Context

Frontend is now wired to canonical readiness only. The popover reads
`GET /api/projects/:id/readiness` and renders its `dimensions[strategy|build|activity|delivery]` verbatim (score + evidence). No more `nodeState`-derived Architecture / Decisions rows, no more mode toggle. The popover explains the same score the ring shows.

Two gaps remain that only the backend can close:

## G1 — `previewUrl` writeback from Auto-detect

The Workspace URL tab's "Auto-detect" resolves a live preview URL client-side, but never persists it. Result: the popover's "Live URL" meta row shows `Not set (backend writeback pending)` even when detection succeeded, and the delivery dimension can't count it as a signal.

**Ask:** on successful auto-detect (frontend already has the resolved URL), accept a `PATCH /api/projects/:id { previewUrl }` and persist. Emit it back on `GET /api/projects` and `GET /api/projects/:id/intelligence` so surfaces see it without a refetch dance.

## G2 — Delivery dimension should ingest `previewUrl` + `linkedRepo`

Once G1 lands, `computeProjectReadiness().dimensions.delivery` should factor in `previewUrl` presence (already factors `linkedRepo`). Evidence string should name what's counted.

## Non-goals

- The B1/B2 handoff at `docs/handoffs/2026-07-01-readiness-source-of-truth-backend.md` still covers `readinessScore` on the list endpoint and `layerMix`/`phases`. That work is unchanged.
- No frontend follow-up required once G1 is deployed — the popover will start reflecting it automatically.

## Definition of done

- `PATCH /api/projects/:id` accepts `{ previewUrl: string | null }` and persists it.
- `GET /api/projects/:id/readiness` shows a non-zero delivery score once repo + preview are both set.
- Header ring, Home cards, and the completion popover all move up in lockstep when a preview URL is saved.
