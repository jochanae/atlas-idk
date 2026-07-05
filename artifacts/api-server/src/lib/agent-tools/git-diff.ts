import { spawn } from "node:child_process";
import { tool } from "ai";
import { z } from "zod";
import type { AgentToolContext } from "./context";

export function gitDiffTool(ctx: AgentToolContext) {
  return tool({
    description: "Show the current git diff or diff against a git ref.",
    inputSchema: z.object({
      ref: z.string().optional(),
    }),
    execute: async ({ ref }) => {
      const started = performance.now();
      ctx.emitToolCall("git_diff", { ref: ref ?? "working tree" });
      const args = ref ? ["diff", ref] : ["diff"];
      try {
        const diff = await new Promise<string>((resolve, reject) => {
          let out = "";
          const child = spawn("git", args, { cwd: ctx.workspaceDir, shell: false });
          child.stdout.on("data", (c: Buffer) => { out += c.toString(); });
          child.stderr.on("data", (c: Buffer) => { out += c.toString(); });
          child.on("close", (code) => (code === 0 || code === 1 ? resolve(out) : reject(new Error(`git diff failed: ${code}`))));
          child.on("error", reject);
        });
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("git_diff", true, ms);
        const truncated = diff.length > 50000;
        return { diff: truncated ? diff.slice(0, 50000) : diff, truncated };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("git_diff", false, ms);
        return { diff: "", error: String(err) };
      }
    },
  });
}
