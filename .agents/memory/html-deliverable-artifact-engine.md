---
name: HTML deliverable via Artifact Engine
description: How HTML became a real Artifact Engine deliverable type by reusing the existing Draft/Sandbox pathway instead of building a second HTML system.
---

Atlas already had two separate HTML-related systems before this change: preview.ts's React-component multi-file preview builder, and a Draft/Sandbox pathway (useChatStream detects a FILE_EDIT at `preview/output.html`, PreviewPanel renders it via `buildSrcdoc`). Only the second one mattered for turning HTML into a persisted deliverable — the first is an unrelated system and should not be touched for HTML-deliverable work.

**Decision:** register `"html"` as an Artifact Engine renderer type (alongside docx/pptx/xlsx) rather than adding a second generation path. The renderer takes HTML the app already produced (no LLM call inside the renderer) and just packages it: wraps bare fragments into a standalone document, runs a safety/completeness heuristic, and returns `status: "generated" | "needs_review"`.

**Why:** the user explicitly rejected a second/duplicate HTML system. Reusing the existing Draft/Sandbox content flow and only adding the missing persistence layer (project_artifacts row, Ledger entry, download) kept the diff minimal and consistent with how docx/pptx/xlsx already work.

**How to apply:** if HTML generation needs to change (e.g. new safety rules, different wrapping), edit `artifacts/api-server/src/lib/renderers/htmlRenderer.ts`. Do not add a second HTML type to `generate-deliverable.ts`'s type enum. The `status` field on `ArtifactRenderOutput`/`GeneratedArtifact` in `artifactEngine.ts` is generic — other renderers can set `needs_review` too, and the client (PreviewPanel) already has the review-gate UI (`pendingReview` state) wired to any artifact whose `axiom:preview-artifact` event carries `needsReview: true`.
