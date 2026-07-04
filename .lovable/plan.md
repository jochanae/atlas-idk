## What's broken

The Changes tab is rendering the wrong receipt card at the top and using a bad time format:

1. `ViewChangesPanel` renders `<WorkspaceRunCards>` → which reuses the big **`RunCard`** from `home/ActiveRuns.tsx`. That component has its own expanded body with **Chat · Diff · Shell** tabs (`ActiveRuns.tsx` L1316–1731). That's the "odd component up in there" — it doesn't belong on the Timeline/Changes surface.
2. In the screenshots, the row at the top of the tab was just a compact receipt pill: `● BUILD · React Healthy … · 2 files written — App.tsx, index.css · 24m ago ▽`. That compact pill needs to come back.
3. `formatAgo` in `ActiveRuns.tsx` (L171) only renders `Ns` / `Nm ago` — never hours/days. A 6-hour-old run reads "400m ago". That's the "weird number by the time".
4. The Timeline/Changes lens toggle currently renders as two small lowercase pills side-by-side; screenshots show them as capitalized `TIMELINE` / `CHANGES` pill segments matching the tab bar language.

Everything else on the page (subheader tabs, RunTimeline items, Changes list, Workspace git block) already matches the screenshots and stays as-is.

## Plan

Frontend only. No backend changes.

**1. Replace the big RunCard receipt with a compact receipt pill inside `ViewChangesPanel.tsx`**

- Delete the `WorkspaceRunCards` component (L461–506) and its import of `RunCard` / `adaptApiRunToActiveRun` usage.
- Add a small local `RunReceiptPill` that renders per run (top 1, or the filtered `runId`):
  - Left: status dot (green/red) + `BUILD` mono tag.
  - Middle: project name (ellipsis) + `·` + summary line (`N files written — a.tsx, b.css`).
  - Right: relative time + a caret `▽` (non-interactive — this is a receipt, not an expander).
- Style matches the screenshots (dark surface, gold border-left accent, mono tag, sans body, muted timestamp). Reuses existing atlas tokens.
- One receipt per run, capped at the most recent 5 (same as today), or exactly the filtered `runId` when set.

**2. Fix the relative-time formatter**

- Add a local `formatAgo` inside `ViewChangesPanel.tsx` that handles seconds → minutes → hours → days → date, so a 6-hour-old run reads `6h ago` instead of `360m ago`.
- Leave the copy of `formatAgo` inside `ActiveRuns.tsx` alone for now (that surface has its own use); scope of this change is Timeline/Changes only.

**3. Restore the Timeline/Changes toggle look**

- Keep the two-button toggle, but render the labels uppercased (`TIMELINE`, `CHANGES`) with the same segment-pill styling shown in the screenshots (active = gold fill, inactive = outlined). Same font-size/letter-spacing as the tab bar so both feel like one system.

**4. No changes to**

- `UnifiedSubheader.tsx` (CHANGES / BLUEPRINTS / OUTPUTS / CONSOLE tab bar is correct).
- `RunTimeline` / `RunTimelineItem` step rendering.
- `ChangesLens` per-file rows.
- `WorkspaceBlock` git-status footer.
- `ActiveRuns.tsx` (used elsewhere — leave untouched).

## Files touched

- `artifacts/atlas-frontend/src/components/workspace/ViewChangesPanel.tsx` — remove `WorkspaceRunCards`, add compact `RunReceiptPill` + local `formatAgo`, restyle the toggle.

## Verification

- Load Ask Atlas + Workspace → open Changes tab: top shows compact BUILD receipt (no Chat/Diff/Shell tabs), toggle reads `TIMELINE` / `CHANGES`, times read `24m ago` / `6h ago` / `2d ago` correctly.
- Run filter (`?runId=…`) still narrows to a single receipt.
- Old runs with no THOUGHT still auto-switch to Changes lens.
