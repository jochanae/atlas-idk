import { spawn } from "node:child_process";
import { tool } from "ai";
import { z } from "zod";
import type { AgentToolContext } from "./context";

const MAX_HITS = 100;

export function searchCodebaseTool(ctx: AgentToolContext) {
  return tool({
    description: "Search the project codebase with ripgrep for a text pattern.",
    inputSchema: z.object({
      query: z.string(),
      glob: z.string().optional(),
      maxResults: z.number().int().min(1).max(100).optional(),
    }),
    execute: async ({ query, glob, maxResults }) => {
      const started = performance.now();
      const limit = Math.min(maxResults ?? 50, MAX_HITS);
      ctx.emitToolCall("search_codebase", { query, glob, maxResults: limit });
      const args = ["--line-number", "--max-count", String(limit), query, "."];
      if (glob) args.splice(0, 0, "--glob", glob);

      const hits: Array<{ file: string; line: number; text: string }> = [];
      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn("rg", args, { cwd: ctx.workspaceDir, shell: false });
          let buf = "";
          child.stdout.on("data", (chunk: Buffer) => { buf += chunk.toString(); });
          child.stderr.on("data", () => { /* rg writes match count to stderr */ });
          child.on("close", (code) => {
            if (code === 0 || code === 1) {
              for (const line of buf.split("\n").filter(Boolean)) {
                const m = line.match(/^(.+?):(\d+):(.*)$/);
                if (m) hits.push({ file: m[1], line: Number(m[2]), text: m[3] });
              }
              resolve();
            } else {
              reject(new Error(`rg exited ${code}`));
            }
          });
          child.on("error", reject);
        });
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("search_codebase", true, ms);
        return { hits, count: hits.length, capped: hits.length >= limit };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("search_codebase", false, ms);
        return { hits: [], error: String(err) };
      }
    },
  });
}
