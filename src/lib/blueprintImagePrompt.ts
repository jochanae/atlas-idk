/**
 * Wraps a blueprint's raw `visualPrompt` in a rich, multi-panel industrial-
 * design board template so generated images match the original Blueprint
 * style — magazine-quality hero + orthographic views + interaction states.
 *
 * Keeps prompt quality controlled here in the frontend, independent of
 * whatever the Cloud Run `/api/projects/:id/blueprint` endpoint currently
 * emits in `visualPrompt`.
 */
export function buildBlueprintImagePrompt(visualPrompt: string, title?: string): string {
  const subject = (visualPrompt ?? "").trim();
  const heading = title?.trim() ? `Concept: ${title.trim()}` : "Concept";
  return [
    "Multi-panel industrial design board, magazine-quality presentation, dark editorial background, premium materials, cohesive palette, English labels only.",
    "",
    "Layout:",
    "- Top-left: product concept hero shot, studio lighting, three-quarter view, crisp materials.",
    "- Top-right: orthographic views (front / side / top) with light annotation lines, technical blueprint feel, clean readable English annotations.",
    "- Bottom: 4-state interaction or workflow strip with clean English labels.",
    "- Typography: minimal, legible, premium editorial, no foreign-language text, no gibberish.",
    "",
    heading,
    "",
    "Subject:",
    subject,
  ].join("\n");
}
