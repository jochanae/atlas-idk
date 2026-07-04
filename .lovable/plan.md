# Deep Dive as a composer verb

Kill the standalone `DeepDiveSheet`. Deep Dive becomes a two-state mode of the focused composer, shared by Ask Atlas and Workspace.

## Behavior

**State A — Brief (composer expanded, background blurred)**
- User taps "↗ Deep Dive" affordance in the focused composer (or long-presses an Atlas message → prefills that message as context).
- Composer grows a "Dive brief" section directly below the textarea:
  - Prefilled context: current draft + optional selected message excerpt (editable).
  - Three destination chips: ChatGPT · Perplexity · Gemini.
- Primary button flips from Send → "Dive →".
- Tapping a destination opens that tool in a new tab with context prefilled where the URL supports it (ChatGPT `?q=`, Perplexity `?q=`); Gemini copies to clipboard + opens + shows toast "Copied — paste in Gemini".

**State B — Awaiting paste (same focused composer, still blurred)**
- After launch, the brief collapses into a small "Dove with ChatGPT · <excerpt>" chip at the top of the composer.
- Textarea is replaced by a single paste box: "Drop the answer here when you're back."
- Two actions: "Bring in" (primary) · "Cancel dive" (secondary).
- Bring in → composer collapses to normal, pasted answer is attached as **dive context** for the next send (rendered as a small "Dive result" chip above the textarea, expandable, removable).

**No separate portal, no in-between page.** The focused/blurred composer is the waiting room.

## Where it lives

- One component: `ComposerDeepDive` used inside the existing focused-composer surface on both Ask Atlas home and Workspace.
- Delete `src/components/DeepDiveSheet.tsx` and all `<DeepDiveSheet />` mount points.

## Provenance (minimal)

The attached dive context carries `{ destination, excerpt, pastedAt }` so it can render as a chip and be included in the outgoing message payload. No backend schema change — it rides in the message body Atlas already receives.

## Out of scope

- Auto-fetching results server-side / Atlas-runs-the-dive.
- Rendering the dive as a first-class Ledger/thread artifact card.
- Both stay possible later; current scope is composer-integrated handoff + paste-back.

## Technical notes

Files to touch:
- `artifacts/atlas-frontend/src/components/DeepDiveSheet.tsx` — remove.
- Composer surfaces on Ask Atlas (`components/home/AskAtlasSurface.tsx`) and Workspace (`pages/workspace.tsx`) — mount `ComposerDeepDive`, remove sheet triggers.
- New: `artifacts/atlas-frontend/src/components/composer/ComposerDeepDive.tsx` — brief + awaiting-paste states, destination launch logic (ported from current sheet), local state machine (`idle | brief | awaiting | attached`).
- Wire attached dive context into the send path so it travels with the next message.

Focused-composer container already handles blur + expand; Deep Dive slots into that expanded region — no new overlay layer.
