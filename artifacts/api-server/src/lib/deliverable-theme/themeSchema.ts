// Zod schema + safe font whitelist for LLM-inferred deliverable themes
// (Phase 3B.2). Kept separate from tokens.ts so the "what shape is a theme"
// contract and the "what's the default" concern don't live in the same file.
import { z } from "zod";

const HEX_RE = /^[0-9A-Fa-f]{6}$/;
const hexColor = () => z.string().regex(HEX_RE, "must be a 6-digit hex color without #");

// PowerPoint-safe fonts only — no custom font embedding, so an inferred theme
// must pick from fonts that render correctly without the font being installed.
export const FONT_WHITELIST = [
  "Georgia",
  "Calibri",
  "Arial",
  "Verdana",
  "Times New Roman",
  "Garamond",
  "Trebuchet MS",
  "Book Antiqua",
  "Century Gothic",
  "Palatino Linotype",
  "Segoe UI",
  "Tahoma",
] as const;

export const InferredThemeSchema = z.object({
  name: z.string().min(1),
  colors: z.object({
    background: hexColor(),
    surface: hexColor(),
    accent: hexColor(),
    accentDim: hexColor(),
    heading: hexColor(),
    body: hexColor(),
    bodyMuted: hexColor(),
    footer: hexColor(),
  }),
  fonts: z.object({
    heading: z.enum(FONT_WHITELIST),
    body: z.enum(FONT_WHITELIST),
  }),
});
export type InferredTheme = z.infer<typeof InferredThemeSchema>;
