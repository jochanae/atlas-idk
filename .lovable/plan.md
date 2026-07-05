## Goal

Kill the muddy warm-ivory/parchment base in light mode. Replace it with a clean platinum-frost neutral. Neutralize the bronze accent to cool slate blue. Dark obsidian theme stays byte-identical.

## Scope

Frontend only — CSS tokens + a handful of components that hardcoded warm RGBs. No logic changes, no dark-mode edits, no rename of the `parchment` theme key (it stays as an internal identifier so `data-theme="parchment"` still switches modes without breaking `useThemeMode`, `theme.ts`, or the 200+ scoped selectors).

## The edits

### 1. Rewrite the parchment token block — `src/styles.css` lines 280–385

Swap warm values for cool platinum. Everything downstream reads these tokens through `color-mix(... var(--atlas-bg) ...)`, so retuning them cascades to the header, dock, composer glass, cards, sheets.

```
--atlas-bg:            #F8F9FA   (was #F5F1E8 warm ivory)
--atlas-surface:       #FFFFFF
--atlas-surface-alt:   #F1F3F5   (was #FBF7EE cream)
--bg-primary:          #F8F9FA
--bg-surface:          rgba(255,255,255,0.80)
--bg-elevated:         #EEF0F3
--atlas-bg-rgb:        248, 249, 250
--atlas-surface-rgb:   255, 255, 255
--atlas-flow-pane-bg:  #FFFFFF
--atlas-nav-arch-fill: rgba(248,249,250,0.92)
--atlas-home-btn-bg:   #FFFFFF
--atlas-glass-bg:      rgba(255,255,255,0.72)
--atlas-glass-border:  rgba(255,255,255,0.95)
--border-soft:         rgba(15,23,42,0.08)
--atlas-border:        rgba(15,23,42,0.10)
```

Foreground/text unchanged (already near-black slate `#05070F`).

### 2. Neutralize the accent to slate blue (light mode only)

```
--atlas-gold:         #3B5273   (was #8B5E3C bronze)
--atlas-gold-dim:     rgba(59, 82, 115, 0.10)
--atlas-gold-glow:    rgba(59, 82, 115, 0.18)
--atlas-gold-border:  rgba(59, 82, 115, 0.22)
--atlas-gold-rgb:     59, 82, 115
--atlas-ember:        #3B5273
--atlas-ember-glow:   rgba(59, 82, 115, 0.20)
--atlas-search-btn-border: rgba(59, 82, 115, 0.45)
--atlas-search-btn-fg:     #3B5273
--ring:               215 32% 34%   (shadcn ring token)
--primary:            215 32% 34%
--accent:             215 32% 34%
```

Dark mode gold (`#E6C687`) is untouched.

### 3. Sweep hardcoded warm RGBs inside `[data-theme="parchment"]` scoped rules — `src/styles.css`

~15–20 literal substitutions where the CSS bypasses tokens. Targets: `rgba(240,228,210,*)`, `rgba(255,253,248,*)`, `rgba(139,94,60,*)`, `#EDE9DF`. Replace with `var(--atlas-bg)`, `var(--atlas-surface)`, `var(--atlas-border)`, or `rgba(59,82,115,*)` for accent-bearing rules.

### 4. Neutralize component-level warm literals

Files that hardcode warm RGBs in JS-side inline styles when `isParchment` is true:

- `components/run/VerificationPanel.tsx`
- `components/AxiomFlow.tsx` (31 warm refs — largest offender)
- `components/HistoryBookmarksSheet.tsx`
- `components/UserMenuDropdown.tsx`
- `components/CommandPalette.tsx`
- `components/home/AskAtlasSurface.tsx`
- `components/workspace/AssistantBubble.tsx`
- `pages/showcase.tsx`
- `pages/master-map.tsx`

Swaps: `rgba(240,228,210,0.25)` → `rgba(15,23,42,0.04)`; warm borders → `rgba(15,23,42,0.10)`; bronze `#8B5E3C` labels → `#3B5273`. Route through tokens (`var(--atlas-bg)`, `var(--atlas-border)`, `var(--atlas-gold)`) wherever the branch permits, so the next retune is a one-file edit.

### 5. Kill lingering Tailwind `bg-amber-*` / `bg-yellow-*` in the workspace

Grep pass across `src/**/*.{tsx,ts}` for `bg-amber-`, `bg-yellow-`, `text-amber-`, `text-yellow-`, `border-amber-`, `border-yellow-`. Replace with semantic tokens (`bg-card`, `bg-muted`, `border-border`) or `bg-[hsl(var(--token-bg))]` where the class was signaling a warning state.

## What stays exactly as-is

- Dark mode `:root` / `.dark` token block in `styles.css`.
- The `parchment` theme identifier and `useThemeMode` switching logic.
- Gold-on-obsidian in dark mode.
- `bg-red-*` / `bg-green-*` status colors (only warm/amber neutrals are targeted).

## Verification after the swap

1. Build passes.
2. Load `/settings`, `/workspace`, `/ledger`, `/home`, `/pricing` in light mode → no warm ivory anywhere. Backgrounds read as cool platinum `#F8F9FA`; accents read as slate blue.
3. Toggle to dark mode → pixel-identical to current.
4. Contrast: text on `#F8F9FA` uses `#05070F` (AAA), muted uses `#4D5A6E` (AA), slate-blue accent on white ≈ 7.4:1 (AAA).
5. Re-screenshot the Console tab that started this thread — frosted crystal, not sepia parchment.

## Risk

Low. 87 warm hits in styles.css sounds scary but ~80% cascade from token retuning in step 1. Real hand-edit surface: ~15 CSS literals + ~10 component files.
