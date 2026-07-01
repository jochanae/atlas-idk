# Run Card Mockup — v3.1 (Receipt + Artifacts model)

Two standalone HTML files, visual reference only. No app code changes.

## Deliverables

- `/mnt/documents/run-card-dark.html`
- `/mnt/documents/run-card-light.html`

Self-contained (inline CSS, Geist Sans/Mono, no build). Same layout, only tokens differ (dark `#0e0e0f`/`#e9e6df`/gold `#c9a24c`; light parchment `#f5efe4`/`#2a2a2a`/gold `#8B5E3C`).

## Mental model (locked)

- **Chat** = why + human explanation (Atlas' own words below the card).
- **Run Card** = receipt. Small. Lists artifacts produced.
- **Timeline** = how Atlas got there.
- **Changes** = what changed under the hood.
- **Open Preview** = opens the produced artifact.

Each surface answers one question. No duplication.

## Run Card — visual weight

Card is intentionally lighter than the surrounding chat. Two-line header, then artifacts, then footer. Bookmark stays top-right (future: Saved Runs).

```text
✓ Run Complete
Fixed Ask Atlas mobile spacing
2 files · 6 actions · 18s
```

Title line adapts to the run type — not always "Run Complete":

- Questions answered
- Plan created
- Preview generated
- Prototype built
- Files updated
- Migration completed
- Deployment finished

## Artifacts section (replaces "Files")

Only shown when the run produced user-facing deliverables (mockups, images, PDFs, plans, wireframes, downloadable bundles, previewable pages). Internal source edits do NOT appear here — they live in Changes.

```text
PRODUCED
📄 Run Card — Dark mockup
📄 Run Card — Light mockup
📋 Visual specification
```

Each row is individually tappable → opens that artifact. If the run produced nothing user-facing, the section is omitted entirely (no empty state).

## Footer buttons

- **Details** → opens the existing Workspace Changes surface, filtered to this run, with the Timeline | Changes toggle restored. Not a new standalone page.
- **Open Preview** → opens the first previewable artifact from this run. (Renamed from "Preview" — was ambiguous with "preview the card".)
- Bookmark top-right corner.

Card body tap expands/collapses inline. Three separate interactions; whole card never navigates.

## States (stacked top to bottom in each file)

1. **Running** — spinner · "Working…" · mono sub `Tightening tiny-mobile left spacing…` · bookmark · no footer buttons yet · live Produced list appears as items are generated.
2. **Completed — success** — green pulse border settling to neutral · run-type title · meta line `2 files · 6 actions · 18s` · Produced section (if any) · footer `Details` · `Open Preview`. Atlas' plain-text explanation renders BELOW the card, not inside it.
3. **Completed — failed** — red border · X icon · footer `Details` · `Open Preview`.
4. **Blocked / needs input** — amber border · alert icon · footer `Details` · `Resolve`.
5. **Expanded inline** — success card, body tapped: shows last 3 timeline items (mono, muted), no blockers line. Footer unchanged. Produced stays visible.

## Details surface (Workspace Changes)

Details maps to the **existing Workspace Changes surface**, restored with the `Timeline | Changes` toggle — not a new standalone page. No nested cards, no page chrome. Flush to the Workspace, filtered to the run being inspected.

Mobile default:

```text
CHANGES

[ Timeline | Changes ]

<content>
```

One-line header above the tab content:

> Completed successfully · 2 files changed · No blockers

(or `· Pushed to GitHub` when applicable)

Desktop/tablet: same toggle owns the interaction; a wider two-column layout is shown as an optional density hint labeled "Desktop density hint".

### Timeline lens — Atlas' thinking, not logs

```text
💭 Planned approach
📖 Inspected composer
📖 Inspected Ask Atlas surface
✏ Updated spacing
🎨 Replaced color tokens
🧪 Verified layout
✅ Finished
```

No filenames here. Filenames belong in Changes.

### Changes lens — grouped by file

```text
home.tsx
────────
• tightened mobile spacing
• reduced icon padding

AskAtlasSurface.tsx
───────────────────
• replaced hardcoded gold
• uses semantic tokens

ComposerActions.tsx
───────────────────
• compact mode under 480px
```

One row shown in active state revealing `View diff` / `Open file`.

### GitHub block — conditional

Only rendered if the run actually pushed. Two states shown in the mockup, labeled:

- **State A — not pushed:**
  ```text
  Workspace updated
  3 files modified · Ready for review
  ```
- **State B — pushed:**
  ```text
  GITHUB
  ✓ Pushed to main
  Commit 7b81ac2 · View on GitHub
  ```

No historical commit list. No tokens/model/cost.

## Explicitly removed from v2

- Summary tab — redundant with chat.
- "Files" section on the card — replaced by "Produced" (artifacts only).
- Always-on GitHub block — now conditional.
- "Preview" label — renamed "Open Preview".
- Modified/Created/Deleted grouping — replaced by file-grouped bullets.
- Details as a new page — replaced by existing Workspace Changes surface.

## Responsive strip (bottom of page)

Three width samples of the completed card: tiny mobile, mobile, desktop. Each shows the Produced section, meta line, and footer buttons at that width.

## Out of scope

- No React code changes (`RunCard.tsx`, `ViewChangesPanel.tsx`, chat rendering all untouched).
- No cleanup work yet (awaitingPlan dot, reviewNotes, PlanCard consolidation, selfEdits, StepProgress stacking) — that becomes the next plan after this visual is approved.
- Saved Runs / bookmark history noted but not mocked.

Approve this and I'll regenerate both HTML files. Next plan translates the accepted layout into real components and wires Details into the existing Workspace Changes surface.
