# Polish Pass — Cohesion (frontend-only)

No new concepts. No backend work. Refine what exists.

## 1. Composer — user-controlled collapse (3 states)

`composerVisibility` already supports `full | compact | hidden` via `shellStore` + `useComposerVisibility`, but it's currently artifact-driven only. Add an explicit user affordance.

- Add `userComposerPreference: 'full' | 'compact' | null` to `shellStore` (null = auto, sessionStorage-persisted).
- Resolution order: `hidden` (stage claim) > `userComposerPreference` > reading density > `full`.
- Subtle chevron in composer top-right (~16px, muted). Tap toggles full ↔ compact. Tooltip: "Collapse composer" / "Expand composer".
- Compact = single input line + icon row. Hide model chip row, attachment preview, trailing controls.
- Reset preference to `null` on send and on gold "A" focus (already calls `restoreComposer`).
- Not tied to filter, scroll, or message length.

## 2. Hydrate button — explicit intent

In the workspace hydrate/refresh control:

- First time (no prior analysis for this project): label **"Analyze Project"**, ⚡ icon, gold accent, slightly emphasized.
- After first run: label **"Update"**, ↻ icon, muted.
- Detect "has been analyzed" from existing project metadata; fall back to "flow has >0 non-seed nodes" — no backend change.
- Tooltip: "Atlas re-reads decisions, ledger, and architecture."

## 3. Loading state — staged thinking

Replace the static "ATLAS IS MAPPING YOUR PROJECT…" string with a staged checklist that advances on a visual timer (~700ms per line). Backend timing untouched.

```
Atlas is reviewing…
✓ decisions
✓ architecture
• unresolved tension
• dependencies
```

Final line pulses until response returns. Reused by initial analyze and update.

## 4. Haptics — physical feel

Extend `src/lib/haptics.ts` with light variants and wire to:

- FlowMap node select → `tap`
- Project card drill-in → `tap`
- Designer / Builder / Storyteller switch → `tap`
- Center map (tap) → `tap` (long-press reset already has `cardConfirmed`)
- Hydrate complete → `nodeResolved`
- Open project card → `tap`

Already gated by `navigator.vibrate`. No sound changes.

## 5. Drill-down confidence — graceful render only

In the flow drill-down card, render a confidence row **only when the payload already has those fields**:

```
Atlas believes · 92%
Why:
 • <reason>
 • <reason>
```

- Read optional `confidence` (number 0–1 or 0–100) and `reasons[]` (string[]) from the existing node payload.
- If absent → render nothing. No type changes that require backend coordination.
- No handoff spec, no payload contract change.

## Explicitly NOT in this pass

- Flow Map colors.
- Designer/Builder/Storyteller copy.
- Filter button behavior.
- Backend work of any kind.
- New surfaces or concepts.

## Files likely touched

- `artifacts/atlas-frontend/src/store/shellStore.ts`
- `artifacts/atlas-frontend/src/hooks/useComposerVisibility.ts`
- Composer component(s) + `src/pages/workspace.tsx` (chevron + compact rendering)
- Workspace hydrate button component (analyze vs update labels)
- Analyze loading card component (staged checklist)
- `artifacts/atlas-frontend/src/lib/haptics.ts` + call sites (FlowMap, project cards, lens switcher, center button, hydrate complete)
- Flow drill-down card (optional confidence row)

I'll confirm exact file paths during build by reading them before editing.
