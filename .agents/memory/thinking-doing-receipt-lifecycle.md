---
name: Thinking/Doing/Receipt chat lifecycle
description: How Atlas workspace chat distinguishes prose-only "Thinking" turns from card-worthy "Doing" turns, and the shared classification module that governs both.
---

Workspace chat has three assistant turn states: **Thinking** (plain streaming prose, no card), **Doing** (single live Run Card, plain-language step label), **Receipt** (unified success/failure card, including generated deliverables like DOCX/PPTX/PDF with Download/Preview buttons).

The verb→state/label classification is centralized in `artifacts/atlas-frontend/src/lib/runStepLabels.ts` (`EXECUTION_VERBS`, `isDoingVerb()`, `doingLabel()`, `thinkingLabel()`). Both `ChatStream.tsx` (prose suppression) and `WorkspaceRunCard.tsx` (live card + receipt) import from it.

**Why:** before this, `ChatStream.tsx` suppressed assistant prose for *any* live step (even pure read/think steps like FILE_READ/TREE), so "Thinking" turns showed no text until the model finished — conflating Thinking and Doing into one visual state. The verb list also existed independently in three places (ChatStream, WorkspaceRunCard's `EXECUTION_VERBS`, and its `InlineThinkingPulse`/`liveStepMeta` label logic), so they could silently drift.

**How to apply:** prose should only be suppressed while an actual mutating/tool-use step (`isDoingVerb()` true) is live — not for read-only/thinking steps. When a pure-thinking live step is active, `WorkspaceRunCard` renders nothing (no shimmer card) once prose has started streaming; the card only appears for genuine Doing steps. Deliverable generation (`ARTIFACT_CREATED` step, from `generate-deliverable.ts`) produces a `"delivered"` `DerivedStatus` in `adaptExecutionRun()`, resolved via `artifactUrl: "artifact://<id>"` → `/api/projects/:id/artifacts/:artifactId/download`. `ViewChangesPanel.tsx` has its own separate, older verb-tag mapping that was NOT migrated to this shared module (tracked as a follow-up) — don't assume its tags match WorkspaceRunCard's.
