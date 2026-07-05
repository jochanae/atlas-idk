---
name: Surface map (Phase 4 targets — corrected 2026-07-05)
description: Real surfaces behind the stale North Star page names. Use these when auditing/refactoring, not the old /dashboard, /think-freely, /project-compass, /compass routes.
type: feature
---

The North Star doc lists `/dashboard`, `/think-freely`, `/workshop`, `/project-compass` for Phase 4. Those names are outdated. Actual mapping:

- **"Dashboard"** — no `/dashboard` route. It redirects to `/home`. The real overview lives *inside the briefcase* (workspace): `BelowFoldDashboard.tsx` + `PortfolioHealthDashboard.tsx` on `/home`, plus the workspace overview panel. When user says "dashboard", they mean the Overview section inside the briefcase.
- **"Think Freely"** = **Ask Atlas** now. Renamed. Surfaces: `AskAtlasSurface.tsx`, `AskAtlasRenderer.tsx` (rendered inside `/home`), helpers in `lib/askAtlasHelpers.ts`. This is the Nexus chat entry point pre-project. No `/think-freely` route exists.
- **"Project Compass"** — `/compass` and `/project-compass` are stubbed to redirect to `/home`. The real compass concept is folded into workspace panels; confirm exact home before auditing.
- **"Workshop"** — real page at `/workshop` (`Workshop.tsx`). This one is accurate.

**How to apply:** When Phase 4 (page audit) references any of the four names, translate to the real surface above before reading/editing. Never audit the stub redirect.
