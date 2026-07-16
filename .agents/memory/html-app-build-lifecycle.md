---
name: HTML App Build Lifecycle
description: The missing end-to-end build experience for generated web apps — inline preview, iteration loop, deploy/share. Locked in for future work.
---

## The Gap

Atlas can now generate self-contained HTML web apps via `generate_deliverable` (type `html-app`). The renderer works. But the user experience stops at "file saved to Outputs" — which is the wrong endpoint for an app.

## What the full lifecycle should look like

Compare to Lovable/Bolt/v0:

1. **Generate** — user describes app in conversation → Atlas calls generate_deliverable → app produced
2. **Inline preview** — app renders as a live iframe directly in the conversation message (not a download card, not buried in Outputs). User can interact with it immediately — click the timer, see it run.
3. **Iterate** — user sends follow-up ("make the ring purple") → Atlas regenerates → updated iframe appears below the previous one. Full history preserved.
4. **Code access** — "show me the code" → source shown in a code block, copyable
5. **Deploy/share** — "give me a link to this" → one-click share URL (sandbox hosted)
6. **Promote to project** — if the user wants to evolve it beyond a single file, this is the on-ramp to the full Workspace build experience

## What's built vs missing

| Step | Status |
|---|---|
| Generation (html-app renderer, generate_deliverable tool) | ✅ Built |
| Artifact stored with preview.html payload | ✅ Built |
| artifact_created SSE event carries preview.html | ✅ Built |
| Inline iframe rendered in chat stream | ❌ Missing |
| Iteration (regenerate on follow-up, update iframe) | ❌ Missing |
| Deploy/share link | ❌ Missing (Runtime tab exists but not wired to html-app) |

## Implementation note

The `artifact_created` SSE event already carries `preview: { safe, reasons, html }`. When `type === "html-app"` and `preview.safe === true`, the workspace chat stream should render the HTML as a sandboxed `<iframe srcdoc>` inline in the message instead of the generic download card. When `preview.safe === false`, show the download card with review reasons visible. This is the minimum viable change to get the Lovable-style experience.

**Why:** Jo confirmed this is the correct UX model. "When you generate deliverables, where would a user naturally expect them to be?" — for apps, the answer is: rendered inline, not filed away.
