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

export type SketchStylePreset = "concept" | "wireframe" | "moodboard" | "blueprint" | "photoreal";

export const SKETCH_STYLE_PRESETS: SketchStylePreset[] = [
  "concept",
  "wireframe",
  "moodboard",
  "blueprint",
  "photoreal",
];

export const SKETCH_STYLE_LABEL: Record<SketchStylePreset, string> = {
  concept: "Concept",
  wireframe: "Wireframe",
  moodboard: "Mood board",
  blueprint: "Blueprint",
  photoreal: "Photoreal",
};

export const SKETCH_STYLE_HINT: Record<SketchStylePreset, string> = {
  concept:
    "Loose hand-drawn whiteboard sketch, dark marker on light background, casual but legible.",
  wireframe:
    "Clean low-fidelity UI wireframe, light background, generous whitespace, grayscale blocks.",
  moodboard:
    "Editorial mood board collage, balanced composition, cohesive palette, magazine-quality.",
  blueprint:
    "Multi-panel industrial design board, premium editorial presentation, English labels only, product concept hero shot, orthographic blueprint views, workflow strip, crisp typography, no foreign-language text.",
  photoreal:
    "Photorealistic product render, studio lighting, crisp materials, clean dark background.",
};

export function isSketchStylePreset(v: unknown): v is SketchStylePreset {
  return typeof v === "string" && (SKETCH_STYLE_PRESETS as string[]).includes(v);
}

/**
 * Compose a prompt to send through the standard chat path.
 *
 * The leading `[SKETCH:<preset>]` marker is the explicit signal the
 * Cloud Run `/api/chat` handler branches on to route this turn to
 * image generation instead of replying as text. See BACKEND CONTRACT
 * below.
 */
export const SKETCH_PROMPT_MARKER_RE = /^\[SKETCH:(concept|wireframe|moodboard|blueprint|photoreal)\]\s*/i;

export function buildSketchPrompt(preset: SketchStylePreset, excerpt: string): string {
  const label = SKETCH_STYLE_LABEL[preset];
  const hint = SKETCH_STYLE_HINT[preset];
  const trimmed = excerpt.trim().slice(0, 700);
  return `[SKETCH:${preset}] Sketch this as a ${label} (thinking artifact, not a final deliverable).\n\nStyle: ${hint}\n\nSubject:\n${trimmed}`;
}

/**
 * User-facing label for an optimistic chat bubble that still stores the
 * full `[SKETCH:<preset>] …` prompt (needed for history / retry).
 */
export function formatSketchUserPromptDisplay(prompt: string): string {
  const match = prompt.match(SKETCH_PROMPT_MARKER_RE);
  if (!match) return prompt;
  const preset = match[1]?.toLowerCase();
  if (preset && isSketchStylePreset(preset)) {
    return `Sketch as ${SKETCH_STYLE_LABEL[preset]}`;
  }
  return "Sketch";
}

export function extractSketchSubject(prompt: string): string {
  const stripped = prompt.replace(SKETCH_PROMPT_MARKER_RE, "").trim();
  const subjectMatch = stripped.match(/\nSubject:\n([\s\S]*)$/i);
  if (subjectMatch?.[1]?.trim()) return subjectMatch[1].trim();
  return stripped
    .replace(/^Sketch this as a .*?\n\nStyle:\s*[\s\S]*$/i, "")
    .trim() || stripped;
}

const CAPABILITY_QUESTION_RE = /^(?:\s*)(?:can|could|do|does|is|are|will|would)\b[\s\S]*\?\s*$/i;
const DIRECT_IMAGE_REQUEST_RE = [
  /\b(sketch|draw|render|illustrate|visuali[sz]e|mock\s*up)\b\s+(?:this|that|it|me|a|an|the)\b/i,
  /\b(generate|create|make)\b[\s\S]{0,80}\b(image|picture|illustration|render|sketch|mockup|wireframe|mood\s*board)\b/i,
  /\bshow\s+me\b[\s\S]{0,80}\b(image|picture|render|sketch|mockup|wireframe|mood\s*board)\b/i,
];

export function inferSketchStylePreset(text: string): SketchStylePreset {
  const lower = text.toLowerCase();
  if (/(wireframe|layout|ui|screen|page|dashboard|interface|app)/i.test(lower)) return "wireframe";
  if (/(mood\s*board|moodboard|palette|brand|branding|style|editorial|vibe)/i.test(lower)) return "moodboard";
  if (/(blueprint|orthographic|schematic|industrial design|concept board|product board)/i.test(lower)) return "blueprint";
  if (/(photoreal|photo\s*real|realistic|product\s*render|studio\s*lighting|cinematic)/i.test(lower)) return "photoreal";
  return "concept";
}

export function shouldAutoRouteToSketchPrompt(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || SKETCH_PROMPT_MARKER_RE.test(trimmed)) return false;
  if (CAPABILITY_QUESTION_RE.test(trimmed) && !/\b(of|for|this|that|it|me)\b/i.test(trimmed)) return false;
  return DIRECT_IMAGE_REQUEST_RE.some((re) => re.test(trimmed));
}

export function routeDirectImageRequestToSketchPrompt(text: string): string {
  if (!shouldAutoRouteToSketchPrompt(text)) return text;
  return buildSketchPrompt(inferSketchStylePreset(text), text);
}

/**
 * ─── SKETCH FLOW (R6) ──────────────────────────────────────────────────
 * Clients no longer short-circuit on `[SKETCH:<preset>]`. They rewrite the
 * marker into natural language (`Generate a <preset> style image: …`) and
 * route through the normal LLM chat path. The model emits
 * `IMAGE_GEN:{"prompt":…}` tokens; the nexus/chat handler extracts them,
 * sends `event: image_pending`, then `event: done`, then generates the
 * image and emits `event: image` with `{ images: [{ imageUrl: "data:…" }] }`.
 * Frontend surfaces must render from `imageGen` / `imageB64` (not only
 * `imageUrl`) — Ask Atlas historically missed that and showed no sketch.
 * ───────────────────────────────────────────────────────────────────────
 */

