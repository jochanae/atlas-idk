// Pure schema validation for Joy conversation cards.
// Transport-agnostic — currently the fenced-code-block syntax delivers these,
// but the parser itself knows nothing about markdown.
//
// If parsing or validation fails, callers MUST fall back gracefully (hide the
// block or show a plain question). Never expose raw JSON or code fences to
// the user.

const MAX_QUESTION_LEN = 200;
const MAX_OPTION_LEN = 80;
const MAX_OPTIONS_CHOICE = 2;
const MIN_OPTIONS_CLARIFY = 2;
const MAX_OPTIONS_CLARIFY = 4;

// ── Types ──────────────────────────────────────────────────────────────────

export interface AtlasChoiceCard {
  type: "atlas-choice";
  /** Two-option binary decision. */
  question: string;
  options: [string, string];
}

export interface AtlasClarifyCard {
  type: "atlas-clarify";
  /** Focused clarification with 2–4 options. */
  question: string;
  options: string[];
}

export type AtlasCard = AtlasChoiceCard | AtlasClarifyCard;

// ── Helpers ────────────────────────────────────────────────────────────────

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function validQuestion(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= MAX_QUESTION_LEN;
}

function validOptions(arr: string[]): boolean {
  return arr.every((o) => o.trim().length > 0 && o.length <= MAX_OPTION_LEN);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse and strictly validate an Joy card payload.
 *
 * @param lang  The fenced-block language tag, e.g. "atlas-choice"
 * @param raw   Raw string content of the fenced block
 * @returns     A validated AtlasCard, or null if invalid
 */
export function parseAtlasCard(lang: string, raw: string): AtlasCard | null {
  // Only handle known types — reject unknown atlas-* variants silently.
  if (lang !== "atlas-choice" && lang !== "atlas-clarify") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }

  // Must be a plain object — not an array, not null, not a primitive.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  // Reject any unexpected top-level keys to avoid executing arbitrary properties.
  const allowedKeys = new Set(["question", "options"]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) return null;
  }

  const { question, options } = obj;

  if (!validQuestion(question)) return null;
  if (!isStringArray(options)) return null;
  if (!validOptions(options)) return null;

  if (lang === "atlas-choice") {
    if (options.length !== MAX_OPTIONS_CHOICE) return null;
    return {
      type: "atlas-choice",
      question: question.trim(),
      options: [options[0].trim(), options[1].trim()],
    };
  }

  if (lang === "atlas-clarify") {
    if (options.length < MIN_OPTIONS_CLARIFY || options.length > MAX_OPTIONS_CLARIFY) return null;
    return {
      type: "atlas-clarify",
      question: question.trim(),
      options: options.map((o) => o.trim()),
    };
  }

  return null;
}
