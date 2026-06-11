/**
 * Sketch style presets — user-facing styles selectable when offering to
 * sketch a thinking artifact from an assistant reply. Each preset carries
 * a label and a style hint appended to the generation prompt.
 *
 * Ported from Compani (sketchStylePresets.ts) and adapted for Atlas.
 * In Atlas, image generation flows through the standard chat path, so we
 * compose a prompt rather than calling a dedicated work-image hook.
 *
 * Discipline (per North Star):
 *   - Sketch = thinking artifact, not a build deliverable.
 *   - Manual chip path only; no auto-emit from the model.
 *   - Any preset (including Photoreal) is an exploration, not a commit.
 */

export type SketchStylePreset = "concept" | "wireframe" | "moodboard" | "photoreal";

export const SKETCH_STYLE_PRESETS: SketchStylePreset[] = [
  "concept",
  "wireframe",
  "moodboard",
  "photoreal",
];

export const SKETCH_STYLE_LABEL: Record<SketchStylePreset, string> = {
  concept: "Concept",
  wireframe: "Wireframe",
  moodboard: "Mood board",
  photoreal: "Photoreal",
};

export const SKETCH_STYLE_HINT: Record<SketchStylePreset, string> = {
  concept:
    "Loose hand-drawn whiteboard sketch, dark marker on light background, casual but legible.",
  wireframe:
    "Clean low-fidelity UI wireframe, light background, generous whitespace, grayscale blocks.",
  moodboard:
    "Editorial mood board collage, balanced composition, cohesive palette, magazine-quality.",
  photoreal:
    "Photorealistic product render, studio lighting, crisp materials, clean dark background.",
};

export function isSketchStylePreset(v: unknown): v is SketchStylePreset {
  return typeof v === "string" && (SKETCH_STYLE_PRESETS as string[]).includes(v);
}

/**
 * Compose a prompt to send through the standard chat path. The leading
 * verb explicitly asks for an image so atlas-chat routes it to the
 * image-generation tool; the style hint pins the visual register.
 */
export function buildSketchPrompt(preset: SketchStylePreset, excerpt: string): string {
  const label = SKETCH_STYLE_LABEL[preset];
  const hint = SKETCH_STYLE_HINT[preset];
  const trimmed = excerpt.trim().slice(0, 700);
  return `Sketch this as a ${label} (thinking artifact, not a final deliverable).\n\nStyle: ${hint}\n\nSubject:\n${trimmed}`;
}
