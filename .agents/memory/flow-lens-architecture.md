---
name: Axiom Flow Lens Architecture
description: Three-lens design for Axiom Flow — each lens answers a different question from the same node graph
---

## The three lenses

**Designer** ("What experience are we creating?")
- Keeps the AxiomFlow visual canvas as-is — that IS the design perspective
- Lens-aware semantic coloring already in AxiomFlow (blocker glow, wont fade)
- MoscowBadge + resolved ✓ corner badge already render on nodes

**Builder** ("What needs to be built?")
- Sections: Blocked (red) → Open (sorted by MoSCoW) → Resolved (green) → Won't do (muted)
- Progress bar: resolved/total active nodes
- Each item shows: label, type tag, MoSCoW tag, strategicAnswer snippet when resolved

**Storyteller** ("Why does this project exist?")
- Five narrative chapters: The Origin (goal) → What Was Decided (resolved) → Still Being Shaped (exploring) → Active Risks (blockers) → Tradeoffs Made (wont)
- Pulls from: goal.label, goal.details, goal.strategicAnswer, node.strategicAnswer, node.question, node.details
- No new API calls needed — all data already in the nodes array

## Shared node type
`isResolved` = has a non-empty `strategicAnswer` (same as `isNodeDefined` in AxiomFlow)
`isWont` = type === "wont" || (type === "priority" && (meta|moscow) === "wont")

## Semantic node coloring (AxiomFlow)
- Resolved non-goal nodes get a gold ✓ badge (14px circle, top-right corner, absolute position)
- MoscowBadge renders below node circle for priority/requirement nodes
- Colors: goal=gold circle, requirement=gold-bordered rect, blocker=ember rect, decision=orange rect, sprint=small rounded, wont=faded+strikethrough
- `lens` prop passed to `nodeStyleFor` for designer-specific treatments

## Lens tab switcher
- Active tab shows sublabel: designer="experience", builder="execution", storyteller="story"

**Why:**
User feedback that all three lenses felt like "three layouts of the same data" — each now answers a different question while reading from the same node graph.
