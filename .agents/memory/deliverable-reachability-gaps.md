---
name: Deliverable generation reachability gaps
description: Which artifact types are actually reachable from a live conversation vs only via direct API
---

The `generate_deliverable` agent tool (chat-reachable) only accepts `type: "pptx" | "docx" | "xlsx"`, even though pdf/mermaid/chart renderers are fully registered with the Artifact Engine and pass their own verifiers. There is no chat tool wired for diagrams/charts/pdf — they are only reachable via the generic `POST /api/projects/:id/deliverables/:type/generate` route (used by the "Export PDF" UI path only in a different, non-Artifact-Engine way for PDF, and not exposed in the UI at all for mermaid/chart).

**Why:** Discovered while running an e2e verification pass (F6A Artifact Verification Engine) — attempting to reach mermaid/pdf through natural conversation phrasing wasn't possible; had to call the generic deliverables route directly to exercise those verifiers end-to-end.

**How to apply:** If asked to make Atlas able to "draw a diagram" or "export a PDF" conversationally, the gap is in the agent tool's type enum / missing a dedicated tool, not the renderer or verifier layer. When e2e-testing any deliverable type outside pptx/docx/xlsx, use `POST /api/projects/:id/deliverables/:type/generate` directly rather than assuming a chat phrase will trigger it.
