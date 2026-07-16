/**
 * Single source of truth for the Thinking / Doing split used across the
 * workspace chat surface (ChatStream suppression + WorkspaceRunCard).
 *
 * Thinking  — plain prose, no card. Anything not in EXECUTION_VERBS.
 * Doing     — single live Run Card with a plain-language step label.
 *
 * Task #158: previously ChatStream suppressed streaming prose for ANY
 * liveStep (including pure THOUGHT/FILE_READ steps), which meant "Thinking"
 * turns rendered no text at all until the model finished. Centralizing the
 * verb classification here keeps ChatStream and WorkspaceRunCard in sync.
 */

// Verbs that mean Atlas is actually writing, building, or executing something.
// Anything not in this set is a read/think operation ("Thinking").
export const EXECUTION_VERBS = new Set([
  "FILE_EDIT", "LINE_PATCH", "FILE_DELETE", "COMMAND", "SHELL",
  "BUILD", "INSTALL", "TEST", "GITHUB_PUSH", "IMAGE_GEN", "RUN",
  "ARTIFACT_CREATED",
  // Read-only file checks in Build mode still belong to the run lifecycle:
  // active card → completed/no-change receipt → Details. Pure chat turns do
  // not emit these steps because the backend suppresses build steps there.
  "FILE_READ",
]);

function looksLikeFilePath(target?: string | null): boolean {
  if (!target || /\s/.test(target)) return false;
  return target.includes("/") || /\.[a-zA-Z0-9]{1,8}$/.test(target);
}

/** True when this verb represents a "Doing" (mutating/tool-use) step. */
export function isDoingVerb(verb?: string | null, target?: string | null): boolean {
  if (!verb) return false;
  const v = verb.toUpperCase();
  if (EXECUTION_VERBS.has(v)) return true;
  return (v === "READ" || v === "READING") && looksLikeFilePath(target);
}

/** Plain-language label for a "Thinking" step — never raw verbs like FILE_READ/TREE. */
export function thinkingLabel(verb?: string | null, target?: string | null): string {
  const v = (verb ?? "").toUpperCase();
  const filename = target ? target.split("/").pop() ?? target : "";
  if (v === "TREE") return "Reviewing project structure…";
  if (v === "FILE_READ") return filename ? `Reading ${filename}…` : "Reviewing project files…";
  if (v === "FETCH") return target ? `Looking into ${target}…` : "Fetching context…";
  return "Thinking…";
}

/** Plain-language label for a "Doing" step — never raw verbs like FILE_EDIT. */
export function doingLabel(verb?: string | null, target?: string | null): string {
  const v = (verb ?? "").toUpperCase();
  const filename = target ? target.split("/").pop() ?? target : "";
  switch (v) {
    case "FILE_EDIT":
    case "LINE_PATCH":
      return filename ? `Editing ${filename}` : "Editing project files";
    case "FILE_DELETE":
      return filename ? `Removing ${filename}` : "Removing file";
    case "FILE_READ":
    case "READ":
    case "READING":
      return filename ? `Reading ${filename}` : "Reading project files";
    case "GITHUB_PUSH":
      return target ? `Pushing to ${target}` : "Pushing to GitHub";
    case "BUILD":
      return "Running build";
    case "INSTALL":
      return "Installing packages";
    case "TEST":
      return "Running tests";
    case "IMAGE_GEN":
      return "Generating image";
    case "ARTIFACT_CREATED":
      return target ? `Generating ${target}` : "Generating file";
    case "COMMAND":
    case "SHELL":
    case "RUN":
      return target ? `Running ${target}` : "Running command";
    default:
      return filename ? `Working on ${filename}` : "Working…";
  }
}
