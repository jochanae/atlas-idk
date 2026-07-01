
## Reframe

Build the **Theme Showcase page first**. Don't touch parchment tokens yet. `/showcase` becomes the surface where we judge every future theme change side by side, and we'll use it to validate the neutral/bronze/purple rebalance in a follow-up pass.

## What we're building

A new internal page at **`/showcase`** (unlinked from nav) that renders every real component state Axiom uses, in both themes, on a single scrollable canvas.

### Page structure

Sticky top bar:
- Theme toggle: `Obsidian` / `Parchment` (writes `document.documentElement.dataset.theme`, mirrors `useThemeMode`; reverts on unmount)
- Side-by-side toggle: render both themes in two columns for direct comparison
- Anchor jump-links to each section

Sections (in order):

1. **Typography** — H1/H2/H3/subheading/body/caption/mono + editorial labels (`YOU`, `ATLAS`, `PORTFOLIO THINKING · NOT BUILDING`)
2. **Color tokens** — swatch grid for every `--atlas-*` variable with resolved value + role label ("border-default", "gold-armed", "intel-active")
3. **Buttons** — primary / secondary / ghost / danger / icon-only; states default / hover / focus / active / disabled / loading
4. **Ask Atlas states** — Idle / Listening / Thinking / Streaming / Completed / Error
5. **Inputs** — empty / focused / typing / disabled / error; single-line, textarea, composer shell
6. **Cards** — default / hover / selected / active / dragging
7. **Message bubbles** — user / atlas / system / streaming / with tool result
8. **Pills & chips** — default / selected / thinking / error / success / memory chip
9. **Icons** — idle / hover / active / armed (send)
10. **Tables / list rows** — normal / hover / selected / with divider (mirrors History sheet)
11. **Sheets & drawers** — header, list, empty state (mirrors HistoryBookmarksSheet, feature drawers)
12. **Status indicators** — Committed / In Motion / Under Consideration / In Tension / Overridden

Each state gets a caption with the token(s) it consumes.

## Forced-state previews (added)

Hover/focus/active/armed are hard to inspect at rest. Rules:

- Always render the **real** component. Never rebuild lookalike markup.
- To display a non-default state, wrap the real component in a `ForcedState` primitive that applies the styling only:
  - toggles CSS via `data-force-state="hover|focus|active|disabled"` on the wrapper, backed by matching CSS rules scoped to `[data-force-state]` in a small `showcase.css`
  - for stateful React components, pass real props when they exist (`disabled`, `aria-selected`), and only fall back to `data-force-state` for pseudo-class states
- Every forced state renders a small badge above it: **"Forced preview state — hover"** (or focus/active/etc.) so nothing masquerades as a live interaction.
- Never modify the underlying component's props/markup to fake a state that isn't wired.

## TODO discipline

If a real component or state doesn't exist yet (e.g. "Ask Atlas Listening" has no built component), render a visible **`TODO — not yet built`** tile in that slot instead of inventing markup. The showcase stays an honest mirror of what exists.

## Files

New:
- `artifacts/atlas-frontend/src/pages/showcase.tsx` — the page
- `artifacts/atlas-frontend/src/pages/showcase/sections/*.tsx` — one file per section
- `artifacts/atlas-frontend/src/pages/showcase/ForcedState.tsx` — wrapper primitive with the "Forced preview state" label
- `artifacts/atlas-frontend/src/pages/showcase/Swatch.tsx`, `StateRow.tsx`, `SectionShell.tsx`, `TodoTile.tsx` — small shared primitives
- `artifacts/atlas-frontend/src/pages/showcase/showcase.css` — scoped rules for `[data-force-state="…"]`

Edited:
- `artifacts/atlas-frontend/src/App.tsx` — add `<Route path="/showcase" component={Showcase} />` near line 219. No nav link.

**Not touched:** `styles.css` parchment tokens, any existing components, dark mode, `/home`, `/workspace`.

## After `/showcase` lands (follow-up plan, not this one)

Rebalance parchment with corrected rule:
- **Bronze** = premium/priority — focus, hover, selected borders, armed send. "This is Axiom / your action."
- **Purple** = intelligence status only — idle Ask Atlas dot, streaming pulse, live AI signal. Never a theme fill.
- **Neutrals** = everything structural.
- Dark mode untouched.

That pass ships only after we've inspected each state in `/showcase`.

## Verification

- `/showcase` loads without errors
- Theme toggle repaints every section; obsidian and parchment look identical to today (no token changes yet)
- Every forced-state tile carries the "Forced preview state" label
- Missing components render as visible `TODO` tiles, not fake UI
- No visible change on `/`, `/home`, `/workspace`, or any existing route
