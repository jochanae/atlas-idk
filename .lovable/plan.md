# Workspace Header: Tighten + Scroll-Driven Collapse

## Goal
Eliminate the dead whitespace under the subheader tabs and make the whole header context collapse/reveal smoothly based on scroll direction — like a premium mobile app.

---

## 1. Tighten the padding (immediate visual fix)

In `src/components/UnifiedSubheader.tsx`:

- Reduce the wrapper `marginTop: 50` → `marginTop` that matches the actual main-header height (no arbitrary 50px gap).
- Tab row vertical padding: `10px 22px 8px` (desktop) / `8px 16px 6px` (mobile) → tighten bottom to `2px`.
- Collapse-handle wrapper height: expanded `14` / collapsed `10` → reduce to `10 / 6`, and pull it up so it sits right under the tabs row (or right under the main header when collapsed).
- Tab buttons currently have `padding: "6px 2px 10px"` — drop the bottom `10` → `4`.

Net effect: the `▾` chip sits tight against the content above it. No more empty band.

## 2. Scroll-driven collapse/reveal

Add a small hook `useScrollCollapse(scrollRef)` that watches the chat scroll container and emits `collapsed: boolean`:

- Tracks `scrollTop` and `lastScrollTop`.
- `scrollTop > 20` AND scrolling **up** (reading older content) → `collapsed = true`.
- `scrollTop <= 20` OR a downward swipe of ≥ 8px → `collapsed = false`.
- Debounced via `requestAnimationFrame` so it's smooth, not jittery.
- Respects `prefers-reduced-motion` (skips the transition, still toggles state).

Wire it in `ChatStream.tsx` (which owns `scrollRef`) and pass the boolean up to `UnifiedSubheader` via the existing `expanded` / `onExpandedChange` props (already controlled — no new prop wiring needed).

## 3. Transition mechanics

In `UnifiedSubheader.tsx`, the collapsible row already animates `max-height`. Extend it:

- Add `opacity` and `transform: translateY(-6px)` transitions to the tab row.
- Use `transition: max-height 280ms ease-in-out, opacity 220ms ease-in-out, transform 280ms ease-in-out`.
- The pinned `Play` button and `▾` chip stay visible in both states (already do).

When **empty-state greeting** is visible (in `ChatStream.tsx`, the "What are we shaping here?" / Atlas greeting block), wrap it with the same `collapsed` flag so it fades + slides up on scroll and fades back in at top.

## 4. Manual override coordination

The `▾` chip stays tappable. Rule:

- Scroll updates `expanded` automatically.
- A manual tap sets a `userPinnedAt` timestamp; scroll-driven changes are ignored for 2s after a manual tap (prevents the auto-collapse from immediately undoing the user's tap).
- Returning to `scrollTop === 0` clears the pin.

## Technical notes

- Files touched: `src/components/UnifiedSubheader.tsx`, `src/components/workspace/ChatStream.tsx`, new `src/hooks/useScrollCollapse.ts`.
- No changes to `UnifiedShell.tsx` main header — it stays exactly where it is (already low-profile sticky).
- No changes to TimelineRail, composer, or any global styles.
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)` (matches Tailwind `ease-in-out`), 280ms.

## What you'll feel

- Land on workspace → full header + tabs + greeting, tightly stacked (no dead gap).
- Scroll up to read history → tabs + greeting fade up and out in ~280ms, leaving just the slim AXIOM bar.
- Scroll back to top (or quick down-swipe at top) → header expands back down smoothly.
- Tap `▾` manually any time to force-collapse or force-expand; auto-behavior resumes after 2s.
