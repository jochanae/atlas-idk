import { readFile } from "node:fs/promises";
import path from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { resolveWorkspacePath } from "../projectWorkspace";
import type { AgentToolContext } from "./context";

function inferLanguage(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    json: "json", css: "css", html: "html", md: "markdown", sql: "sql",
  };
  return map[ext] ?? (ext || "text");
}

export function editFileTool(ctx: AgentToolContext) {
  return tool({
    description: "Replace file content by matching old content and applying new content.",
    inputSchema: z.object({
      path: z.string(),
      oldContent: z.string(),
      newContent: z.string(),
      reason: z.string(),
    }),
    execute: async ({ path: filePath, oldContent, newContent, reason }) => {
      const started = performance.now();
      ctx.emitToolCall("edit_file", { path: filePath, reason });
      try {
        const abs = resolveWorkspacePath(ctx.workspaceDir, filePath);
        let current = "";
        try {
          current = await readFile(abs, "utf8");
        } catch {
          current = "";
        }

        let finalContent: string;
        if (!current) {
          finalContent = newContent;
        } else if (current.includes(oldContent)) {
          finalContent = current.replace(oldContent, newContent);
        } else {
          finalContent = newContent;
        }

        const edit = {
          path: filePath,
          language: inferLanguage(filePath),
          content: finalContent,
        };
        ctx.sideEffects.fileEdits.push(edit);
        ctx.writeStep({ verb: "Writing", target: filePath, phase: "build" });

        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("edit_file", true, ms);
        return {
          ok: true,
          path: filePath,
          hint: "run_typecheck recommended after file edits",
        };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("edit_file", false, ms);
        return { ok: false, error: String(err) };
      }
    },
  });
}
