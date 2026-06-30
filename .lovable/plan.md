
## Goal

Home composer becomes the single entry point for both Workspace and Ask Atlas. No routing sheet, no second composer. The composer itself toggles modes; `AskAtlasOverlay` is only the response surface that appears *after* a send in Ask Atlas mode.

No backend work. Frontend-only inside `artifacts/atlas-frontend/`.

---

## Scope of files

- `artifacts/atlas-frontend/src/pages/home.tsx` — remove Send-to pill + sheet, add Ask Atlas toggle, wire Park button to `ParkSheet`, handle radial-menu Ask Atlas event as a "turn toggle ON + focus composer" shortcut.
- `artifacts/atlas-frontend/src/components/composer/ComposerActions.tsx` — no behavior change; just stop hiding Park on home (drop `hidePark`).

Workspace composer, Plan button, and `AskAtlasOverlay` internals are not touched.

---

## Changes

### 1. Kill the "Send to" pill and its sheet

In `home.tsx`:

- Delete the `Send to · <target>` pill button (≈ 4834–4875).
- Delete the `showSendToPicker` portal sheet (≈ 4599–4657).
- Delete the `parking` branch in `handleSubmit` (≈ 2914–2922). Parking is no longer a send target.
- Narrow `sendTo` to `"workspace" | "ask-atlas"`; remove all `"parking"` references.
- Workspace focus selection (`homeFocus`) is no longer surfaced via that pill — it stays driven by whatever existing focus UI / launcher you already have. No new focus UI added.

### 2. Add a glowing "Ask Atlas" toggle on the composer (Plan-button-inspired)

Placed where the killed pill sat (right side of action row, before mic/Send):

- Pill button labeled **Ask Atlas** with a small dot/glyph (use `Globe` from `lucide-react` so it's visually distinct from the workspace Plan checklist).
- **OFF:** transparent background, muted border, muted text.
- **ON:** gold gradient (`linear-gradient(135deg, rgba(201,162,76,0.28), rgba(201,162,76,0.14))`), gold border, gold text, outer glow `0 0 14px -4px rgba(201,162,76,0.55)` + inset highlight, glyph with `drop-shadow(0 0 4px rgba(201,162,76,0.75))`. Mirrors workspace Plan button exactly.
- Click flips `sendTo` between `"workspace"` and `"ask-atlas"`. Toggle stays ON across sends until the user turns it off.

When ON:

- Textarea **placeholder** swaps to `"Ask Atlas anything…"` (overrides rotating placeholder).
- A small animated banner above the composer fades in (mono, 10px, gold, uppercase, same height-collapse pattern as `Plan Mode · Active` in `ChatComposer.tsx` 570–597):
  > `Portfolio Thinking · Not Building`
- **First-activation helper** (one-time, gated by `localStorage["atlas-ask-atlas-helped"]`): a one-line caption appears under the banner the first time the toggle is turned on:
  > `Think freely across your portfolio. Nothing here modifies a project until you continue in a workspace.`
  Dismisses on next toggle / next send and never shows again.

### 3. Send routing (simpler logic, single Send button)

In `handleSubmit`:

- If `sendTo === "ask-atlas"` → existing path: `setAskAtlasSeed(text); setAskAtlasOpen(true);` (overlay opens as the response surface). Do not reset `sendTo` after sending.
- Else → existing workspace-create / inline-send fork, unchanged.

### 4. Parking Lot on the home composer

- Remove the `hidePark` prop on the home `<ComposerActions>` call (currently hides it before any conversation). Park button shows always.
- Wire `onMenuAction("park")` on home to open a `ParkSheet`, mirroring workspace:
  - Add `const [showParkSheet, setShowParkSheet] = useState(false);`
  - Render `<ParkSheet projectId={homeFocus ?? undefined} projects={selectableFocusProjects.map(p => ({ id: p.id, name: p.name }))} onClose={() => setShowParkSheet(false)} onOpenFull={() => { setShowParkSheet(false); setLocation("/parking" + (homeFocus ? `?project=${homeFocus}` : "")); }} />` next to the existing portals.
- `parkedCount` on home stays `0` for this round (no portfolio aggregation yet; badge already hides at 0).

### 5. Radial menu "Ask Atlas" → shortcut, not separate surface

Today the radial-menu Ask Atlas dispatches an event that sets `askAtlasSeed` and opens `AskAtlasOverlay` directly (home.tsx ≈ 1911–1912). Change the listener to:

1. `setSendTo("ask-atlas")` — flip the home composer's toggle ON.
2. Scroll/focus the home composer textarea (`textareaRef.current?.focus()`).
3. If the event carries a `seed` string, prefill the textarea (`setInput(seed)`) but **do not** auto-send and **do not** open `AskAtlasOverlay`. The overlay only appears after the user taps Send.

This makes the radial menu a true shortcut into the same composer rather than a separate entry surface.

### 6. History clock — unchanged

Out of scope this turn.

---

## AskAtlasOverlay status

Kept as-is. It is now strictly the response surface for Ask Atlas mode, only reachable by sending from the home composer while the toggle is ON.

---

## Visual sketch (target)

```text
🕘   +   …   🅿️                 [ Ask Atlas ● ]   🎙  ➤
──────────────────────────────────────────────────────
| Ask Atlas anything...                              |
|____________________________________________________|
       Portfolio Thinking · Not Building   (banner, gold, mono)
```

---

## Out of scope (explicit)

- Killing `AskAtlasOverlay` entirely.
- Splitting clock history into Workspace vs Ask Atlas.
- Portfolio-wide parked-count badge.
- Any workspace-composer changes.
