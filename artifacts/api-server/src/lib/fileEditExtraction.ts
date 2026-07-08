/**
 * Shared FILE_EDIT_START/FILE_EDIT_END text-block parsing.
 *
 * This is the legacy (pre-agent-loop) file edit format. It is still emitted by
 * the base Atlas system prompt, so any code path that can receive raw model
 * text (classic chat path, or the agent-loop fallback recovery) needs the same
 * parser — kept here once so both stay in sync.
 */

export interface FileEdit {
  path: string;
  language: string;
  content: string;
}

export const BLOCKED_PATH_RE = /(?:^|[\\/])(?:pnpm-workspace\.yaml|(?:vite|tsconfig|drizzle|jest|vitest|eslint|prettier|babel|webpack|rollup|postcss)\.config\.[a-z]+|\.env[.\w]*)$/i;
export const BLOCKED_DIR_RE = /^(?:node_modules|dist|build|\.next|\.cache)[\\/]/;

export function extractAllFileEdits(content: string): { visibleContent: string; fileEdits: FileEdit[] } {
  const startMarker = "FILE_EDIT_START";
  const endMarker = "FILE_EDIT_END";
  const contentMarker = "FILE_EDIT_CONTENT";

  const fileEdits: FileEdit[] = [];
  const firstStart = content.indexOf(startMarker);
  const visibleContent = firstStart !== -1 ? content.slice(0, firstStart).trim() : content;

  let searchFrom = 0;
  while (true) {
    const startIdx = content.indexOf(startMarker, searchFrom);
    if (startIdx === -1) break;
    const endIdx = content.indexOf(endMarker, startIdx + startMarker.length);
    if (endIdx === -1) break;

    const block = content.slice(startIdx + startMarker.length, endIdx);
    const contentIdx = block.indexOf(contentMarker);
    if (contentIdx !== -1) {
      const header = block.slice(0, contentIdx).trim();
      const fileContent = block.slice(contentIdx + contentMarker.length);
      const trimmed = fileContent.startsWith("\n") ? fileContent.slice(1) : fileContent;
      const final = trimmed.endsWith("\n") ? trimmed.slice(0, -1) : trimmed;

      let path = "";
      let language = "typescript";
      for (const line of header.split("\n")) {
        const ci = line.indexOf(":");
        if (ci === -1) continue;
        const key = line.slice(0, ci).trim();
        const val = line.slice(ci + 1).trim();
        if (key === "path") path = val;
        if (key === "language") language = val;
      }
      // Block forbidden paths silently — don't surface them to the user
      if (path && !BLOCKED_PATH_RE.test(path) && !BLOCKED_DIR_RE.test(path)) {
        fileEdits.push({ path, language, content: final });
      }
    }

    searchFrom = endIdx + endMarker.length;
  }

  return { visibleContent, fileEdits };
}
