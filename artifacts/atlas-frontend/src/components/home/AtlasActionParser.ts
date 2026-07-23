// Pure schema validation for Joy quick-action blocks.
// Transport-agnostic — the fenced-code-block syntax is today's delivery mechanism,
// but this parser knows nothing about markdown.
//
// Actions fire immediately on tap (no confirm step). The allowed ID list is
// intentionally small and closed — unknown IDs are rejected so the frontend
// never wires up unexpected side-effects.

const MAX_LABEL_LEN = 60;
const MAX_ACTIONS = 3;

/** IDs the frontend has registered handlers for. Any other value is rejected. */
export const ALLOWED_ACTION_IDS = new Set<string>([
  "create-project",
  "open-project",
]);

// ── Types ──────────────────────────────────────────────────────────────────

export interface AtlasActionItem {
  id: string;
  label: string;
  /** Optional structured payload. Values must be strings or numbers. */
  payload?: Record<string, string | number>;
}

export interface AtlasActionBlock {
  type: "atlas-action";
  actions: AtlasActionItem[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isPayload(v: unknown): v is Record<string, string | number> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  return Object.values(v).every(
    (x) => typeof x === "string" || typeof x === "number",
  );
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse and strictly validate an atlas-action block payload.
 *
 * @param raw  Raw string content of the fenced block (the JSON body)
 * @returns    A validated AtlasActionBlock, or null if invalid
 */
export function parseAtlasAction(raw: string): AtlasActionBlock | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  // Reject unexpected top-level keys.
  const allowedKeys = new Set(["actions"]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) return null;
  }

  const { actions } = obj;

  if (!Array.isArray(actions) || actions.length === 0 || actions.length > MAX_ACTIONS) {
    return null;
  }

  const validated: AtlasActionItem[] = [];

  for (const item of actions) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return null;

    const { id, label, payload, ...rest } = item as Record<string, unknown>;

    // No unknown keys in action items.
    if (Object.keys(rest).length > 0) return null;

    if (typeof id !== "string" || !ALLOWED_ACTION_IDS.has(id)) return null;
    if (typeof label !== "string" || label.trim().length === 0 || label.length > MAX_LABEL_LEN) {
      return null;
    }
    if (payload !== undefined && !isPayload(payload)) return null;

    validated.push({
      id,
      label: label.trim(),
      ...(payload !== undefined ? { payload: payload as Record<string, string | number> } : {}),
    });
  }

  if (validated.length === 0) return null;

  return { type: "atlas-action", actions: validated };
}
