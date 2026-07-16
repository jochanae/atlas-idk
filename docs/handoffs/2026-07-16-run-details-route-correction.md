# Run Details — Drawer → Dedicated Route Correction

**Date:** 2026-07-16
**Owner:** frontend (Cursor)
**Supersedes parts of:** Slice 2 (RunDetailsDrawer)

## What went wrong in Slice 2

Slice 2 wrapped `ViewChangesPanel` in a right-side `Sheet` (`RunDetailsDrawer`) opened via `axiom:open-changes` + `?runId`. That is not the interaction requested.

Lovable's model — and the target for Atlas — is: **tapping Details on a run/commit card navigates to a dedicated run-details page**, not an overlay drawer. The drawer:

- Feels temporary instead of a permanent historical record.
- Makes mobile a full-screen sheet masquerading as a page (bad back-nav, weak deep-linking).
- Constrains diffs, artifacts, slide previews to a narrow container.
- Leaves `?runId` as the canonical state, which is not deep-link-safe.

**Keep** the data wiring done in Slice 2 (runId resolution, Timeline/Changes fetching, receipt pill selection, `ViewChangesPanel` itself). **Replace** the container.

## Required behavior

1. **Dedicated route.** Add `/workspace/:projectId/run/:runId` (or the router's closest equivalent — match existing workspace route shape). Render a `RunDetailsPage` that mounts `ViewChangesPanel` as its body.
2. **Primary tabs.** Timeline | Changes at the top of the page (already inside `ViewChangesPanel`).
3. **Mobile = normal full-screen page.** Not a Sheet. Standard scroll, standard back button behavior.
4. **Desktop = full page** (centered or wide layout — not a right-side overlay on top of the workspace).
5. **Back returns to the exact conversation scroll position.** Use `history.state` or a scroll-restoration key stored when the Details button is clicked.
6. **Deep-linkable + refresh-safe.** Reloading the run URL must load that run directly, without going through the workspace conversation first.
7. **Receipt pills / Timeline entries** navigate within the run page (replace the URL, not push a drawer state).
8. **Remove `?runId` as the canonical mechanism.** It may remain only as a legacy fallback that redirects to the new route.

## Details / secondary button rule (applies to every card)

Establish one rule across all system cards:

- **Details → stays inside Atlas.** Always opens the Atlas run-details page (or artifact detail, slide detail, PDF preview, etc.). Never a link out.
- **Secondary button → leaves Atlas.** Labeled by destination: `GitHub`, `Preview`, `Open`, `Download`. Never generic `Preview` for a GitHub commit.

Card mapping:

| Card type      | Details →                          | Secondary →              |
| -------------- | ---------------------------------- | ------------------------ |
| Run            | `/…/run/:runId` (Timeline)         | Preview (live route)     |
| GitHub push    | `/…/run/:runId` (Changes tab)      | `GitHub` (commit/PR URL) |
| Artifact       | Artifact detail page               | Download / Open          |
| PowerPoint/PDF | In-app preview                     | Download                 |

For GitHub push cards specifically: once backend Slice 1 lands the SHA → runId mapping, `Details` must route to the internal run page. The current GitHub-URL fallback stays only until that mapping is available, and the button label switches from `Preview` to `GitHub`.

## GitHub card headline copy

Do not render GitHub's raw title (`Merge pull request #170 from jochanae/...`) as the card headline. Summarize:

- `GitHub Push` (eyebrow/label)
- Headline: `Merged N file changes` or `Committed <short summary>` (derived from commit message first line, with `Merge pull request #NNN from …/…` collapsed to `Merged branch <branch>`).
- Raw PR title, PR #, branch, SHA, files-changed all live inside Details.

## Card sizing (mobile)

Atlas cards currently stretch ~92–95% width, edge-to-edge. Target:

- Max width: **86–88%** of conversation column on phones (keep Atlas slightly wider than Lovable's 82–84% to preserve the obsidian/glass identity).
- Side margins: **24–28px** each side.
- Reduce internal vertical padding by **~10–15%**.
- Keep current button sizes.

Apply to `SystemActivityCard` / `CommitReceipt` wrapper — do not shrink content.

## Migration plan (minimal)

1. Add route + `RunDetailsPage` that renders `<ViewChangesPanel />` with `runId` from route params.
2. Rewire every `axiom:open-changes` dispatch site (WorkspaceRunCard, ActiveCard, WorkspaceRunReceipts, CommitReceipt) to `navigate(\`/…/run/\${runId}\`)`.
3. Store `sessionStorage['workspace:scroll:<conversationId>']` on navigate; restore on workspace mount.
4. Demote `RunDetailsDrawer`: either delete or keep behind a feature flag as a future quick-peek. Not on the Details path.
5. Update GitHub `CommitReceipt`: rename secondary button `Preview` → `GitHub`; make `Details` route to the run page when `runId` is known, else disable with tooltip "Linking to run…".
6. Tighten card width + padding per sizing spec.

## Out of scope

- Backend SHA→runId mapping (already handoff'd as Slice 1).
- Diff renderer upgrades.
- New Timeline/Changes internals.

## Verification

- Tap Details on run card → lands on `/…/run/:runId`, full page, Timeline tab default.
- Reload run URL → page loads directly.
- Back button → returns to conversation at prior scroll.
- Tap Details on GitHub commit card (with runId) → Changes tab of run page.
- Tap `GitHub` on the same card → opens commit URL in new tab.
- Mobile: no side-sheet animation; page transition.
- Card visual: measure width and side margin against spec.
