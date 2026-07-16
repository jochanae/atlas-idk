/**
 * Atlas-owned GitHub commits stamp this trailer so Quiet Updates can skip
 * them — the push already has a GITHUB_PUSH receipt on the originating run.
 */
export const ATLAS_RUN_TRAILER_RE = /(?:^|\n)Atlas-Run:\s*\S+/;

/** Append `\n\nAtlas-Run: <runId>` when a run is active and the trailer is absent. */
export function appendAtlasRunTrailer(
  message: string,
  runId: string | null | undefined,
): string {
  if (!runId) return message;
  if (ATLAS_RUN_TRAILER_RE.test(message)) return message;
  return `${message.trimEnd()}\n\nAtlas-Run: ${runId}`;
}

/** True when a commit message was stamped by an Atlas run push. */
export function hasAtlasRunTrailer(message: string | null | undefined): boolean {
  return ATLAS_RUN_TRAILER_RE.test(message ?? "");
}
