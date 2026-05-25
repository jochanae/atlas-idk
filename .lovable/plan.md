# Landing Page Evolution — Final Plan (mockup-first)

Evolution of the existing landing page identity. Preserve floating geometry, purple ambient, gold restraint, chips, and Bridge. Evolve copy, pacing, and three new sections. Pricing stays — simplified and lower.

## Step 1 (this approval) — Static mobile mockup

Before touching `landing.tsx`, produce a single self-contained HTML file at mobile width (390px) covering three sections so you can judge rhythm:

- **Hero** — floating geometry refined, headline + locked subhead, three pills, ghost CTA.
- **Strategic Manifest** — lens selector (Storyteller / Designer / Builder), three-column collapsing to stacked mobile flow.
- **Structural Outputs** — three editorial entries with mono indices and SVG glyphs.

Delivered as `/mnt/documents/axiom-landing-mobile-mockup.html` (viewable in browser, sized for mobile). No app code touched. You review → green light → I implement against `landing.tsx`.

## Locked copy decisions

- H1: `Every great thing started as a conversation.` (italic gold on "started").
- Subhead: **`A workspace where ideas hold their shape long enough to become real.`**
- Mono support: `AXIOM // WHERE IDEAS BECOME DECISIONS BECOME REALITY`.
- Pills: THINK IT THROUGH · MAP IT OUT · BUILD IT (reframed as cognitive stages, not actions).
- Interrogation title: `How many ideas faded before they became real?` (sentence case).
- Bridge tagline: `Decide here. Build anywhere.`

## Step 2 (after mockup approval) — Implementation in `landing.tsx`

Final section order:

```text
01  HERO                   refined (geometry kept, slowed, lightened)
02  THE INTERROGATION      evolved (sentence case, philosophical, left gold tracer)
03  THE STRATEGIC MANIFEST new (lens selector + three columns)
04  THE STRUCTURAL OUTPUTS new (mono indices + monochrome SVG)
05  THE BRIDGE             evolved from HandoffSection ("Decide here. Build anywhere.")
06  PRICING                simplified single row
07  FOOTER                 unchanged
```

Removed: `WallOfGoldSection` only.

## Preserved DNA (do not touch)

- Floating architectural node geometry behind hero — only: opacity max 0.35, drift 60s, fewer overlapping hairlines.
- Purple ambient radial gradient system — kept exactly; slightly desaturated under Sections 03–05 for breathing room.
- 1px gold grid + noise grain global overlay.
- `LandingHeader` and `LandingFooter`.
- Serif display H1 with italic gold accent treatment.
- IBM Plex Mono for eyebrows and micro-labels.
- The three hero pills.

## Motion system

- Easing `cubic-bezier(0.16, 1, 0.3, 1)`.
- Reveal: opacity 0→1 + translateY 12→0 over 800ms via `IntersectionObserver` (threshold 0.2).
- Atmospheric loops 40–60s, opacity peaks ≤ 0.25.
- Respect `prefers-reduced-motion`.

## Visual restraint

- Borders only `rgba(255,255,255,0.05)` / `rgba(255,255,255,0.10)`.
- Gold + teal combined ≤ ~12% surface coverage per viewport.
- No new colors. No new icon library. No new dependencies.

## Technical scope

- Mockup file: `public/axiom-landing-mobile-mockup.html` (also copied to `/mnt/documents/` for direct download).
- Implementation edits scoped to `src/pages/landing.tsx` (evolve `HeroSection`, `InterrogationSection`, `HandoffSection`, `PricingSection`; remove `WallOfGoldSection`).
- One new component: `src/components/landing/StrategicManifest.tsx` (houses both Strategic Manifest + Structural Outputs to limit surface area).
- No backend, routing, auth, or schema changes.

## Out of scope

- Dedicated `/pricing` route.
- Header / footer redesign.
- Replacing the floating geometry with a different visualization.
- Copy A/B variants, CMS wiring, analytics.
