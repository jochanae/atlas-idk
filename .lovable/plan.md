## What changes

Today the **SHAPING** pill in the Nexus home header is a single tap-target that jumps to an existing idea project. We replace that behavior with an in-place overlay that reveals Atlas's active working memory — narrative-first, with a scannable tag strip, and a real Commit path into the Ledger.

The pill itself, its placement, pulse animation, and gold styling stay exactly as they are. Only the tap behavior and the new overlay are added.

## The overlay — "Shaping Forge"

Triggered by tapping the pill. Dismissed by tap-outside, ESC, or a downward drag on the pill itself.

```text
┌────────────────────────────────────────────┐
│ ░░░ blurred obsidian backdrop ░░░          │
│                                            │
│   ●  filament pulse (gold → warm-amber)    │
│   ─────────────────────────────            │
│                                            │
│   [Audience] Small restaurants             │  ← tag strip
│   [Friction] Overpriced SaaS               │     mono, 10px, gold
│   [Scope]    Lean waitlist                 │     ✕ on each = drop
│                                            │
│   ── The Anchor ──                         │  ← narrative
│   Isolating the core mechanics of an       │     Geist Sans, prose
│   independent reservation framework…       │
│                                            │
│   ── Holding ──                            │
│   • Target: low-overhead operators         │
│   • Friction: bloated platforms…           │
│   • Scope: lean queue vs. ledger           │
│                                            │
│   ── Trajectory ──                         │
│   Awaiting your read on "manage" to        │
│   shape either a real-time queue or…       │
│                                            │
│   ─────────────────────────────            │
│   [ Release ]            [ Commit → ]      │
└────────────────────────────────────────────┘
```

### Three sections, in order

1. **Tag strip** — 3–4 mono chips derived from `shapingPayload` (audience, tension/friction, what/scope). Each chip has a hairline `✕` — tap to drop that facet from the frame (calls `setShapingPayload` with that field cleared).
2. **The Anchor** — one sentence synthesized from `shapingPayload.title` + `tension`.
3. **Holding** — bulleted narrative pulled from `audience`, `tension`, `what`.
4. **Trajectory** — one sentence: "Awaiting your read on X to shape Y." Derived from what's still missing in the payload (e.g. if `what` is thin, prompt for it).

The narrative is rendered from the existing `shapingPayload` shape — no new backend call. If a field is empty, that section gracefully omits.

### Actions

- **Commit →** opens the existing `CommitPrompt` flow with the Anchor pre-filled as the intent. On commit, a Ledger entry is created (status: Committed), the overlay closes, and the pill transitions to its existing "held" visual state showing the committed title (already implemented behavior).
- **Release** — clears `shapingPayload` and `shapingHeld`, closes overlay, pill disappears. No Ledger write. (This replaces the more aggressive "Purge" naming.)

## Visual execution

- **Backdrop:** `backdrop-filter: blur(14px)` over `rgba(10,10,10,0.55)`.
- **Panel:** centered, max-width 420px on mobile (full-bleed with 16px gutter), rounded 16px, `1px solid color-mix(in oklab, var(--atlas-gold) 25%, transparent)`, shadow `0 20px 60px rgba(0,0,0,0.5)`.
- **Filament:** 1px tall, 64px wide, gradient `linear-gradient(90deg, transparent, var(--atlas-gold), transparent)`, 2s breathing animation.
- **Tag chips:** `var(--app-font-mono)`, 10px, gold on `rgba(201,162,76,0.06)` with 1px gold-tinted border.
- **Narrative:** Geist Sans, 14px body, 1.6 line-height. Section labels in mono uppercase 9px, 0.12em letter-spacing, `--atlas-muted`.
- **Buttons:** Release = ghost (muted text, transparent), Commit = gold-bordered pill matching existing CTA pattern.
- **No teal.** Sticking to the obsidian + gold system. Filament uses gold → warm-amber, not gold → teal.

## Animation

- Open: backdrop fades in 180ms, panel scales from 0.96 → 1.0 with `cubic-bezier(0.2, 0.8, 0.2, 1)` over 220ms.
- Close: reverse, 160ms.
- Filament: continuous 2s opacity breath (0.4 → 1 → 0.4).
- Pill → overlay: the pill itself stays visible behind the backdrop and pulses in sync with the filament, reinforcing the "this is what's behind the pill" metaphor.

## Files touched

- **New:** `src/components/nexus/ShapingForgeOverlay.tsx` — the overlay component. Props: `payload`, `held`, `onCommit`, `onRelease`, `onDropFacet(field)`, `onClose`.
- **Edit:** `src/pages/home.tsx` (~line 2428) — replace the pill's `onClick` navigation with `setShapingOverlayOpen(true)`; render `<ShapingForgeOverlay>` below the portal. Wire `onCommit` into the existing CommitPrompt flow (find current CommitPrompt invocation pattern in the file).
- **Edit:** `src/hooks/useNexusChatStream.ts` — add `dropPayloadFacet(field: keyof NexusShapingPayload)` helper that calls `setShapingPayload(prev => prev ? { ...prev, [field]: "" } : prev)`. No other changes to the stream hook.

No backend, edge function, schema, or routing changes. Pure frontend.

## Out of scope (call out, don't build)

- Live token-by-token streaming of the narrative *inside* the overlay. The overlay re-renders when `shapingPayload` updates, which is already reactive — that's enough for v1.
- A new `--atlas-shaping` teal token. If we want teal in the system later, that's a separate design-system decision.
- Drag-down peek gesture on the pill. Tap-to-open + tap-outside-to-close is enough for v1; gesture can come later.
- Editing the narrative text. Drop-facet via `✕` is the only mutation surface in v1.
