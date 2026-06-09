## Scope
Refactor the **Live URL** tab of `src/components/workspace/PreviewPanel.tsx` only. Iframe rendering, auto-detect logic, save-to-project, Sandbox/Local tabs, and backend are untouched.

## New chrome layout

**Row 1 — Unified browser bar (single ~36px row):**
```text
[🌐 https://mycompani.app........] [Go] [↺] [↗] [Desktop ▾] [⛶] [×]
```
- Device + orientation collapse into a popover anchored to a `Desktop ▾` button (your pick).
- `⛶` = fullscreen toggle (hides Row 1 + Row 2).
- `↺ ↗ ×` only render once a URL is loaded.

**Row 2 — Status strip (~22px, auto-hides):**
```text
✓ Auto-detected · Netlify   [2 suggestions ▾]                 Saved to project ✓
```
- "DETECTED / SUGGESTED" list becomes a popover anchored to a `N suggestions ▾` chip.
- Slides in on new status (auto-detect result, save confirmation, suggestions arriving).
- **Auto-hides after 4s** of no new status.
- Instantly collapses the moment scroll-collapse triggers.

**Hairline reveal:** when chrome is hidden, a 4px gold gradient pull-tab pins to the very top of the panel. Tap → restores chrome.

## Behavior

- **Scroll-collapse:** scroll listener on `containerRef`. `scrollTop > 8` → hide both rows. `scrollTop <= 8` → reveal Row 1 (Row 2 only reappears on a new status event).
- **Fullscreen ⛶:** manual toggle for `chromeVisible`. Required because cross-origin iframes don't bubble scroll events — this is the explicit trigger.
- **Row 2 auto-hide:** 4s timer reset on every status change; cleared on unmount and on scroll-collapse.
- Mode tabs (Live URL / Sandbox / Local) stay pinned — they're navigation.

## Implementation notes

- Add state: `chromeVisible`, `statusVisible`, `deviceMenuOpen`, `detectMenuOpen`.
- Add two `useEffect`s: scroll listener on `containerRef`; 4s auto-hide timer keyed on `statusVisible` + status deps.
- Re-show Row 2 whenever `autoDetected`, `savedIndicator`, or `detectResults` change.
- Restrict the existing device-switcher row (lines 424–463) to `previewMode === "sandbox"` only — URL mode gets the popover instead.
- Replace the URL-mode header block (lines 465–561) with the two-row layout above.
- Wrap each row in `max-height` + `opacity` transitions (`240ms cubic-bezier(.32,.72,0,1)`).
- Popovers close on outside tap via a transparent full-screen overlay sibling.

## Out of scope
No package installs, no new files, no changes to Sandbox/Local tabs, no backend touches.
