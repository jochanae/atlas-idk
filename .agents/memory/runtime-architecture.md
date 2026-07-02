---
name: Runtime Architecture
description: Sandbox→Share→Publish three-state model; Runtime tab implementation and ownership rules
---

## Three-state model (agreed product design)

1. **Sandbox** — private dev server, live URL, hot reload, ephemeral. Nobody else sees it.
2. **Share** — temporary URL (e.g. `preview.axiom.app/slug`, 7 days). No deployment, no DNS. Requires subdomain decision before build.
3. **Publish** — production, permanent, versioned. Pluggable adapter backends: Replit / Vercel / Railway / Netlify / Render. Never hard-couple to one provider.

## Phase 1 — Runtime tab (complete)

All backend infrastructure was already in `devserver.ts`:
- `POST /api/devserver/workspace/:projectId/start` — installs deps, builds, sets status=running
- `GET /api/devserver/workspace/:projectId/status` — status, port, logs, errorMsg, hasScaffold, startedAt
- `POST /api/devserver/workspace/:projectId/stop` — kills process, resets state
- `router.use /api/devserver/workspace/:projectId/proxy` — proxies to running dev server port

`WsDevState` fields: status / port / proc / logs / errorMsg / startedAt (Date|null)

Port range: 5200–5299. Sentinel port=1 means "static build served via /api/preview/workspace/:id/".

State persisted to `/tmp/atlas-ws-{projectId}.json` — re-adopted on API server restart.

## Surface ownership rule

- **RuntimePanel** (`components/workspace/RuntimePanel.tsx`) — owns start/stop/restart controls, log stream, uptime display, status indicator
- **PreviewPanel** (`components/workspace/PreviewPanel.tsx`) — owns the iframe display, URL saving, route picker
- They share the same backend state (module-level Map in devserver.ts). Multiple callers to start/stop are safe.

## Workspace tab

`RightTab` type includes "runtime". Tab is positioned after "preview" in the tabs array. `onOpenPreview` prop navigates to the Preview tab.

## Phase 2 — Embedded Preview

Blocked only by Phase 1 being live. Just need to verify the iframe proxy URL works in the Preview tab. No new infra needed.

## Phase 3 — Share Preview

Requires a subdomain (`preview.axiom.app` or similar) — needs DNS/domain decision before build. The proxy infrastructure in devserver.ts already handles port routing; the gap is the external URL.

## Phase 4 — Pluggable Publish

Adapter interface: each provider (Replit, Vercel, Railway, Netlify, Render) is a separate adapter. UI never changes, only the adapter does. Never default to Replit — keep Atlas portable.

**Why:** Coupling Atlas's "Publish" to any single provider creates migration debt and undermines the portability brand promise.
