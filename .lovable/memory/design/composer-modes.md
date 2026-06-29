---
name: Composer modes
description: Composer visibility contract — full/compact/hidden driven by stage artifacts and explicit reading density, never scroll or message length
type: design
---
# Composer modes

Three states (`composerVisibility` in `shellStore`):

- **full** — default. Conversation is the activity. Ambient home, active chat, short replies.
- **compact** — Atlas produced a long-read artifact the user is reading. EXPLICIT only: `long-read | ledger | analysis | decision | research | code-explainer`. Never auto-triggered by raw message length.
- **hidden** — a stage artifact owns the screen: `preview | flow | sketch | image | map | canvas | wireframe`.

## Trigger model

Mobile-first focus. Stage artifacts call `useStageArtifact(kind)` which resolves to:
- mobile → `hidden`
- desktop → `compact` (unless `desktopHidden: true` for explicit fullscreen/focus)

Reading density: artifact components call `useReadingDensity(kind)` → `compact`.

Highest priority wins: `hidden > compact > full`. Claims are tracked per-mount in `shellStore.composerClaims` and auto-released on unmount.

## Restore

- Gold "A" (`atlas:focus-composer`) → `useShellStore.getState().restoreComposer()` clears all claims and forces `full`.
- Sending a message returns to `full` (handled by send path / restore on focus).

## NOT triggers

Scroll position, scroll direction, time on screen, message count, message length. Footer/dock scroll behavior is independent and untouched.

## Files

- `src/store/shellStore.ts` — `composerVisibility`, `composerClaims`, `registerComposerClaim`, `releaseComposerClaim`, `restoreComposer`.
- `src/hooks/useComposerVisibility.ts` — `useStageArtifact(kind, opts)`, `useReadingDensity(kind, opts)`, `useComposerVisibility()`.
- `src/pages/workspace.tsx` — gates `composerProps` to `null` when `hidden`; focus listener restores.
- `src/components/workspace/PreviewPanel.tsx`, `FlowPanel.tsx` — register stage claims.
