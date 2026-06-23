

## Hero Section: Anchor Pill + Rotating Features

Replace the current 7 static feature pills with a single anchor badge and a rotating feature display below it.

### Design

**Anchor pill (always visible):**
- Text: "Your Complete Presentation Studio"
- Styled with a subtle gradient/gold accent to match the brand

**Rotating feature (below the anchor):**
- Cycles through all 7 features one at a time (icon + label)
- ~3 second interval with a smooth fade + vertical slide transition using AnimatePresence
- Centered below the anchor pill

### Layout Flow
```text
  [ Your Complete Presentation Studio ]    <-- static pill
        [ icon  Feature Name ]             <-- rotates every 3s
```

### Technical Changes

**File: `src/components/landing/LandingHero.tsx`**

1. Add a `useState` for the current rotating index and a `useEffect` with a 3-second interval to cycle through the `quickFeatures` array.
2. Replace the `flex-wrap` pills grid with:
   - A single static badge/pill with the anchor text
   - An `AnimatePresence` block below it that fades/slides the current feature (icon + title) in and out
3. Keep the existing `quickFeatures` array for the rotation data.
4. Transition: `opacity` 0 to 1 + `y` shift (e.g., 10px) with ~0.4s duration, exit reversed.

No new files or dependencies needed -- uses existing `framer-motion` AnimatePresence.

