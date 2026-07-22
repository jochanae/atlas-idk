import { tool } from "ai";
import { z } from "zod";
import { db, entriesTable } from "@workspace/db";
import type { AgentToolContext } from "./context";

export function writeLedgerEntryTool(_ctx: AgentToolContext) {
  return tool({
    description: "Write a new ledger entry for the project.",
    inputSchema: z.object({
      projectId: z.number().int(),
      verb: z.string(),
      title: z.string(),
      summary: z.string(),
      amField: z.string().optional(),
    }),
    execute: async ({ projectId, verb, title, summary, amField }) => {
      const started = performance.now();
      _ctx.emitToolCall("write_ledger_entry", { projectId, verb, title });
      try {
        const [row] = await db
          .insert(entriesTable)
          .values({
            projectId,
            type: "Decision",
            title,
            summary,
            verb,
            status: "committed",
            severity: "committed",
            mode: verb,
            amField: amField ?? null,
            ...(_ctx.messageId != null ? { sourceMessageId: _ctx.messageId } : {}),
          })
          .returning({ id: entriesTable.id });
        const ms = Math.round(performance.now() - started);
        _ctx.emitToolResult("write_ledger_entry", true, ms);
        return { ok: true, entryId: row?.id };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        _ctx.emitToolResult("write_ledger_entry", false, ms);
        return { ok: false, error: String(err) };
      }
    },
  });
}
