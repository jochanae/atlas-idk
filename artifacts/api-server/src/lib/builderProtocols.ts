/**
 * Builder token protocols shared by /api/chat and /api/nexus/chat.
 *
 * Extractors + Output Guard scrub + BUILD prompt segment.
 * Field names on the done event must match chat.ts exactly so the
 * workspace frontend can consume nexus streams without changes.
 */

export type MemoryChipRich = {
  label: string;
  insight?: string;
  tier?: 1 | 2 | 3 | 4 | 5;
};

export interface FileEdit {
  path: string;
  language: string;
  content: string;
}

export interface LinePatch {
  path: string;
  find: string;
  replace: string;
}

export interface FileDelete {
  path: string;
}

export interface FileMove {
  from: string;
  to: string;
}

export type GithubPushToken = {
  branch: string;
  message: string;
  openPr?: boolean;
  prTitle?: string;
  prBody?: string;
  base?: string;
};

export type GithubPushResult = {
  branch: string;
  message: string;
  files: Array<{ path: string; commitSha?: string; commitUrl?: string; error?: string }>;
  prUrl?: string;
  prNumber?: number;
  error?: string;
};

export type FileEditSummary = {
  path: string;
  language: string;
  lines: number;
};

/** Paths Atlas must never write via FILE_EDIT / FILE_DELETE. */
export const BLOCKED_PATH_RE =
  /(?:^|[\\/])(?:pnpm-workspace\.yaml|(?:vite|tsconfig|drizzle|jest|vitest|eslint|prettier|babel|webpack|rollup|postcss)\.config\.[a-z]+|\.env[.\w]*)$/i;
export const BLOCKED_DIR_RE = /^(?:node_modules|dist|build|\.next|\.cache)[\\/]/;
export const CRITICAL_PATH_RE =
  /(?:^|[\\/])(?:package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|pnpm-workspace\.yaml|(?:vite|tsconfig|drizzle|jest|vitest|eslint|prettier|babel|webpack|rollup|postcss)\.config\.[a-z]+|\.env[.\w]*)$/i;
export const CRITICAL_DIR_RE = /(?:^|[\\/])(?:auth|security|payments?|billing|migrations?)(?:[\\/]|$)/i;

export function normalizeRepoPath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\.?\//, "");
}

export function isCriticalPath(path: string): boolean {
  const normalized = normalizeRepoPath(path);
  return CRITICAL_PATH_RE.test(normalized) || CRITICAL_DIR_RE.test(normalized);
}

export function fileExistsInRepo(path: string, repoFiles: Set<string> | null): boolean {
  return repoFiles?.has(normalizeRepoPath(path)) ?? false;
}

export function detectMemoryChips(content: string): { content: string; memoryChips: MemoryChipRich[] } {
  const marker = "MEMORY_CHIPS:";
  const idx = content.lastIndexOf(marker);
  if (idx === -1) return { content, memoryChips: [] };
  const before = content.slice(0, idx).trim();
  const after = content.slice(idx + marker.length).trimStart();
  // Prefer a single-line JSON array; fall back to first [...] block.
  const lineEnd = after.indexOf("\n");
  const candidates = [
    lineEnd === -1 ? after : after.slice(0, lineEnd).trim(),
    after.match(/^\[[\s\S]*?\]/)?.[0] ?? "",
  ].filter(Boolean);

  for (const jsonStr of candidates) {
    try {
      const chips = JSON.parse(jsonStr);
      if (Array.isArray(chips)) {
        const normalized: MemoryChipRich[] = chips.slice(0, 6).map((c) => {
          if (typeof c === "string") return { label: c };
          if (c && typeof c === "object" && typeof (c as { label?: unknown }).label === "string") {
            const obj = c as { label: string; insight?: unknown; tier?: unknown };
            return {
              label: obj.label,
              insight: typeof obj.insight === "string" ? obj.insight : undefined,
              tier:
                typeof obj.tier === "number" && obj.tier >= 1 && obj.tier <= 5
                  ? (obj.tier as 1 | 2 | 3 | 4 | 5)
                  : undefined,
            };
          }
          return { label: String(c) };
        });
        // Strip the marker + consumed JSON (and the rest of that line) from content.
        const consumedEnd = idx + marker.length + after.indexOf(jsonStr) + jsonStr.length;
        let rest = content.slice(consumedEnd);
        if (rest.startsWith("\n")) rest = rest.slice(1);
        const cleaned = `${before}${before && rest ? "\n" : ""}${rest}`.replace(/\n{3,}/g, "\n\n").trim();
        return { content: cleaned, memoryChips: normalized };
      }
    } catch {
      /* try next candidate */
    }
  }
  return { content, memoryChips: [] };
}

export function matchEntryChips(
  content: string,
  entries: Array<{ id: number; title: string; status: string }>,
): string[] {
  const lower = content.toLowerCase();
  return entries
    .filter((e) => e.title.length > 5 && lower.includes(e.title.toLowerCase()))
    .map((e) => e.title)
    .slice(0, 5);
}

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
      if (path && !BLOCKED_PATH_RE.test(path) && !BLOCKED_DIR_RE.test(path)) {
        fileEdits.push({ path, language, content: final });
      }
    }

    searchFrom = endIdx + endMarker.length;
  }

  return { visibleContent, fileEdits };
}

/**
 * Defensive fallback for the WRITE_FILE:{"path":...} marker.
 *
 * WRITE_FILE is not a structured protocol the backend ever parsed into a real file
 * write — only FILE_EDIT_START/FILE_EDIT_CONTENT/FILE_EDIT_END blocks are. If the
 * model ever emits WRITE_FILE (old habit, stale training data, or a future prompt
 * regression) immediately after a fenced code block, convert that pair into a real
 * FileEdit here instead of silently dropping it while the response text claims the
 * file was written — that silent-drop-plus-false-claim is the bug this closes.
 */
const WRITE_FILE_MARKER_RE = /```([\w-]*)\n([\s\S]*?)```\s*\nWRITE_FILE:(\{[^\n]+\})/g;

export function convertWriteFileMarkersToFileEdits(content: string): {
  visibleContent: string;
  fileEdits: FileEdit[];
} {
  const fileEdits: FileEdit[] = [];
  const visibleContent = content
    .replace(WRITE_FILE_MARKER_RE, (_match, language: string, code: string, json: string) => {
      try {
        const parsed = JSON.parse(json) as { path?: string };
        const path = (parsed.path ?? "").trim();
        if (path && !BLOCKED_PATH_RE.test(path) && !BLOCKED_DIR_RE.test(path)) {
          fileEdits.push({
            path,
            language: language || "typescript",
            content: code.endsWith("\n") ? code.slice(0, -1) : code,
          });
        }
      } catch {
        // Malformed WRITE_FILE JSON — drop the marker but leave no orphaned claim.
      }
      return "";
    })
    .trim();

  return { visibleContent, fileEdits };
}

export function extractAllLinePatches(content: string): { visibleContent: string; linePatches: LinePatch[] } {
  const startMarker = "LINE_PATCH_START";
  const findMarker = "LINE_PATCH_FIND";
  const replaceMarker = "LINE_PATCH_REPLACE";
  const endMarker = "LINE_PATCH_END";

  const linePatches: LinePatch[] = [];
  const firstStart = content.indexOf(startMarker);
  const visibleContent = firstStart !== -1 ? content.slice(0, firstStart).trim() : content;

  let searchFrom = 0;
  while (true) {
    const startIdx = content.indexOf(startMarker, searchFrom);
    if (startIdx === -1) break;
    const endIdx = content.indexOf(endMarker, startIdx + startMarker.length);
    if (endIdx === -1) break;

    const block = content.slice(startIdx + startMarker.length, endIdx);
    const findIdx = block.indexOf(findMarker);
    const replaceIdx = block.indexOf(replaceMarker);

    if (findIdx !== -1 && replaceIdx !== -1 && replaceIdx > findIdx) {
      const header = block.slice(0, findIdx).trim();
      let path = "";
      for (const line of header.split("\n")) {
        const ci = line.indexOf(":");
        if (ci === -1) continue;
        const key = line.slice(0, ci).trim();
        const val = line.slice(ci + 1).trim();
        if (key === "path") {
          path = val;
          break;
        }
      }
      const findContent = block.slice(findIdx + findMarker.length, replaceIdx).trim();
      const replaceContent = block.slice(replaceIdx + replaceMarker.length).trim();
      if (path && findContent) {
        linePatches.push({ path, find: findContent, replace: replaceContent });
      }
    }
    searchFrom = endIdx + endMarker.length;
  }

  return { visibleContent, linePatches };
}

export function extractAllFileDeletes(content: string): { visibleContent: string; fileDeletes: FileDelete[] } {
  const startMarker = "FILE_DELETE_START";
  const endMarker = "FILE_DELETE_END";
  const fileDeletes: FileDelete[] = [];

  let searchFrom = 0;
  while (true) {
    const startIdx = content.indexOf(startMarker, searchFrom);
    if (startIdx === -1) break;
    const endIdx = content.indexOf(endMarker, startIdx + startMarker.length);
    if (endIdx === -1) break;
    const block = content.slice(startIdx + startMarker.length, endIdx).trim();
    let filePath = "";
    for (const line of block.split("\n")) {
      const ci = line.indexOf(":");
      if (ci === -1) continue;
      const key = line.slice(0, ci).trim();
      const val = line.slice(ci + 1).trim();
      if (key === "path") {
        filePath = val;
        break;
      }
    }
    if (filePath && !BLOCKED_PATH_RE.test(filePath) && !BLOCKED_DIR_RE.test(filePath)) {
      fileDeletes.push({ path: filePath });
    }
    searchFrom = endIdx + endMarker.length;
  }

  const visibleContent = content.replace(/FILE_DELETE_START[\s\S]*?FILE_DELETE_END/g, "").trim();
  return { visibleContent, fileDeletes };
}

export function extractAllFileMoves(content: string): { visibleContent: string; fileMoves: FileMove[] } {
  const startMarker = "FILE_MOVE_START";
  const endMarker = "FILE_MOVE_END";
  const fileMoves: FileMove[] = [];

  let searchFrom = 0;
  while (true) {
    const startIdx = content.indexOf(startMarker, searchFrom);
    if (startIdx === -1) break;
    const endIdx = content.indexOf(endMarker, startIdx + startMarker.length);
    if (endIdx === -1) break;

    const block = content.slice(startIdx + startMarker.length, endIdx);
    let from = "";
    let to = "";
    for (const line of block.split("\n")) {
      const ci = line.indexOf(":");
      if (ci === -1) continue;
      const key = line.slice(0, ci).trim();
      const val = line.slice(ci + 1).trim();
      if (key === "from") from = val;
      if (key === "to") to = val;
    }
    if (from && to) {
      fileMoves.push({ from, to });
    }
    searchFrom = endIdx + endMarker.length;
  }

  const visibleContent = content.replace(/FILE_MOVE_START[\s\S]*?FILE_MOVE_END/g, "").trim();
  return { visibleContent, fileMoves };
}

export function extractGithubPushToken(content: string): {
  content: string;
  token: GithubPushToken | null;
} {
  const GITHUB_PUSH_RE = /^GITHUB_PUSH:\s*(\{[^\n]+\})\s*$/gm;
  let token: GithubPushToken | null = null;
  const cleaned = content
    .replace(GITHUB_PUSH_RE, (_match, json: string) => {
      if (!token) {
        try {
          const parsed = JSON.parse(json) as GithubPushToken;
          if (typeof parsed.branch === "string" && typeof parsed.message === "string") {
            token = parsed;
          }
        } catch {
          /* ignore malformed */
        }
      }
      return "";
    })
    .trim();
  return { content: cleaned, token };
}

/**
 * Output Guard — WhisperGate CHAT scrub.
 * Defense in depth: strip operational markers on pure chat turns even if the
 * model ignored the CHAT system-prompt hint. Prose is preserved.
 */
export function scrubOperationalMarkersForChat(rawContent: string): {
  content: string;
  strippedMarkers: string[];
} {
  let content = rawContent;
  const strippedMarkers: string[] = [];
  const scrub = (re: RegExp, name: string) => {
    content = content.replace(re, () => {
      strippedMarkers.push(name);
      return "";
    });
  };
  scrub(/FILE_EDIT_START[\s\S]*?FILE_EDIT_END/g, "FILE_EDIT");
  scrub(/LINE_PATCH_START[\s\S]*?LINE_PATCH_END/g, "LINE_PATCH");
  scrub(/FILE_DELETE_START[\s\S]*?FILE_DELETE_END/g, "FILE_DELETE");
  scrub(/FILE_MOVE_START[\s\S]*?FILE_MOVE_END/g, "FILE_MOVE");
  scrub(/^REPO_LINK:\s*\{[^\n]*\}\s*$/gm, "REPO_LINK");
  scrub(/^GITHUB_PUSH:\s*\{[^\n]*\}\s*$/gm, "GITHUB_PUSH");
  scrub(/^GITHUB_READ:\s*\{[^\n]*\}\s*$/gm, "GITHUB_READ");
  scrub(/^BUILD_RUN:\s*[^\n]+$/gm, "BUILD_RUN");
  scrub(/^IMAGE_GEN:\s*\{[^\n]+\}\s*$/gm, "IMAGE_GEN");
  scrub(/^BROWSER_VISIT:\s*\{[^\n]+\}\s*$/gm, "BROWSER_VISIT");
  scrub(/^SHELL_RUN:\s*\{[^\n]+\}\s*$/gm, "SHELL_RUN");
  scrub(/^DATA_FETCH:\s*\{[^\n]+\}\s*$/gm, "DATA_FETCH");
  return { content: content.trim(), strippedMarkers };
}

/**
 * Output Guard — block FILE_EDIT / LINE_PATCH against existing critical paths
 * unless the change is creating a brand-new file.
 */
export function hasExistingCriticalFileChange(args: {
  fileEdits: FileEdit[];
  linePatches: LinePatch[];
  repoFiles: Set<string> | null;
}): boolean {
  const paths = [
    ...args.fileEdits.map((edit) => edit.path),
    ...args.linePatches.map((patch) => patch.path),
  ];
  return paths.some((path) => {
    if (!isCriticalPath(path)) return false;
    // Creating a new critical file is allowed; editing an existing one is not.
    return fileExistsInRepo(path, args.repoFiles);
  });
}

export function canProceedWithFileChanges(args: {
  fileEdits: FileEdit[];
  linePatches: LinePatch[];
  repoFiles: Set<string> | null;
}): boolean {
  return !hasExistingCriticalFileChange(args);
}

/** Phrases used to tell the user a critical-path change needs explicit approval. */
const APPROVAL_REQUEST_RE =
  /(these changes touch files that require confirmation before applying|i need explicit approval before making these changes)/i;

/** Did the most recent assistant turn ask the user to confirm a blocked change? */
export function previousTurnRequestedApproval(
  history: Array<{ role: string; content: string }>,
): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role !== "assistant") continue;
    return APPROVAL_REQUEST_RE.test(msg.content ?? "");
  }
  return false;
}

/**
 * Short, explicit "yes, apply it" replies — the only signal that should unblock a gated
 * change. Anchored to the start/end of the message and rejects any trailing hedge/negation
 * words (e.g. "yes but...", "yes only if...") so a conditional reply can never be
 * misread as consent.
 */
const AFFIRMATIVE_CONFIRMATION_RE =
  /^\s*(?:yes|yep|yeah|yup|sure|confirmed?|approved?|go ahead|do it|apply it|proceed|sounds good|please do|ok(?:ay)?)\s*[,.!]?\s*(?:go ahead|do it|apply it|proceed|make (?:the )?(?:change|edit)s?|ship it|go for it)?\s*[.!]?\s*$/i;

/** Is this user message an explicit affirmative reply (not just any message containing "yes")? */
export function isAffirmativeConfirmationReply(message: string): boolean {
  return AFFIRMATIVE_CONFIRMATION_RE.test((message ?? "").trim());
}

/**
 * Once-off bypass for the critical-path gate: only true when the previous turn
 * explicitly asked for approval AND this message is an explicit "yes" — never a
 * general trust-the-model bypass. This is what closes the confirmation loop bug:
 * without it, canProceedWithFileChanges() has no way to know consent was given,
 * so it re-blocks the same edit forever even after the user says yes.
 */
export function userConfirmedPendingChanges(
  message: string,
  history: Array<{ role: string; content: string }>,
): boolean {
  return isAffirmativeConfirmationReply(message) && previousTurnRequestedApproval(history);
}

/** Write-claim phrases: model narrated a file write without emitting blocks. */
export const WRITE_CLAIM_RE =
  /\b(sent (it |this )?(to (your |the )?)?(sandbox|preview)|created (the |a |an )?file|saved (to|as|the)|written to|generated (the |a |an )?file|wrote (the |a |an )?file|added (the |a |an )?file (to|at)|updated (the |a |an )?file|I'?ve (made|built|created|written|generated) (the |a |an )?file)\b/i;

export function isWriteClaimWithoutEmission(content: string, hasProposedFileChanges: boolean): boolean {
  return WRITE_CLAIM_RE.test(content) && !hasProposedFileChanges && content.length > 100;
}

export function summarizeFileEdits(fileEdits: FileEdit[]): FileEditSummary[] {
  return fileEdits.map((e) => ({
    path: e.path,
    language: e.language,
    lines: e.content.split("\n").length,
  }));
}

export function mergeMemoryChips(
  aiChips: MemoryChipRich[],
  entryTitles: string[],
  max = 6,
): MemoryChipRich[] {
  const entryChipRich: MemoryChipRich[] = entryTitles.map((s) => ({ label: s }));
  const seenLabels = new Set<string>();
  const allChips: MemoryChipRich[] = [];
  for (const c of [...aiChips, ...entryChipRich]) {
    if (!seenLabels.has(c.label)) {
      seenLabels.add(c.label);
      allChips.push(c);
    }
    if (allChips.length >= max) break;
  }
  return allChips;
}

/**
 * BUILD-branch system prompt segment for nexus (mirrors chat.ts builder protocols).
 * Injected only when WhisperGate intent === BUILD and Just Talk / Conversation Mode are off.
 */
export const NEXUS_BUILD_PROTOCOLS = `--- BUILD PROTOCOLS (active this turn) ---
This turn is classified BUILD. You may emit file edits, line patches, and GitHub pushes when the user is asking you to build, fix, or ship code.

## FILE_EDIT protocol

When the user asks you to fix, build, or create something, output the complete file(s) at the very END of your response:

FILE_EDIT_START
path: [the file path]
language: [typescript|javascript|css|json|etc]
FILE_EDIT_CONTENT
[complete file content — every line, no omissions]
FILE_EDIT_END

Critical rules:
- For EXISTING files: only emit when you have the FULL file in context. Never guess.
- For NEW files: write the complete file from scratch.
- Always output the COMPLETE file — never partial, never "// ... unchanged".
- Be an editor, not a narrator. Lead with the file path and action. One sentence of context at most — then the block.
- Do NOT emit FILE_EDIT for explanations or debugging questions.
- NEVER claim a file was created, written, sent to preview, sent to sandbox, or saved unless you have emitted a FILE_EDIT_START…FILE_EDIT_END block for it in this response.

STANDALONE ARTIFACT RULE:
When asked to generate any standalone visual artifact — an HTML page, component demo, design mockup, landing page section, UI preview — ALWAYS emit it as a FILE_EDIT block using exactly this canonical path: preview/output.html
- Content must be a complete, self-contained HTML document.
- After FILE_EDIT_END, say nothing about "sending it" — the block IS the delivery.

NO PLACEHOLDER CODE — ABSOLUTE:
Never write stub code, skeleton code, or placeholder comments ("// TODO", "// Mock X here", etc.).

PATH RULES — never edit:
- package.json, pnpm-workspace.yaml, any config file, node_modules, build output

## LINE_PATCH (for large existing files)

LINE_PATCH_START
path: src/components/Foo.tsx
LINE_PATCH_FIND
[exact existing code — 3-5 lines for context]
LINE_PATCH_REPLACE
[new code]
LINE_PATCH_END

The FIND block must match EXACTLY.

## GITHUB_PUSH

Emit AFTER all FILE_EDIT blocks when the user asks to commit/push:

GITHUB_PUSH:{"branch":"atlas/feature-name","message":"Commit message"}
GITHUB_PUSH:{"branch":"atlas/feature-name","message":"Commit message","openPr":true,"prTitle":"PR title","base":"main"}

RULES:
- One GITHUB_PUSH per response
- All FILE_EDIT blocks in the same response are committed together
- Only use when the user explicitly asks to commit/push, or when a linked repo is confirmed and the task says to open a PR

## MEMORY_CHIPS

When your response references prior committed decisions, project memory, or established facts worth surfacing as chips above the bubble, emit at the end (before NEXT_SUGGESTIONS / CLARIFY if present):

MEMORY_CHIPS:[{"label":"short chip text","insight":"optional one-line context","tier":1}]

Rules:
- 1–6 chips. Prefer labels that match committed ledger titles or memory facts already in context.
- Emit on any intent when memory is genuinely relevant — not only on BUILD.
- Do not invent chips for filler.

## Closed-Loop Verification (Phase 3)

Do NOT claim a build is "done" on narration alone. After emitting FILE_EDIT blocks for a batch of files:
- Every file referenced by package.json scripts (e.g. --config paths) or by relative imports must actually be emitted — never leave a dangling reference to a file you didn't write.
- If you are running in agent mode, calling \`finish\` will automatically run install/build/typecheck + a truncation scan; if it fails, fix the reported blocking issues and call \`finish\` again — do not tell the user it's done until it passes.
- List required environment variables (every \`process.env.X\` you introduced) explicitly to the user — do not assume they'll find it themselves.
- Production-grade builds must include minimal seed data (a few realistic rows), not just an empty schema.

## Clarification + suggestions still apply

CLARIFY_START / CLARIFY_END and NEXT_SUGGESTIONS still fire on BUILD turns when earned (Decision Catch on a build intent is the point). Keep those protocols intact.
--- END BUILD PROTOCOLS ---`;

/** MEMORY_CHIPS prompt for all intents (P0 gap independent of BUILD). */
export const NEXUS_MEMORY_CHIPS_PROTOCOL = `--- MEMORY_CHIPS PROTOCOL ---
When your response references prior committed decisions, project memory, or established facts worth surfacing as chips above the assistant bubble, emit at the very end of your response (before NEXT_SUGGESTIONS / CLARIFY if present):

MEMORY_CHIPS:[{"label":"short chip text","insight":"optional one-line context","tier":1}]

Rules:
- 1–6 chips maximum.
- Prefer labels that match committed ledger titles or memory facts already in context.
- Do not invent chips for filler. Most turns should have none.
- Emit on any intent when memory is genuinely relevant.
--- END MEMORY_CHIPS PROTOCOL ---`;

export const GH_API_BASE = "https://api.github.com";

export function ghApiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Atlas/1.0",
  };
}

export function parseRepoFullName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { fullName?: unknown; full_name?: unknown } | string;
    if (typeof p === "string") return p.trim() || null;
    if (typeof p === "object" && p !== null) {
      const fn = (p as { fullName?: unknown }).fullName ?? (p as { full_name?: unknown }).full_name;
      return typeof fn === "string" && fn.trim() ? fn.trim() : null;
    }
    return null;
  } catch {
    return (raw ?? "").trim() || null;
  }
}
