// Project theme inference (Phase 3B.2). Infers a deliverable theme (color
// palette + font pairing) from a project's DNA (creative principles +
// experience intent) and/or an explicit user style instruction, so the same
// layout catalog can render CoinsBloom as fintech-emerald and Care
// Coordination as calming-blue without any layout code changing.
//
// Precedence handled by resolveDeliverableTheme() in tokens.ts:
//   explicit style override > inferred project theme > ATLAS_DEFAULT_THEME
import { generateValidatedContentPlan } from "../renderers/contentPlan";
import { logger } from "../logger";
import { ATLAS_DEFAULT_THEME, type DeliverableTheme } from "./tokens";
import { InferredThemeSchema, FONT_WHITELIST, type InferredTheme } from "./themeSchema";

export interface ThemeInferenceInput {
  creativePrinciples?: string[];
  experienceIntent?: {
    emotionalRegister?: string[];
    visualLanguage?: string[];
    designPrinciples?: string[];
    interactionPosture?: string[];
  };
  /** Explicit user instruction, e.g. "make it look like Pixar" or "match our fintech emerald branding". Wins over inferred DNA signals when both are present. */
  styleOverride?: string;
  /** Used only for prompt context / theme naming, never persisted. */
  projectName?: string;
}

const THEME_PROMPT = `You are a visual designer choosing a color palette and font pairing for a generated PowerPoint deck.

{SOURCE_BLOCK}

Design a cohesive theme:
- Pick a "name" (2-4 words) describing the theme's mood, e.g. "Fintech Emerald" or "Calm Family Blue".
- Pick 8 hex colors (no #, 6 digits): background (the slide's base fill — usually dark or a soft tint, must NOT be pure white #FFFFFF or pure black #000000), surface (for cards, close to background but visually distinct), accent (the theme's signature color, used for headings/dividers — should feel intentional, not generic blue), accentDim (a muted/desaturated version of accent, used for subtle lines), heading (the main text color, must contrast strongly against background), body (slightly softer than heading but still highly readable against background), bodyMuted (for captions/labels, readable but clearly secondary), footer (small footer/page-number text, subtle but legible against background).
- Pick a heading font and a body font, each from EXACTLY this list (case-sensitive, no substitutions): ${FONT_WHITELIST.join(", ")}.
- Ensure heading and body colors are clearly readable against the background color you chose (do not pick colors close in brightness to the background).

Output ONLY valid JSON, no markdown, no explanation:
{
  "name": "...",
  "colors": { "background": "...", "surface": "...", "accent": "...", "accentDim": "...", "heading": "...", "body": "...", "bodyMuted": "...", "footer": "..." },
  "fonts": { "heading": "...", "body": "..." }
}`;

function hasSignal(input: ThemeInferenceInput): boolean {
  if (input.styleOverride && input.styleOverride.trim().length > 0) return true;
  if (input.creativePrinciples && input.creativePrinciples.length > 0) return true;
  const ei = input.experienceIntent;
  if (!ei) return false;
  return Boolean(
    ei.emotionalRegister?.length || ei.visualLanguage?.length || ei.designPrinciples?.length || ei.interactionPosture?.length,
  );
}

function buildSourceBlock(input: ThemeInferenceInput): string {
  const lines: string[] = [];
  if (input.projectName) lines.push(`Project: ${input.projectName}`);
  if (input.creativePrinciples?.length) lines.push(`Creative principles: ${input.creativePrinciples.join(", ")}`);
  const ei = input.experienceIntent;
  if (ei?.emotionalRegister?.length) lines.push(`Emotional register: ${ei.emotionalRegister.join(", ")}`);
  if (ei?.visualLanguage?.length) lines.push(`Visual language: ${ei.visualLanguage.join(", ")}`);
  if (ei?.designPrinciples?.length) lines.push(`Design principles: ${ei.designPrinciples.join(", ")}`);
  if (ei?.interactionPosture?.length) lines.push(`Interaction posture: ${ei.interactionPosture.join(", ")}`);
  if (input.styleOverride) lines.push(`\nEXPLICIT USER INSTRUCTION (this takes priority over anything above): ${input.styleOverride}`);
  return lines.length > 0 ? lines.join("\n") : "No specific signals available — use tasteful judgment.";
}

// WCAG-style relative luminance, used only for a coarse contrast sanity check
// (not full WCAG compliance) — cheap guard against an LLM picking two colors
// that are technically different hex values but read as the same brightness.
function relativeLuminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

function passesContrast(theme: InferredTheme): boolean {
  const MIN_RATIO = 3.2; // deliberately below strict WCAG AA (4.5) — decks lean stylistic, not body-text-dense
  return (
    contrastRatio(theme.colors.background, theme.colors.heading) >= MIN_RATIO &&
    contrastRatio(theme.colors.background, theme.colors.body) >= MIN_RATIO
  );
}

function toDeliverableTheme(inferred: InferredTheme): DeliverableTheme {
  return {
    name: inferred.name,
    colors: {
      background: inferred.colors.background.toUpperCase(),
      surface: inferred.colors.surface.toUpperCase(),
      accent: inferred.colors.accent.toUpperCase(),
      accentDim: inferred.colors.accentDim.toUpperCase(),
      heading: inferred.colors.heading.toUpperCase(),
      body: inferred.colors.body.toUpperCase(),
      bodyMuted: inferred.colors.bodyMuted.toUpperCase(),
      footer: inferred.colors.footer.toUpperCase(),
    },
    fonts: { heading: inferred.fonts.heading, body: inferred.fonts.body },
  };
}

/**
 * Infers a deliverable theme from project DNA / explicit style instruction.
 * Returns null (caller should fall back to ATLAS_DEFAULT_THEME) when there's
 * no signal to work with, the LLM call fails, or the result fails a basic
 * contrast sanity check — never returns a theme that risks being unreadable.
 */
export async function inferProjectTheme(input: ThemeInferenceInput): Promise<DeliverableTheme | null> {
  if (!hasSignal(input)) return null;

  const prompt = THEME_PROMPT.replace("{SOURCE_BLOCK}", buildSourceBlock(input));
  try {
    const inferred = await generateValidatedContentPlan<InferredTheme>(prompt, InferredThemeSchema, "Theme inference");
    if (!passesContrast(inferred)) {
      logger.warn({ theme: inferred.name }, "inferProjectTheme: contrast check failed — falling back to default theme");
      return null;
    }
    return toDeliverableTheme(inferred);
  } catch (err) {
    logger.warn({ err }, "inferProjectTheme: inference failed — falling back to default theme");
    return null;
  }
}

export { ATLAS_DEFAULT_THEME };
