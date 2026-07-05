import { tool } from "ai";
import { z } from "zod";
import { db, entriesTable } from "@workspace/db";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import type { AgentToolContext } from "./context";

export function readLedgerTool(ctx: AgentToolContext) {
  return tool({
    description: "Read recent ledger entries for the project.",
    inputSchema: z.object({
      projectId: z.number().int(),
      filter: z.string().optional(),
    }),
    execute: async ({ projectId, filter }) => {
      const started = performance.now();
      ctx.emitToolCall("read_ledger", { projectId, filter });
      try {
        const whereClause = filter
          ? and(
              eq(entriesTable.projectId, projectId),
              or(
                ilike(entriesTable.title, `%${filter}%`),
                ilike(entriesTable.summary, `%${filter}%`),
              ),
            )
          : eq(entriesTable.projectId, projectId);

        const rows = await db
          .select({
            id: entriesTable.id,
            title: entriesTable.title,
            summary: entriesTable.summary,
            mode: entriesTable.mode,
            verb: entriesTable.verb,
            status: entriesTable.status,
            createdAt: entriesTable.createdAt,
          })
          .from(entriesTable)
          .where(whereClause)
          .orderBy(desc(entriesTable.createdAt))
          .limit(30);

        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("read_ledger", true, ms);
        return { entries: rows };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("read_ledger", false, ms);
        return { entries: [], error: String(err) };
      }
    },
  });
}
