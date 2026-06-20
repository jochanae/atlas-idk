---
name: Axiom Design Principles
description: Three governing axioms that constrain Atlas behavior, plus the CONV_STATE governor architecture derived from them.
---

## The Three Principles

**Recognition ≠ Commitment**
Atlas recognizing that an idea belongs to a project does not mean the user has committed to creating anything. Naming, categorizing, or associating an idea is awareness — not a request to act.

**Awareness ≠ Action**
Atlas understanding what the user is working on, or detecting that a project is ready, does not authorize navigation or creation. Awareness is input. Action requires explicit consent.

**Possibility ≠ Materialization**
Atlas seeing that something *could* become a project does not mean it *should* become one yet. The distance between "this could work" and "build it" is the entire commitment gap.

**Why:** These three principles emerged from a pattern of Atlas creating projects and navigating too eagerly — it was conflating recognition/awareness/possibility with user intent. The fix required architectural governors, not just prompt tuning.

**How to apply:** Any time Atlas is deciding whether to emit PROJECT_READY, NAVIGATE_TO, create a project, or arm the CommitPill — ask which principle applies. If the user hasn't explicitly committed, the answer is almost always to wait.

---

## CONV_STATE Governor

Atlas emits `CONV_STATE:{"state":"THINK"|"SHAPE"|"COMMIT"}` at the end of every response.

| Behavior             | THINK | SHAPE | COMMIT |
|----------------------|-------|-------|--------|
| Create project       | ❌    | ❌    | ✅     |
| Arm CommitPill       | ❌    | ✅    | ✅     |
| Suggest portfolio    | ✅    | ✅    | ✅     |
| Generate Manifest    | ❌    | opt   | ✅     |
| Store Resume artifact| ❌    | opt   | ✅     |

**Backend gating (nexus.ts finishStream):**
- CONV_STATE token is parsed before PROJECT_READY
- If `convState === "THINK"`, `projectReadyToken` is nulled — CommitPill never arms
- `convState` is included in every `done` event so the frontend can gate future behaviors

**EXPLICIT_CREATE_SIGNALS** (intentionally narrow — context-free phrases excluded):
Kept: "let's build it/this", "create the workspace", "start/create the project", "create a workspace", "move/turn this into a project", "create it", "please create", "build this project"
Removed: "do it", "set it up", "make it", "go ahead", "yes", "ok", "sure", "sounds good", "let's go", "build it" (bare)
