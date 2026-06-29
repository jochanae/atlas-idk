## Header change

**File:** `artifacts/atlas-frontend/src/components/UnifiedShell.tsx`

1. Rename `ShellNavMenu` → `ShellDrawerButton`. Remove dropdown state, items array, outside-click handler, and the Dashboard branch. Single action on click: dispatch `axiom:open-nav-drawer`.
2. Swap the SVG from the two-rectangle menu icon to a **circle with three short stacked lines inside** (matches your screenshot 2: ~22px circle, gold stroke, three lines with rounded caps).
3. Move `<ShellDrawerButton />` to render **before** `<ShellWordmark />` in the header row so it sits to the **left** of the AXIOM logo. Keep the rest of the header (clock, avatar, etc.) unchanged.
4. Dashboard is out of scope — it moves elsewhere in a future turn.

That's it. Confirm and I'll implement.
