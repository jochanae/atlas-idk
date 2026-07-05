import { tool } from "ai";
import { z } from "zod";
import { db, entriesTable, projectsTable } from "@workspace/db";
import { desc, eq, ilike, or } from "drizzle-orm";
import type { AgentToolContext } from "./context";

export function searchMemoryTool(_ctx: AgentToolContext) {
  return tool({
    description: "Search project memory and ledger entries by text (vector search in Phase 3).",
    inputSchema: z.object({
      projectId: z.number().int(),
      query: z.string(),
      k: z.number().int().min(1).max(20).default(8),
    }),
    execute: async ({ projectId, query, k }) => {
      const started = performance.now();
      _ctx.emitToolCall("search_memory", { projectId, query, k });
      try {
        const [project] = await db
          .select({ memory: projectsTable.memory })
          .from(projectsTable)
          .where(eq(projectsTable.id, projectId))
          .limit(1);

        const entryHits = await db
          .select({ id: entriesTable.id, title: entriesTable.title, summary: entriesTable.summary })
          .from(entriesTable)
          .where(eq(entriesTable.projectId, projectId))
          .orderBy(desc(entriesTable.createdAt))
          .limit(50);

        const q = query.toLowerCase();
        const scored = entryHits
          .map((e: { id: number; title: string; summary: string | null }) => {
            const text = `${e.title} ${e.summary ?? ""}`.toLowerCase();
            const score = text.includes(q) ? 2 : q.split(/\s+/).filter((w) => text.includes(w)).length;
            return { ...e, score };
          })
          .filter((e: { score: number }) => e.score > 0)
          .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
          .slice(0, k);

        const ms = Math.round(performance.now() - started);
        _ctx.emitToolResult("search_memory", true, ms);
        return {
          hits: scored,
          projectMemorySnippet: project?.memory?.slice(0, 2000) ?? null,
          mode: "text_search",
        };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        _ctx.emitToolResult("search_memory", false, ms);
        return { hits: [], error: String(err) };
      }
    },
  });
}
