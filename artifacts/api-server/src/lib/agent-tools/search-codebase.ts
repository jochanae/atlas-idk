/**
 * search_codebase — Ranked Repository Search (Engineering Fluency v0.1)
 *
 * Replaces the flat rg-hit dump with a grouped, ranked response.
 *
 * Categories (in priority order):
 *   symbol_definitions — function/class/type/interface/const definitions
 *   direct_matches     — source-code hits that aren't definitions or imports
 *   references         — import/require/export-from lines
 *   config_files       — package.json, tsconfig, artifact.toml, .env, etc.
 *   test_files         — *.test.ts / *.spec.ts / __tests__/ paths
 *
 * Each hit includes 1 line of context before and after the match line.
 * Hits in recently-modified files (git log --since=7 days ago) are flagged
 * and sorted to the top of their group.
 *
 * Output is capped at MAX_RANKED_OUTPUT total hits across all groups.
 * rg runs with a higher internal cap (RG_LIMIT) so ranking has enough to work with.
 */

import { spawn } from "node:child_process";
import { tool } from "ai";
import { z } from "zod";
import type { AgentToolContext } from "./context";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RG_LIMIT        = 120;  // rg match cap — ranking candidate pool
const MAX_PER_GROUP   = 12;   // max hits per category in the ranked output
const CONTEXT_LINES   = 1;    // lines of context before/after each match

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const CATEGORIES = [
  "symbol_definitions",
  "direct_matches",
  "references",
  "config_files",
  "test_files",
] as const;

type Category = (typeof CATEGORIES)[number];

interface RawHit {
  file: string;
  line: number;
  text: string;        // match line content
  before: string;      // context line before (empty string if none)
  after: string;       // context line after (empty string if none)
}

interface RankedHit extends RawHit {
  category: Category;
  recent: boolean;     // file modified in last 7 days
}

// ---------------------------------------------------------------------------
// Classification — determines group for a given hit
// ---------------------------------------------------------------------------

// Config / build / env files — never source code
const CONFIG_RE = /\/(package\.json|tsconfig[^/]*\.json|\.eslintrc[^/]*|\.babelrc[^/]*|vite\.config\.[jt]sx?|webpack\.config\.[jt]sx?|rollup\.config\.[jt]sx?|[Dd]ockerfile[^/]*|docker-compose[^/]*|\.replit|artifact\.toml|drizzle\.config\.[jt]s|tailwind\.config\.[jt]s|postcss\.config\.[jt]s|pnpm-workspace\.yaml|\.env[^/]*|jest\.config\.[jt]s|vitest\.config\.[jt]s)$/;

// Test files
const TEST_FILE_RE = /\.(test|spec)\.[jt]sx?$|\/(__tests__|__specs__|tests?|specs?)\/[^/]+$/;

// Symbol definitions — line starts a declaration
const SYMBOL_DEF_RE = /^\s*(export\s+)?(default\s+)?(async\s+)?(?:function\s+\w|class\s+\w|abstract\s+class\s+\w|type\s+\w+\s*[=<{(]|interface\s+\w|enum\s+\w|namespace\s+\w|const\s+\w+\s*[:=(]|let\s+\w+\s*[:=(]|var\s+\w+\s*[:=(]|def\s+\w|fn\s+\w)/;

// Import / export-from / require lines
const REFERENCE_RE = /^\s*(?:import\s|from\s+['"]|export\s+\{|export\s+\*|const\s+\w+\s*=\s*require\()/;

function classify(file: string, matchText: string): Category {
  const f = file.replace(/\\/g, "/");
  if (CONFIG_RE.test(f))    return "config_files";
  if (TEST_FILE_RE.test(f)) return "test_files";
  if (SYMBOL_DEF_RE.test(matchText)) return "symbol_definitions";
  if (REFERENCE_RE.test(matchText))  return "references";
  return "direct_matches";
}

// ---------------------------------------------------------------------------
// rg JSON stream parser
// ---------------------------------------------------------------------------

interface RgJsonEvent {
  type: "begin" | "match" | "context" | "end" | "summary";
  data: any;
}

/**
 * Run rg with --json and parse the event stream into RawHit objects with context.
 * We buffer context lines per-file so before/after can be attached to each match.
 */
async function runRg(
  pattern: string,
  cwd: string,
  glob: string | undefined,
  limit: number,
): Promise<{ hits: RawHit[]; rawCount: number }> {
  const args: string[] = [
    "--json",
    "--line-number",
    "--max-count", String(limit),
    "--context", String(CONTEXT_LINES),
    "--",
    pattern,
    ".",
  ];
  if (glob) args.unshift("--glob", glob);

  return new Promise((resolve) => {
    const child = spawn("rg", args, { cwd, shell: false });

    let buf = "";
    let rawCount = 0;

    // rg JSON stream order per file:
    //   begin → [context (before)]* → match → [context (after)]* → … → end
    //
    // "before" context lines arrive BEFORE the match event, so we buffer them
    // in pendingBefore and splice them into the match when it arrives.

    interface PendingMatch {
      file: string;
      line: number;
      text: string;
      beforeLines: string[];
      afterLines: string[];
    }

    const pending: PendingMatch[] = [];
    let pendingBefore: string[] = [];   // context lines buffered for the next match
    let lastMatchLine = -1;             // line number of the most recent match

    child.stdout.on("data", (chunk: Buffer) => { buf += chunk.toString(); });
    child.stderr.on("data", () => { /* rg stats — ignore */ });

    child.on("close", (code) => {
      if (code !== 0 && code !== 1) {
        resolve({ hits: [], rawCount: 0 });
        return;
      }

      for (const rawLine of buf.split("\n")) {
        if (!rawLine.trim()) continue;
        let event: RgJsonEvent;
        try { event = JSON.parse(rawLine); } catch { continue; }

        if (event.type === "begin") {
          // New file — reset per-file context state
          pendingBefore = [];
          lastMatchLine = -1;

        } else if (event.type === "match") {
          rawCount++;
          pending.push({
            file: event.data.path.text as string,
            line: event.data.line_number as number,
            text: (event.data.lines.text as string).trimEnd(),
            beforeLines: pendingBefore.splice(0),  // consume buffered before-context
            afterLines: [],
          });
          lastMatchLine = event.data.line_number as number;
          pendingBefore = [];  // reset for the next match in this file

        } else if (event.type === "context") {
          const lineNum = event.data.line_number as number;
          const text = (event.data.lines.text as string).trimEnd();

          if (lastMatchLine >= 0 && lineNum > lastMatchLine) {
            // After-context for the most recent match
            const last = pending[pending.length - 1];
            if (last) last.afterLines.push(text);
          } else {
            // Before-context for the next match (or orphaned — discard)
            pendingBefore.push(text);
          }
        }
      }

      const hits: RawHit[] = pending.map(m => ({
        file: m.file,
        line: m.line,
        text: m.text,
        before: m.beforeLines[m.beforeLines.length - 1] ?? "",
        after: m.afterLines[0] ?? "",
      }));

      resolve({ hits, rawCount });
    });

    child.on("error", () => resolve({ hits: [], rawCount: 0 }));
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, 8_000);
    child.on("close", () => clearTimeout(timer));
  });
}

// ---------------------------------------------------------------------------
// Recently modified files (git log, 7-day window)
// ---------------------------------------------------------------------------

async function getRecentFiles(cwd: string): Promise<Set<string>> {
  return new Promise(resolve => {
    const child = spawn(
      "git",
      ["log", "--name-only", "--format=", "--since=7 days ago"],
      { cwd, shell: false },
    );
    let buf = "";
    child.stdout.on("data", (c: Buffer) => { buf += c.toString(); });
    const done = () => {
      const files = new Set(
        buf.split("\n").map(l => l.trim()).filter(l => l.length > 0),
      );
      resolve(files);
    };
    child.on("close", done);
    child.on("error", () => resolve(new Set()));
    const timer = setTimeout(() => { try { child.kill(); } catch {} resolve(new Set()); }, 3_000);
    child.on("close", () => clearTimeout(timer));
  });
}

// ---------------------------------------------------------------------------
// Ranking + grouping
// ---------------------------------------------------------------------------

function rankAndGroup(
  hits: RawHit[],
  recentFiles: Set<string>,
): Record<Category, RankedHit[]> {
  const groups: Record<Category, RankedHit[]> = {
    symbol_definitions: [],
    direct_matches:     [],
    references:         [],
    config_files:       [],
    test_files:         [],
  };

  const seen = new Set<string>(); // deduplicate by "file:line"

  for (const hit of hits) {
    const key = `${hit.file}:${hit.line}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const category = classify(hit.file, hit.text);
    const recent   = recentFiles.has(hit.file);
    groups[category].push({ ...hit, category, recent });
  }

  // Within each group: recently-modified first, then file path asc
  for (const cat of CATEGORIES) {
    groups[cat].sort((a, b) => {
      if (a.recent !== b.recent) return a.recent ? -1 : 1;
      return a.file.localeCompare(b.file);
    });
    // Cap per group
    groups[cat] = groups[cat].slice(0, MAX_PER_GROUP);
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function searchCodebaseTool(ctx: AgentToolContext) {
  return tool({
    description:
      "Search the project codebase with ripgrep. Results are ranked and grouped:\n" +
      "  symbol_definitions — function/class/type/interface/const declarations\n" +
      "  direct_matches     — source-code lines that contain the pattern\n" +
      "  references         — import/require/export-from lines\n" +
      "  config_files       — package.json, tsconfig, artifact.toml, .env, etc.\n" +
      "  test_files         — *.test.ts, *.spec.ts, __tests__/ paths\n" +
      "Each hit includes 1 line of context before/after. Hits from recently-modified files\n" +
      "(last 7 days) are flagged `recent: true` and sorted to the top of their group.\n" +
      "Use symbol_definitions to locate where something is defined, direct_matches\n" +
      "to find usages, and config_files for project structure questions.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("ripgrep pattern (regex). For symbol lookup, use the bare name e.g. 'searchCodebaseTool'."),
      glob: z
        .string()
        .optional()
        .describe("Optional file glob filter, e.g. '**/*.ts', '*.json'."),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max hits per group (default 12). Raise only when you need broad coverage."),
    }),
    execute: async ({ query, glob, maxResults }) => {
      const started = performance.now();
      const perGroupLimit = Math.min(maxResults ?? MAX_PER_GROUP, 100);
      ctx.emitToolCall("search_codebase", { query, glob, maxResults: perGroupLimit });

      const [rgResult, recentFiles] = await Promise.all([
        runRg(query, ctx.workspaceDir, glob, RG_LIMIT),
        getRecentFiles(ctx.workspaceDir),
      ]);

      if ("error" in rgResult) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("search_codebase", false, ms);
        return { error: (rgResult as any).error };
      }

      const groups = rankAndGroup(rgResult.hits, recentFiles);

      // Apply caller's per-group limit
      if (perGroupLimit !== MAX_PER_GROUP) {
        for (const cat of CATEGORIES) {
          groups[cat] = groups[cat].slice(0, perGroupLimit);
        }
      }

      const totalOutput = CATEGORIES.reduce((n, c) => n + groups[c].length, 0);
      const recentCount = CATEGORIES.reduce(
        (n, c) => n + groups[c].filter(h => h.recent).length,
        0,
      );

      const ms = Math.round(performance.now() - started);
      ctx.emitToolResult("search_codebase", true, ms);

      return {
        groups,
        totalMatches: rgResult.rawCount,
        totalOutput,
        capped: rgResult.rawCount >= RG_LIMIT,
        recentlyModifiedInResults: recentCount,
      };
    },
  });
}
