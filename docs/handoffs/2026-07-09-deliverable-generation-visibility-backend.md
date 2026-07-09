# Handoff: Deliverable generation must be visible, openable, and timeline-linked

**Date:** 2026-07-09  
**Repo:** `Axiom-Atlas` backend  
**Lane:** Backend only. Lovable frontend now reads project file-backed artifacts in the Workspace **Outputs** panel.

---

## Problem

Atlas can call `generate_deliverable` and create a real `.pptx`/`.docx`/`.xlsx`, but the user experience is unclear:

- Atlas says the file was generated.
- The assistant text points to a “Deliverables tab,” which is not the visible UI name.
- No inline card appears with the generated file.
- Timeline only gets generic tool steps like `Running/Completed generate_deliverable`; it does not show `ARTIFACT_CREATED` with an openable target.
- The user cannot tell what the PowerPoint looked like unless they discover the project artifact record.

Frontend now exposes generated file-backed artifacts under Workspace → **Outputs** and can open a timeline artifact link when `artifact_url` is `artifact://<artifactId>`.

---

## Required backend changes

### 1. Update `generate_deliverable` copy

Replace “Deliverables tab” with **Outputs** everywhere user-facing:

- tool description
- returned `summary`
- model/system guidance that tells Atlas where generated files are saved

Atlas should say: “I generated it — it’s in Outputs” and include a direct action if possible.

### 2. Emit structured generated-artifact metadata to the client

When `generate_deliverable` succeeds, return enough structured data for the stream `done` payload and/or a data event:

```json
{
  "ok": true,
  "artifactId": 123,
  "projectId": 45,
  "type": "pptx",
  "title": "Beta Tester Presentation",
  "extension": "pptx",
  "downloadUrl": "/api/projects/45/artifacts/123/download",
  "preview": {
    "title": "Beta Tester Presentation",
    "subtitle": "...",
    "slideCount": 8,
    "slideHeadings": ["...", "..."]
  }
}
```

Then include it in the final stream metadata as something like:

```json
{ "generatedArtifacts": [ ... ] }
```

This lets the frontend render an inline “PowerPoint generated” card in the assistant message instead of relying on prose.

### 3. Write a timeline step for generated files

On successful `generate_deliverable`, add a non-code step:

```ts
{
  verb: "ARTIFACT_CREATED",
  target: artifact.title,
  detail: `${artifact.type.toUpperCase()} · ${artifact.extension}`,
  content: artifact.summary ?? null,
  artifactUrl: `artifact://${artifact.id}`
}
```

Do not write this as `FILE_EDIT`; generated decks/docs/spreadsheets belong in Timeline/Outputs, not Changes diffs.

### 4. Persist enough preview data

The existing PPTX renderer returns `slideCount` and `slideHeadings`. Keep that in `project_artifacts.payload.preview` so Outputs can show what was created without downloading.

For PPTX specifically, consider upgrading preview later to generated slide thumbnails, but minimum acceptance is outline + download.

### 5. End-to-end tool verification

The following tools are registered but still need live conversation walkthroughs:

- `read_file`
- `search_codebase`
- `list_reference_project_dir`
- `read_reference_project_file`
- `generate_deliverable` with a real PPTX request

Record: tool call fired, result returned to model, assistant response correct, timeline step persisted, UI opens expected surface.

---

## Acceptance

1. User asks: “Generate a PowerPoint for beta testers.”
2. Atlas calls `generate_deliverable` and creates a `.pptx` row in `project_artifacts`.
3. Assistant message includes an inline generated-output card with title, type, slide count/headings, and download/open action.
4. Workspace → Outputs shows the file immediately and expands to the same outline.
5. Workspace → Changes → Timeline shows `ARTIFACT_CREATED` / “Output” with an “Open Output” action.
6. Clicking timeline “Open Output” opens Workspace → Outputs and expands the generated PowerPoint.
7. No user-facing copy says “Deliverables tab.”
