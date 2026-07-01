
# Run Card Mockup — Dark + Light (v2)

Two standalone HTML files. Visual reference only. No app code changes.

## Deliverable

- `/mnt/documents/run-card-dark.html`
- `/mnt/documents/run-card-light.html`

Self-contained (inline CSS, no build). Same layout, only theme tokens differ:
- **Dark:** `--atlas-bg #0e0e0f`, `--atlas-fg #e9e6df`, gold `#c9a24c`
- **Light (Parchment):** `--atlas-bg #f5efe4`, `--atlas-fg #2a2a2a`, gold `#8B5E3C`

Geist Sans / Geist Mono to match the app. Bookmark icon in each card's top-right corner (matches your reference).

## Interaction legend (rendered at top of each file)

- **Card body tap** → expand/collapse inline. Does not navigate.
- **Details** → opens Details surface (Timeline | Changes toggle).
- **Preview** → triggers the existing play/preview behavior.
- Border color = run status; fades back to neutral after ~1s.

The whole card never navigates. Three separate interactions.

## States shown (stacked top to bottom)

### 1. Running
Spinner · title `Working…` · mono sub `Tightening tiny-mobile left spacing…` · bookmark top-right · no footer buttons yet.

### 2. Completed — success
Green pulse border settling to neutral · check icon · title `Fixed Ask Atlas mobile spacing` · footer: `Details` · `Preview` · bookmark top-right.

Directly below (plain Atlas text, not another card):
> Fixed both:
> • Light-mode gold now uses semantic tokens.
> • Tiny-mobile overlap fixed by hiding label and tightening spacing.

### 3. Completed — failed
Red border · X icon · footer `Details` · `Preview`.

### 4. Blocked / needs input
Amber border · alert icon · footer `Details` · `Resolve`.

### 5. Expanded inline (success card, tapped open)
Same card, expanded body reveals a compact preview:
- Last 3 timeline items (mono, muted)
- Touched files (2)
- "No blockers"

Footer unchanged. Card body tap toggles this — Details / Preview do not.

## Details surface

Rendered twice in each file so both responsive layouts are visible:

### Mobile layout (default)
Header `CHANGES` with segmented toggle:

```text
[ Timeline | Changes ]
```

Only one lens visible at a time. Tap toggles between them. Both rendered stacked in the mockup with a label ("Mobile — Timeline selected", "Mobile — Changes selected") so you can see both states.

### Desktop / tablet layout (hint block)
Same toggle still present at the top. Below it, a wider two-column layout renders Timeline and Changes side-by-side as an optional density hint — the toggle still owns the interaction; side-by-side is a layout affordance, not a merge.

### Timeline lens content
- 💭 Thought for 8s
- 📖 Read home.tsx
- 📖 Read ComposerActions.tsx
- ✏️ Edited home.tsx
- ✏️ Edited AskAtlasSurface.tsx
- 🧪 Typecheck passed
- ✅ Run completed

### Changes lens content
- Modified → `home.tsx` (bullets: tightened mobile spacing · replaced gold tokens · fixed button sizing)
- Created → `RunSummary.tsx`
- Deleted → `legacyTimeline.tsx`
- One row shown in active state to reveal `View diff` / `Open file`.

### GitHub block (bottom of Details, single item)
- ✓ Pushed to `main`
- Commit `7b81ac2` · View on GitHub

No historical commit list. No tokens. No cost. No model. No parked decisions.

## Responsive strip (bottom of page)

Three width samples of the completed card:
- Tiny mobile — expanded shows 2–3 timeline items + files + blockers only
- Mobile — short timeline + changes summary
- Desktop — expanded density hint

## Out of scope

- No React component code
- No edits to `RunCard.tsx`, `ViewChangesPanel.tsx`, chat rendering
- No cleanup work (awaitingPlan dot, reviewNotes, PlanCard consolidation, selfEdits, StepProgress stacking) — that's the next plan after you approve the visual

Approve this and I'll produce both HTML files. Next plan after that translates the accepted layout into real components and does the cleanup list.
