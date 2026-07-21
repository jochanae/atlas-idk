/**
 * Extract labeling / versioning helpers (T3).
 * Persistence wiring uses the same labels — single pipeline.
 */

export const EXTRACT_VERSION = 1 as const;

export type ExtractPayload = {
  text: string;
  extractVersion: number;
  truncated: boolean;
  format: string;
  truncationReason?: string;
};

/**
 * Wrap extract text for model injection with an explicit version label.
 * Truncated extracts must be labeled — never silent truncation.
 */
export function labelExtractForModel(payload: ExtractPayload): string {
  const version = payload.extractVersion || EXTRACT_VERSION;
  const header = payload.truncated
    ? `[attachment extract v${version} — truncated${payload.truncationReason ? `: ${payload.truncationReason}` : " to budget"}]`
    : `[attachment extract v${version}]`;
  return `${header}\n${payload.text}`;
}
