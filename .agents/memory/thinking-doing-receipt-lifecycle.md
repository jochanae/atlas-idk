---
name: Thinking/Doing/Receipt chat lifecycle
description: How Atlas workspace chat distinguishes prose-only "Thinking" turns from card-worthy "Doing" turns, and why the classifier must be shared, not duplicated.
---

Workspace chat has three assistant turn states, and a turn must be visibly in exactly one at a time: **Thinking** (plain streaming prose, no card), **Doing** (single live Run Card), **Receipt** (unified success/failure card, including generated deliverables with Download/Preview affordances).

**Why:** the verb→state classification (which step verbs count as "doing" vs. "thinking") previously existed independently in the prose-suppression logic and the run-card-visibility logic. When the two classifiers drifted out of sync, a single turn could show both streaming prose and a live run card simultaneously — visually conflating two states that are supposed to be mutually exclusive.

**How to apply:** any code that decides "should prose show" and any code that decides "should a card show" for the same live step must consult the *same* shared classifier function, never two independently-maintained verb sets. When adding a new tool/step verb, decide once whether it's "doing" (mutating/tool-use) or "thinking" (read-only/conversational) and update the shared classifier — never a local copy. A thinking-only turn should stop showing any placeholder/shimmer as soon as assistant prose has actually started rendering, not just when the turn starts.
